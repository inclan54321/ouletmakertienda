require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const sgMail = require("@sendgrid/mail");

const TOKEN         = process.env.TELEGRAM_BOT_RASTREO_TOKEN;
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SENDGRID_KEY  = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_NAME = process.env.SENDGRID_FROM_NAME || "Outlet Maker Tienda";
const ORDERS_FILE   = path.join(__dirname, "buy_orders.json");
const ENVIADOS_FILE = path.join(__dirname, "enviados_rastreo.json");

if (!TOKEN)      { console.error("❌ TELEGRAM_BOT_RASTREO_TOKEN no definido"); process.exit(1); }
if (!GEMINI_KEY) { console.error("❌ GEMINI_API_KEY no definido"); process.exit(1); }
if (!SENDGRID_KEY){ console.error("❌ SENDGRID_API_KEY no definido"); process.exit(1); }

sgMail.setApiKey(SENDGRID_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const bot = new TelegramBot(TOKEN, { polling: true });

// ── Helpers de archivos ──────────────────────────────────

function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); } catch { return []; }
}

function loadEnviados() {
  try { return JSON.parse(fs.readFileSync(ENVIADOS_FILE, "utf8")); } catch { return {}; }
}

function saveEnviados(data) {
  fs.writeFileSync(ENVIADOS_FILE, JSON.stringify(data, null, 2));
}

// ── Buscar pedido por nombre o teléfono ──────────────────

function buscarPedido(nombre, telefono) {
  const orders = loadOrders();
  const normStr = s => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
  const normTel = s => String(s || "").replace(/\D/g, "");

  return orders.find(o => {
    const matchNombre = nombre && normStr(o.name).includes(normStr(nombre));
    const matchTel    = telefono && normTel(o.phone) === normTel(telefono);
    return matchNombre || matchTel;
  }) || null;
}

// ── Enviar correo de rastreo ─────────────────────────────

async function enviarCorreoRastreo(email, nombre, orderNumber, numeroRastreo, servicio) {
  const servicioNombre = servicio === "correos" ? "Correos de Costa Rica" : "Dual";
  const linkRastreo = servicio === "correos"
    ? `https://www.correos.go.cr/rastreo/?numero=${numeroRastreo}`
    : `https://dual.cr/rastreo/?guia=${numeroRastreo}`;

  await sgMail.send({
    to: email,
    from: { email: SENDGRID_FROM, name: SENDGRID_NAME },
    subject: `📦 Tu pedido #${orderNumber} fue enviado`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2c3e50;">¡Tu pedido está en camino! 🚀</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Nos complace informarte que tu pedido <strong>#${orderNumber}</strong> ya fue enviado a través de <strong>${servicioNombre}</strong>.</p>
        <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0;font-size:16px;">📦 <strong>Número de rastreo:</strong></p>
          <p style="margin:8px 0;font-size:22px;font-weight:bold;color:#2980b9;letter-spacing:2px;">${numeroRastreo}</p>
          <a href="${linkRastreo}" style="display:inline-block;background:#2980b9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:8px;">
            Rastrear mi pedido →
          </a>
        </div>
        <p>Si tenés alguna duda, no dudés en contactarnos. ¡Fue un placer atenderte! 🙌</p>
        <p style="color:#888;font-size:12px;">Outlet Maker Tienda</p>
      </div>
    `
  });
}

// ── Descargar imagen como base64 ─────────────────────────

function descargarBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── Analizar imagen con Gemini (Correos CR) ──────────────

async function extraerRastreoDeImagen(imageBase64, mimeType, nombre, telefono) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt =
    `Analizá esta imagen de un comprobante de envío de Correos de Costa Rica.\n` +
    `Extraé la siguiente información si está presente:\n` +
    `NUMERO_RASTREO: (el número de guía o rastreo)\n` +
    `NOMBRE_DESTINATARIO: (nombre del destinatario)\n` +
    `TELEFONO_DESTINATARIO: (teléfono si aparece)\n\n` +
    `Si no encontrás algún dato escribí "No detectado".\n` +
    `Respondé SOLO con ese formato, sin texto adicional.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageBase64, mimeType } }
  ]);
  return result.response.text().trim();
}

// ── Analizar texto (Dual) ────────────────────────────────

async function extraerRastreoDeTexto(texto) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt =
    `Analizá este texto de información de envío de Dual (servicio de mensajería).\n` +
    `Extraé la siguiente información:\n` +
    `NUMERO_RASTREO: (número de guía o rastreo)\n` +
    `NOMBRE_DESTINATARIO: (nombre del destinatario)\n` +
    `TELEFONO_DESTINATARIO: (teléfono si aparece)\n\n` +
    `Si no encontrás algún dato escribí "No detectado".\n` +
    `Respondé SOLO con ese formato, sin texto adicional.\n\n` +
    `Texto a analizar:\n${texto}`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// ── Procesar resultado de Gemini y enviar correo ─────────

async function procesarResultado(chatId, geminiRespuesta, servicio) {
  const rastreo  = (geminiRespuesta.match(/NUMERO_RASTREO:\s*(.+)/i)       || [])[1]?.trim() || "";
  const nombre   = (geminiRespuesta.match(/NOMBRE_DESTINATARIO:\s*(.+)/i)  || [])[1]?.trim() || "";
  const telefono = (geminiRespuesta.match(/TELEFONO_DESTINATARIO:\s*(.+)/i)|| [])[1]?.trim() || "";

  if (!rastreo || rastreo === "No detectado") {
    return bot.sendMessage(chatId, "⚠️ No pude detectar el número de rastreo. Intentá de nuevo con una imagen más clara o revisá el texto.");
  }

  // Buscar pedido
  const pedido = buscarPedido(nombre, telefono);
  if (!pedido) {
    return bot.sendMessage(chatId,
      `⚠️ No encontré ningún pedido para:\n👤 ${nombre}\n📞 ${telefono}\n\n` +
      `Verificá que el nombre o teléfono coincidan con los del pedido.`
    );
  }

  // Verificar si ya fue enviado
  const enviados = loadEnviados();
  if (enviados[pedido.orderNumber]) {
    // Ignorar silenciosamente — solo log interno
    console.log(`⏭️ Pedido #${pedido.orderNumber} ya fue enviado antes. Ignorando.`);
    return bot.sendMessage(chatId, `ℹ️ El pedido #${pedido.orderNumber} ya fue marcado como enviado anteriormente. No se envió el correo de nuevo.`);
  }

  // Enviar correo
  try {
    await enviarCorreoRastreo(pedido.email, pedido.name, pedido.orderNumber, rastreo, servicio);

    // Marcar como enviado
    enviados[pedido.orderNumber] = {
      rastreo,
      servicio,
      fecha: new Date().toISOString()
    };
    saveEnviados(enviados);

    await bot.sendMessage(chatId,
      `✅ *Correo enviado exitosamente*\n` +
      `━━━━━���━━━━━━━━━━━━━\n` +
      `📋 Pedido: #${pedido.orderNumber}\n` +
      `👤 Cliente: ${pedido.name}\n` +
      `📧 Correo: ${pedido.email}\n` +
      `📦 Rastreo: \`${rastreo}\`\n` +
      `🚚 Servicio: ${servicio === "correos" ? "Correos de Costa Rica" : "Dual"}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Error enviando correo rastreo:", e);
    bot.sendMessage(chatId, `❌ Error al enviar el correo: ${e.message}`);
  }
}

// ── Recibir FOTO (Correos de Costa Rica) ─────────────────

bot.on("photo", async (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "⏳ Analizando comprobante con IA...");

    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;
    const imageBase64 = await descargarBase64(fileUrl);
    const mimeType = fileInfo.file_path.endsWith(".png") ? "image/png" : "image/jpeg";

    const geminiRespuesta = await extraerRastreoDeImagen(imageBase64, mimeType);
    await procesarResultado(chatId, geminiRespuesta, "correos");

  } catch (e) {
    console.error("Error procesando foto rastreo:", e);
    bot.sendMessage(chatId, `❌ Error al procesar la imagen: ${e.message}`);
  }
});

// ── Recibir TEXTO (Dual) ─────────────────────────────────

bot.on("message", async (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  if (msg.photo) return; // ya manejado arriba
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "⏳ Analizando información de Dual con IA...");
    const geminiRespuesta = await extraerRastreoDeTexto(msg.text);
    await procesarResultado(chatId, geminiRespuesta, "dual");

  } catch (e) {
    console.error("Error procesando texto rastreo:", e);
    bot.sendMessage(chatId, `❌ Error al procesar el texto: ${e.message}`);
  }
});

// ── Comando /start ───────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  bot.sendMessage(msg.chat.id,
    `📦 *Bot de Rastreo - Outlet Maker*\n\n` +
    `Cómo usarlo:\n` +
    `📸 *Correos de CR* → enviame la foto del comprobante\n` +
    `💬 *Dual* → pegá el texto con la info del envío\n\n` +
    `El bot detectará el número de rastreo y enviará el correo al cliente automáticamente.`,
    { parse_mode: "Markdown" }
  );
});

console.log("📦 Bot de rastreo iniciado...");
module.exports = { bot };