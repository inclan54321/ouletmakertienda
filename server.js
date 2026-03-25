const http = require("http");
const fs = require("fs");
const path = require("path");

const sgMail = require("@sendgrid/mail");

const PORT = process.env.PORT || 8080;

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Outlet Maker Tienda";

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

http
  .createServer(async (req, res) => {

    // ---- DEBUG: comprobar variables (no muestra la key completa) ----
    if (req.method === "GET" && req.url === "/api/env-check") {
      const key = process.env.SENDGRID_API_KEY || "";
      return sendJson(res, 200, {
        has_SENDGRID_API_KEY: Boolean(key),
        SENDGRID_API_KEY_prefix: key ? key.slice(0, 6) + "..." : "",
        has_SENDGRID_FROM_EMAIL: Boolean(process.env.SENDGRID_FROM_EMAIL || "")
      });
    }

    // ---- API: enviar correo al usuario ----
    if (req.method === "POST" && req.url === "/api/send-email") {
      try {
        if (!SENDGRID_API_KEY) return sendJson(res, 500, { ok: false, error: "SENDGRID_API_KEY missing" });
        if (!SENDGRID_FROM_EMAIL) return sendJson(res, 500, { ok: false, error: "SENDGRID_FROM_EMAIL missing" });

        const body = await readJsonBody(req);
        const email = String(body.email || "").trim();
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!ok) return sendJson(res, 400, { ok: false, error: "Invalid email" });

        await sgMail.send({
          to: email,
          from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
          subject: "Registro de novedades",
          text: "Escríbenos aquí: https://t.me/InclanSoporteBot",
          html: '<p>Escríbenos aquí: <a href="https://t.me/InclanSoporteBot">https://t.me/InclanSoporteBot</a></p>'
        });

        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message || "Server error" });
      }
    }

    // ---- Archivos estáticos ----
    const safeUrl = req.url.split("?")[0];
    let filePath = path.join(__dirname, safeUrl === "/" ? "index.html" : safeUrl);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
      res.end(data);
    });
  })
  .listen(PORT, "0.0.0.0", () => console.log("Servidor en puerto " + PORT));