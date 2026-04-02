require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const fs = require("fs");
const path = require("path");
const sgMail = require("@sendgrid/mail");

const TOKEN         = process.env.TELEGRAM_BOT_MATCH_TOKEN;
const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY;
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SENDGRID_KEY  = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_NAME = process.env.SENDGRID_FROM_NAME || "Outlet Maker Tienda";
const BOT_USERNAME  = "Alphahobot";

const SOLICITUDES_FILE = path.join(__dirname, "match_solicitudes.json");
const CHATIDS_FILE     = path.join(__dirname, "match_chatids.json");

if (!TOKEN)     { console.error("❌ TELEGRAM_BOT_MATCH_TOKEN no definido"); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error("❌ DEEPSEEK_API_KEY no definido"); process.exit(1); }

sgMail.setApiKey(SENDGRID_KEY);
const bot = new TelegramBot(TOKEN, { polling: true });

// ── Helpers de archivos ──────────────────────────────────

function loadSolicitudes() {
  try { return JSON.parse(fs.readFileSync(SOLICITUDES_FILE, "utf8")); } catch { return []; }
}

function loadChatIds() {
  try { return JSON.parse(fs.readFileSync(CHATIDS_FILE, "utf8")); } catch { return {}; }
}

function saveChatIds(data) {
  fs.writeFileSync(CHATIDS_FILE, JSON.stringify(data, null, 2));
}

// ── Estado activo de notificaciones en curso ─────────────
// { matchId: { solicitud, chatId, timer, articuloInfo } }
const matchesActivos = {};

// ── Helpers de fecha/hora ────────────────────────────────

function getDiaActual() {
  // Retorna L, M, X, J, V, S o D
  const dias = ["D", "L", "M", "X", "J", "V", "S"];
  return dias[new Date().getDay()];
}

function getHoraActual() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes(); // minutos desde medianoche
}

function horaAMinutos(horaStr) {
  // "14:30" → 870
  if (!horaStr || !horaStr.includes(":")) return null;
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

function solicitudEsValida(solicitud) {
  const diaHoy = getDiaActual();
  const minHoy = getHoraActual();

  // Verificar tiempo asignado
  const tiempo = solicitud.tiempo || {};
  if (tiempo.tipo === "temporada") {
    const inicio = new Date(tiempo.inicio);
    const fin    = new Date(tiempo.fin);
    const hoy    = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (hoy < inicio || hoy > fin) return false;
  } else if (tiempo.tipo === "diasfijos") {
    const diaNum = new Date().getDate(); // día del mes 1-31
    if (!Array.isArray(tiempo.dias) || !tiempo.dias.map(String).includes(String(diaNum))) return false;
  }

  // Verificar horas preferidas
  const horas = Array.isArray(solicitud.horas) ? solicitud.horas : [];
  if (horas.length === 0) return true; // sin restricción de hora

  for (const franja of horas) {
    const inicio = horaAMinutos(franja.inicio);
    const fin    = horaAMinutos(franja.fin);
    const diasFranja = Array.isArray(franja.dias) ? franja.dias : [];

    // Si no seleccionó días = aplica todos
    const diaOk = diasFranja.length === 0 || diasFranja.includes(diaHoy);
    const horaOk = (inicio !== null && fin !== null)
      ? (minHoy >= inicio && minHoy <= fin)
      : true;

    if (diaOk && horaOk) return true;
  }

  return false;
}

// ── DeepSeek: verificar coincidencia ────────────────────

async function verificarCoincidencia(solicitud, articuloDesc) {
  return new Promise((resolve, reject) => {
    const texto = solicitud.tipoArticulo === "situacion"
      ? `Situación buscada: ${solicitud.textoArticulo}`
      : `Artículo buscado: ${solicitud.textoArticulo}`;

    const body = JSON.stringify({
      model: "deepseek-chat",
      messages: [{
        role: "user",
        content:
          `Sos un asistente de Outlet Maker, una tienda de artículos de segunda mano en Costa Rica.\n` +
          `Determiná si el siguiente artículo disponible coincide con lo que busca el cliente.\n\n` +
          `ARTÍCULO DISPONIBLE: ${articuloDesc}\n\n` +
          `LO QUE BUSCA EL CLIENTE: ${texto}\n\n` +
          `Respondé ÚNICAMENTE con SI o NO, sin explicaciones.`
      }],
      max_tokens: 10
    });

    const req = https.request({
      hostname: "api.deepseek.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`,
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          const resp = j.choices[0].message.content.trim().toUpperCase();
          resolve(resp.startsWith("SI"));
        } catch { reject(new Error("Error parseando DeepSeek")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
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

// ── Enviar correo opt-in Telegram ────────────────────────

async function enviarCorreoOptIn(email, nombre, codigo) {
  const enlace = `https://t.me/${BOT_USERNAME}?start=match_${codigo}`;
  await sgMail.send({
    to: email,
    from: { email: SENDGRID_FROM, name: SENDGRID_NAME },
    subject: `🎯 Activá tus alertas Match — Outlet Maker`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2c3e50;">¡Tu solicitud Match fue registrada! 🎯</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Para que podamos avisarte por Telegram cuando encontremos un artículo que coincida con tu búsqueda, necesitamos que actives las alertas.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${enlace}" style="display:inline-block;background:#229ED9;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;">
            📲 Activar alertas en Telegram
          </a>
        </div>
        <p style="font-size:13px;color:#888;">Solo tenés que hacer clic en el botón de arriba y luego presionar <strong>Iniciar</strong> en Telegram.</p>
        <p style="font-size:13px;color:#888;">Tu código Match es: <strong>${codigo}</strong></p>
        <p>¡Estaremos atentos para avisarte! 🙌</p>
      </div>
    `
  });
}

// ── /start match_CODIGO — Cliente activa alertas ─────────

bot.onText(/\/start match_(.+)/, async (msg, match) => {
  const chatId  = msg.chat.id;
  const codigo  = match[1];
  const nombre  = msg.from.first_name || "cliente";

  // Guardar chatId vinculado al código
  const chatIds = loadChatIds();
  chatIds[codigo] = String(chatId);
  saveChatIds(chatIds);

  await bot.sendMessage(chatId,
    `✅ *¡Alertas Match activadas!*\n\n` +
    `Hola ${nombre}, a partir de ahora te avisaremos aquí en Telegram cuando encontremos un artículo que coincida con tu búsqueda.\n\n` +
    `Cuando recibas una oferta, tendrás *1 minuto* para aceptarla o rechazarla.\n\n` +
    `¡Estamos buscando para vos! 🎯`,
    { parse_mode: "Markdown" }
  );
});

// ── ADMIN envía foto del artículo ────────────────────────

bot.on("photo", async (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const chatId  = msg.chat.id;
  const caption = msg.caption || "";

  // Parsear descripción y precio del caption
  // Formato esperado: "Descripción del artículo | precio: 15000"
  const precioMatch = caption.match(/precio:\s*([\d,.]+)/i);
  const precio      = precioMatch ? precioMatch[1].replace(/,/g, "") : "No especificado";
  const descripcion = caption.replace(/precio:\s*[\d,.]+/i, "").trim() || "Sin descripción";

  await bot.sendMessage(chatId, "⏳ Buscando coincidencias en solicitudes Match...");

  try {
    // Descargar imagen
    const fileId   = msg.photo[msg.photo.length - 1].file_id;
    const fileInfo = await bot.getFile(fileId);
    const fileUrl  = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;
    const imgBase64 = await descargarBase64(fileUrl);

    // Analizar descripción con Gemini para mejorar el matching
    const geminiDesc = await analizarArticuloGemini(imgBase64,
      fileInfo.file_path.endsWith(".png") ? "image/png" : "image/jpeg",
      descripcion);

    const articuloInfo = {
      descripcion: geminiDesc || descripcion,
      precio,
      fileId: msg.photo[msg.photo.length - 1].file_id,
      caption
    };

    // Buscar coincidencias
    const solicitudes    = loadSolicitudes();
    const chatIds        = loadChatIds();
    const coincidencias  = [];

    for (const sol of solicitudes) {
      // Verificar que tenga chatId registrado
      if (!chatIds[sol.codigo]) continue;
      // Verificar día/hora
      if (!solicitudEsValida(sol)) continue;
      // Verificar coincidencia con IA
      const coincide = await verificarCoincidencia(sol, articuloInfo.descripcion);
      if (coincide) coincidencias.push(sol);
    }

    if (coincidencias.length === 0) {
      return bot.sendMessage(chatId,
        `😔 No encontré ninguna solicitud Match que coincida con este artículo en este momento.\n\n` +
        `Puede ser que:\n` +
        `• Ningún cliente busca algo similar\n` +
        `• Los que coinciden tienen otras horas/días configurados`
      );
    }

    // Escoger al azar si hay más de uno
    const elegida = coincidencias[Math.floor(Math.random() * coincidencias.length)];

    await bot.sendMessage(chatId,
      `✅ *${coincidencias.length} coincidencia(s) encontrada(s)*\n` +
      `🎲 Notificando a: ${elegida.telefono} (código: ${elegida.codigo})`,
      { parse_mode: "Markdown" }
    );

    await notificarCliente(elegida, articuloInfo, coincidencias, chatIds);

  } catch (e) {
    console.error("Error en bot Match:", e);
    bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
});

// ── Analizar artículo con Gemini ─────────────────────────

async function analizarArticuloGemini(imageBase64, mimeType, descripcionAdmin) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            text:
              `Describí brevemente este artículo en español (máximo 2 oraciones).\n` +
              `Información adicional del vendedor: ${descripcionAdmin}\n` +
              `Sé específico sobre qué tipo de producto es, marca si se ve, y estado general.`
          },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }]
    });

    const req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          resolve(j.candidates[0].content.parts[0].text.trim());
        } catch { resolve(descripcionAdmin); }
      });
    });
    req.on("error", () => resolve(descripcionAdmin));
    req.write(body);
    req.end();
  });
}

// ── Notificar al cliente elegido ─────────────────────────

async function notificarCliente(solicitud, articuloInfo, todasCoincidencias, chatIds) {
  const clienteChatId = chatIds[solicitud.codigo];
  if (!clienteChatId) return;

  const matchId = `${solicitud.codigo}_${Date.now()}`;
  const precio  = articuloInfo.precio !== "No especificado"
    ? `₡${Number(articuloInfo.precio).toLocaleString("es-CR")}`
    : "Precio no especificado";

  // Enviar foto con mensaje
  await bot.sendPhoto(clienteChatId, articuloInfo.fileId, {
    caption:
      `🎯 *¡Encontramos algo para vos!*\n\n` +
      `📦 *Descripción:* ${articuloInfo.descripcion}\n` +
      `💰 *Precio:* ${precio}\n\n` +
      `⏱️ *Tenés 1 minuto para responder.*\n` +
      `Si no respondés, la oferta pasará al siguiente cliente.`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Aceptar", callback_data: `match_aceptar_${matchId}` },
        { text: "❌ Rechazar", callback_data: `match_rechazar_${matchId}` }
      ]]
    }
  });

  // Guardar estado activo
  matchesActivos[matchId] = {
    solicitud,
    clienteChatId,
    articuloInfo,
    todasCoincidencias,
    chatIds,
    respondido: false
  };

  // Timer de 1 minuto
  matchesActivos[matchId].timer = setTimeout(async () => {
    const match = matchesActivos[matchId];
    if (!match || match.respondido) return;
    match.respondido = true;

    // Avisar al cliente que se venció
    try {
      await bot.sendMessage(clienteChatId,
        `⏰ *El tiempo se agotó.*\n\nNo respondiste a tiempo y la oferta fue asignada a otro cliente.\n¡Seguiremos buscando para vos! 🎯`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {}

    // Notificar al admin
    await bot.sendMessage(ADMIN_CHAT_ID,
      `⏰ *Sin respuesta*\nEl cliente con código ${solicitud.codigo} no respondió a tiempo.`,
      { parse_mode: "Markdown" }
    );

    delete matchesActivos[matchId];
    // Pasar al siguiente
    await pasarAlSiguiente(solicitud, articuloInfo, todasCoincidencias, chatIds);

  }, 60 * 1000);
}

// ── Pasar al siguiente en coincidencias ──────────────────

async function pasarAlSiguiente(solicitudActual, articuloInfo, todasCoincidencias, chatIds) {
  // Quitar la actual de la lista
  const restantes = todasCoincidencias.filter(s => s.codigo !== solicitudActual.codigo);
  if (restantes.length === 0) {
    return bot.sendMessage(ADMIN_CHAT_ID,
      `😔 Ningún cliente respondió a la oferta del artículo:\n_${articuloInfo.descripcion}_`,
      { parse_mode: "Markdown" }
    );
  }

  const siguiente = restantes[Math.floor(Math.random() * restantes.length)];
  await bot.sendMessage(ADMIN_CHAT_ID,
    `➡️ Pasando al siguiente cliente: código ${siguiente.codigo}`,
    { parse_mode: "Markdown" }
  );
  await notificarCliente(siguiente, articuloInfo, restantes, chatIds);
}

// ── Manejar botones Aceptar / Rechazar ───────────────────

bot.on("callback_query", async (query) => {
  const data     = query.data || "";
  const chatId   = query.message.chat.id;
  const msgId    = query.message.message_id;

  if (!data.startsWith("match_")) return;

  const partes  = data.split("_");
  const accion  = partes[1]; // aceptar o rechazar
  const matchId = partes.slice(2).join("_");

  const matchData = matchesActivos[matchId];

  // Si ya no existe (venció el timer)
  if (!matchData || matchData.respondido) {
    await bot.answerCallbackQuery(query.id, { text: "⏰ Esta oferta ya no está disponible." });
    return;
  }

  matchData.respondido = true;
  clearTimeout(matchData.timer);
  delete matchesActivos[matchId];

  if (accion === "aceptar") {
    // Confirmar al cliente
    await bot.editMessageCaption(
      `✅ *¡Genial! Aceptaste la oferta.*\n\n` +
      `📦 ${matchData.articuloInfo.descripcion}\n\n` +
      `Pronto nos pondremos en contacto con vos para coordinar. 🙌`,
      { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" }
    );
    await bot.answerCallbackQuery(query.id, { text: "✅ ¡Oferta aceptada!" });

    // Notificar al admin
    await bot.sendMessage(ADMIN_CHAT_ID,
      `🎉 *¡Match aceptado!*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Código: ${matchData.solicitud.codigo}\n` +
      `📞 Teléfono: ${matchData.solicitud.telefono}\n` +
      `📦 Artículo: ${matchData.articuloInfo.descripcion}\n` +
      `💰 Precio: ₡${Number(matchData.articuloInfo.precio).toLocaleString("es-CR") || matchData.articuloInfo.precio}\n\n` +
      `¡Coordiná con el cliente para concretar la venta! 🙌`,
      { parse_mode: "Markdown" }
    );

  } else {
    // Rechazó
    await bot.editMessageCaption(
      `❌ *Rechazaste esta oferta.*\n\nNo hay problema, seguiremos buscando artículos para vos. 🎯`,
      { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" }
    );
    await bot.answerCallbackQuery(query.id, { text: "❌ Oferta rechazada." });

    // Notificar al admin
    await bot.sendMessage(ADMIN_CHAT_ID,
      `❌ *Match rechazado*\nCódigo: ${matchData.solicitud.codigo}\nPasando al siguiente...`,
      { parse_mode: "Markdown" }
    );

    // Pasar al siguiente
    await pasarAlSiguiente(
      matchData.solicitud,
      matchData.articuloInfo,
      matchData.todasCoincidencias,
      matchData.chatIds
    );
  }
});

// ── /start sin código ────────────────────────────────────

bot.onText(/\/start$/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👋 Hola! Soy el bot de alertas Match de *Outlet Maker*.\n\n` +
    `Para activar tus alertas, usá el enlace que te llegó al correo. 📧`,
    { parse_mode: "Markdown" }
  );
});

console.log("🎯 Bot Match iniciado...");
module.exports = { bot, enviarCorreoOptIn };