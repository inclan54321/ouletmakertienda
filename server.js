    // ---- DEBUG: probar Telegram desde el navegador (GET) ----
    if (req.method === "GET" && req.url === "/api/telegram-test") {
      try {
        const token = process.env.TELEGRAM_BOT_TOKEN || "";
        const chatId = process.env.TELEGRAM_CHAT_ID || "";

        if (!token) return sendJson(res, 500, { ok: false, error: "TELEGRAM_BOT_TOKEN missing" });
        if (!chatId) return sendJson(res, 500, { ok: false, error: "TELEGRAM_CHAT_ID missing" });

        const payload = JSON.stringify({
          chat_id: chatId,
          text: "Prueba Telegram OK (GET /api/telegram-test)"
        });

        const r = await new Promise((resolve, reject) => {
          const req2 = https.request(
            {
              method: "POST",
              hostname: "api.telegram.org",
              path: `/bot${token}/sendMessage`,
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
              }
            },
            (resp) => {
              let data = "";
              resp.on("data", (c) => (data += c));
              resp.on("end", () => resolve({ status: resp.statusCode || 0, data }));
            }
          );
          req2.on("error", reject);
          req2.write(payload);
          req2.end();
        });

        return sendJson(res, 200, { ok: true, telegram_status: r.status, telegram_response: r.data });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message || "Server error" });
      }
    }

    // ---- Archivos estáticos ----
    const safeUrl = req.url.split("?")[0];