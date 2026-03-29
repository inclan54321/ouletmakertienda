const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const http = require("http");

const TOKEN = process.env.TELEGRAM_BOT_VENTAS_TOKEN;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) { console.error("❌ TELEGRAM_BOT_VENTAS_TOKEN no definido"); process.exit(1); }
if (!DEEPSEEK_KEY) { console.error("❌ DEEPSEEK_API_KEY no definido"); process.exit(1); }

const botVentas = new TelegramBot(TOKEN, { polling: true });

async function obtenerTerminos() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: "localhost",
      port: process.env.PORT || 8080,
      path: "/api/terminos",
      method: "GET"
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on("error", () => resolve({}));
    req.end();
  });
}

async function preguntarDeepSeek(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500
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
          resolve(j.choices[0].message.content.trim());
        } catch { reject(new Error("Error parseando respuesta DeepSeek")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

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

   // Si es el cliente — verificar si el enlace fue bloqueado
  if (ordenesCache[ordenId]?.bloqueado) {
    return botVentas.sendMessage(chatId,
      "🚫 Este enlace ya no está disponible. Contáctanos por otro medio."
    );
  }

  if (!conversaciones[ordenId]) conversaciones[ordenId] = {
    modo: "esperando",
    historial: [],
    contextoExtra: "",
    salidasTema: 0
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

  // DEBUG temporal
  console.log("conversaciones al usar /msg:", JSON.stringify(conversaciones));

  const ordenId = Object.keys(conversaciones).find(
    id => conversaciones[id] && conversaciones[id].clienteChatId
  );
  if (!ordenId) return botVentas.sendMessage(msg.chat.id, "⚠️ No hay orden activa o el cliente aún no abrió el bot.");

  const conv = conversaciones[ordenId];
  if (!conv.clienteChatId) return botVentas.sendMessage(msg.chat.id,
    "⚠️ El cliente aún no abrió el bot.\n" +
    "Esperá que el cliente le dé click al enlace del pedido."
  );

  await botVentas.sendMessage(conv.clienteChatId, texto);
  conv.historial.push({ rol: "admin", texto });
  conv.modo = "ia";

  // Iniciar timer de inactividad
  resetearTimerInactividad(ordenId);

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

  if (conv.timerAviso) clearTimeout(conv.timerAviso);
  if (conv.timerCierre) clearTimeout(conv.timerCierre);
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

  // Resetear timer de inactividad
  resetearTimerInactividad(ordenId);

  // Espejo al admin en tiempo real
  botVentas.sendMessage(ADMIN_CHAT_ID,
    `💬 *Orden #${ordenId}*\n👤 Cliente: "${msg.text}"`,
    { parse_mode: "Markdown" }
  );

  if (conv.modo !== "ia") return;

  // IA responde
  try {
    console.log("ordenId buscado:", ordenId);
    console.log("ordenesCache completo:", JSON.stringify(ordenesCache));
    const orden = ordenesCache[ordenId] || {};
    const terminos = await obtenerTerminos();

    const terminosTexto = `
ENVÍOS: ${terminos.envios?.empresa}. Costo fijo: ₡${terminos.envios?.costo}. ${terminos.envios?.tiempo}. Número de guía se envía al correo del cliente. No se hacen entregas personales.
DEVOLUCIONES: Plazo de ${terminos.devoluciones?.plazo}. Métodos: ${terminos.devoluciones?.metodos?.join(" / ")}.
GARANTÍA: ${terminos.garantia?.dias} días. Métodos: ${terminos.garantia?.metodos?.join(" / ")}.
PAGOS: ${terminos.pagos?.metodo} al ${terminos.pagos?.numero} a nombre de ${terminos.pagos?.nombre}.
    `.trim();

    const prompt =
      `Sos un asesor de ventas de Outlet Maker, una tienda en Costa Rica.\n` +
      `Sos amable, directo y profesional. Respondés en español.\n\n` +
      `TÉRMINOS DE SERVICIO (usá esto para tomar decisiones):\n${terminosTexto}\n\n` +
      `Información del pedido:\n` +
      `- Cliente: ${orden.nombre || "cliente"}\n` +
      `- Teléfono: ${orden.telefono || ""}\n` +
      `- Dirección: ${orden.direccion || ""}\n` +
      `- Productos: ${orden.productos ? orden.productos.map(p => `${p.name} x${p.qty || 1}`).join(", ") : ""}\n` +
      `- Total: ₡${orden.total || ""}\n\n` +
      `Estado real de los productos:\n${conv.contextoExtra || "Sin detalles adicionales"}\n\n` +
      `Historial:\n` +
      `${conv.historial.map(h => `${h.rol === "cliente" ? "Cliente" : "Asesor"}: ${h.texto}`).join("\n")}\n\n` +
      `REGLAS DE COMPORTAMIENTO:\n` +
      `- El cliente ha salido del tema ${conv.salidasTema} veces.\n` +
      `- Si el cliente se sale del tema de la compra:\n` +
      `  * 1ra vez (salidasTema llegará a 1): pedile amablemente que no cambie de tema.\n` +
      `  * 2da vez (salidasTema llegará a 2): advertile que el chat se cerrará si lo hace de nuevo.\n` +
      `  * 3ra vez (salidasTema llegará a 3): respondé EXACTAMENTE con la palabra CERRAR_CHAT y nada más.\n` +
      `- Si el cliente está hablando del pedido, respondé normal.\n\n` +
      `Respondé SOLO el próximo mensaje del asesor, sin etiquetas ni explicaciones.`;

    const respuesta = await preguntarDeepSeek(prompt);

    // Incrementar contador si la IA detectó salida de tema
    if (respuesta.trim() === "CERRAR_CHAT" || conv.salidasTema < 3 && (
      respuesta.includes("te pido") || respuesta.includes("advertimos") || respuesta.includes("cerrará")
    )) {
      conv.salidasTema = (conv.salidasTema || 0) + 1;
    }

    if (respuesta.trim() === "CERRAR_CHAT") {
      // Bloquear enlace
      if (ordenesCache[ordenId]) ordenesCache[ordenId].bloqueado = true;

      // Avisar al cliente
      await botVentas.sendMessage(clienteChatId,
        "🚫 Este chat ha sido cerrado porque te saliste del tema de la compra en varias ocasiones.\n" +
        "El enlace de tu pedido ya no está disponible. Contáctanos por otro medio."
      );

      // Notificar al admin
      botVentas.sendMessage(ADMIN_CHAT_ID,
        `🚫 *Chat cerrado automáticamente*\n` +
        `Orden #${ordenId} fue cerrada porque el cliente se salió del tema 3 veces.`,
        { parse_mode: "Markdown" }
      );

      delete conversaciones[ordenId];
      return;
    }

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

// ── Timer de inactividad ───────────────────────────────────

function resetearTimerInactividad(ordenId) {
  const conv = conversaciones[ordenId];
  if (!conv) return;

  // Limpiar timers anteriores
  if (conv.timerAviso) { clearTimeout(conv.timerAviso); conv.timerAviso = null; }
  if (conv.timerCierre) { clearTimeout(conv.timerCierre); conv.timerCierre = null; }

  // Aviso al minuto 1
  conv.timerAviso = setTimeout(async () => {
    if (!conversaciones[ordenId]) return;
    await botVentas.sendMessage(conv.clienteChatId,
      "⏳ ¿Seguís ahí? Si no respondés en 1 minuto el chat se cerrará automáticamente."
    );
  }, 60 * 1000);

  // Cierre al minuto 2
  conv.timerCierre = setTimeout(async () => {
    if (!conversaciones[ordenId]) return;
    const clienteChatId = conv.clienteChatId;

    // Avisar al cliente
    await botVentas.sendMessage(clienteChatId,
      "🚪 El chat fue cerrado por inactividad.\n" +
      "Podés retomar tu orden usando el enlace que te llegó al correo."
    );

    // Avisar al admin
    await botVentas.sendMessage(ADMIN_CHAT_ID,
      `⏰ *Chat cerrado por inactividad*\n` +
      `Orden #${ordenId} fue cerrada porque el cliente no respondió en 2 minutos.`,
      { parse_mode: "Markdown" }
    );

    delete conversaciones[ordenId];
  }, 2 * 60 * 1000);
}

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