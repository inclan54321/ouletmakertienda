const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");
const http = require("http");

const TOKEN = process.env.TELEGRAM_BOT_C_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) { console.error("❌ TELEGRAM_BOT-C_TOKEN no definido"); process.exit(1); }
if (!GEMINI_KEY) { console.error("❌ GEMINI_API_KEY no definido"); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { photos: [], step: "idle" };
  return sessions[chatId];
}

function clearSession(chatId) {
  sessions[chatId] = { photos: [], step: "idle" };
}

const CATEGORIAS = [
  "Herramientas", "Hogar", "Cocina", "Figuras", "Estetica",
  "Peliculas", "Oficina", "Juegos de Mesa", "Arte", "Camping",
  "Videojuegos", "Iluminacion", "Musica", "Agricultura",
  "Mascotas", "Computacion", "Electronica"
];

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function analizarProducto(imageBuffers) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const parts = [
    {
      text: `Eres un experto en ventas online en Costa Rica. Analiza estas fotos de un producto y responde EXACTAMENTE en este formato JSON, sin markdown, sin explicaciones extra:
{
  "nombre": "nombre del producto",
  "descripcion": "descripción atractiva para venta, máximo 2 oraciones",
  "precio": 00000,
  "categoria": "una de estas: ${CATEGORIAS.join(", ")}",
  "fondo_prompt": "descripción en inglés del fondo temático ideal para este producto, específico y detallado"
}
El precio debe ser en colones costarricenses (CRC), un precio justo de mercado secundario.`
    },
    ...imageBuffers.map(buf => ({
      inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") }
    }))
  ];
  const result = await model.generateContent(parts);
  const clean = result.response.text().trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}

async function generarFondoBase64(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-002" });
    const result = await model.generateImages({
      prompt: `Professional product photography background: ${prompt}. High quality, 4k, no products, just background.`,
      number_of_images: 1,
      aspect_ratio: "1:1"
    });
    if (result.images && result.images[0]) return result.images[0].imageBytes;
  } catch (e) {
    console.error("Error generando fondo:", e.message);
  }
  return null;
}

function formatCRC(n) {
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(n);
}

// ── COMANDOS ──────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  clearSession(msg.chat.id);
  bot.sendMessage(msg.chat.id,
    `👋 Hola! Soy el bot de catálogo de *Outlet Maker*.\n\n` +
    `📸 Enviame las fotos del producto que querés publicar.\n` +
    `Cuando termines escribí */analizar*\n\n` +
    `*/start* — Reiniciar\n` +
    `*/analizar* — Analizar fotos\n` +
    `*/cancelar* — Cancelar`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/cancelar/, (msg) => {
  clearSession(msg.chat.id);
  bot.sendMessage(msg.chat.id, "❌ Cancelado. Podés empezar de nuevo enviando fotos.");
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  if (session.step === "confirming") {
    bot.sendMessage(chatId, "⚠️ Hay un análisis pendiente. Escribí /confirmar o /cancelar primero.");
    return;
  }

  const bestPhoto = msg.photo[msg.photo.length - 1];
  session.photos.push(bestPhoto.file_id);
  session.step = "collecting";

  bot.sendMessage(chatId, `📸 Foto ${session.photos.length} recibida. Podés enviar más o escribir /analizar.`);
});

bot.onText(/\/analizar/, async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  if (!session.photos.length) {
    bot.sendMessage(chatId, "⚠️ Primero enviame las fotos del producto.");
    return;
  }

  bot.sendMessage(chatId, "⏳ Analizando con IA... puede tardar unos segundos.");

  try {
    const buffers = [];
    for (const fileId of session.photos) {
      const fileUrl = await bot.getFileLink(fileId);
      const buf = await downloadImage(fileUrl);
      buffers.push(buf);
    }

    const analisis = await analizarProducto(buffers);
    session.analisis = analisis;
    session.buffers = buffers;

    bot.sendMessage(chatId, "🎨 Generando fondo temático con IA...");
    const fondoBase64 = await generarFondoBase64(analisis.fondo_prompt);
    session.fondoBase64 = fondoBase64;
    session.step = "confirming";

    const imgBuffer = fondoBase64 ? Buffer.from(fondoBase64, "base64") : buffers[0];

    const resumen =
      `✅ Análisis completado\n\n` +
      `📦 Nombre: ${analisis.nombre}\n` +
      `💰 Precio: ${formatCRC(analisis.precio)}\n` +
      `📂 Categoría: ${analisis.categoria}\n` +
      `📝 Descripción: ${analisis.descripcion}\n\n` +
      `¿Publicar este producto?\n` +
      `/confirmar — Sí ✅\n` +
      `/cancelar — No ❌`;

    await bot.sendPhoto(chatId, imgBuffer, { caption: resumen });

  } catch (e) {
    console.error("Error en análisis:", e);
    bot.sendMessage(chatId, "❌ Error al analizar. Intentá de nuevo con /start");
    clearSession(chatId);
  }
});

bot.onText(/\/confirmar/, async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  if (session.step !== "confirming" || !session.analisis) {
    bot.sendMessage(chatId, "⚠️ No hay análisis pendiente. Enviame fotos primero.");
    return;
  }

  try {
    const { analisis, fondoBase64, buffers } = session;

    const fotos = [];
    fotos.push(`data:image/jpeg;base64,${fondoBase64 ? fondoBase64 : buffers[0].toString("base64")}`);
    for (let i = 1; i < buffers.length; i++) {
      fotos.push(`data:image/jpeg;base64,${buffers[i].toString("base64")}`);
    }

    const producto = {
      nombre: analisis.nombre,
      precio: analisis.precio,
      descripcion: analisis.descripcion,
      categoria: analisis.categoria,
      fotos
    };

    const payload = JSON.stringify(producto);
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "localhost",
        port: process.env.PORT || 8080,
        path: "/api/bot-publish",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.ok) resolve(j);
            else reject(new Error(j.error || "Error publicando"));
          } catch { reject(new Error("Respuesta inválida")); }
        });
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    clearSession(chatId);
    bot.sendMessage(chatId,
      `🎉 Producto publicado!\n\n📦 ${analisis.nombre}\n💰 ${formatCRC(analisis.precio)}\n📂 ${analisis.categoria}`
    );

  } catch (e) {
    console.error("Error publicando:", e);
    bot.sendMessage(chatId, `❌ Error al publicar: ${e.message}`);
  }
});

console.log("🤖 Bot de catálogo iniciado...");
module.exports = { bot };