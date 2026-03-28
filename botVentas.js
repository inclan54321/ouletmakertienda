const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const TOKEN = process.env.TELEGRAM_BOT_VENTAS_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) { console.error("❌ TELEGRAM_BOT_VENTAS_TOKEN no definido"); process.exit(1); }
if (!GEMINI_KEY) { console.error("❌ GEMINI_API_KEY no definido"); process.exit(1); }

const botVentas = new TelegramBot(TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// { ordenId: { clienteChatId, modo, contextoExtra, historial[], ordenData } }
const conversaciones = {};
const ordenesCache = {};   // { ordenId: ordenData }

// ── Utilidad ───────────────────────────────────────────────

function encontrarOrdenDeAdmin() {
  return Object.keys(conversaciones).find(
    id => conversaciones[id].modo !== undefined
  );
}

function encontrarOrdenDeCliente(clienteChatId) {
  return Object.keys(conversaciones).find(
    id => String(conversaciones[id].clienteChatId) === String(clienteChatId)
  );
}

// ── CLIENTE abre el bot con el enlace del pedido ───────────

botVentas.onText(/\/start orden_(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const ordenId = match[1];

  // TEMPORAL - borrar después
  console.log("chatId que llegó:", chatId);
  console.log("ADMIN_CHAT_ID:", ADMIN_CHAT_ID);
  console.log("¿Son iguales?:", String(chatId) === String(ADMIN_CHAT_ID));
  console.log("ordenesCache:", JSON.stringify(ordenesCache));

  // Si es el admin
  if (String(chatId) === String(ADMIN_CHAT_ID)) {
    if (!conversaciones[ordenId]) conversaciones[ordenId] = {
      modo: "esperando",
      historial: [],
      contextoExtra: ""
    };

    const orden = ordenesCache[ordenId];
    const resumen = orden
      ? `📋 Orden #${ordenId}\n\n` +
        `👤 ${orden.nombre}\n` +
        `📞 ${orden.telefono}\n` +
        `📍 ${orden.direccion}\n` +
        `💰 Total: ₡${Number(orden.total).toLocaleString("es-CR")}\n\n` +
        `📦 Productos:\n${orden.productos.map(p => `  - ${p.name} x${p.qty || 1}`).join("\n")}`
      : `📋 Orden #${ordenId} cargada`;

    return botVentas.sendMessage(chatId,
      `${resumen}\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Antes de contactar al cliente podés agregar\n` +
      `el estado real de los productos:\n\n` +
      `/detalles <info>\n\n` +
      `Cuando estés listo escribí el primer mensaje:\n` +
      `/msg <texto>`
    );
  }

  // Si es el cliente
  if (!conversaciones[ordenId]) conversaciones[ordenId] = {
    modo: "esperando",
    historial: [],
    contextoExtra: ""
  };

  conversaciones[ordenId].clienteChatId = chatId;

  botVentas.sendMessage(chatId,
    "👋 Hola! Gracias por tu compra en *Outlet Maker*.\n" +
    "En breve un asesor te va a contactar. 🙌",
    { parse_mode: "Markdown" }
  );
});

// ── ADMIN agrega detalles reales de los productos ──────────

botVentas.onText(/\/detalles (.+)/s, (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const texto = match[1];

  const ordenId = Object.keys(conversaciones).find(
    id => conversaciones[id] !== undefined
  );
  if (!ordenId) return botVentas.sendMessage(msg.chat.id, "⚠️ No hay orden activa. Usá el enlace del pedido.");

  conversaciones[ordenId].contextoExtra += "\n" + texto;
  botVentas.sendMessage(msg.chat.id,
    "✅ Info guardada.\n\nCuando estés listo escribí el primer mensaje:\n/msg <texto>"
  );
});

// ── ADMIN envía el primer mensaje al cliente ───────────────

botVentas.onText(/\/msg (.+)/s, async (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const texto = match[1];

  const ordenId = Object.keys(conversaciones).find(
    id => conversaciones[id] !== undefined
  );
  if (!ordenId) return botVentas.sendMessage(msg.chat.id, "⚠️ No hay orden activa.");

  const conv = conversaciones[ordenId];
  if (!conv.clienteChatId) return botVentas.sendMessage(msg.chat.id,
    "⚠️ El cliente aún no abrió el bot.\n" +
    "Esperá que el cliente le dé click al enlace del pedido."
  );

  await botVentas.sendMessage(conv.clienteChatId, texto);
  conv.historial.push({ rol: "admin", texto });
  conv.modo = "ia";

  botVentas.sendMessage(msg.chat.id,
    "✅ Mensaje enviado al cliente.\n" +
    "🤖 La IA toma el control desde ahora.\n\n" +
    "Comandos disponibles:\n" +
    "/tomar — Tomás el control vos\n" +
    "/ia — Devolvés el control a la IA\n" +
    "/cerrar — Cerrar la conversación"
  );
});

// ── ADMIN toma el control ──────────────────────────────────

botVentas.onText(/\/tomar/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const ordenId = Object.keys(conversaciones).find(id => conversaciones[id]);
  if (!ordenId) return;
  conversaciones[ordenId].modo = "admin";
  botVentas.sendMessage(msg.chat.id,
    "🎮 Control tomado. Respondés vos directamente.\n" +
    "Escribí normal para responderle al cliente.\n" +
    "/ia para devolvérselo a la IA."
  );
});

// ── ADMIN devuelve control a la IA ─────────────────────────

botVentas.onText(/\/ia/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const ordenId = Object.keys(conversaciones).find(id => conversaciones[id]);
  if (!ordenId) return;
  conversaciones[ordenId].modo = "ia";
  botVentas.sendMessage(msg.chat.id, "🤖 IA en control nuevamente.");
});

// ── ADMIN cierra la conversación ───────────────────────────

botVentas.onText(/\/cerrar/, async (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  const ordenId = Object.keys(conversaciones).find(id => conversaciones[id]);
  if (!ordenId) return;

  const conv = conversaciones[ordenId];
  if (conv.clienteChatId) {
    await botVentas.sendMessage(conv.clienteChatId,
      "✅ Gracias por tu compra en *Outlet Maker*!\n" +
      "Cualquier consulta estamos a la orden. 🙌",
      { parse_mode: "Markdown" }
    );
  }

  delete conversaciones[ordenId];
  botVentas.sendMessage(msg.chat.id, `✅ Conversación #${ordenId} cerrada y archivada.`);
});

// ── ADMIN responde manualmente (modo admin) ────────────────

botVentas.on("message", async (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return;
  if (msg.text && msg.text.startsWith("/")) return;

  const ordenId = Object.keys(conversaciones).find(
    id => conversaciones[id] && conversaciones[id].modo === "admin"
  );
  if (!ordenId) return;

  const conv = conversaciones[ordenId];
  if (!conv.clienteChatId) return;

  await botVentas.sendMessage(conv.clienteChatId, msg.text);
  conv.historial.push({ rol: "admin", texto: msg.text });
});

// ── CLIENTE responde → IA contesta ────────────────────────

botVentas.on("message", async (msg) => {
  const clienteChatId = msg.chat.id;
  if (String(clienteChatId) === String(ADMIN_CHAT_ID)) return;
  if (msg.text && msg.text.startsWith("/")) return;

  const ordenId = encontrarOrdenDeCliente(clienteChatId);
  if (!ordenId) return;

  const conv = conversaciones[ordenId];
  conv.historial.push({ rol: "cliente", texto: msg.text });

  // Espejo al admin en tiempo real
  botVentas.sendMessage(ADMIN_CHAT_ID,
    `💬 *Orden #${ordenId}*\n👤 Cliente: "${msg.text}"`,
    { parse_mode: "Markdown" }
  );

  if (conv.modo !== "ia") return;

  // IA responde
  try {
    const orden = ordenesCache[ordenId] || {};

    const prompt =
      `Sos un asesor de ventas de Outlet Maker, una tienda en Costa Rica.\n` +
      `Sos amable, directo y profesional. Respondés en español.\n\n` +
      `Información del pedido:\n` +
      `- Cliente: ${orden.nombre || "cliente"}\n` +
      `- Teléfono: ${orden.telefono || ""}\n` +
      `- Dirección: ${orden.direccion || ""}\n` +
      `- Productos: ${orden.productos ? orden.productos.map(p => `${p.name} x${p.qty || 1}`).join(", ") : ""}\n` +
      `- Total: ₡${orden.total || ""}\n\n` +
      `Estado real de los productos:\n${conv.contextoExtra || "Sin detalles adicionales"}\n\n` +
      `Historial:\n` +
      `${conv.historial.map(h => `${h.rol === "cliente" ? "Cliente" : "Asesor"}: ${h.texto}`).join("\n")}\n\n` +
      `Respondé SOLO el próximo mensaje del asesor, sin etiquetas ni explicaciones.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const respuesta = result.response.text().trim();

    await botVentas.sendMessage(clienteChatId, respuesta);
    conv.historial.push({ rol: "ia", texto: respuesta });

    // Espejo al admin
    botVentas.sendMessage(ADMIN_CHAT_ID,
      `🤖 *IA respondió:*\n"${respuesta}"`,
      { parse_mode: "Markdown" }
    );

  } catch (e) {
    console.error("Error IA ventas:", e);
  }
});

// ── Registrar orden desde server.js ───────────────────────

function registrarOrden(ordenId, datos) {
  ordenesCache[ordenId] = datos;
  if (!conversaciones[ordenId]) {
    conversaciones[ordenId] = {
      modo: "esperando",
      historial: [],
      contextoExtra: ""
    };
  }
}

console.log("💬 Bot de ventas iniciado...");
module.exports = { botVentas, registrarOrden };