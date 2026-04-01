const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const http = require("http");

const TOKEN = process.env.TELEGRAM_BOT_VENTAS_TOKEN;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_NAME = process.env.SENDGRID_FROM_NAME || "Outlet Maker Tienda";

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

async function analizarImagenGemini(imageBase64, mimeType, contexto) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            text:
              `Sos un asistente de ventas de Outlet Maker, una tienda en Costa Rica.\n` +
              `Contexto del pedido actual:\n${contexto}\n\n` +
              `Analizá esta imagen y determiná:\n` +
              `1. ¿Es un comprobante de pago SINPE? Respondé SOLO con "SINPE_SI" o "SINPE_NO" en la primera línea.\n` +
              `2. Si es SINPE, extraé en líneas separadas: MONTO: xxx, CONFIRMACION: xxx, FECHA: xxx, HORA: xxx.\n` +
              `3. Si NO es SINPE, describí brevemente qué muestra la imagen y si está relacionada con el pedido (producto, consulta, etc). Respondé en español.`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          }
        ]
      }]
    });

    const req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          resolve(j.candidates[0].content.parts[0].text.trim());
        } catch { reject(new Error("Error parseando respuesta Gemini")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function descargarImagenBase64(fileUrl) {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
      res.on("error", reject);
    });
  });
}

async function enviarCorreoSinpe(email, nombre, ordenId, accion) {
  if (!SENDGRID_KEY || !SENDGRID_FROM) return;
  const sgMail = require("@sendgrid/mail");
  sgMail.setApiKey(SENDGRID_KEY);

  if (accion === "confirmar") {
    await sgMail.send({
      to: email,
      from: { email: SENDGRID_FROM, name: SENDGRID_NAME },
      subject: `✅ Pago confirmado — Pedido #${ordenId}`,
      html:
        `<p>Hola <strong>${nombre}</strong>,</p>` +
        `<p>Nos complace informarte que tu pago para el pedido <strong>#${ordenId}</strong> ha sido confirmado exitosamente. 🎉</p>` +
        `<p>En breve recibirás el número de rastreo de tu pedido para que puedas darle seguimiento.</p>` +
        `<p>Gracias por confiar en <strong>Outlet Maker</strong>. ¡Fue un placer atenderte! 🙌</p>`
    });
  } else {
    await sgMail.send({
      to: email,
      from: { email: SENDGRID_FROM, name: SENDGRID_NAME },
      subject: `⚠️ Verificación de pago — Pedido #${ordenId}`,
      html:
        `<p>Hola <strong>${nombre}</strong>,</p>` +
        `<p>Hemos revisado cuidadosamente tu comprobante de pago para el pedido <strong>#${ordenId}</strong>, ` +
        `pero lamentablemente no pudimos encontrar ningún depósito registrado a nuestro nombre.</p>` +
        `<p>No te preocupes, uno de nuestros asesores se pondrá en contacto contigo muy pronto para ayudarte a resolver esta situación.</p>` +
        `<p>Disculpá los inconvenientes. Estamos a tus órdenes. 🙏</p>`
    });
  }
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
const filaEspera = [];     // [{ ordenId, chatId }]
const MAX_FILA = 12;

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

  // Verificar si ya hay una conversación activa con otro cliente
  const hayConversacionActiva = Object.values(conversaciones).some(
    c => c.clienteChatId && c.modo !== "esperando"
  );

  if (hayConversacionActiva) {
    // Verificar si ya está en la fila
    const yaEnFila = filaEspera.find(f => f.ordenId === ordenId);
    if (yaEnFila) {
      const pos = filaEspera.findIndex(f => f.ordenId === ordenId) + 1;
      return botVentas.sendMessage(chatId,
        `⏳ Ya estás en la fila, tu posición actual es *#${pos}*.\n` +
        `Por favor seguí esperando, te atenderemos muy pronto. 🙏`,
        { parse_mode: "Markdown" }
      );
    }

    // Verificar límite de fila
    if (filaEspera.length >= MAX_FILA) {
      return botVentas.sendMessage(chatId,
        "😔 Lo sentimos, en este momento no podemos atenderte.\n" +
        "Por favor intentá más tarde. 🙏"
      );
    }

    // Agregar a la fila
    filaEspera.push({ ordenId, chatId });
    const pos = filaEspera.length;
    const otros = pos === 1 ? "1 persona esperando" : `${pos} personas esperando`;

    return botVentas.sendMessage(chatId,
      `👋 ¡Hola! Gracias por tu compra en *Outlet Maker*.\n\n` +
      `🕐 En este momento estamos atendiendo a otro cliente.\n` +
      `📋 Hay *${otros}* antes que vos, incluyéndote a vos.\n\n` +
      `Te avisaremos en cuanto sea tu turno. ¡Gracias por tu paciencia! 🙏`,
      { parse_mode: "Markdown" }
    );
  }

  // No hay conversación activa — atender directamente
  const historialGuardado = (
    ordenesCache[ordenId]?._historial &&
    ordenesCache[ordenId]?._historialExpira > Date.now()
  ) ? ordenesCache[ordenId]._historial : [];

  const esRegreso = historialGuardado.length > 0;

  if (!conversaciones[ordenId]) conversaciones[ordenId] = {
    modo: esRegreso ? "ia" : "esperando",
    historial: historialGuardado,
    contextoExtra: ordenesCache[ordenId]?.contextoExtra || "",
    salidasTema: 0
  };

  conversaciones[ordenId].clienteChatId = chatId;

  if (esRegreso) {
    // Cliente regresa — IA retoma directamente
    botVentas.sendMessage(chatId,
      "👋 ¡Bienvenido de vuelta a *Outlet Maker*! Continuamos donde lo dejamos. 🙌",
      { parse_mode: "Markdown" }
    );
    botVentas.sendMessage(ADMIN_CHAT_ID,
      `🔄 *Cliente retomó la conversación*\nOrden #${ordenId} — La IA tiene el historial y retoma automáticamente.`,
      { parse_mode: "Markdown" }
    );
    resetearTimerInactividad(ordenId);
  } else {
    botVentas.sendMessage(chatId,
      "👋 ¡Hola! Gracias por tu compra en *Outlet Maker*.\n" +
      "En breve un asesor va a revisar tu pedido. 🙌",
      { parse_mode: "Markdown" }
    );
  }
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
  if (ordenesCache[ordenId]) {
    ordenesCache[ordenId]._historial = conv.historial || [];
    ordenesCache[ordenId]._historialExpira = Date.now() + (8 * 60 * 60 * 1000);
  }
  delete conversaciones[ordenId];
  atenderSiguienteEnFila();
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

  // Rechazar audios
  if (msg.voice || msg.audio) {
    return botVentas.sendMessage(clienteChatId,
      "🎙️ Lo sentimos, por el momento no podemos recibir mensajes de voz.\n" +
      "Por favor escribí tu consulta en texto y con gusto te atendemos. 🙏"
    );
  }

  // Rechazar llamadas (video_note también por las dudas)
  if (msg.video_note) {
    return botVentas.sendMessage(clienteChatId,
      "📵 Las llamadas no están disponibles en este canal de atención.\n" +
      "Por favor escribí tu consulta en texto y te respondemos a la brevedad. 🙏"
    );
  }

  // Manejar fotos
  if (msg.photo) {
    resetearTimerInactividad(ordenId);

    const orden = ordenesCache[ordenId] || {};
    const contexto =
      `Cliente: ${orden.nombre || "cliente"}\n` +
      `Productos: ${orden.productos ? orden.productos.map(p => `${p.name} x${p.qty || 1}`).join(", ") : ""}\n` +
      `Total: ₡${orden.total || ""}\n` +
      `Historial reciente:\n${conv.historial.slice(-4).map(h => `${h.rol}: ${h.texto || "[imagen]"}`).join("\n")}`;

    try {
      // Descargar la foto
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfoUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
      const fileInfo = await new Promise((resolve, reject) => {
        https.get(fileInfoUrl, (res) => {
          let d = "";
          res.on("data", c => d += c);
          res.on("end", () => resolve(JSON.parse(d)));
          res.on("error", reject);
        });
      });
      const filePath = fileInfo.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
      const imageBase64 = await descargarImagenBase64(fileUrl);
      const mimeType = filePath.endsWith(".png") ? "image/png" : "image/jpeg";

      // Analizar con Gemini
      const geminiRespuesta = await analizarImagenGemini(imageBase64, mimeType, contexto);
      const primeraLinea = geminiRespuesta.split("\n")[0].trim();

      if (primeraLinea === "SINPE_SI") {
        // Extraer datos del comprobante
        const monto = (geminiRespuesta.match(/MONTO:\s*(.+)/i) || [])[1] || "No detectado";
        const confirmacion = (geminiRespuesta.match(/CONFIRMACION:\s*(.+)/i) || [])[1] || "No detectado";
        const fecha = (geminiRespuesta.match(/FECHA:\s*(.+)/i) || [])[1] || "No detectado";
        const hora = (geminiRespuesta.match(/HORA:\s*(.+)/i) || [])[1] || "No detectado";

        // Avisar al cliente
        await botVentas.sendMessage(clienteChatId,
          "💚 ¡Muchas gracias por tu comprobante de pago!\n\n" +
          "Estamos verificando tu depósito. En breve recibirás un correo con la confirmación del pago " +
          "y las instrucciones para continuar con el proceso. 🙏\n\n" +
          "¡Fue un placer atenderte en Outlet Maker! 🛍️"
        );

        // Notificar al admin con botones
        const notifMsg =
          `💳 *Posible comprobante SINPE recibido*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `📋 Orden: #${ordenId}\n` +
          `👤 Cliente: ${orden.nombre || "—"}\n` +
          `📧 Correo: ${orden.email || "—"}\n\n` +
          `🧾 *Datos del comprobante:*\n` +
          `💰 Monto: ${monto}\n` +
          `🔢 Confirmación: ${confirmacion}\n` +
          `📅 Fecha: ${fecha}\n` +
          `🕐 Hora: ${hora}`;

        await botVentas.sendMessage(ADMIN_CHAT_ID, notifMsg, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Confirmar pago", callback_data: `sinpe_confirmar_${ordenId}` },
              { text: "❌ Denegar pago", callback_data: `sinpe_denegar_${ordenId}` }
            ]]
          }
        });

        // Cerrar el chat
        if (conv.timerAviso) clearTimeout(conv.timerAviso);
        if (conv.timerCierre) clearTimeout(conv.timerCierre);
        delete conversaciones[ordenId];
        atenderSiguienteEnFila();
        return;
      }

      // No es SINPE — describir la imagen con DeepSeek
      const descripcionImagen = geminiRespuesta.split("\n").slice(1).join(" ").trim() || geminiRespuesta;

      const promptConFoto =
        `Sos un asesor de ventas de Outlet Maker, una tienda en Costa Rica.\n` +
        `Sos amable, directo y profesional. Respondés en español.\n\n` +
        `El cliente envió una imagen. Gemini la analizó y dice:\n"${descripcionImagen}"\n\n` +
        `Contexto del pedido:\n${contexto}\n\n` +
        `REGLAS:\n` +
        `- Si la imagen está relacionada con el pedido o el producto, respondé útilmente.\n` +
        `- Si la imagen NO tiene relación con el pedido, tratala como una salida de tema.\n` +
        `- El cliente ha salido del tema ${conv.salidasTema} veces.\n` +
        `  * 1ra vez: pedile amablemente que no cambie de tema.\n` +
        `  * 2da vez: advertile que el chat se cerrará.\n` +
        `  * 3ra vez: respondé EXACTAMENTE con CERRAR_CHAT y nada más.\n\n` +
        `Respondé SOLO el próximo mensaje del asesor, sin etiquetas ni explicaciones.`;

      const respuesta = await preguntarDeepSeek(promptConFoto);

      if (respuesta.trim() === "CERRAR_CHAT") {
        if (ordenesCache[ordenId]) ordenesCache[ordenId].bloqueado = true;
        await botVentas.sendMessage(clienteChatId,
          "🚫 Este chat ha sido cerrado porque te saliste del tema de la compra en varias ocasiones.\n" +
          "El enlace de tu pedido ya no está disponible. Contáctanos por otro medio."
        );
        botVentas.sendMessage(ADMIN_CHAT_ID,
          `🚫 *Chat cerrado automáticamente*\nOrden #${ordenId} fue cerrada porque el cliente se salió del tema 3 veces.`,
          { parse_mode: "Markdown" }
        );
        if (conv.timerAviso) clearTimeout(conv.timerAviso);
        if (conv.timerCierre) clearTimeout(conv.timerCierre);
        delete conversaciones[ordenId];
        atenderSiguienteEnFila();
        return;
      }

      if (conv.salidasTema < 3) conv.salidasTema = (conv.salidasTema || 0) + 1;
      await botVentas.sendMessage(clienteChatId, respuesta);
      conv.historial.push({ rol: "ia", texto: `[imagen analizada] ${respuesta}` });
      botVentas.sendMessage(ADMIN_CHAT_ID,
        `🖼️ *Cliente envió imagen (Orden #${ordenId})*\nGemini: ${descripcionImagen.slice(0, 200)}\n🤖 IA respondió: "${respuesta}"`,
        { parse_mode: "Markdown" }
      );

    } catch (e) {
      console.error("Error analizando imagen:", e);
      botVentas.sendMessage(clienteChatId,
        "⚠️ Hubo un problema analizando tu imagen. Por favor intentá de nuevo o describí tu consulta en texto. 🙏"
      );
    }
    return;
  }

  // Detectar si el cliente dice que ya pagó — la IA decide
  const promptPago =
    `Analizá el siguiente mensaje de un cliente de una tienda en Costa Rica.\n` +
    `¿El cliente está indicando que ya realizó un pago o transferencia SINPE?\n` +
    `Respondé ÚNICAMENTE con SI o NO, sin explicaciones.\n\n` +
    `Mensaje: "${msg.text}"`;
  const respuestaPago = await preguntarDeepSeek(promptPago);
  const mencionaPago = respuestaPago.trim().toUpperCase().startsWith("SI");

  if (mencionaPago) {
    resetearTimerInactividad(ordenId);
    const orden = ordenesCache[ordenId] || {};

    await botVentas.sendMessage(clienteChatId,
      "💚 ¡Muchas gracias por informarnos!\n\n" +
      "En breve recibirás un correo con la confirmación de tu depósito y las instrucciones para continuar con el proceso. 🙏\n\n" +
      "¡Fue un placer atenderte en Outlet Maker! 🛍️"
    );

    await botVentas.sendMessage(ADMIN_CHAT_ID,
      `💳 *El cliente indica que ya realizó el pago*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📋 Orden: #${ordenId}\n` +
      `👤 Cliente: ${orden.nombre || "—"}\n` +
      `📧 Correo: ${orden.email || "—"}\n` +
      `💬 Mensaje: "${msg.text}"`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Confirmar pago", callback_data: `sinpe_confirmar_${ordenId}` },
            { text: "❌ Denegar pago", callback_data: `sinpe_denegar_${ordenId}` }
          ]]
        }
      }
    );

    if (conv.timerAviso) clearTimeout(conv.timerAviso);
    if (conv.timerCierre) clearTimeout(conv.timerCierre);
    delete conversaciones[ordenId];
    atenderSiguienteEnFila();
    return;
  }

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
      atenderSiguienteEnFila();
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

// ── Pasar al siguiente en la fila ─────────────────────────

async function atenderSiguienteEnFila() {
  if (filaEspera.length === 0) return;

  const siguiente = filaEspera.shift(); // sacar el primero
  const { ordenId, chatId } = siguiente;

  if (!conversaciones[ordenId]) conversaciones[ordenId] = {
    modo: "esperando",
    historial: [],
    contextoExtra: "",
    salidasTema: 0
  };

  conversaciones[ordenId].clienteChatId = chatId;

  // Avisar al cliente que es su turno
  await botVentas.sendMessage(chatId,
    "🎉 ¡Ya es tu turno!\n\n" +
    "📦 Estamos revisando tu pedido, muy pronto serás atendido. 🙌",
    { parse_mode: "Markdown" }
  );

  // Avisar al admin
  await botVentas.sendMessage(ADMIN_CHAT_ID,
    `📋 *Siguiente cliente en fila*\n` +
    `Orden #${ordenId} ya está lista para ser atendida.\n` +
    `Usá /msg para escribirle.`,
    { parse_mode: "Markdown" }
  );

  // Actualizar posiciones a los que siguen esperando
  filaEspera.forEach((f, i) => {
    botVentas.sendMessage(f.chatId,
      `📋 Avanzaste en la fila, ahora estás en la posición *#${i + 1}*. ¡Gracias por tu paciencia! 🙏`,
      { parse_mode: "Markdown" }
    );
  });
}

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

    // Guardar historial por 8 horas antes de borrar
    if (ordenesCache[ordenId]) {
      ordenesCache[ordenId]._historial = conversaciones[ordenId].historial || [];
      ordenesCache[ordenId]._historialExpira = Date.now() + (8 * 60 * 60 * 1000);
    }
    delete conversaciones[ordenId];
    atenderSiguienteEnFila();
  }, 2 * 60 * 1000);
}

// ── Manejar botones inline (confirmar/denegar SINPE) ──────

botVentas.on("callback_query", async (query) => {
  if (String(query.from.id) !== String(ADMIN_CHAT_ID)) return;

  const data = query.data || "";
  const [accion, tipo, ordenId] = data.split("_"); // sinpe_confirmar_0013

  if (accion !== "sinpe") return;

  const orden = ordenesCache[ordenId] || {};
  const email = orden.email || "";
  const nombre = orden.nombre || "cliente";

  try {
    await enviarCorreoSinpe(email, nombre, ordenId, tipo);

    if (tipo === "confirmar") {
      // Mandar a imprimir etiqueta
      const ngrokUrl = process.env.NGROK_URL || "";
      if (ngrokUrl) {
        try {
          const printPayload = JSON.stringify({
            secreto: "ouletmaker2024",
            orderNumber: ordenId,
            nombre: orden.nombre || "—",
            telefono: orden.telefono || "—",
            direccion: orden.direccion || "—",
            productos: orden.productos || []
          });
          await new Promise((resolve, reject) => {
            const urlObj = new URL(ngrokUrl + "/imprimir");
            const reqP = https.request({
              hostname: urlObj.hostname,
              path: urlObj.pathname,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(printPayload)
              }
            }, (r) => {
              let d = "";
              r.on("data", c => d += c);
              r.on("end", () => resolve(d));
            });
            reqP.on("error", reject);
            reqP.write(printPayload);
            reqP.end();
          });
          console.log(`🖨️ Impresión enviada — Orden #${ordenId}`);
        } catch (e) {
          console.error("Error enviando a imprimir:", e.message);
        }
      }

      await botVentas.answerCallbackQuery(query.id, { text: "✅ Correo de confirmación enviado." });
      await botVentas.editMessageText(
        `✅ *Pago confirmado*\nOrden #${ordenId} — Correo enviado a ${email}`,
        { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: "Markdown" }
      );
    } else {
      await botVentas.answerCallbackQuery(query.id, { text: "❌ Correo de denegación enviado." });
      await botVentas.editMessageText(
        `❌ *Pago denegado*\nOrden #${ordenId} — Correo enviado a ${email}`,
        { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: "Markdown" }
      );
    }
  } catch (e) {
    console.error("Error enviando correo SINPE:", e);
    await botVentas.answerCallbackQuery(query.id, { text: "⚠️ Error enviando el correo." });
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

// Rechazar llamadas telefónicas al bot
botVentas.on("message", (msg) => {
  if (String(msg.chat.id) === String(ADMIN_CHAT_ID)) return;
  if (msg.phone_number || (msg.contact && msg.contact.phone_number)) {
    botVentas.sendMessage(msg.chat.id,
      "📵 Las llamadas no están disponibles en este canal.\n" +
      "Por favor escribí tu consulta en texto y te atendemos con gusto. 🙏"
    );
  }
});

console.log("💬 Bot de ventas iniciado...");
module.exports = { botVentas, registrarOrden };