/* =========================================================
   app.js (REEMPLAZO TOTAL) — 2026-03-11

   Basado en tu app.js pegado, con ESTOS ARREGLOS:
   - Soporta menú de 6 opciones (3 columnas x 2 filas):
     #btnChat #btnCatalog #btnAuction #btnMaker #btnWebDesign #btnAbout
   - Mantiene tu lógica original de Catálogo/Subasta/Carrito/Modales
   - Para Maker / WebDesign / About:
     * NO inventa vistas nuevas (porque tu HTML no las trae)
     * Abre un MODAL "en construcción" (no rompe nada)
   - NUEVO: Funcionalidad IMC (Imagen de Fondo de Categoría)
     * Se accede escribiendo "IMC" en el campo Nombre de Servicio al Cliente
     * Con event delegation (sin duplicar listeners)
   ========================================================= */

const STORAGE_KEYS = {
  customers: "localapp_customers_v1",
  categories: "localapp_categories_v1",
  subcategories: "localapp_subcategories_v1",
  products: "localapp_products_v1",
  chat: "localapp_chatlog_v1",
  cart: "localapp_cart_v1",
  auctionDaily: "localapp_auction_daily_v1",
  categoryImages: "localapp_category_images_v1"
};

const CODES = {
  messages: "MG666",
  auctionMessages: "MSU",
  newCategory: "CN666",
  newProduct: "PN666",
  newSubcategory: "SUBCAT"
};

const PAGE_SIZE = 10;

/* =========================
   IDIOMAS / TRANSLATIONS
   ========================= */
const translations = {
  es: {
    chat_placeholder: "Escribe tu mensaje...",
    chat_send: "Enviar",
    chat_tip: "Tip: envía: Nombre: ..., Número: ..., Artículo: ...",
    catalog_title: "Catálogo",
    auction_title: "Subasta",
    maker_title: "Zona Maker",
    about_title: "Acerca de nosotros",
    webdesign_title: "Creación y Diseño de páginas web",
    home_tooltip: "Inicio",
    cart_tooltip: "Carrito"
  },
  en: {
    chat_placeholder: "Write your message...",
    chat_send: "Send",
    chat_tip: "Tip: send: Name: ..., Phone: ..., Item: ...",
    catalog_title: "Catalog",
    auction_title: "Auction",
    maker_title: "Maker Zone",
    about_title: "About Us",
    webdesign_title: "Web Page Creation & Design",
    home_tooltip: "Home",
    cart_tooltip: "Cart"
  }
};

let currentLang = localStorage.getItem("selectedLang") || "es";

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("selectedLang", lang);
  document.documentElement.lang = lang;
  updateUILanguage();
}


function addProduct(product) {
  const products = getProducts();
  products.push(product);
  saveProducts(products);
}




function t(key) {
  return translations[currentLang][key] || translations.es[key] || key;
}

function updateUILanguage() {
  // Actualizar atributos
  document.getElementById("homeBtn").title = t("home_tooltip");
  document.getElementById("cartBtn").title = t("cart_tooltip");
  
  // Actualizar placeholders e inputs
  const chatInput = document.getElementById("chatText");
  if (chatInput) chatInput.placeholder = t("chat_placeholder");
  
  const chatSend = document.getElementById("chatSend");
  if (chatSend) chatSend.textContent = t("chat_send");
  
  const chatHint = document.querySelector(".chat-hint span");
  if (chatHint) chatHint.textContent = t("chat_tip");
  
  // Actualizar títulos de secciones
  const menuTitles = document.querySelectorAll(".menu-tile__title");
  const menuNames = ["Subasta", "Acerca de nosotros", "Catálogo", "Servicio al cliente", "Creación y Diseño de páginas web", "Zona maker"];
  const menuKeysES = ["Subasta", "Acerca de nosotros", "Catálogo", "Servicio al cliente", "Creación y Diseño de páginas web", "Zona maker"];
  
  // Por ahora solo traducimos botones principales
}

function seedIfEmpty() {
  fetch("/api/products")
    .then(r => r.json())
    .then(data => {
      if (data.ok && Array.isArray(data.products) && data.products.length) {
        const local = getProducts();
        const localIds = new Set(local.map(p => p.id));
        const newOnes = data.products.filter(p => !localIds.has(p.id));
        if (newOnes.length) {
          saveProducts([...local, ...newOnes]);
          console.log(`✅ ${newOnes.length} producto(s) nuevo(s) sincronizados desde el servidor`);
        }
      }
    })
    .catch(e => console.warn("No se pudo sincronizar productos:", e.message));
}










// Event listener para el selector de idiomas
document.addEventListener("DOMContentLoaded", function() {
  
  const langBtn = document.getElementById("langBtn");
  const langDropdown = document.querySelector(".lang-dropdown");
  const langText = document.getElementById("langText");
  
  if (langBtn) {
    langBtn.addEventListener("click", function(e) {
      e.preventDefault();
      langDropdown.classList.toggle("hidden");
    });
  }
  
  const langLinks = document.querySelectorAll(".lang-dropdown a");
  langLinks.forEach(link => {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      const lang = this.getAttribute("data-lang");
      setLanguage(lang);
      langText.textContent = lang.toUpperCase();
      langDropdown.classList.add("hidden");
    });
  });
  
  // Inicializar idioma
  langText.textContent = currentLang.toUpperCase();
  updateUILanguage();

  // Modal novedades
  const novedadesModal = document.getElementById("modalNovedades");
  const closeNovedadesBtn = document.getElementById("closeNovedades");

  if(novedadesModal && closeNovedadesBtn) {
    closeNovedadesBtn.addEventListener("click", function(){
      novedadesModal.classList.add("hidden");
    });
  }

  // -- Modal novedades con flechas --
  const products = getProducts(); // ¡La forma correcta de obtener TODOS tus productos!

  function filtrarNovedadesRecientes(arr, dias = 3) {
    const now = Date.now();
    return arr.filter(prod => {
      // Cambia 'created' por tu campo de fecha si es distinto
      if (!prod.created) return false;
      const prodDate = new Date(prod.created);
      return ((now - prodDate.getTime()) / (1000 * 60 * 60 * 24)) <= dias;
    });
  }

  const novedades = filtrarNovedadesRecientes(products);

  let novedadIndex = 0;

  function renderNovedad(idx) {
    const contenido = document.getElementById("novedadContenido");
    if (!contenido) return;
    if (!novedades.length) {
      contenido.innerHTML = "<p>No hay novedades recientes.</p>";
      document.getElementById("novedadPrev").disabled = true;
      document.getElementById("novedadNext").disabled = true;
      return;
    }
    const prod = novedades[idx];
    contenido.innerHTML = `
      ${prod.photos && prod.photos[0] ? `<img src="${prod.photos[0]}" alt="${prod.name}" />` : ""}
      <h2>${prod.name || "Sin nombre"}</h2>
      ${prod.category ? `<p><b>Categoría:</b> ${prod.category}</p>` : ""}
      ${prod.price ? `<p><b>Precio:</b> ₡${prod.price.toLocaleString("es-CR")}</p>` : ""}
      ${prod.ficha ? `<p><b>Ficha:</b> <a href="${prod.ficha}" target="_blank">Ver ficha</a></p>` : ""}
      <small>Subido: ${prod.created ? new Date(prod.created).toLocaleString("es-CR") : ""}</small>
    `;
    document.getElementById("novedadPrev").disabled = (idx === 0);
    document.getElementById("novedadNext").disabled = (idx === novedades.length - 1);
  }

  document.getElementById("novedadPrev").addEventListener("click", () => {
    if (novedadIndex > 0) {
      novedadIndex--;
      renderNovedad(novedadIndex);
    }
  });

  document.getElementById("novedadNext").addEventListener("click", () => {
    if (novedadIndex < novedades.length - 1) {
      novedadIndex++;
      renderNovedad(novedadIndex);
    }
  });

  // Inicializar carrusel de novedades al cargar
  renderNovedad(novedadIndex);

   // Sincronizar categorías al servidor
  const catsToSync = getCategories();
  if (catsToSync.length) {
    fetch("/api/sync-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: catsToSync })
    }).catch(() => {});
  }

  seedIfEmpty();

});
const AUCTION_COUNT = 3;
const AUCTION_STEP = 500;

const CRC = new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" });

/* =========================
   UTILS
   ========================= */
function nowTime() { return new Date().toLocaleString(); }

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}

function asNumberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMultipleOfStep(n, step) {
  const x = asNumberOrZero(n);
  return x % step === 0;
}

function effectiveGangaPrice(product) {
  const price = asNumberOrZero(product?.price);
  const g = asNumberOrZero(product?.gangaPrice);
  return g > 0 ? g : price;
}

/* Normaliza para comparar categorías sin importar acentos */
function normalizeKeyNoAccent(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* =========================
   AVISO CATÁLOGO (Shadow DOM)
   ========================= */
let catalogNoticeShownThisLoad = false;

function openCatalogNoticeOncePerLoad() {
  if (catalogNoticeShownThisLoad) return;
  catalogNoticeShownThisLoad = true;

  const old = document.querySelector("#catalogNoticeHost");
  if (old) old.remove();

  const host = document.createElement("div");
  host.id = "catalogNoticeHost";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }

      .backdrop{
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.70);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }

      .modal{
        width: min(760px, 96vw);
        max-height: 90vh;
        display: flex;
        flex-direction: column;

        background: rgba(18,18,18,.94);
        color: #f2f5f7;

        border: 1px solid rgba(255,255,255,.14);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,.55);

        padding: 16px;
        box-sizing: border-box;
      }

      h3{ margin: 0 0 12px; font-size: 18px; font-weight: 700; }

      .scroll{
        flex: 1 1 auto;
        overflow: auto;
        max-height: 60vh;

        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.25);

        line-height: 1.45;
        box-sizing: border-box;
      }

      p{ margin: 0 0 10px; }
      ul{ margin: 6px 0 12px 22px; padding: 0; }
      li{ margin: 4px 0; }

      .actions{ display: flex; justify-content: flex-end; margin-top: 12px; }

      button{
        appearance: none;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.10);
        color: #f2f5f7;
        font-weight: 700;
        padding: 10px 14px;
        border-radius: 12px;
        cursor: pointer;
      }

      button[disabled]{ opacity: .45; cursor: not-allowed; }

      button.enabled{
        opacity: 1;
        background: rgba(90,160,255,.20);
        border-color: rgba(90,160,255,.45);
      }
    </style>

    <div class="backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Aviso importante">
        <h3>Aviso importante antes de ver el catálogo</h3>

        <div class="scroll" id="scrollBox">
          <p><strong>Por favor lee antes de continuar:</strong></p>

          <p>
            Los productos publicados en este catálogo son <strong>devoluciones de Amazon</strong>.
            Por esta razón, algunos artículos pueden venir <strong>incompletos</strong> o presentar
            <strong>daños menores</strong> (rayones, marcas, detalles estéticos o empaque abierto).
          </p>

          <p><strong>La mayor parte no trae caja ni manual</strong>, salvo que se indique lo contrario.</p>
          <p>Todos los productos cuentan con <strong>30 días de garantía</strong>.</p>

          <p><strong>Entrega gratuita</strong> en:</p>
          <ul>
            <li>Alajuela centro</li>
            <li>Grecia</li>
            <li>Poás</li>
          </ul>

          <p>Para el <strong>resto del país</strong>, el envío se realiza por <strong>Dual</strong> o por <strong>Correos de Costa Rica</strong>.</p>

          <p style="margin-top:14px;">Para activar el botón <em>Entendido</em>, baja hasta el final del texto.</p>
          <div style="height: 12px;"></div>
        </div>

        <div class="actions">
          <button id="okBtn" disabled>Entendido</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const scrollBox = shadow.querySelector("#scrollBox");
  const okBtn = shadow.querySelector("#okBtn");

  function updateOkState() {
    const atBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 2;
    okBtn.disabled = !atBottom;
    okBtn.classList.toggle("enabled", atBottom);
  }

  scrollBox.addEventListener("scroll", updateOkState);
  updateOkState();

 okBtn.addEventListener("click", () => {
  host.remove();
  document.getElementById("modalNovedades").classList.remove("hidden");
});
}

/* =========================
   CARRITO
   ========================= */
function getCart(){ 
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.cart)) || []; } catch { return []; }
}
function setCart(cart){ 
  sessionStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); 
  updateCartBadge(); 
}

function addToCart(productId, qty = 1){
  const cart = getCart();
  const idx = cart.findIndex(i => i.productId === productId);
  if (idx >= 0) cart[idx].qty += qty;
  else cart.push({ productId, qty });
  setCart(cart);
}
function removeFromCart(productId){ setCart(getCart().filter(i => i.productId !== productId)); }
function setCartQty(productId, qty){
  const n = Math.max(0, Number(qty) || 0);
  const cart = getCart();
  const it = cart.find(i => i.productId === productId);
  if (!it) return;
  it.qty = n;
  setCart(cart.filter(x => (Number(x.qty)||0) > 0));
}
function clearCart(){ setCart([]); }

function cartCount(){ return getCart().reduce((acc, it) => acc + (Number(it.qty) || 0), 0); }

function updateCartBadge(){
  const btn = document.querySelector("#cartBtn");
  if (!btn) return;

  const n = cartCount();
  let badge = btn.querySelector(".cart-badge");

  if (n <= 0){ if (badge) badge.remove(); return; }
  if (!badge){ badge = document.createElement("span"); badge.className = "cart-badge"; btn.appendChild(badge); }
  badge.textContent = String(n);
}

/* =========================
   DATA HELPERS
   ========================= */


function telegramNotify(type, text) {
  if (!type || !text) return Promise.resolve();

  return fetch("/api/telegram-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, text })
  }).catch(() => {});
}


function getForms() { return loadJSON(STORAGE_KEYS.customers, []); }
function setForms(forms) { saveJSON(STORAGE_KEYS.customers, forms); }

function getCategories() { return loadJSON(STORAGE_KEYS.categories, []); }

function getSubcategories() { return loadJSON(STORAGE_KEYS.subcategories, []); }
function saveSubcategories(list) { saveJSON(STORAGE_KEYS.subcategories, list); }

function getProducts() { return loadJSON(STORAGE_KEYS.products, []); }
function saveProducts(products) { saveJSON(STORAGE_KEYS.products, products); }

function getCategoryById(id) { return getCategories().find(c => c.id === id) || null; }
function getSubcategoryById(id) { return getSubcategories().find(s => s.id === id) || null; }

/* =========================
   SEED
   ========================= */


/* =========================
   
   ========================= */
const views = {
  splash: document.querySelector("#viewSplash"),
  menu: document.querySelector("#viewMenu"),
  chat: document.querySelector("#viewChat"),
  imc: document.querySelector("#viewIMC"),
  catalog: document.querySelector("#viewCatalog"),
  auction: document.querySelector("#viewAuction"),
  maker: document.querySelector("#viewMaker"),
about: document.querySelector("#viewAbout"),
 
};

function showView(name) {
  Object.entries(views).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", k !== name);
  });
}

/* =========================
   SPLASH
   ========================= */
const splashAudio = document.querySelector("#splashAudio");

async function runSplashThenMenu() {
  showView("splash");

  let started = false;
  try { await splashAudio.play(); started = true; } catch { started = false; }

  const tryOnFirstInteraction = async () => {
    if (started) return;
    try {
      await splashAudio.play();
      started = true;
      window.removeEventListener("pointerdown", tryOnFirstInteraction);
      window.removeEventListener("keydown", tryOnFirstInteraction);
    } catch {}
  };

  window.addEventListener("pointerdown", tryOnFirstInteraction);
  window.addEventListener("keydown", tryOnFirstInteraction);

  setTimeout(() => {
    showView("menu");
    try { splashAudio.pause(); splashAudio.currentTime = 0; } catch {}
    window.removeEventListener("pointerdown", tryOnFirstInteraction);
    window.removeEventListener("keydown", tryOnFirstInteraction);
  }, 4000);
}

/* =========================
   MODAL BASE
   ========================= */
const modalBackdrop = document.querySelector("#modalBackdrop");
const modalTitle = document.querySelector("#modalTitle");
const modalBody = document.querySelector("#modalBody");
const modalFooter = document.querySelector("#modalFooter");

document.querySelector("#modalClose")?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

function openModal({ title, bodyHTML, footerHTML, large = false }) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML || "";
  modalFooter.innerHTML = footerHTML || "";
  if (large) {
    modalBackdrop.querySelector(".modal").classList.add("modal-large");
  } else {
    modalBackdrop.querySelector(".modal").classList.remove("modal-large");
  }
  modalBackdrop.classList.remove("hidden");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.querySelector(".modal").classList.remove("modal-large");
  modalBody.innerHTML = "";
  modalFooter.innerHTML = "";
}

/* =========================
   SUBCAT
   ========================= */
function openModalNewSubcategory() {
  const cats = getCategories().slice().sort(() => Math.random() - 0.5);
  if (!cats.length) return alert("Primero crea una categoría.");

  openModal({
    title: "Crear subcategoría",
    bodyHTML: `
      <label>Categoría</label>
      <select id="subcatCat">
        ${cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}
      </select>

      <label>Nombre de la subcategoría</label>
      <input id="subcatName" type="text" placeholder="Ej: Cocina..." />
    `,
    footerHTML: `
      <button class="secondary" id="cancelSubcat">Cancelar</button>
      <button class="primary" id="saveSubcat">Guardar</button>
    `
  });

  document.querySelector("#cancelSubcat").addEventListener("click", closeModal);
  document.querySelector("#saveSubcat").addEventListener("click", () => {
    const categoryId = document.querySelector("#subcatCat").value;
    const name = document.querySelector("#subcatName").value.trim();
    if (!name) return alert("Escribe el nombre.");

    const subs = getSubcategories();
    const exists = subs.some(s =>
      s.categoryId === categoryId && String(s.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (exists) return alert("Ya existe esa subcategoría.");

    subs.push({ id: crypto.randomUUID(), categoryId, name });
    saveSubcategories(subs);

    closeModal();
    if (!views.catalog.classList.contains("hidden")) {
      state.catalog.categoryId = categoryId;
      state.catalog.subcategoryId = null;
      state.catalog.mode = "subcategories";
      state.catalog.page = 1;
      renderCatalog();
    }
  });
}

function subcategoryOptionsHTML(categoryId, selectedSubId) {
  const subs = getSubcategories().filter(s => s.categoryId === categoryId);
  const base = `<option value="">(Sin subcategoría)</option>`;
  return base + subs.map(s =>
    `<option value="${escapeHtml(s.id)}" ${s.id === selectedSubId ? "selected" : ""}>${escapeHtml(s.name)}</option>`
  ).join("");
}

/* =========================
   -O / -E
   ========================= */
function parseDeleteProductCode(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!v.toUpperCase().endsWith("-E")) return null;
  const productName = v.slice(0, -2).trim();
  if (!productName) return null;
  return { productName };
}
function parseEditProductCode(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!v.toUpperCase().endsWith("-O")) return null;
  const productName = v.slice(0, -2).trim();
  if (!productName) return null;
  return { productName };
}

function deleteProductsByName(productName) {
  const products = getProducts();
  const before = products.length;
  const remaining = products.filter(p => (p?.name || "").trim() !== productName);
  const deletedCount = before - remaining.length;
  if (deletedCount > 0) saveProducts(remaining);
  return deletedCount;
}

function findProductByExactName(productName) {
  const name = (productName || "").trim();
  if (!name) return null;
  return getProducts().find(p => (p?.name || "").trim() === name) || null;
}

/* =========================
   FORMULARIOS: TODOS vs SUBASTA (MSU)
   ========================= */
function isAuctionForm(form) {
  const s = String(form?.subject || "");
  return s.toUpperCase().startsWith("OFERTA SUBASTA:");
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openModalAuctionCustomers() {
  const forms = getForms().filter(isAuctionForm);
  openModal({
    title: `Subasta · Formularios · ${forms.length}`,
    bodyHTML: forms.length
      ? `<pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(forms, null, 2))}</pre>`
      : `<p style="margin:0;color:rgba(242,245,247,0.72);">No hay ofertas registradas.</p>`,
    footerHTML: `
      <button class="secondary" id="exportAuctionForms">Exportar JSON</button>
      <button class="primary" id="closeAuctionForms">Cerrar</button>
    `
  });

  document.querySelector("#closeAuctionForms").addEventListener("click", closeModal);
  document.querySelector("#exportAuctionForms").addEventListener("click", () => {
    downloadJSON(forms, "subasta_ofertas.json");
  });
}

function openModalCustomers() {
  const forms = getForms();
  openModal({
    title: `Formularios guardados · ${forms.length}`,
    bodyHTML: forms.length
      ? `<pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(forms, null, 2))}</pre>`
      : `<p style="margin:0;color:rgba(242,245,247,0.72);">No hay formularios.</p>`,
    footerHTML: `
      <button class="secondary" id="exportAllForms">Exportar JSON</button>
      <button class="primary" id="closeModalBtn">Cerrar</button>
    `
  });

  document.querySelector("#closeModalBtn").addEventListener("click", closeModal);
  document.querySelector("#exportAllForms").addEventListener("click", () => {
    downloadJSON(forms, "formularios_guardados.json");
  });
}

/* =========================
   ADMIN: categoría/producto
   ========================= */
function openModalNewCategory() {
  openModal({
    title: "Crear categoría nueva",
    bodyHTML: `
      <label>Nombre de la categoría</label>
      <input id="catName" type="text" />
    `,
    footerHTML: `
      <button class="secondary" id="cancelCat">Cancelar</button>
      <button class="primary" id="saveCat">Guardar</button>
    `
  });

  document.querySelector("#cancelCat").addEventListener("click", closeModal);
  document.querySelector("#saveCat").addEventListener("click", () => {
    const name = document.querySelector("#catName").value.trim();
    if (!name) return alert("Escribe un nombre.");
    const cats = getCategories().slice().sort(() => Math.random() - 0.5);
    cats.push({ id: crypto.randomUUID(), name });
    saveJSON(STORAGE_KEYS.categories, cats);
    closeModal();
    if (!views.catalog.classList.contains("hidden")) {
      state.catalog.categoryId = null;
      state.catalog.subcategoryId = null;
      state.catalog.mode = "categories";
      state.catalog.page = 1;
      renderCatalog();
    }
  });
}

function openModalNewProduct() {
  const cats = getCategories().slice().sort(() => Math.random() - 0.5);
  if (!cats.length) { alert("Primero crea una categoría."); return; }

  openModal({
    title: "Crear producto nuevo",
    bodyHTML: `
      <label>Categoría</label>
      <select id="prodCat">${cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}</select>

      <label>Subcategoría (opcional)</label>
      <select id="prodSubcat"></select>

      <label>Nombre</label>
      <input id="prodName" type="text" />

      <label>Precio (CRC)</label>
      <input id="prodPrice" type="number" step="0.01" />

      <label>Precio ganga (solo subasta) — vacío o 0 = igual al precio normal</label>
      <input id="prodGanga" type="number" step="500" placeholder="(vacío)" />

      <label>Descripción</label>
      <textarea id="prodDesc"></textarea>

      <label>Enlace (opcional)</label>
      <input id="prodLink" type="url" />

      <label>Fotos (rutas separadas por coma)</label>
      <input id="prodPhotos" type="text" />
    `,
    footerHTML: `
      <button class="secondary" id="cancelProd">Cancelar</button>
      <button class="primary" id="saveProd">Guardar</button>
    `
  });

  const catEl = document.querySelector("#prodCat");
  const subEl = document.querySelector("#prodSubcat");
  const refreshSubs = () => { subEl.innerHTML = subcategoryOptionsHTML(catEl.value, ""); };
  refreshSubs();
  catEl.addEventListener("change", refreshSubs);

  document.querySelector("#cancelProd").addEventListener("click", closeModal);
  document.querySelector("#saveProd").addEventListener("click", () => {
    const categoryId = catEl.value;
    const subcategoryId = subEl.value || null;

    const name = document.querySelector("#prodName").value.trim();
    const price = Number(document.querySelector("#prodPrice").value);

    const gangaRaw = document.querySelector("#prodGanga").value.trim();
    const gangaParsed = gangaRaw === "" ? 0 : Number(gangaRaw);

    const description = document.querySelector("#prodDesc").value.trim();
    const link = document.querySelector("#prodLink").value.trim();
    const photosRaw = document.querySelector("#prodPhotos").value.trim();

    if (!name) return alert("Escribe el nombre.");
    if (!Number.isFinite(price)) return alert("Precio inválido.");

    let gangaPrice = (!Number.isFinite(gangaParsed) || gangaParsed <= 0) ? price : gangaParsed;
    if (!isMultipleOfStep(gangaPrice, AUCTION_STEP)) return alert(`Precio ganga debe ser múltiplo de ${AUCTION_STEP}.`);

    const photos = photosRaw ? photosRaw.split(",").map(s => s.trim()).filter(Boolean) : ["./assets/IMG01.jpeg"];

    const products = getProducts();
    products.push({ id: crypto.randomUUID(), categoryId, subcategoryId, name, price, gangaPrice, description, link, photos, created: new Date().toISOString() });
    saveProducts(products);

    closeModal();
    if (!views.catalog.classList.contains("hidden")) {
      state.catalog.categoryId = categoryId;
      state.catalog.subcategoryId = null;
      state.catalog.mode = getSubcategories().some(s => s.categoryId === categoryId) ? "subcategories" : "products";
      state.catalog.page = 1;
      renderCatalog();
    }
  });
}

function openModalEditProduct(product) {
  const cats = getCategories().slice().sort(() => Math.random() - 0.5);
  const photos = Array.isArray(product.photos) ? product.photos.filter(Boolean) : [];
  const photosValue = photos.length ? photos.join(", ") : "";

  openModal({
    title: "Editar producto",
    bodyHTML: `
      <label>Categoría</label>
      <select id="editProdCat">
        ${cats.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === product.categoryId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      </select>

      <label>Subcategoría (opcional)</label>
      <select id="editProdSubcat"></select>

      <label>Nombre</label>
      <input id="editProdName" type="text" value="${escapeHtml(product.name || "")}" />

      <label>Precio (CRC)</label>
      <input id="editProdPrice" type="number" step="0.01" value="${escapeHtml(String(asNumberOrZero(product.price)))}" />

      <label>Precio ganga (solo subasta) — vacío o 0 = igual al precio normal</label>
      <input id="editProdGanga" type="number" step="500" value="${escapeHtml(String(asNumberOrZero(product.gangaPrice)))}" />

      <label>Descripción</label>
      <textarea id="editProdDesc">${escapeHtml(product.description || "")}</textarea>

      <label>Enlace (opcional)</label>
      <input id="editProdLink" type="url" value="${escapeHtml(product.link || "")}" />

      <label>Fotos</label>
      <input id="editProdPhotos" type="text" value="${escapeHtml(photosValue)}" />
    `,
    footerHTML: `
      <button class="secondary" id="cancelEditProd">Cancelar</button>
      <button class="primary" id="saveEditProd">Guardar</button>
    `
  });

  const catEl = document.querySelector("#editProdCat");
  const subEl = document.querySelector("#editProdSubcat");

  const refreshSubs = () => {
    const catId = catEl.value;
    const subs = getSubcategories().filter(s => s.categoryId === catId);
    const ok = subs.some(s => s.id === product.subcategoryId);
    const selected = ok ? product.subcategoryId : "";
    subEl.innerHTML = subcategoryOptionsHTML(catId, selected);
  };
  refreshSubs();
  catEl.addEventListener("change", refreshSubs);

  document.querySelector("#cancelEditProd").addEventListener("click", closeModal);

  document.querySelector("#saveEditProd").addEventListener("click", () => {
    const categoryId = catEl.value;
    const subcategoryId = subEl.value || null;

    const name = document.querySelector("#editProdName").value.trim();
    const price = Number(document.querySelector("#editProdPrice").value);

    const gangaRaw = document.querySelector("#editProdGanga").value.trim();
    const gangaParsed = gangaRaw === "" ? 0 : Number(gangaRaw);

    const description = document.querySelector("#editProdDesc").value.trim();
    const link = document.querySelector("#editProdLink").value.trim();
    const photosRaw = document.querySelector("#editProdPhotos").value.trim();

    if (!name) return alert("Escribe el nombre.");
    if (!Number.isFinite(price)) return alert("Precio inválido.");

    let gangaPrice = (!Number.isFinite(gangaParsed) || gangaParsed <= 0) ? price : gangaParsed;
    if (!isMultipleOfStep(gangaPrice, AUCTION_STEP)) return alert(`Precio ganga debe ser múltiplo de ${AUCTION_STEP}.`);

    const photos = photosRaw ? photosRaw.split(",").map(s => s.trim()).filter(Boolean) : ["./assets/IMG01.jpeg"];

    const products = getProducts();
    const idx = products.findIndex(p => p.id === product.id);
    if (idx < 0) return alert("No encontré ese producto.");

    products[idx] = { ...products[idx], categoryId, subcategoryId, name, price, gangaPrice, description, link, photos };
    saveProducts(products);

    closeModal();
    if (!views.auction.classList.contains("hidden")) renderAuction();
    if (!views.catalog.classList.contains("hidden")) renderCatalog();
  });
}

/* =========================
   CÓDIGOS SECRETOS (incluye MSU + IMC)
   ========================= */
function handleNameFieldCode(code) {
  const normalized = String(code || "").trim().toUpperCase();

  if (normalized === CODES.messages) { openModalCustomers(); return { handled: true, message: null }; }
  if (normalized === CODES.auctionMessages) { openModalAuctionCustomers(); return { handled: true, message: null }; }
  if (normalized === CODES.newCategory) { openModalNewCategory(); return { handled: true, message: null }; }
  if (normalized === CODES.newProduct) { openModalNewProduct(); return { handled: true, message: null }; }
  if (normalized === CODES.newSubcategory) { openModalNewSubcategory(); return { handled: true, message: null }; }
  
  // IMC - Código secreto
  if (normalized === "IMC") { showView("imc"); renderIMC(); return { handled: true, message: null }; }

  // MFA - Ver peticiones de favoritos
  if (normalized === "MFA") {
    const favoritos = getFavoritos();
    if (!favoritos.length) {
      return { handled: true, message: "No hay peticiones de favoritos registradas aún." };
    }
    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    favoritos.forEach((f, i) => {
      html += `
        <div style="padding:10px; border:1px solid rgba(255,255,255,0.15); border-radius:12px; background:rgba(0,0,0,0.2);">
          <div><strong>#${i + 1}</strong></div>
          <div>👤 <strong>Nombre:</strong> ${escapeHtml(f.nombre ?? "")}</div>
          <div>📞 <strong>Teléfono:</strong> ${escapeHtml(f.telefono ?? "")}</div>
          <div>⭐ <strong>Categoría:</strong> ${escapeHtml(f.categoriaNombre ?? "")}</div>
          <div>📂 <strong>Subcategoría:</strong> ${escapeHtml(f.subcategoriaNombre ?? "")}</div>
          <div>🔑 <strong>Código:</strong> ${escapeHtml(f.id ?? "")}</div>
          <div>🕒 <strong>Fecha:</strong> ${escapeHtml(new Date(f.created ?? "").toLocaleString())}</div>
        </div>
      `;
    });
    html += `</div>`;
    chatMessagesEl.insertAdjacentHTML("beforeend", `<div class="msg bot" style="max-width:100%;">${html}</div>`);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return { handled: true, message: null };
  }

  // MCC - Ver pedidos de compra
  if (normalized === "MCC") {
    const orders = loadJSON("buy_orders", []);
    if (!orders.length) {
      return { handled: true, message: "No hay pedidos registrados aún." };
    }
    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    orders.forEach((o, i) => {
      const items = Array.isArray(o.cart) ? o.cart.map(it => `${escapeHtml(it.productId)} x${it.qty}`).join(", ") : "";
      html += `
        <div style="padding:10px; border:1px solid rgba(255,255,255,0.15); border-radius:12px; background:rgba(0,0,0,0.2);">
          <div><strong>#${i + 1}</strong> — ${escapeHtml(new Date(o.date).toLocaleString())}</div>
          <div>👤 <strong>Nombre:</strong> ${escapeHtml(o.name)}</div>
          <div>📞 <strong>Teléfono:</strong> ${escapeHtml(o.phone)}</div>
          <div>📦 <strong>Dirección:</strong> ${escapeHtml(o.address)}</div>
          ${items ? `<div>🛒 <strong>Productos:</strong> ${items}</div>` : ""}
        </div>
      `;
    });
    html += `</div>`;
    openModal({ title: "Pedidos de compra", bodyHTML: html, footerHTML: `<button class="secondary" id="mccClose">Cerrar</button>` });
    document.querySelector("#mccClose").addEventListener("click", closeModal);
    return { handled: true, message: null };
  }

  const edit = parseEditProductCode(code);
  if (edit) {
    const product = findProductByExactName(edit.productName);
    if (!product) return { handled: true, message: "No encontré ese producto para editar." };
    openModalEditProduct(product);
    return { handled: true, message: null };
  }

  const del = parseDeleteProductCode(code);
  if (del) {
    const n = deleteProductsByName(del.productName);
    if (!views.catalog.classList.contains("hidden")) renderCatalog();
    if (!views.auction.classList.contains("hidden")) renderAuction();
    return { handled: true, message: n > 0 ? `Se eliminó/eliminaron ${n} producto(s).` : `No se encontró ningún producto con ese nombre.` };
  }

  if (normalized === "DELCAT") {
    const cats = getCategories().slice().sort(() => Math.random() - 0.5);
    if (!cats.length) return { handled: true, message: "No hay categorías para eliminar." };
    let html = `<label>Selecciona la categoría a eliminar:</label><select id="delCatSelect">`;
    html += cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
    html += `</select>`;
    openModal({ title: "Eliminar categoría", bodyHTML: html, footerHTML: `<button class="secondary" id="cancelDelCat">Cancelar</button><button class="primary" id="confirmDelCat">Eliminar</button>` });
    document.querySelector("#cancelDelCat").addEventListener("click", closeModal);
    document.querySelector("#confirmDelCat").addEventListener("click", () => { const catId = document.querySelector("#delCatSelect").value; const cats = getCategories().slice().sort(() => Math.random() - 0.5); const remaining = cats.filter(c => c.id !== catId); saveJSON(STORAGE_KEYS.categories, remaining); closeModal(); alert("Categoría eliminada."); });
    return { handled: true, message: null };
  }

  return { handled: false, message: null };
}

/* =========================
   SERVICE FORM
   ========================= */
const chatMessagesEl = document.querySelector("#chatMessages");
const chatTextEl = document.querySelector("#chatText");
const chatSendEl = document.querySelector("#chatSend");

function saveServiceForm({ name, phone, subject }) {
  const forms = getForms();

  const entry = {
    id: crypto.randomUUID(),
    createdAt: nowTime(),
    type: "customer_service",
    name,
    phone,
    subject
  };

  forms.push(entry);
  setForms(forms);

  // Aviso Telegram (no bloquea si falla)
  telegramNotify(
    "customer_service",
    `Nuevo mensaje de servicio al cliente\n` +
      `Nombre: ${name}\n` +
      `Tel: ${phone}\n` +
      `Asunto: ${subject}\n` +
      `Fecha: ${entry.createdAt}`
  );
}

function renderServiceForm() {
  chatTextEl?.closest(".chat-input")?.classList.add("hidden");
  chatSendEl?.closest(".chat-input")?.classList.add("hidden");
  document.querySelector(".chat-hint")?.classList.add("hidden");

  chatMessagesEl.innerHTML = `
    <div class="msg bot" style="max-width:100%;">Completa el formulario.</div>

    <div class="tile" style="margin-top:12px;">
      <label>Nombre</label>
      <input id="formName" type="text" placeholder="Tu nombre" />

      <label>Teléfono</label>
      <input id="formPhone" type="text" placeholder="Tu teléfono" />

      <label>Asunto</label>
      <textarea id="formSubject" placeholder="¿En qué te ayudamos?"></textarea>

      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;">
        <button class="secondary" id="formClear">Limpiar</button>
        <button class="primary" id="formSend" disabled style="opacity:0.45;cursor:not-allowed;">Enviar</button>
      </div>
    </div>
  `;

  const nameEl = document.querySelector("#formName");
  const phoneEl = document.querySelector("#formPhone");
  const subjectEl = document.querySelector("#formSubject");
  const sendEl = document.querySelector("#formSend");
  const clearEl = document.querySelector("#formClear");

  const updateSendState = () => {
    const ready = Boolean(nameEl.value.trim() && phoneEl.value.trim() && subjectEl.value.trim());
    sendEl.disabled = !ready;
    sendEl.style.opacity = ready ? "1" : "0.45";
    sendEl.style.cursor = ready ? "pointer" : "not-allowed";
  };

  nameEl.addEventListener("input", () => {
    const v = nameEl.value.trim();
    if (v) {
      const res = handleNameFieldCode(v);
      if (res.handled && res.message) {
        chatMessagesEl.insertAdjacentHTML("beforeend", `<div class="msg bot" style="max-width:100%;">${escapeHtml(res.message)}</div>`);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }
    }
    updateSendState();
  });

  phoneEl.addEventListener("input", updateSendState);
  subjectEl.addEventListener("input", updateSendState);

  clearEl.addEventListener("click", () => {
    nameEl.value = "";
    phoneEl.value = "";
    subjectEl.value = "";
    updateSendState();
  });

  sendEl.addEventListener("click", () => {
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    const subject = subjectEl.value.trim();
    if (!(name && phone && subject)) return;

    const res = handleNameFieldCode(name);
    if (res.handled) return;

    saveServiceForm({ name, phone, subject });
    chatMessagesEl.insertAdjacentHTML("beforeend", `<div class="msg bot" style="max-width:100%;">¡Listo! Guardé tu formulario.</div>`);
    nameEl.value = "";
    phoneEl.value = "";
    subjectEl.value = "";
    updateSendState();
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  });

  updateSendState();
}

/* =========================
   CATÁLOGO
   ========================= */
const categoriesPanel = document.querySelector("#categoriesPanel");
const productsPanel = document.querySelector("#productsPanel");
const paginationEl = document.querySelector("#pagination");
const breadcrumbEl = document.querySelector("#breadcrumb");

const state = { catalog: { categoryId: null, subcategoryId: null, mode: "categories", page: 1 } };

function openModalProductDetail(product, { showGanga }) {
  const photos = Array.isArray(product.photos) && product.photos.filter(Boolean).length
    ? product.photos.filter(Boolean)
    : ["./assets/IMG01.jpeg"];

  let currentPhotoIndex = 0;

  const existing = document.getElementById("modalProductoDetalle");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "modalProductoDetalle";
  modal.style.cssText = "display:flex;align-items:center;justify-content:center;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);";

  const inner = document.createElement("div");
  inner.style.cssText = "background:#1a1f2e;color:#f2f5f7;padding:3em 2em 2em;margin-top:3.5cm;border-radius:18px;width:860px;max-width:95vw;max-height:95vh;min-height:900px;box-sizing:border-box;position:relative;text-align:center;display:flex;flex-direction:column;overflow:hidden;";

  // Boton cerrar
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:absolute;top:0.5em;right:0.5em;background:#dc3545;color:#fff;border:none;border-radius:3px;padding:.4em 1.2em;cursor:pointer;z-index:10;";

  // Imagen
  const img = document.createElement("img");
  img.src = photos[0];
  img.alt = product.name || "foto";
  img.style.cssText = "max-width:600px;max-height:420px;width:100%;object-fit:contain;display:block;margin:0 auto 1em;border-radius:12px;";

  // Flecha izquierda
  const prevBtn = document.createElement("button");
  prevBtn.innerHTML = "&#8592;";
  prevBtn.style.cssText = "position:absolute;top:calc(50% - 5cm);left:0.5em;transform:translateY(-50%);background:#2a2a2a;color:#fff;border:none;border-radius:50%;font-size:2em;padding:0.4em;cursor:pointer;z-index:10;";
  prevBtn.style.display = photos.length > 1 ? "block" : "none";

  // Flecha derecha
  const nextBtn = document.createElement("button");
  nextBtn.innerHTML = "&#8594;";
  nextBtn.style.cssText = "position:absolute;top:calc(50% - 5cm);right:0.5em;transform:translateY(-50%);background:#2a2a2a;color:#fff;border:none;border-radius:50%;font-size:2em;padding:0.4em;cursor:pointer;z-index:10;";
  nextBtn.style.display = photos.length > 1 ? "block" : "none";

  // Texto info
  const infoDiv = document.createElement("div");
  infoDiv.innerHTML = `
    ${product.name ? `<p style="margin:0 0 8px;font-size:1.2em;"><strong>${product.name}</strong></p>` : ""}
    <p style="margin:0 0 8px;"><strong>Precio:</strong> ${CRC.format(asNumberOrZero(product.price))}</p>
    ${showGanga ? `<p style="margin:0 0 8px;"><strong>Precio ganga:</strong> ${CRC.format(effectiveGangaPrice(product))}</p>` : ""}
    ${product.description ? `<p style="margin:0 0 8px;max-width:420px;word-wrap:break-word;white-space:normal;text-align:left;line-height:1.6;margin-left:auto;margin-right:auto;"><strong>Descripción:</strong> ${product.description}</p>` : ""}
    ${product.link ? `<p style="margin:0 0 12px;"><a href="${product.link}" target="_blank" rel="noopener" style="color:#5aa0ff;">Abrir enlace</a></p>` : ""}
  `;

  // Botones footer
  const footerDiv = document.createElement("div");
  footerDiv.style.cssText = "display:flex;flex-direction:row;gap:10px;justify-content:center;align-items:center;margin-top:1em;";

  const closeBtnFooter = document.createElement("button");
  closeBtnFooter.textContent = "Cerrar";
  closeBtnFooter.style.cssText = "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);color:#f2f5f7;padding:10px 14px;border-radius:12px;cursor:pointer;";

  const actionBtn = document.createElement("button");
  actionBtn.textContent = showGanga ? "Ofertar" : "Agregar al carrito";
  actionBtn.style.cssText = "background:rgba(90,160,255,0.18);border:1px solid rgba(90,160,255,0.45);color:#f2f5f7;padding:10px 14px;border-radius:12px;cursor:pointer;";

  footerDiv.appendChild(closeBtnFooter);
  footerDiv.appendChild(actionBtn);

  // Ensamblar
  const scrollDiv = document.createElement("div");
  scrollDiv.style.cssText = "overflow-y:auto;overflow-x:hidden;width:100%;padding:0.5em 1em;min-height:150px;max-height:250px;scrollbar-width:thin;scrollbar-color:#5aa0ff #1a1f2e;";
  scrollDiv.appendChild(infoDiv);

  const wrapperDiv = document.createElement("div");
  wrapperDiv.style.cssText = "display:flex;flex-direction:column;align-items:center;width:100%;margin-top:-1cm;";
  wrapperDiv.appendChild(prevBtn);
  wrapperDiv.appendChild(nextBtn);
  wrapperDiv.appendChild(img);
  wrapperDiv.appendChild(scrollDiv);
  wrapperDiv.appendChild(footerDiv);
  inner.appendChild(closeBtn);
  inner.appendChild(wrapperDiv);
  modal.appendChild(inner);
  document.body.appendChild(modal);

  // Eventos flechas
  prevBtn.addEventListener("click", () => {
    currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
    img.src = photos[currentPhotoIndex];
  });
  nextBtn.addEventListener("click", () => {
    currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
    img.src = photos[currentPhotoIndex];
  });

  const closeAll = () => modal.remove();
  closeBtn.addEventListener("click", closeAll);
  closeBtnFooter.addEventListener("click", closeAll);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAll(); });

  if (showGanga) {
    actionBtn.addEventListener("click", () => { closeAll(); openModalOffer(product.id); });
  } else {
    actionBtn.addEventListener("click", () => {
      addToCart(product.id, 1);
      closeAll();
      alert("Agregado al carrito.");
    });
  }

  // línea muerta — reemplaza el resto de la función vieja
  if (false) {
  modal.id = "modalProductoDetalle";
  modal.style.cssText = `
    display:flex; align-items:center; justify-content:center;
    position:fixed; inset:0; z-index:1200; background:rgba(0,0,0,0.7);
  `;

  modal.innerHTML = `
    <div style="
      background:#1a1f2e; color:#f2f5f7;
      padding:3em 2em 2em;margin-top:3.5cm; border-radius:18px;
      min-width:640px; width:640px; min-height:594px;
      box-sizing:border-box; position:relative;
      font-family:system-ui,-apple-system,sans-serif;
    ">
      <button id="closeProductDetalle" style="
        position:absolute; top:0.5em; right:0.5em;
        background:#dc3545; color:#fff; border:none;
        border-radius:3px; padding:.4em 1.2em; cursor:pointer; z-index:10;
      ">✕</button>

      ${photos.length > 1 ? `
        <button id="productPhotoPrev" style="
          position:absolute; top:50%; left:0.5em;
          transform:translateY(-50%);
          background:#2a2a2a; color:#fff; border:none;
          border-radius:50%; font-size:2em; padding:0.4em;
          cursor:pointer; z-index:10;
        ">&#8592;</button>
        <button id="productPhotoNext" style="
          position:absolute; top:50%; right:0.5em;
          transform:translateY(-50%);
          background:#2a2a2a; color:#fff; border:none;
          border-radius:50%; font-size:2em; padding:0.4em;
          cursor:pointer; z-index:10;
        ">&#8594;</button>
      ` : ""}

      <div style="text-align:center;">
        <img id="productDetalleImg" src="${escapeHtml(photos[0])}"
          alt="${escapeHtml(product.name || "foto")}"
          style="max-width:440px; max-height:440px; object-fit:contain; display:block; margin:0 auto 1em; border-radius:12px;" />

        <p style="margin:0 0 8px;"><strong>Precio:</strong> ${escapeHtml(CRC.format(asNumberOrZero(product.price)))}</p>
        ${showGanga ? `<p style="margin:0 0 8px;"><strong>Precio ganga:</strong> ${escapeHtml(CRC.format(effectiveGangaPrice(product)))}</p>` : ""}
        ${product.description ? `<p style="margin:0 0 8px;"><strong>Descripción:</strong> ${escapeHtml(product.description)}</p>` : ""}
        ${product.link ? `<p style="margin:0 0 12px;"><a href="${escapeHtml(normalizeUrl(product.link))}" target="_blank" rel="noopener" style="color:#5aa0ff;">Abrir enlace</a></p>` : ""}

        <div style="display:flex; gap:10px; justify-content:center; margin-top:1em;">
          <button id="closeProductDetalle2" style="
            background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.16);
            color:#f2f5f7; padding:10px 14px; border-radius:12px; cursor:pointer;
          ">Cerrar</button>
          ${showGanga ? `
            <button id="offerBtn" style="
              background:rgba(90,160,255,0.18); border:1px solid rgba(90,160,255,0.45);
              color:#f2f5f7; padding:10px 14px; border-radius:12px; cursor:pointer;
            ">Ofertar</button>
          ` : `
            <button id="addToCartBtn" style="
              background:rgba(90,160,255,0.18); border:1px solid rgba(90,160,255,0.45);
              color:#f2f5f7; padding:10px 14px; border-radius:12px; cursor:pointer;
            ">Agregar al carrito</button>
          `}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const imgEl = modal.querySelector("#productDetalleImg");

  function updatePhoto() {
    imgEl.src = escapeHtml(photos[currentPhotoIndex]);
  }

  if (photos.length > 1) {
    modal.querySelector("#productPhotoPrev").addEventListener("click", () => {
      currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
      updatePhoto();
    });
    modal.querySelector("#productPhotoNext").addEventListener("click", () => {
      currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
      updatePhoto();
    });
  }

  const closeModal2 = () => modal.remove();

  modal.querySelector("#closeProductDetalle").addEventListener("click", closeModal2);
  modal.querySelector("#closeProductDetalle2").addEventListener("click", closeModal2);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal2(); });

  if (showGanga) {
    modal.querySelector("#offerBtn").addEventListener("click", () => {
      closeModal2();
      openModalOffer(product.id);
    });
  } else {
    modal.querySelector("#addToCartBtn").addEventListener("click", () => {
      addToCart(product.id, 1);
      closeModal2();
      alert("Agregado al carrito.");
    });
  }
  } // cierra if(false)
} // cierra openModalProductDetail

function renderCatalog() {
  const { categoryId, subcategoryId, mode, page } = state.catalog;

  if (!categoryId || mode === "categories") {
    breadcrumbEl.textContent = "Categorías";
    productsPanel.classList.add("hidden");
    paginationEl.classList.add("hidden");
    categoriesPanel.classList.remove("hidden");

    const cats = getCategories().slice().sort(() => Math.random() - 0.5);
    categoriesPanel.innerHTML = `
      <div class="grid">
        ${cats.map(c => {
          const key = normalizeKeyNoAccent(c.name);
          const categoryImageUrl = getCategoryImageUrl(c.name);

          const imageHTML = categoryImageUrl
            ? `<img src="${escapeHtml(categoryImageUrl)}" alt="${escapeHtml(c.name)}" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
            : (
              key === "hogar"
                ? `<img src="./assets/Chogar.png" alt="Hogar" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
                : key === "peliculas"
                  ? `<img src="./assets/Cpeliculas.png" alt="Películas" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
                  : key === "juegos de mesa"
                    ? `<img src="./assets/Cjuegosdemesa.png" alt="Juegos de Mesa" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
                    : key === "musica"
                      ? `<img src="./assets/Cmusica.png" alt="Música" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
                      : key === "computacion"
                        ? `<img src="./assets/Ccomputacion.png" alt="Computación" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
                        : key === "mascotas"
                          ? `<img src="./assets/Cmascotas.png" alt="Mascotas" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
                          : ""
              );

          const titleHTML = categoryImageUrl || key === "hogar" || key === "peliculas" || key === "juegos de mesa" || key === "musica" || key === "computacion" || key === "mascotas"
            ? ""
            : `<h3>${escapeHtml(c.name)}</h3>`;

          return `
            <div class="tile">
              ${imageHTML}
              ${titleHTML}
              <p>Ver subcategorías / productos</p>
              <div style="margin-top:10px;">
                <button class="primary" data-cat="${escapeHtml(c.id)}">Entrar</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    categoriesPanel.querySelectorAll("button[data-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.catalog.categoryId = btn.getAttribute("data-cat");
        state.catalog.subcategoryId = null;
        state.catalog.mode = getSubcategories().some(s => s.categoryId === state.catalog.categoryId) ? "subcategories" : "products";
        state.catalog.page = 1;
        renderCatalog();
      });
    });
    return;
  }

  categoriesPanel.classList.add("hidden");
  productsPanel.classList.remove("hidden");

  const cat = getCategoryById(categoryId);
  const catName = cat ? cat.name : "Desconocida";

  if (mode === "subcategories") {
    breadcrumbEl.textContent = `Categorías / ${catName}`;
    paginationEl.classList.add("hidden");

    const subs = getSubcategories().filter(s => s.categoryId === categoryId);

    productsPanel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
        <button class="secondary" id="backToCats">← Volver a categorías</button>
      </div>

      <div class="grid">
        <div class="tile">
          <h3>Ver todos</h3>
          <p>Mostrar todos los productos de esta categoría</p>
          <div style="margin-top:10px;">
            <button class="primary" id="viewAllProducts">Entrar</button>
          </div>
        </div>

        ${subs.map(s => `
          <div class="tile">
            <h3>${escapeHtml(s.name)}</h3>
            <p>Ver productos</p>
            <div style="margin-top:10px;">
              <button class="primary" data-sub="${escapeHtml(s.id)}">Entrar</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    document.querySelector("#backToCats").addEventListener("click", () => {
      state.catalog.categoryId = null;
      state.catalog.subcategoryId = null;
      state.catalog.mode = "categories";
      state.catalog.page = 1;
      renderCatalog();
    });

    document.querySelector("#viewAllProducts").addEventListener("click", () => {
      state.catalog.subcategoryId = null;
      state.catalog.mode = "products";
      state.catalog.page = 1;
      renderCatalog();
    });

    productsPanel.querySelectorAll("button[data-sub]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.catalog.subcategoryId = btn.getAttribute("data-sub");
        state.catalog.mode = "products";
        state.catalog.page = 1;
        renderCatalog();
      });
    });

    return;
  }

  const sub = subcategoryId ? getSubcategoryById(subcategoryId) : null;
  breadcrumbEl.textContent = sub ? `Categorías / ${catName} / ${sub.name}` : `Categorías / ${catName}`;

  const all = getProducts().filter(p =>
    p.categoryId === categoryId &&
    (!subcategoryId || p.subcategoryId === subcategoryId)
  );

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  state.catalog.page = currentPage;

  const start = (currentPage - 1) * PAGE_SIZE;
  const items = all.slice(start, start + PAGE_SIZE);

  productsPanel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
      <button class="secondary" id="backBtn">← Volver</button>
      <div style="color: rgba(242,245,247,0.7); font-size: 13px;">
        ${total} producto(s) · Página ${currentPage} de ${totalPages}
      </div>
    </div>

    <div class="grid">
      ${items.map(p => {
        const photo = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : "./assets/IMG01.jpeg";
        return `
          <div class="tile product-tile" data-pid="${escapeHtml(p.id)}" style="cursor:pointer;">
            <div class="product">
              <img src="${escapeHtml(photo)}" alt="${escapeHtml(p.name)}" />
              <div class="info">
                <h3 style="margin:0 0 6px;">${escapeHtml(p.name)}</h3>
                <div class="price">${escapeHtml(CRC.format(asNumberOrZero(p.price)))}</div>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  document.querySelector("#backBtn").addEventListener("click", () => {
    const hasSubs = getSubcategories().some(s => s.categoryId === categoryId);
    if (hasSubs) {
      state.catalog.mode = "subcategories";
      state.catalog.subcategoryId = null;
      state.catalog.page = 1;
    } else {
      state.catalog.categoryId = null;
      state.catalog.subcategoryId = null;
      state.catalog.mode = "categories";
      state.catalog.page = 1;
    }
    renderCatalog();
  });

  productsPanel.querySelectorAll(".product-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const pid = tile.getAttribute("data-pid");
      const product = getProducts().find(pr => pr.id === pid);
      if (!product) return;
      openModalProductDetail(product, { showGanga: false });
    });
  });

  renderPagination(totalPages, currentPage);
}

function renderPagination(totalPages, currentPage) {
  if (totalPages <= 1) { paginationEl.classList.add("hidden"); return; }
  paginationEl.classList.remove("hidden");

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  paginationEl.innerHTML = pages.map(p => `
    <button class="page-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>
  `).join("");

  paginationEl.querySelectorAll("button[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.catalog.page = Number(btn.getAttribute("data-page"));
      renderCatalog();
    });
  });
}

/* =========================
   SUBASTA (3 por día)
   ========================= */
function pickRandomIds(ids, n) {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

function getDailyAuctionProductIds() {
  const key = todayKey();
  const saved = loadJSON(STORAGE_KEYS.auctionDaily, null);

  if (saved && saved.dateKey === key && Array.isArray(saved.productIds) && saved.productIds.length > 0) {
    return saved.productIds;
  }

  const products = getProducts();
  const picked = pickRandomIds(products.map(p => p.id), AUCTION_COUNT);

  saveJSON(STORAGE_KEYS.auctionDaily, { dateKey: key, productIds: picked });
  return picked;
}

function renderAuction() {
  const panel = document.querySelector("#auctionPanel");
  const allProducts = getProducts();
  const ids = getDailyAuctionProductIds();
  const items = ids.map(id => allProducts.find(p => p.id === id)).filter(Boolean);

  panel.innerHTML = items.length ? `
    <div class="grid">
      ${items.map(p => {
        const photo = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : "./assets/IMG01.jpeg";
        return `
          <div class="tile auction-tile" data-pid="${escapeHtml(p.id)}" style="cursor:pointer;">
            <div class="product">
              <img src="${escapeHtml(photo)}" alt="${escapeHtml(p.name)}" />
              <div class="info">
                <h3 style="margin:0 0 6px;">${escapeHtml(p.name)}</h3>
                <div style="color: rgba(242,245,247,0.72); font-size: 13px;">Toca para ofertar</div>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  ` : `<p style="margin:0;color:rgba(242,245,247,0.72);">No hay productos.</p>`;

  panel.querySelectorAll(".auction-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const pid = tile.getAttribute("data-pid");
      const product = getProducts().find(pr => pr.id === pid);
      if (!product) return;
      openModalProductDetail(product, { showGanga: true });
    });
  });
}

function openModalOffer(productId) {
  const product = getProducts().find(p => p.id === productId);
  if (!product) return alert("No encontré ese producto.");

  let offer = effectiveGangaPrice(product);
  offer = Math.round(offer / AUCTION_STEP) * AUCTION_STEP;
  if (offer <= 0) offer = AUCTION_STEP;

  openModal({
    title: "Ofertar",
    bodyHTML: `
      <p style="margin-top:0;color:rgba(242,245,247,0.72);">
        Producto: <strong>${escapeHtml(product.name || "")}</strong>
      </p>

      <label>Nombre</label>
      <input id="offerName" type="text" placeholder="Tu nombre" />

      <label>Teléfono</label>
      <input id="offerPhone" type="text" placeholder="Tu teléfono" />

      <label>Nueva oferta (CRC) · pasos de ${AUCTION_STEP}</label>
      <div style="display:flex; gap:10px; align-items:center;">
        <button class="secondary" id="offerMinus" type="button">-</button>
        <div id="offerValue" style="flex:1; text-align:center; font-weight:900; padding:12px; border:1px solid rgba(255,255,255,0.14); border-radius:12px; background: rgba(0,0,0,0.25);">
          ${escapeHtml(CRC.format(offer))}
        </div>
        <button class="secondary" id="offerPlus" type="button">+</button>
      </div>
    `,
    footerHTML: `
      <button class="secondary" id="cancelOffer">Cancelar</button>
      <button class="primary" id="saveOffer">Enviar oferta</button>
    `
  });

  const valueEl = document.querySelector("#offerValue");
  const sync = () => { valueEl.textContent = CRC.format(offer); };

  document.querySelector("#offerMinus").addEventListener("click", () => {
    offer = Math.max(AUCTION_STEP, offer - AUCTION_STEP);
    sync();
  });
  document.querySelector("#offerPlus").addEventListener("click", () => {
    offer = offer + AUCTION_STEP;
    sync();
  });

  document.querySelector("#cancelOffer").addEventListener("click", closeModal);

  document.querySelector("#saveOffer").addEventListener("click", () => {
    const name = document.querySelector("#offerName").value.trim();
    const phone = document.querySelector("#offerPhone").value.trim();
    if (!name) return alert("Escribe tu nombre.");
    if (!phone) return alert("Escribe tu teléfono.");

    const products = getProducts();
    const idx = products.findIndex(p => p.id === productId);
    if (idx < 0) return alert("No encontré ese producto.");

    products[idx] = { ...products[idx], gangaPrice: offer };
    saveProducts(products);

    const forms = getForms();
    forms.push({
      id: crypto.randomUUID(),
      createdAt: nowTime(),
      name,
      phone,
      subject: `OFERTA SUBASTA: ${products[idx].name} · ${CRC.format(offer)}`
    });
    setForms(forms);

    closeModal();
    alert("Oferta enviada.");
    if (!views.auction.classList.contains("hidden")) renderAuction();
  });
}

/* =========================
   CARRITO MODAL
   ========================= */
function openCartModal(){
  const products = getProducts();
  const cart = getCart();
  const getById = (id) => products.find(p => p.id === id) || null;

  const rows = cart.map(it => {
    const p = getById(it.productId);
    const name = p?.name || "Producto";
    const price = asNumberOrZero(p?.price);
    const qty = asNumberOrZero(it.qty);
    const subtotal = price * qty;

    return `
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px; border:1px solid rgba(255,255,255,0.12); border-radius:14px; background:rgba(0,0,0,0.2);">
        <div style="min-width: 200px;">
          <div style="font-weight:900;">${escapeHtml(name)}</div>
          <div style="color: rgba(242,245,247,0.72); font-size: 13px;">
            ${escapeHtml(CRC.format(subtotal))}
          </div>
        </div>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <button class="secondary" data-del="${escapeHtml(it.productId)}">Quitar</button>
        </div>
      </div>
    `;
  }).join("");

  const total = cart.reduce((acc, it) => {
    const p = getById(it.productId);
    const price = asNumberOrZero(p?.price);
    return acc + (asNumberOrZero(it.qty) * price);
  }, 0);

  openModal({
    title: "Carrito",
    bodyHTML: cart.length
      ? `<div style="display:flex; flex-direction:column; gap:10px;">${rows}</div>
         <div style="margin-top:12px; text-align:right; font-weight:900;">Total: ${escapeHtml(CRC.format(total))}</div>`
      : `<p style="margin:0; color: rgba(242,245,247,0.72);">Tu carrito está vacío.</p>`,
    footerHTML: `
      <button class="secondary" id="cartClose">Cerrar</button>
      <button class="secondary" id="cartClear" ${cart.length ? "" : "disabled"}>Vaciar</button>
      <button class="primary" id="cartBuy" ${cart.length ? "" : "disabled"}>Comprar</button>
    `
  });

  document.querySelector("#cartClose").addEventListener("click", closeModal);
  document.querySelector("#cartClear").addEventListener("click", () => { clearCart(); openCartModal(); });

  document.querySelector("#cartBuy").addEventListener("click", () => {
    openModal({
      title: "Formulario de compra",
      bodyHTML: `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="display:block; margin-bottom:4px;">Nombre</label>
            <input id="buyName" type="text" placeholder="Tu nombre completo" style="width:100%;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;">Número</label>
            <input id="buyPhone" type="tel" placeholder="Tu número de teléfono" style="width:100%;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;">Provincia</label>
            <select id="buyProvincia" style="width:100%;">
              <option value="">-- Selecciona provincia --</option>
              <option>San José</option><option>Alajuela</option><option>Cartago</option>
              <option>Heredia</option><option>Guanacaste</option><option>Puntarenas</option>
              <option>Limón</option>
            </select>
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;">Cantón</label>
            <select id="buyCanton" style="width:100%;" disabled>
              <option value="">-- Primero selecciona provincia --</option>
            </select>
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;">Distrito</label>
            <select id="buyDistrito" style="width:100%;" disabled>
              <option value="">-- Primero selecciona cantón --</option>
            </select>
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;">Señas adicionales</label>
            <input id="buyAddress" type="text" placeholder="Ej: casa azul, frente al parque..." style="width:100%;" />
          </div>
    const crData = {
      "San José": {
        "San José": ["Carmen","Merced","Hospital","Catedral","Zapote","San Francisco de Dos Ríos","Uruca","Mata Redonda","Pavas","Hatillo","San Sebastián"],
        "Escazú": ["Escazú","San Antonio","San Rafael"],
        "Desamparados": ["Desamparados","San Miguel","San Juan de Dios","San Rafael Arriba","San Antonio","Frailes","Patarrá","San Cristóbal","Rosario","Damas","San Rafael Abajo","Gravilias","Los Guido"],
        "Puriscal": ["Santiago","Mercedes Sur","Barbacoas","Grifo Alto","San Rafael","Candelarita","Desamparaditos","San Antonio","Chires"],
        "Tarrazú": ["San Marcos","San Lorenzo","San Carlos"],
        "Aserrí": ["Aserrí","Tarbaca","Vuelta de Jorco","San Gabriel","Legua","Monterrey","Salitrillos"],
        "Mora": ["Colón","Guayabo","Tabarcia","Piedras Negras","Picagres","Jaris","Quitirrisí"],
        "Goicoechea": ["Guadalupe","San Francisco","Calle Blancos","Mata de Plátano","Ipís","Rancho Redondo","Purral"],
        "Santa Ana": ["Santa Ana","Salitral","Pozos","Uruca","Piedades","Brasil"],
        "Alajuelita": ["Alajuelita","San Josecito","San Antonio","Concepción","San Felipe"],
        "Vásquez de Coronado": ["San Isidro","San Rafael","Dulce Nombre de Jesús","Patalillo","Cascajal"],
        "Acosta": ["San Ignacio","Guaitil","Palmichal","Cangrejal","Sabanillas"],
        "Tibás": ["San Juan","Cinco Esquinas","Anselmo Llorente","León XIII","Colmena"],
        "Moravia": ["San Vicente","San Jerónimo","La Trinidad"],
        "Montes de Oca": ["San Pedro","Sabanilla","Mercedes","San Rafael"],
        "Turrubares": ["San Pablo","San Pedro","San Juan de Mata","San Luis","Carara"],
        "Dota": ["Santa María","Jardín","Copey"],
        "Curridabat": ["Curridabat","Granadilla","Sánchez","Tirrases"],
        "Pérez Zeledón": ["San Isidro de El General","El General","Daniel Flores","Rivas","San Pedro","Platanares","Pejibaye","Cajón","Barú","Río Nuevo","Páramo","La Amistad"],
        "León Cortés Castro": ["San Pablo","San Andrés","Llano Bonito","San Isidro","Santa Cruz","San Antonio"]
      },
      "Alajuela": {
        "Alajuela": ["Alajuela","San José","Carrizal","San Antonio","Guácima","San Isidro","Sabanilla","San Rafael","Río Segundo","Desamparados","Turrúcares","Tambor","Garita","Sarapiquí"],
        "San Ramón": ["San Ramón","Santiago","San Juan","Piedades Norte","Piedades Sur","San Rafael","San Isidro","Ángeles","Alfaro","Volio","Concepción","Zapotal","Peñas Blancas","San Lorenzo"],
        "Grecia": ["Grecia","San Isidro","San José","San Roque","Tacares","Río Cuarto","Puente de Piedra","Bolivar"],
        "San Mateo": ["San Mateo","Desmonte","Jesús María","Labrador"],
        "Atenas": ["Atenas","Jesús","Mercedes","San Isidro","Concepción","San José","Santa Eulalia","Escobal"],
        "Naranjo": ["Naranjo","San Miguel","San José","Cirrí Sur","San Jerónimo","San Juan","El Rosario","Palmitos"],
        "Palmares": ["Palmares","Zaragoza","Buenos Aires","Santiago","Candelaria","Esquipulas","La Granja"],
        "Poás": ["San Juan","San Luis","Carrillos","Sabana Redonda"],
        "Orotina": ["Orotina","El Mastate","Hacienda Vieja","Coyolar","La Ceiba"],
        "San Carlos": ["Quesada","Florencia","Buenavista","Aguas Zarcas","Venecia","Pital","La Fortuna","La Tigra","La Palmera","Venado","Cutris","Monterrey","Pocosol"],
        "Zarcero": ["Zarcero","Laguna","Tapesco","Guadalupe","Palmira","Zapote","Brisas"],
        "Sarchí": ["Sarchí Norte","Sarchí Sur","Toro Amarillo","San Pedro","Rodríguez"],
        "Upala": ["Upala","Aguas Claras","San José","Bijagua","Delicias","Dos Ríos","Yolillal","Canalete"],
        "Los Chiles": ["Los Chiles","Caño Negro","El Amparo","San Jorge"],
        "Guatuso": ["San Rafael","Buenavista","Cote","Katira"],
        "Río Cuarto": ["Río Cuarto","Santa Rita","Santa Isabel"]
      },
      "Cartago": {
        "Cartago": ["Oriental","Occidental","Carmen","San Nicolás","Aguacaliente","Guadalupe","Corralillo","Tierra Blanca","Dulce Nombre","Llano Grande","Quebradilla"],
        "Paraíso": ["Paraíso","Santiago","Orosi","Cachí","Llanos de Santa Lucía"],
        "La Unión": ["Tres Ríos","San Diego","San Juan","San Rafael","Concepción","Dulce Nombre","San Ramón","Río Azul"],
        "Jiménez": ["Juan Viñas","Tucurrique","Pejibaye"],
        "Turrialba": ["Turrialba","La Suiza","Peralta","Santa Cruz","Santa Teresita","Pavones","Tuis","Tayutic","Santa Rosa","Tres Equis","La Isabel","Chirripó"],
        "Alvarado": ["Pacayas","Cervantes","Capellades"],
        "Oreamuno": ["San Rafael","Cot","Potrero Cerrado","Cipreses","Santa Rosa"],
        "El Guarco": ["El Tejar","San Isidro","Tobosi","Patio de Agua"]
      },
      "Heredia": {
        "Heredia": ["Heredia","Mercedes","San Francisco","Ulloa","Varablanca"],
        "Barva": ["Barva","San Pedro","San Pablo","San Roque","Santa Lucía","San José de la Montaña"],
        "Santo Domingo": ["Santo Domingo","San Vicente","San Miguel","Paracito","Santo Tomás","Santa Rosa","Tures","Pará"],
        "Santa Bárbara": ["Santa Bárbara","San Pedro","San Juan","Jesús","Santo Domingo","Puraba"],
        "San Rafael": ["San Rafael","San Josecito","Santiago","Ángeles","Concepción"],
        "San Isidro": ["San Isidro","San José","Concepción","San Francisco"],
        "Belén": ["San Antonio","La Ribera","La Asunción"],
        "Flores": ["San Joaquín","Barrantes","Llorente"],
        "San Pablo": ["San Pablo","Rincón de Sabanilla"],
        "Sarapiquí": ["Puerto Viejo","La Virgen","Las Horquetas","Llanuras del Gaspar","Cureña"]
      },
      "Guanacaste": {
        "Liberia": ["Liberia","Cañas Dulces","Mayorga","Nacascolo","Curubandé"],
        "Nicoya": ["Nicoya","Mansión","San Antonio","Quebrada Honda","Sámara","Nosara","Belén de Nosarita"],
        "Santa Cruz": ["Santa Cruz","Bolsón","Veintisiete de Abril","Tempate","Cartagena","Cuajiniquil","Diriá","Cabo Velas","Tamarindo"],
        "Bagaces": ["Bagaces","La Mansion","San Juan de Kiucha","Fortuna"],
        "Carrillo": ["Filadelfia","Palmira","Sardinal","Belén"],
        "Cañas": ["Cañas","Palmira","San Miguel","Bebedero","Porozal"],
        "Abangares": ["Las Juntas","Sierra","San Juan","Colorado"],
        "Tilarán": ["Tilarán","Quebraда Grande","San Pedro","Chitaría","Tronadora","Santa Rosa","Líbano","Tierras Morenas","Arenal"],
        "Nandayure": ["Carmona","Santa Rita","Zapotal","San Pablo","Porvenir","Bejuco"],
        "La Cruz": ["La Cruz","Santa Cecilia","La Garita","Santa Elena"],
        "Hojancha": ["Hojancha","Monte Romo","Puerto Carrillo","Huacas","Matambú"]
      },
      "Puntarenas": {
        "Puntarenas": ["Puntarenas","Pitahaya","Chomes","Lepanto","Paquera","Manzanillo","Guacimal","Barranca","Isla del Coco","Cóbano","Chacarita","Chira","Acapulco","El Roble","Arancibia"],
        "Esparza": ["Espíritu Santo","San Juan Grande","Macacona","San Rafael","San Jerónimo","Caldera"],
        "Buenos Aires": ["Buenos Aires","Volcán","Potrero Grande","Boruca","Pilas","Colinas","Chánguena","Biolley","Brunka"],
        "Montes de Oro": ["Miramar","La Unión","San Isidro"],
        "Osa": ["Puerto Cortés","Palmar","Sierpe","Bahía Ballena","Piedras Blancas","Bahía Drake"],
        "Quepos": ["Quepos","Savegre","Naranjito"],
        "Golfito": ["Golfito","Puerto Jiménez","Guaycará","Pavón"],
        "Coto Brus": ["San Vito","Sabalito","Aguabuena","Limoncito","Pittier","Gutiérrez Braun"],
        "Parrita": ["Parrita"],
        "Corredores": ["Corredor","La Cuesta","Canoas","Laurel"],
        "Garabito": ["Jacó","Tárcoles"]
      },
      "Limón": {
        "Limón": ["Limón","Valle La Estrella","Río Blanco","Matama"],
        "Pococí": ["Guápiles","Jiménez","Rita","Roxana","Cariari","Colorado","La Colonia"],
        "Siquirres": ["Siquirres","Pacuarito","Florida","Germania","El Cairo","Alegría","Reventazón"],
        "Talamanca": ["Bratsi","Sixaola","Cahuita","Telire"],
        "Matina": ["Matina","Batán","Carrandi"],
        "Guácimo": ["Guácimo","Mercedes","Pocora","Río Jiménez","Duacarí"]
      }
    };

    const selProv = document.querySelector("#buyProvincia");
    const selCant = document.querySelector("#buyCanton");
    const selDist = document.querySelector("#buyDistrito");

    selProv.addEventListener("change", () => {
      const cantones = crData[selProv.value] || {};
      selCant.innerHTML = '<option value="">-- Selecciona cantón --</option>';
      Object.keys(cantones).forEach(c => selCant.innerHTML += `<option>${c}</option>`);
      selCant.disabled = !selProv.value;
      selDist.innerHTML = '<option value="">-- Primero selecciona cantón --</option>';
      selDist.disabled = true;
    });

    selCant.addEventListener("change", () => {
      const distritos = (crData[selProv.value] || {})[selCant.value] || [];
      selDist.innerHTML = '<option value="">-- Selecciona distrito --</option>';
      distritos.forEach(d => selDist.innerHTML += `<option>${d}</option>`);
      selDist.disabled = !selCant.value;
    });

    document.querySelector("#buyCancel").addEventListener("click", closeModal);
    document.querySelector("#buyConfirm").addEventListener("click", async() => {
      const name = document.querySelector("#buyName").value.trim();
      const phone = document.querySelector("#buyPhone").value.trim();
      
      const email = document.querySelector("#buyEmail").value.trim();
            const provincia = document.querySelector("#buyProvincia").value.trim();
      const canton = document.querySelector("#buyCanton").value.trim();
      const distrito = document.querySelector("#buyDistrito").value.trim();
      const senas = document.querySelector("#buyAddress").value.trim();
      const address = [provincia, canton, distrito, senas].filter(Boolean).join(", ");
      if (!name || !phone || !provincia || !canton || !distrito || !email) {
        alert("Por favor completa todos los campos.");
        return;
      }

      const orders = loadJSON("buy_orders", []);
      const cartNow = getCart();
      const orderNumber = String(orders.length + 1).padStart(4, "0");
      orders.push({ orderNumber, name, phone, address, email, date: new Date().toISOString(), cart: cartNow });

      // Enviar correo al cliente con enlace del bot
      fetch("/api/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, orderNumber })
      }).then(r => r.json()).then(j => {
        if (!j.ok) console.error("Error enviando correo de pedido:", j.error);
      }).catch(e => console.error("Error enviando correo de pedido:", e));
      saveJSON("buy_orders", orders);

      const allProducts = getProducts();
      const itemsText = Array.isArray(cartNow) && cartNow.length
        ? cartNow.map(it => {
            const prod = allProducts.find(p => p.id === it.productId);
            const nombreProd = prod ? prod.name : it.productId;
            return `- ${nombreProd} x${it.qty}`;
          }).join("\n")
        : "(carrito vacío)";

     // DESPUÉS — esto es lo que debe quedar
const ordenId = orderNumber;

const text =
  `🛍️ PEDIDO #${orderNumber}\n` +
  `Nombre: ${name}\n` +
  `Teléfono: ${phone}\n` +
  `Dirección: ${address}\n\n` +
  `Items:\n${itemsText}`;

try {
  const r = await fetch("/api/telegram-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "cart",
      text,
      ordenId,
      clienteData: {
        nombre: name,
        telefono: phone,
        direccion: address,
        email: email,
        productos: cartNow.map(it => ({
          name: allProducts.find(p => p.id === it.productId)?.name || it.productId,
          qty: it.qty
        })),
        total: cartNow.reduce((acc, it) => {
          const p = allProducts.find(pr => pr.id === it.productId);
          return acc + ((p?.price || 0) * it.qty);
        }, 0)
      }
    })
  });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "Telegram error");
      } catch (e) {
        alert("El pedido se guardó, pero NO se pudo enviar a Telegram: " + (e.message || e));
        return;
      }

      clearCart();
      closeModal();
      alert("¡Pedido confirmado! Nos pondremos en contacto contigo.");
    });
  });

  document.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => { removeFromCart(btn.getAttribute("data-del")); openCartModal(); }));
}

/* =========================
   MENÚ EXTRA (Maker / Web / About)
   ========================= */
function openSimpleInfoModal(title, html) {
  openModal({
    title,
    bodyHTML: html,
    footerHTML: `<button class="primary" id="simpleClose">Cerrar</button>`
  });
  document.querySelector("#simpleClose")?.addEventListener("click", closeModal);
}

/* =========================
   IMC - CATEGORY IMAGES
   ========================= */
function getCategoryImages() {
  return loadJSON(STORAGE_KEYS.categoryImages, {});
}

function saveCategoryImage(categoryName, imageUrl) {
  const images = getCategoryImages();
  images[categoryName] = imageUrl;
  saveJSON(STORAGE_KEYS.categoryImages, images);
}

function getCategoryImageUrl(categoryName) {
  const images = getCategoryImages();
  return images[categoryName] || null;
}

function renderIMC() {
  const panel = document.querySelector("#imcPanel");
  if (!panel) return;
  const cats = getCategories().slice().sort(() => Math.random() - 0.5);
  panel.innerHTML = `<div class="imc-info"><h3>Asignar Imagen a Categoría</h3><p>Escribe la ruta de la imagen (ej: ./assets/miimagen.jpg)</p></div><div class="imc-panel">${cats.map(c => { const currentImage = getCategoryImageUrl(c.name); return `<div class="imc-category-row"><div><label>${escapeHtml(c.name)}</label>${currentImage ? `<small style="color: rgba(90,160,255,0.8);">✓ ${escapeHtml(currentImage)}</small>` : '<small style="color: rgba(242,245,247,0.5);">Sin imagen</small>'}</div><input type="text" class="imc-url-input-${escapeHtml(c.name)}" placeholder="./assets/ejemplo.jpg" value="${escapeHtml(currentImage || '')}" /><button class="primary" data-action="save" data-cat="${escapeHtml(c.name)}">Guardar</button>${currentImage ? `<button class="secondary" data-action="delete" data-cat="${escapeHtml(c.name)}">Quitar</button>` : ''}</div>`; }).join('')}</div>`;
  panel.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    const catName = e.target.getAttribute("data-cat");
    if (action === "save") {
      const input = panel.querySelector(`.imc-url-input-${catName}`);
      const url = input.value.trim();
      if (!url) return alert("Escribe una ruta válida (ej: ./assets/imagen.jpg)");
      saveCategoryImage(catName, url);
      alert("Imagen asignada a " + catName);
      renderIMC();
    }
    if (action === "delete") {
      const images = getCategoryImages();
      delete images[catName];
      saveJSON(STORAGE_KEYS.categoryImages, images);
      alert("Imagen eliminada de " + catName);
      renderIMC();
    }
  });
}

/* =========================
   NAV LISTENERS
   ========================= */
document.querySelector("#homeBtn")?.addEventListener("click", () => showView("menu"));
document.querySelector("#cartBtn")?.addEventListener("click", openCartModal);

document.querySelector("#btnChat")?.addEventListener("click", () => {
  showView("chat");
  renderServiceForm();
});

document.querySelector("#btnCatalog")?.addEventListener("click", () => {
  openCatalogNoticeOncePerLoad();

  showView("catalog");
  state.catalog.categoryId = null;
  state.catalog.subcategoryId = null;
  state.catalog.mode = "categories";
  state.catalog.page = 1;
  renderCatalog();
});

let auctionNoticeShownThisLoad = false;

function openAuctionNoticeOncePerLoad() {
  if (auctionNoticeShownThisLoad) return;
  auctionNoticeShownThisLoad = true;

  const old = document.querySelector("#auctionNoticeHost");
  if (old) old.remove();

  const host = document.createElement("div");
  host.id = "auctionNoticeHost";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }

      .backdrop{
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.70);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }

      .modal{
        width: min(760px, 96vw);
        max-height: 90vh;
        display: flex;
        flex-direction: column;

        background: rgba(18,18,18,.94);
        color: #f2f5f7;

        border: 1px solid rgba(255,255,255,.14);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,.55);

        padding: 16px;
        box-sizing: border-box;
      }

      h3{ margin: 0 0 12px; font-size: 18px; font-weight: 700; }

      .scroll{
        flex: 1 1 auto;
        overflow: auto;
        max-height: 60vh;

        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.25);

        line-height: 1.45;
        box-sizing: border-box;
      }

      p{ margin: 0 0 10px; }
      ul{ margin: 6px 0 12px 22px; padding: 0; }
      li{ margin: 4px 0; }

      .actions{ display: flex; justify-content: flex-end; margin-top: 12px; }

      button{
        appearance: none;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.10);
        color: #f2f5f7;
        font-weight: 700;
        padding: 10px 14px;
        border-radius: 12px;
        cursor: pointer;
      }

      button[disabled]{ opacity: .45; cursor: not-allowed; }

      button.enabled{
        opacity: 1;
        background: rgba(90,160,255,.20);
        border-color: rgba(90,160,255,.45);
      }
    </style>

    <div class="backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Aviso subasta">
        <h3>Aviso importante antes de participar en la subasta</h3>

        <div class="scroll" id="scrollBox">
          <p><strong>Por favor lee antes de continuar:</strong></p>

          <p>
            Los productos en subasta son seleccionados <strong>aleatoriamente cada día</strong>
            de nuestro catálogo. Los precios de subasta pueden ser
            <strong>menores al precio original</strong>.
          </p>

          <p>
            Las subastas son <strong>por orden de llegada</strong>. Una vez que un producto
            es reservado, se retira automáticamente de la subasta del día.
          </p>

          <p>
            Para apartar un producto de subasta debes <strong>contactarnos directamente</strong>
            por los medios disponibles. La reserva no es automática.
          </p>

          <p>
            Los productos de subasta están sujetos a las mismas condiciones del catálogo:
            pueden ser <strong>devoluciones</strong> con detalles menores y cuentan con
            <strong>30 días de garantía</strong>.
          </p>

          <p style="margin-top:14px;">Para activar el botón <em>Entendido</em>, baja hasta el final del texto.</p>
          <div style="height: 12px;"></div>
        </div>

        <div class="actions">
          <button id="okBtn" disabled>Entendido</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const scrollBox = shadow.querySelector("#scrollBox");
  const okBtn = shadow.querySelector("#okBtn");

  function updateOkState() {
    const atBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 2;
    okBtn.disabled = !atBottom;
    okBtn.classList.toggle("enabled", atBottom);
  }

  scrollBox.addEventListener("scroll", updateOkState);
  updateOkState();

  okBtn.addEventListener("click", () => {
    host.remove();
  });
}

document.querySelector("#btnAuction")?.addEventListener("click", () => {
  openAuctionNoticeOncePerLoad();
  showView("auction");
  renderAuction();
});

document.querySelector("#btnMaker")?.addEventListener("click", () => {
  showView("maker");
  renderMaker();
});

function renderMaker() {
  const panel = document.querySelector("#makerPanel");
  if (!panel) return;

  const makerItems = [
    { image: "./assets/servicioimpresion3d.jpeg", id: "impresion3d" },
    { image: "./assets/hacker.jpeg", id: "hacking" },
    { image: "./assets/ouletvideojuego.jpeg", id: "outletvideo" }
  ];

  panel.innerHTML = `
    <div class="grid">
      ${makerItems.map(item => `
        <div class="tile maker-tile" data-maker="${item.id}" style="cursor:pointer; padding:0; overflow:hidden; border-radius: 14px;">
          <img src="${escapeHtml(item.image)}" alt="Servicio" 
               style="width:100%; height:240px; object-fit:cover; display:block;" />
        </div>
      `).join("")}
    </div>
  `;

  panel.querySelectorAll(".maker-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const makerId = tile.getAttribute("data-maker");
      openMakerDetail(makerId);
    });
  });
}

function openMakerDetail(makerId) {
  const details = {
    impresion3d: {
      title: "Impresión 3D",
      description: "Servicios de impresión 3D de alta calidad. Realiza tus proyectos y diseños personalizados."
    },
    hacking: {
      title: "Hacking",
      description: "Aprende sobre seguridad informático, programación y desarrollo de software."
    },
    outletvideo: {
      title: "Outlet Videojuego",
      description: "Consigue videojuegos a precios especiales. Nuevos y usados disponibles."
    }
  };

  const info = details[makerId] || { title: "Maker", description: "Sección en construcción." };

  openModal({
    title: info.title,
    bodyHTML: `<p style="color:rgba(242,245,247,0.8);">${escapeHtml(info.description)}</p>`,
    footerHTML: `<button class="primary" id="closeDetail">Cerrar</button>`
  });

  document.querySelector("#closeDetail").addEventListener("click", closeModal);
}

document.querySelector("#btnAbout")?.addEventListener("click", () => {
  showView("about");
});

document.querySelector("#btnWebDesign")?.addEventListener("click", () => {
  openModal({
    title: "Creación y Diseño de páginas web",
    bodyHTML: `
      <div style="text-align: center;">
        <p style="margin: 0 0 16px; font-size: 16px; color: rgba(242,245,247,0.9);"><strong>¿Necesitas una página web?</strong></p>
        <p style="margin: 0 0 12px; color: rgba(242,245,247,0.8);">Diseñamos páginas web modernas, rápidas y funcionales para tu negocio.</p>
        <div style="background: rgba(90,160,255,0.15); border: 1px solid rgba(90,160,255,0.3); border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px; color: rgba(242,245,247,0.7); font-size: 13px;">Desde</p>
          <p style="margin: 0; font-size: 32px; font-weight: 900; color: #5aa0ff;">₡70.000</p>
          <p style="margin: 8px 0 0; color: rgba(242,245,247,0.7); font-size: 13px;">Diseño completo + hosting</p>
        </div>
        <p style="margin: 0; color: rgba(242,245,247,0.7); font-size: 13px;">Contacta con nosotros para más detalles</p>
      </div>
    `,
    footerHTML: `
      <button class="secondary" id="webClose">Cerrar</button>
      <button class="primary" id="webContact">Solicitar cotización</button>
    `
  });
  document.querySelector("#webClose").addEventListener("click", closeModal);
  document.querySelector("#webContact").addEventListener("click", () => {
    alert("Pronto nos pondremos en contacto contigo. ¡Gracias!");
    closeModal();
  });
});

// --- MODAL NOVEDADES: cierre funcional ---
const novedadesModal = document.getElementById("modalNovedades");
const closeNovedadesBtn = document.getElementById("closeNovedades");

if (novedadesModal && closeNovedadesBtn) {
  closeNovedadesBtn.addEventListener("click", function () {
    novedadesModal.classList.add("hidden");
  });
}

// ---- FAVORITOS ----

function generarCodigo5() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getFavoritos() {
  return loadJSON("favoritos", []);
}
function saveFavoritos(data) {
  saveJSON("favoritos", data);
}


function initFavoritos() {
  document.getElementById("favCategoria").addEventListener("change", function () {
    const sel = document.getElementById("favSubcategoria");
    const subs = getSubcategories().filter(s => s.categoryId === this.value);
    sel.innerHTML = '<option value="">-- Selecciona subcategoría --</option>';
    subs.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  });

  function llenarCategoriasEnFav() {
    const sel = document.getElementById("favCategoria");
    const cats = getCategories();
    sel.innerHTML = '<option value="">-- Selecciona categoría --</option>';
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    document.getElementById("favSubcategoria").innerHTML = '<option value="">-- Selecciona subcategoría --</option>';
  }

  document.getElementById("favBtn").addEventListener("click", function () {
    llenarCategoriasEnFav();

    // Reset UI para que no quede el validador pegado
    document.getElementById("favFormWrap").classList.remove("hidden");
    document.getElementById("favValidarWrap").classList.add("hidden");
    document.getElementById("favCodigoWrap").classList.add("hidden");

    var err = document.getElementById("favValidarError");
    if (err) err.style.display = "none";
    var codeInput = document.getElementById("favCodigoInput");
    if (codeInput) codeInput.value = "";

    document.getElementById("favNombre").value = "";
    document.getElementById("favTelefono").value = "";
    document.getElementById("modalFavorito").classList.remove("hidden");
  });

  document.getElementById("closeFavModal").addEventListener("click", function () {
    document.getElementById("modalFavorito").classList.add("hidden");

    // Reset al cerrar (opcional)
    document.getElementById("favFormWrap").classList.remove("hidden");
    document.getElementById("favValidarWrap").classList.add("hidden");
    document.getElementById("favCodigoWrap").classList.add("hidden");
    var err = document.getElementById("favValidarError");
    if (err) err.style.display = "none";
    var codeInput = document.getElementById("favCodigoInput");
    if (codeInput) codeInput.value = "";
  });

  document.getElementById("favCerrarCodigo").addEventListener("click", function () {
    document.getElementById("modalFavorito").classList.add("hidden");
  });

  document.getElementById("favGuardar").addEventListener("click", function () {
    const nombre = document.getElementById("favNombre").value.trim();
    const telefono = document.getElementById("favTelefono").value.trim();
    const catSel = document.getElementById("favCategoria");
    const subSel = document.getElementById("favSubcategoria");

    if (!nombre || !telefono) {
      alert("Por favor completa nombre y teléfono.");
      return;
    }

    const lista = getFavoritos();
    const yaExiste = lista.find(f => f.telefono === telefono);

    if (yaExiste) {
      // Guardar datos temporales y pedir código
      document.getElementById("favFormWrap").classList.add("hidden");
      document.getElementById("favValidarWrap").classList.remove("hidden");
      document.getElementById("favCodigoInput").value = "";
      document.getElementById("favValidarError").style.display = "none";

      document.getElementById("favValidarCodigo").onclick = function () {
        const inputCodigo = document.getElementById("favCodigoInput").value.trim().toUpperCase();
        if (inputCodigo !== yaExiste.id) {
          document.getElementById("favValidarError").style.display = "block";
          return;
        }
        // Código correcto — guardar con el mismo código
        const favorito = {
          id: yaExiste.id,
          nombre,
          telefono,
          categoriaId: catSel.value || null,
          categoriaNombre: catSel.options[catSel.selectedIndex].text,
          subcategoriaId: subSel.value || null,
          subcategoriaNombre: subSel.options[subSel.selectedIndex].text,
          created: new Date().toISOString()
        };
        lista.push(favorito);
        saveFavoritos(lista);

        document.getElementById("favValidarWrap").classList.add("hidden");
        document.getElementById("favCodigo").textContent = yaExiste.id;
        document.getElementById("favCodigoWrap").classList.remove("hidden");
      };
      return;
    }

    const codigo = generarCodigo5();
    const favorito = {
      id: codigo,
      nombre,
      telefono,
      categoriaId: catSel.value || null,
      categoriaNombre: catSel.options[catSel.selectedIndex].text,
      subcategoriaId: subSel.value || null,
      subcategoriaNombre: subSel.options[subSel.selectedIndex].text,
      created: new Date().toISOString()
    };

    lista.push(favorito);
    saveFavoritos(lista);

    document.getElementById("favCodigo").textContent = codigo;
    document.getElementById("favFormWrap").classList.add("hidden");
    document.getElementById("favCodigoWrap").classList.remove("hidden");
  });
}

document.addEventListener("DOMContentLoaded", initFavoritos);


// === Modal correo (desde botón en favoritos) ===
document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("favOpenNovedades");
  const modal = document.getElementById("modalCorreo");
  const close = document.getElementById("closeCorreoModal");
  const input = document.getElementById("correoInput");
  const send = document.getElementById("correoEnviar");
  const msg = document.getElementById("correoMsg");

  function openCorreoModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    if (msg) msg.style.display = "none";
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function closeCorreoModal() {
    if (!modal) return;
    modal.classList.add("hidden");
  }

  btn?.addEventListener("click", function () {
    openCorreoModal();
  });

  close?.addEventListener("click", closeCorreoModal);

  // Cerrar al hacer click afuera (en el backdrop)
  modal?.addEventListener("click", function (e) {
    if (e.target === modal) closeCorreoModal();
  });

  send?.addEventListener("click", async function () {
    const email = (input?.value || "").trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!ok) {
      if (msg) {
        msg.textContent = "Por favor ingresa un correo válido.";
        msg.style.display = "block";
        msg.style.color = "red";
      }
      return;
    }

    try {
           if (msg) {
        msg.textContent = "Enviando...";
        msg.style.display = "block";
        msg.style.color = "white";
      }

      const selCat = document.getElementById("favCategoria");
      const r = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, categoria: selCat.options[selCat.selectedIndex]?.text || "" })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Error enviando correo");

      if (msg) {
        msg.textContent = "Listo. Revisa tu correo.";
        msg.style.display = "block";
        msg.style.color = "lime";
      }
    } catch (e) {
      if (msg) {
        msg.textContent = "No se pudo enviar el correo: " + (e.message || "");
        msg.style.display = "block";
        msg.style.color = "red";
      }
    }
  });
});



// === Mostrar botón de Novedades SOLO para Hogar y sin subcategoría ===
document.addEventListener("DOMContentLoaded", function () {
  const btnNovedades = document.getElementById("favOpenNovedades");
  const selCat = document.getElementById("favCategoria");
  const selSub = document.getElementById("favSubcategoria");

  if (!btnNovedades || !selCat || !selSub) return;

  function normalize(s) {
    return String(s || "").trim().toLowerCase();
  }

  function updateNovedadesButtonVisibility() {
    const catText = normalize(selCat.options[selCat.selectedIndex]?.text);
    const catValue = normalize(selCat.value);

    // aceptamos "hogar" tanto por texto visible como por value
    const isHogar = catText === "hogar" || catValue === "hogar";

    const subValue = normalize(selSub.value);
    const noSubSelected = subValue === ""; // cuando está "-- Selecciona subcategoría --"

    // visible solo si Hogar y subcategoría no seleccionada
    btnNovedades.style.display = (catValue !== "" && noSubSelected) ? "block" : "none";
  }

  // Ejecutar al cargar y al cambiar selects
  updateNovedadesButtonVisibility();
  selCat.addEventListener("change", updateNovedadesButtonVisibility);
  selSub.addEventListener("change", updateNovedadesButtonVisibility);
});


(function () {
  const chatSend = document.getElementById("chatSend");
  const chatText = document.getElementById("chatText");

  if (chatSend && chatText) {
    chatSend.addEventListener("click", async () => {
      const text = (chatText.value || "").trim();
      if (!text) return;

      try {
        const r = await fetch("/api/telegram-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "customer_service", text })
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "Telegram error");

        chatText.value = "";
      } catch (e) {
        alert("No se pudo enviar a Telegram: " + (e.message || e));
      }
    });
  }
})();