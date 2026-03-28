
require("dotenv").config();

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const sgMail = require("@sendgrid/mail");

// ── Iniciar el bot ──────────────────────────────────
require("./bot");
const { registrarOrden } = require("./botVentas");

const { registrarOrden } = require("./botVentas");

const PORT = process.env.PORT || 8080;

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Outlet Maker Tienda";

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

// Productos en memoria (se cargan desde products.json si existe)
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const CATEGORIES_FILE = path.join(__dirname, "categories.json");

function loadCategories() {
  try {
    if (fs.existsSync(CATEGORIES_FILE)) {
      return JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
    }
  } catch (e) {}
  return [];
}

function loadProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error leyendo products.json:", e.message);
  }
  return [];
}

function saveProducts(products) {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf8");
  } catch (e) {
    console.error("Error guardando products.json:", e.message);
  }
}

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
      if (raw.length > 10_000_000) reject(new Error("Payload too large"));
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

    // ── ENV CHECK ───────────────────────────────────
    if (req.method === "GET" && req.url === "/api/env-check") {
      const key = process.env.SENDGRID_API_KEY || "";
      return sendJson(res, 200, {
        has_SENDGRID_API_KEY: Boolean(key),
        SENDGRID_API_KEY_prefix: key ? key.slice(0, 6) + "..." : "",
        has_SENDGRID_FROM_EMAIL: Boolean(process.env.SENDGRID_FROM_EMAIL || ""),
        has_TELEGRAM_BOT_TOKEN: Boolean(process.env.TELEGRAM_BOT_TOKEN || ""),
        has_TELEGRAM_CHAT_ID: Boolean(process.env.TELEGRAM_CHAT_ID || ""),
        has_TELEGRAM_BOT_C_TOKEN: Boolean(process.env["TELEGRAM_BOT-C_TOKEN"] || ""),
        has_GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY || "")
      });
    }

    // ── SEND EMAIL ──────────────────────────────────
    if (req.method === "POST" && req.url === "/api/send-email") {
      try {
        if (!SENDGRID_API_KEY) return sendJson(res, 500, { ok: false, error: "SENDGRID_API_KEY missing" });
        if (!SENDGRID_FROM_EMAIL) return sendJson(res, 500, { ok: false, error: "SENDGRID_FROM_EMAIL missing" });

        const body = await readJsonBody(req);
        const email = String(body.email || "").trim();
        const categoria = String(body.categoria || "").trim().toLowerCase();
        const enlacesPorCategoria = {
  "estetica":       "https://t.me/+1iBBFkOvNfBlNjRh",
  "oficina":        "https://t.me/+XTNkbFPPnMxlZTlh",
  "computacion":    "https://t.me/+2DKnSvKnmlsyZGYx",
  "electronica":    "https://t.me/+PuiCxP_kuHMwNTMx",
  "agricultura":    "https://t.me/+KzdpKnY0MGI5",
  "arte":           "https://t.me/+WRQ1Z_9Fwv1kMjIx",
  "juego de mesa":  "https://t.me/+n20rNfhpK5EzMjZh",
  "cocina":         "https://t.me/+T3A8VoJqwfVhNTI5",
  "camping":        "https://t.me/+0QWrzAAfzSViZWIx",
  "iluminacion":    "https://t.me/+W1ILm_UWFuo2NzMx",
  "figuras":        "https://t.me/+RBuMVQj66rsyYzIx",
  "herramientas":   "https://t.me/+5k7ZMWYO40ZmMjJh",
  "musica":         "https://t.me/+_bT6YjcicTkyN2I5",
  "peliculas":      "https://t.me/+N_zdJD6FDf8xYTEx",
  "videojuegos":    "https://t.me/+PAfxm8Y3ttMxNjlh",
  "mascotas":       "https://t.me/+ISecWwFy9Cg0ZTQx",
  "hogar":          "https://t.me/+KSjDTiqhETNmNzkx"
};
const enlace = enlacesPorCategoria[categoria] || "https://t.me/+KSjDTiqhETNmNzkx";
const nombreCat = categoria.charAt(0).toUpperCase() + categoria.slice(1);
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!ok) return sendJson(res, 400, { ok: false, error: "Invalid email" });

        await sgMail.send({
          to: email,
          from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
          subject: `Novedades de ${nombreCat}`,
          text: `Novedades de ${nombreCat}: ${enlace}`,
          html: `<p>Novedades de <strong>${nombreCat}</strong>: <a href="${enlace}">${enlace}</a></p>`
        });

        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message || "Server error" });
      }
    }

    // ── TELEGRAM NOTIFY ─────────────────────────────
    if (req.method === "POST" && req.url === "/api/telegram-notify") {
      try {
        const token = process.env.TELEGRAM_BOT_TOKEN || "";
        const chatId = process.env.TELEGRAM_CHAT_ID || "";

        if (!token) return sendJson(res, 500, { ok: false, error: "TELEGRAM_BOT_TOKEN missing" });
        if (!chatId) return sendJson(res, 500, { ok: false, error: "TELEGRAM_CHAT_ID missing" });

        const body = await readJsonBody(req);
        const type = String(body.type || "generic");
        const text = String(body.text || "");
        const ordenId = body.ordenId || Date.now().toString(); // <- línea nueva
        if (type === "cart" && body.clienteData) {             // <- línea nueva
          registrarOrden(ordenId, body.clienteData);           // <- línea nueva
        }                                                      // <- línea nueva

        const msg =
          type === "customer_service" ? `Servicio al cliente:\n${text}` :
          type === "cart" ? `🛒 Nuevo Pedido #${ordenId}\n\n${text}\n\n👇 Atender cliente con IA →\nt.me/Ouletmascobot?start=orden_${ordenId}` :
          `Mensaje:\n${text}`;

        const payload = JSON.stringify({ chat_id: chatId, text: msg });

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

        if (r.status < 200 || r.status >= 300) {
          return sendJson(res, 502, { ok: false, error: "Telegram send failed", details: r.data });
        }

        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message || "Server error" });
      }
    }


    // ── SAVE CATEGORIES (sincronizar desde frontend) ─
    if (req.method === "POST" && req.url === "/api/sync-categories") {
      try {
        const body = await readJsonBody(req);
        const cats = Array.isArray(body.categories) ? body.categories : [];
        fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(cats, null, 2), "utf8");
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }

    // ── GET PRODUCTS (para sincronizar con frontend) ─
if (req.method === "GET" && req.url === "/api/products") {
  const products = loadProducts();
  return sendJson(res, 200, { ok: true, products });
}

    // ── BOT PUBLISH ─────────────────────────────────
    if (req.method === "POST" && req.url === "/api/bot-publish") {
      try {
        const body = await readJsonBody(req);

        const nombre = String(body.nombre || "").trim();
        const precio = Number(body.precio);
        const descripcion = String(body.descripcion || "").trim();
        const categoria = String(body.categoria || "").trim();
        const fotos = Array.isArray(body.fotos) ? body.fotos : [];

        if (!nombre) return sendJson(res, 400, { ok: false, error: "nombre requerido" });
        if (!Number.isFinite(precio) || precio <= 0) return sendJson(res, 400, { ok: false, error: "precio inválido" });
        if (!categoria) return sendJson(res, 400, { ok: false, error: "categoria requerida" });

        const products = loadProducts();
        const cats = loadCategories();
        const catMatch = cats.find(c =>
          c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
          categoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        const categoryId = catMatch ? catMatch.id : categoria;

        const newProduct = {
          id: crypto.randomUUID(),
          categoryId: categoryId,
          subcategoryId: null,
          name: nombre,
         price: Math.round(precio / 2),
gangaPrice: Math.round(precio * 0.30),
          description: descripcion,
          link: "",
          photos: fotos.length ? fotos : ["./assets/IMG01.jpeg"],
          created: new Date().toISOString(),
          source: "bot"
        };

        products.push(newProduct);
        saveProducts(products);

        console.log(`✅ Producto publicado vía bot: ${nombre}`);
        return sendJson(res, 200, { ok: true, id: newProduct.id });

      } catch (e) {
        console.error("Error en bot-publish:", e);
        return sendJson(res, 500, { ok: false, error: e.message || "Server error" });
      }
    }

    // ── STATIC FILES ────────────────────────────────
    const safeUrl = (req.url || "/").split("?")[0];
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