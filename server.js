    // ---- DEBUG: probar Telegram desde el navegador (GET) ----
    if (req.method === "GET" && req.url === "/api/telegram-test") {
      const token = process.env.TELEGRAM_BOT_TOKEN || "";
      const chatId = process.env.TELEGRAM_CHAT_ID || "";

      return sendJson(res, 200, {
        ok: true,
        has_TELEGRAM_BOT_TOKEN: Boolean(token),
        has_TELEGRAM_CHAT_ID: Boolean(chatId),
        TELEGRAM_CHAT_ID: chatId ? String(chatId) : ""
      });
    }

    // ---- Archivos estáticos ----
    const safeUrl = req.url.split("?")[0];