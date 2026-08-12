/* ============================================================
   Clubhouse Golf — Main Application
   PWA for Golf Accessories, Coaching, Video Lessons & Swing Analysis
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────────────────────
// 1. CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────
const BASE = (() => {
  const m = window.location.pathname.match(/^(\/[^/]+)/);
  return m ? m[1] : '';
})();
const DATA_BASE = `${BASE}/data`;

// App version — MUST be bumped on every deploy (keep in sync with
// docs/version.json and the service-worker CACHE_NAME). The running app
// compares this baked-in value against the live version.json to detect a
// newer deploy and offer a one-tap "pull latest" refresh.
const APP_VERSION = '1.9.1';
const VERSION_URL = `${BASE}/version.json`;

const TABS = ['shop', 'performance', 'caddy', 'vision', 'profile', 'docs'];
const DEFAULT_TAB = 'shop';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MODELS = [
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5 (fast & affordable)' },
  { id: 'claude-sonnet-4-6',           label: 'Sonnet 4.6 (balanced)' },
];
const SYSTEM_PROMPT = `You are Caddy AI, the personal golf assistant for Clubhouse Golf.

You help golfers with:
• Club selection and fitting advice based on their swing characteristics and handicap
• Course strategy and course management tips for specific situations
• Swing improvement tips for all skill levels (beginner to scratch)
• Equipment recommendations — drivers, irons, wedges, putters, balls, accessories
• Practice drills and training plans
• Rules of golf clarification
• Mental game and pre-shot routine advice

Tone: knowledgeable, encouraging, precise — like a PGA Tour caddie who is also a PGA professional coach.
Keep responses concise but complete (2–4 paragraphs max). Use bullet points for lists.
Never make up specific product model numbers unless you are confident they exist.
You cannot see the golfer's bag, rounds or swing — ask for the detail you need rather than assuming it.`;

// ─────────────────────────────────────────────────────────────
// 2. APPLICATION STATE
// ─────────────────────────────────────────────────────────────
const state = {
  // Navigation
  activeTab: DEFAULT_TAB,

  // Data
  products: [],
  coaches: [],
  courses: [],
  submissions: [],
  profile: null,

  // PWA update / "pull latest code" from GitHub Pages
  latestVersion: null,
  updateAvailable: false,
  updating: false,

  // Shop
  activeCategory: 'all',
  searchQuery: '',
  cartItems: [],   // [{ product, variants, qty }]
  selectedProduct: null,
  productQty: 1,
  selectedVariants: {},

  // Booking
  bookingStep: 'coaches',  // coaches | details | confirm | confirmed
  selectedCoach: null,
  selectedSessionType: 'in-person',
  selectedDate: null,
  selectedTime: null,
  selectedSession: null,
  calendarDate: new Date(),

  // Lessons
  activeTopic: 'all',
  selectedCourse: null,
  videoProgress: {},  // { courseId: percent }
  subscribed: false,

  // Performance sub-tab — 'swing' | 'lessons' | 'coaching' | 'stats'.
  // Deliberately NOT state.activeTopic, which the Lessons topic filter owns
  // and which now renders inside Performance.
  perfSub: 'swing',

  // Swing
  selectedSubmission: null,
  uploadFile: null,
  uploadClub: 'Driver',
  uploadNotes: '',

  // AI Chat
  chatMessages: [],
  chatOpen: false,
  chatLoading: false,
  apiKey: '',
  selectedModel: DEFAULT_MODEL,

  // Install
  deferredInstallPrompt: null,
};

// ─────────────────────────────────────────────────────────────
// 3. APP INITIALIZATION
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadPersistedState();
  setupImageFallback();
  setupOfflineDetection();
  setupInstallPrompt();
  registerServiceWorker();
  setupNavigation();
  setupGlobalCart();
  setupChat();
  setupSettings();

  // Load data in parallel
  await Promise.all([
    loadJSON(`${DATA_BASE}/products.json`).then(d => { state.products = d; }),
    loadJSON(`${DATA_BASE}/coaches.json`).then(d => { state.coaches = d; }),
    loadJSON(`${DATA_BASE}/courses.json`).then(d => { state.courses = d; }),
    loadJSON(`${DATA_BASE}/submissions.json`).then(d => { state.submissions = d; }),
    loadJSON(`${DATA_BASE}/profile.json`).then(d => { state.profile = d; }),
  ]).catch(err => console.warn('[GV] Data load partial failure:', err));

  // Route to initial tab
  const hash = window.location.hash.replace('#', '');
  const tab = TABS.includes(hash) ? hash : DEFAULT_TAB;
  activateTab(tab, true);

  updateCartBadge();

  // Check whether a newer version has been deployed to GitHub Pages.
  checkForUpdate();
  // Re-check when the app returns to the foreground (e.g. mobile tab switch).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
});

// ─────────────────────────────────────────────────────────────
// 3b. IMAGE FALLBACK — swap any broken image to a branded placeholder
// ─────────────────────────────────────────────────────────────
const IMG_PLACEHOLDER = `${BASE}/icons/product-placeholder.svg`;
function setupImageFallback() {
  // 'error' does not bubble, so listen in the capture phase to catch every <img>.
  document.addEventListener('error', (e) => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && !el.dataset.fallbackApplied) {
      el.dataset.fallbackApplied = '1';
      el.src = IMG_PLACEHOLDER;
    }
  }, true);
}

// ─────────────────────────────────────────────────────────────
// 3c. PWA UPDATE — pull the latest deployed code from GitHub Pages
// ─────────────────────────────────────────────────────────────
// The running bundle carries APP_VERSION (baked into this cached app.js).
// version.json is fetched fresh from the network on every check, so when a
// newer build is deployed the two differ and we flag an update. The Shop
// refresh button then clears caches + refreshes the service worker so the
// device downloads the latest HTML/CSS/JS/data.

async function checkForUpdate() {
  try {
    // cache: 'no-store' bypasses the HTTP cache; the SW also serves
    // version.json network-first, so this reflects the live deploy.
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    state.latestVersion = data.version || null;
    state.updateAvailable = !!state.latestVersion && state.latestVersion !== APP_VERSION;
  } catch (_) {
    // Offline or fetch blocked — leave current state untouched.
  }
  reflectUpdateState();
}

function reflectUpdateState() {
  const btn = document.getElementById('shop-refresh');
  if (!btn) return;
  btn.classList.toggle('has-update', state.updateAvailable && !state.updating);
  btn.setAttribute('title', state.updateAvailable
    ? `Update available (v${state.latestVersion}) — tap to refresh`
    : 'Check for updates');
  const label = btn.querySelector('.shop-refresh-label');
  if (label) label.textContent = state.updateAvailable ? 'Update' : '';
}

async function onShopRefresh() {
  if (state.updating) return;
  const btn = document.getElementById('shop-refresh');
  btn?.classList.add('spinning');
  await checkForUpdate();
  if (state.updateAvailable) {
    await applyUpdate();               // clears caches + reloads with latest code
  } else {
    btn?.classList.remove('spinning');
    showToast("You're on the latest version ✓");
  }
}

async function applyUpdate() {
  state.updating = true;
  showToast('Updating to the latest version…');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      // Fetch the new service worker; tell any waiting worker to take over.
      await Promise.all(regs.map(async r => {
        try { await r.update(); } catch (_) {}
        if (r.waiting) r.waiting.postMessage({ type: 'SKIP_WAITING' });
      }));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (_) { /* best-effort — reload anyway */ }
  // Reload from the network; with caches cleared the SW refetches everything.
  window.location.reload();
}

// ─────────────────────────────────────────────────────────────
// 4. DATA LOADING
// ─────────────────────────────────────────────────────────────
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// 5. PERSISTED STATE
// ─────────────────────────────────────────────────────────────
function loadPersistedState() {
  try {
    const cart = localStorage.getItem('gv_cart');
    if (cart) state.cartItems = JSON.parse(cart);
    state.apiKey = localStorage.getItem('gv_api_key') || '';
    state.selectedModel = localStorage.getItem('gv_model') || DEFAULT_MODEL;
    const progress = localStorage.getItem('gv_video_progress');
    if (progress) state.videoProgress = JSON.parse(progress);
    const subscribed = localStorage.getItem('gv_subscribed');
    if (subscribed) state.subscribed = subscribed === 'true';
  } catch (e) { console.warn('[GV] State restore error:', e); }
}

function saveCart() {
  localStorage.setItem('gv_cart', JSON.stringify(state.cartItems));
}

function saveVideoProgress() {
  localStorage.setItem('gv_video_progress', JSON.stringify(state.videoProgress));
}

// ─────────────────────────────────────────────────────────────
// 6. TAB NAVIGATION
// ─────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
    });
  });
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (TABS.includes(hash)) activateTab(hash, true);
  });
}

function activateTab(tab, skipHistory = false) {
  state.activeTab = tab;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // The FAB is redundant on Caddy, which has its own Ask button.
  syncFab(tab);

  // Show/hide panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `tab-${tab}`;
    panel.classList.toggle('active', isActive);
    if (isActive) renderTab(tab);
  });
  if (!skipHistory) history.pushState(null, '', `#${tab}`);
  else history.replaceState(null, '', `#${tab}`);
}

function renderTab(tab) {
  switch (tab) {
    case 'shop':        renderShop(); break;
    case 'performance': renderPerformance(); break;
    case 'caddy':       renderCaddy(); break;
    case 'vision':      renderVision(); break;
    case 'profile':     renderProfile(); break;
    case 'docs':        renderDocs();  break;
  }
}

// ─────────────────────────────────────────────────────────────
// 7. SHOP TAB
// ─────────────────────────────────────────────────────────────
function renderShop() {
  const panel = document.getElementById('tab-shop');
  if (panel.dataset.rendered) {
    filterProducts();
    return;
  }
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <!-- Hero banner. The artwork carries its own headline and CTA, so nothing
         is overlaid on it; the brand statement follows in real copy. -->
    <div class="shop-banner">
      <img class="shop-banner-img" src="assets/clubhouse-hero.png"
        alt="Clubhouse Golf — elevate your game" width="900" height="600">
      <button class="shop-refresh" id="shop-refresh" type="button"
        aria-label="Check for updates" title="Check for updates">
        <span class="shop-refresh-icon" aria-hidden="true">⟳</span>
        <span class="shop-refresh-label"></span>
      </button>
    </div>

    <header class="shop-hero">
      <img class="shop-hero-logo" src="assets/clubhouse-logo.png"
        alt="Clubhouse Golf" width="176" height="117">
      <div class="brand-eyebrow">Modern Golf. Made Simple.</div>
      <h1 class="brand-headline">Everything Golf.</h1>
      <p class="brand-lede">Shop apparel, discover new gear, improve your game, and join the community changing golf.</p>
    </header>

    <!-- Search bar (below hero) -->
    <div style="background:var(--golf-green);padding:12px var(--content-pad) 14px">
      <div class="search-container">
        <span class="search-icon">🔍</span>
        <input class="search-input" id="shop-search" type="search"
          placeholder="Search clubs, apparel, accessories…"
          value="${escHtml(state.searchQuery)}" autocomplete="off">
      </div>
    </div>

    <div class="filter-row" id="shop-filters">
      ${['all','clubs','apparel','accessories','equipment'].map(cat =>
        `<button class="filter-chip${state.activeCategory === cat ? ' active' : ''}"
          data-cat="${cat}">${cat === 'all' ? '✦ All' : cap(cat)}</button>`
      ).join('')}
    </div>
    <div class="product-grid" id="product-grid"></div>

    <!-- Shop keeps a short teaser. The full brand story, the eight pillars,
         the roadmap and the Founding Member CTA live on the Vision tab. -->
    <section class="brand-story">
      <article class="story-block">
        <div class="story-eyebrow">Why Clubhouse Exists</div>
        <p class="story-lead">Golf has evolved. The experience hasn't.</p>
        <p>We're building a modern golf brand centered around community, technology, experiences, and products people actually want.</p>
        <button class="btn btn-outline btn-full" id="shop-see-vision" type="button">See what's coming →</button>
      </article>
    </section>

    <div class="modal-overlay" id="product-modal">
      <div class="modal-sheet" id="product-detail"></div>
    </div>
  `;

  // Search
  const search = panel.querySelector('#shop-search');
  search.addEventListener('input', () => {
    state.searchQuery = search.value.trim().toLowerCase();
    filterProducts();
  });

  // Filter chips
  panel.querySelector('#shop-filters').addEventListener('click', e => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.activeCategory = btn.dataset.cat;
    panel.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === btn.dataset.cat));
    filterProducts();
  });

  // Close product modal on overlay click
  panel.querySelector('#product-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProductModal();
  });

  // Pull-latest / update refresh button
  panel.querySelector('#shop-see-vision').addEventListener('click', () => activateTab('vision'));
  panel.querySelector('#shop-refresh').addEventListener('click', onShopRefresh);
  reflectUpdateState();   // highlight if an update was already detected

  filterProducts();
}

function filterProducts() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const cat = state.activeCategory;
  const q = state.searchQuery;
  const filtered = state.products.filter(p =>
    (cat === 'all' || p.category === cat) &&
    (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.includes(q))
  );
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⛳</div>
      <h3>No products found</h3>
      <p>Try a different category or search term.</p>
    </div>`;
    return;
  }
  grid.innerHTML = filtered.map(p => productCardHtml(p)).join('');
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProductDetail(card.dataset.id));
  });
}

function productCardHtml(p) {
  const badgeClass = p.badge?.toLowerCase() === 'sale' ? 'sale' : p.badge?.toLowerCase() === 'new' ? 'new' : '';
  const stars = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  return `<div class="product-card" data-id="${p.id}">
    <div class="product-img-wrap">
      <img src="${p.image}" alt="${escHtml(p.name)}" loading="lazy">
      ${p.badge ? `<span class="product-badge ${badgeClass}">${p.badge}</span>` : ''}
    </div>
    <div class="product-info">
      <div class="product-name">${escHtml(p.name)}</div>
      <div class="product-price">$${p.price.toFixed(2)}${p.originalPrice ? `<span class="original-price">$${p.originalPrice.toFixed(2)}</span>` : ''}</div>
      <div class="product-rating"><span class="stars">${stars}</span> ${p.rating} (${p.reviews})</div>
    </div>
  </div>`;
}

function openProductDetail(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  state.selectedProduct = p;
  state.productQty = 1;
  state.selectedVariants = {};
  // Pre-select first variant option for each
  if (p.variants) p.variants.forEach(v => { state.selectedVariants[v.type] = v.options[0]; });

  const modal = document.getElementById('product-modal');
  const detail = document.getElementById('product-detail');
  detail.innerHTML = productDetailHtml(p);
  modal.classList.add('show');

  // Close button
  detail.querySelector('.modal-close').addEventListener('click', closeProductModal);

  // Variant selection
  detail.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const val = btn.dataset.val;
      state.selectedVariants[type] = val;
      detail.querySelectorAll(`.variant-btn[data-type="${type}"]`).forEach(b => {
        b.classList.toggle('selected', b.dataset.val === val);
      });
    });
  });

  // Qty controls
  detail.querySelector('.qty-btn[data-dir="down"]').addEventListener('click', () => {
    if (state.productQty > 1) { state.productQty--; detail.querySelector('.qty-display').textContent = state.productQty; }
  });
  detail.querySelector('.qty-btn[data-dir="up"]').addEventListener('click', () => {
    if (state.productQty < 10) { state.productQty++; detail.querySelector('.qty-display').textContent = state.productQty; }
  });

  // Add to cart
  detail.querySelector('#add-to-cart-btn').addEventListener('click', () => {
    addToCart(state.selectedProduct, { ...state.selectedVariants }, state.productQty);
    closeProductModal();
    showToast(`${p.name} added to cart 🛍`);
  });
}

function productDetailHtml(p) {
  const stars = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  return `
    <div class="modal-handle"></div>
    <button class="modal-close" aria-label="Close">✕</button>
    <img class="detail-img" src="${p.image}" alt="${escHtml(p.name)}">
    <div class="detail-body">
      <h2 class="detail-name serif">${escHtml(p.name)}</h2>
      <div class="detail-price-row">
        <span class="detail-price">$${p.price.toFixed(2)}</span>
        ${p.originalPrice ? `<span class="detail-orig">$${p.originalPrice.toFixed(2)}</span>` : ''}
      </div>
      <div class="product-rating" style="margin-bottom:12px">
        <span class="stars">${stars}</span> ${p.rating} · ${p.reviews} reviews
      </div>
      <p class="detail-desc">${escHtml(p.description)}</p>
      ${p.features?.length ? `<ul class="features-list">${p.features.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>` : ''}
      ${(p.variants||[]).map(v => `
        <div class="variant-group">
          <div class="variant-label">${cap(v.type)}</div>
          <div class="variant-options">
            ${v.options.map((opt, i) => `
              <button class="variant-btn${i === 0 ? ' selected' : ''}" data-type="${v.type}" data-val="${escHtml(opt)}">${escHtml(opt)}</button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="add-to-cart-bar">
      <div class="qty-control">
        <button class="qty-btn" data-dir="down">−</button>
        <span class="qty-display">1</span>
        <button class="qty-btn" data-dir="up">+</button>
      </div>
      <button id="add-to-cart-btn" class="btn btn-accent btn-lg" style="flex:1">Add to Cart</button>
    </div>
  `;
}

function closeProductModal() {
  document.getElementById('product-modal')?.classList.remove('show');
}

// ── Cart ──────────────────────────────────────────────────────
function addToCart(product, variants, qty) {
  const key = cartKey(product.id, variants);
  const existing = state.cartItems.find(i => cartKey(i.product.id, i.variants) === key);
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, 10);
  } else {
    state.cartItems.push({ product, variants, qty });
  }
  saveCart();
  updateCartBadge();
}

function cartKey(id, variants) {
  return id + '|' + Object.entries(variants || {}).map(([k,v]) => `${k}:${v}`).sort().join('|');
}

function updateCartBadge() {
  const total = state.cartItems.reduce((s, i) => s + i.qty, 0);
  const badge = document.querySelector('.cart-badge');
  if (!badge) return;
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
}

function openCart() {
  const modal = document.getElementById('cart-modal');
  const sheet = document.getElementById('cart-sheet');
  if (!modal || !sheet) return;
  sheet.innerHTML = cartHtml();
  modal.classList.add('show');
  // Wire up remove buttons
  sheet.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      state.cartItems.splice(idx, 1);
      saveCart();
      updateCartBadge();
      sheet.innerHTML = cartHtml();
      wireCartEvents(sheet);
    });
  });
  wireCartEvents(sheet);
}

function wireCartEvents(sheet) {
  sheet.querySelector('.cart-close')?.addEventListener('click', closeCartModal);
  sheet.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      state.cartItems.splice(idx, 1);
      saveCart();
      updateCartBadge();
      sheet.innerHTML = cartHtml();
      wireCartEvents(sheet);
    });
  });
  sheet.querySelector('#checkout-btn')?.addEventListener('click', () => {
    closeCartModal();
    showToast('Stripe integration coming soon — checkout placeholder ✓');
  });
}

function cartHtml() {
  const items = state.cartItems;
  const total = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  if (items.length === 0) {
    return `
      <div class="modal-handle"></div>
      <button class="cart-close modal-close">✕</button>
      <h3 style="padding:16px 16px 8px;font-family:var(--font-serif)">Your Cart</h3>
      <div class="cart-empty">
        <div class="empty-icon">🛒</div>
        <p>Your cart is empty.<br>Add some products to get started.</p>
      </div>`;
  }
  return `
    <div class="modal-handle"></div>
    <button class="cart-close modal-close">✕</button>
    <h3 style="padding:16px 16px 8px;font-family:var(--font-serif)">Your Cart (${items.reduce((s,i)=>s+i.qty,0)} items)</h3>
    ${items.map((item, idx) => {
      const variantStr = Object.entries(item.variants || {}).map(([k,v]) => `${cap(k)}: ${v}`).join(' · ');
      return `<div class="cart-item">
        <img class="cart-item-img" src="${item.product.image}" alt="">
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.product.name)}</div>
          ${variantStr ? `<div class="cart-item-variant">${escHtml(variantStr)}</div>` : ''}
          <div class="cart-item-row">
            <span class="cart-item-price">$${(item.product.price * item.qty).toFixed(2)}</span>
            <span style="font-size:12px;color:var(--gray-400)">Qty: ${item.qty}</span>
          </div>
        </div>
        <button class="cart-remove" data-idx="${idx}" aria-label="Remove">✕</button>
      </div>`;
    }).join('')}
    <div class="cart-footer">
      <div class="cart-total-row">
        <span class="cart-total-label">Order total</span>
        <span class="cart-total-price serif">$${total.toFixed(2)}</span>
      </div>
      <button class="btn btn-accent btn-full btn-lg" id="checkout-btn">Proceed to Checkout →</button>
      <p style="text-align:center;font-size:11px;color:var(--gray-400);margin-top:10px">Secure checkout via Stripe</p>
    </div>`;
}

function closeCartModal() {
  document.getElementById('cart-modal')?.classList.remove('show');
}

// ── Global Cart Setup ─────────────────────────────────────────
function setupGlobalCart() {
  // Open cart when cart badge is clicked from any tab
  document.addEventListener('click', e => {
    if (e.target.closest('.cart-badge')) {
      e.stopPropagation();
      openCart();
    }
  });
  // Close on overlay click
  document.getElementById('cart-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCartModal();
  });
}

// ─────────────────────────────────────────────────────────────
// 7b. PERFORMANCE TAB — hosts Swing, Lessons and Coaching as sub-views.
// The brand groups all three under one pillar ("Track, improve, and compete."),
// so they are sub-tabs here rather than three top-level destinations.
// ─────────────────────────────────────────────────────────────
const PERF_SUBS = [
  { id: 'swing',    label: 'Swing' },
  { id: 'lessons',  label: 'Lessons' },
  { id: 'coaching', label: 'Coaching' },
  { id: 'stats',    label: 'Stats' },
];

function renderPerformance() {
  const panel = document.getElementById('tab-performance');

  if (!panel.dataset.rendered) {
    panel.dataset.rendered = '1';
    panel.innerHTML = `
      <div class="tab-header">
        <h1>Performance</h1>
        <div class="subtitle">TRACK, IMPROVE, AND COMPETE.</div>
      </div>
      <div class="topic-tabs" id="perf-subnav" role="tablist">
        ${PERF_SUBS.map(t => `<button class="topic-tab${state.perfSub === t.id ? ' active' : ''}" data-sub="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="perf-body" id="perf-body"></div>
    `;

    // data-sub, not data-topic — the Lessons topic filter renders inside this
    // panel and listens for [data-topic] on its own row.
    panel.querySelector('#perf-subnav').addEventListener('click', e => {
      const btn = e.target.closest('[data-sub]');
      if (!btn || btn.dataset.sub === state.perfSub) return;
      state.perfSub = btn.dataset.sub;
      panel.querySelectorAll('#perf-subnav .topic-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.sub === state.perfSub));
      renderPerfBody();
    });
  }

  renderPerfBody();
}

function renderPerfBody() {
  const body = document.getElementById('perf-body');
  if (!body) return;

  // The sub-renderers guard on dataset.rendered, so clear it when swapping
  // views or they refuse to redraw into the reused container.
  delete body.dataset.rendered;
  body.innerHTML = '';
  body.className = 'perf-body perf-' + state.perfSub;

  switch (state.perfSub) {
    case 'swing':    renderSwing(body); break;
    case 'lessons':  renderLessons(body); break;
    case 'coaching': renderBooking(body); break;
    case 'stats':    body.innerHTML = perfStatsHtml(); break;
  }
}

// Not built. The four features are the brand site's own Performance list.
function perfStatsHtml() {
  const soon = ['Shot tracking', 'Handicap dashboard', 'Performance analytics', 'Virtual coaching'];
  return `
    <div class="empty-state">
      <div class="empty-icon">📊</div>
      <h3>Stats are on the way</h3>
      <p>Round-by-round tracking and analytics arrive with the Performance pillar.</p>
      <ul class="story-list" style="justify-content:center;margin-top:14px">
        ${soon.map(f => `<li>${escHtml(f)}</li>`).join('')}
      </ul>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// 8. BOOK A SESSION TAB
// ─────────────────────────────────────────────────────────────
function renderBooking(panel = document.getElementById('tab-book')) {
  panel.innerHTML = bookingHtml();
  wireBookingEvents(panel);
}

function bookingHtml() {
  switch (state.bookingStep) {
    case 'coaches':  return coachListHtml();
    case 'details':  return bookingDetailsHtml();
    case 'confirm':  return bookingConfirmHtml();
    case 'confirmed': return bookingConfirmedHtml();
  }
}

function coachListHtml() {
  return `
    <div class="tab-header">
      <h1 class="serif">Book a Session</h1>
      <div class="subtitle">CHOOSE YOUR COACH</div>
    </div>
    <div class="coaches-list">
      ${state.coaches.map(coach => coachCardHtml(coach)).join('')}
    </div>`;
}

function coachCardHtml(c) {
  const stars = '★'.repeat(Math.round(c.rating)) + '☆'.repeat(5 - Math.round(c.rating));
  const typeIcons = { 'in-person': '🏌', 'virtual': '💻', 'group': '👥' };
  return `<div class="coach-card" data-coach-id="${c.id}">
    <div class="coach-card-inner">
      <img class="coach-photo" src="${c.photo}" alt="${escHtml(c.name)}" loading="lazy">
      <div class="coach-info">
        <div class="coach-name">${escHtml(c.name)}</div>
        <div class="coach-title">${escHtml(c.title)}</div>
        <div class="coach-specialties">
          ${c.specialties.slice(0,3).map(s => `<span class="specialty-tag">${escHtml(s)}</span>`).join('')}
        </div>
        <div class="coach-meta">
          <span class="coach-rating"><span class="stars">${stars}</span> ${c.rating}</span>
          <span>·</span><span>${c.reviews} reviews</span>
          <span>·</span><span>${c.experience}</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px">
          ${c.sessionTypes.map(t => `<span style="font-size:14px" title="${cap(t)}">${typeIcons[t]||''}</span>`).join('')}
          <span style="font-size:11px;color:var(--gray-400);align-self:center">${c.sessionTypes.map(cap).join(' · ')}</span>
        </div>
      </div>
    </div>
    <div style="padding:0 14px 14px">
      <button class="btn btn-primary btn-full" data-book-coach="${c.id}" style="margin-top:8px">
        Book with ${c.name.split(' ')[0]} →
      </button>
    </div>
  </div>`;
}

function wireBookingEvents(panel) {
  // Coach cards
  panel.querySelectorAll('[data-book-coach]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedCoach = state.coaches.find(c => c.id === btn.dataset.bookCoach);
      state.bookingStep = 'details';
      state.selectedSessionType = state.selectedCoach.sessionTypes[0];
      state.selectedDate = null;
      state.selectedTime = null;
      state.selectedSession = null;
      state.calendarDate = new Date();
      renderBooking(panel);
    });
  });

  // Back button
  panel.querySelector('.booking-back')?.addEventListener('click', () => {
    if (state.bookingStep === 'details') { state.bookingStep = 'coaches'; }
    else if (state.bookingStep === 'confirm') { state.bookingStep = 'details'; }
    renderBooking(panel);
  });

  // Session type buttons
  panel.querySelectorAll('.session-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedSessionType = btn.dataset.type;
      panel.querySelectorAll('.session-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === btn.dataset.type));
      updateSessionOptions(panel);
    });
  });

  // Calendar nav
  panel.querySelector('.cal-prev')?.addEventListener('click', () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
    panel.querySelector('.calendar-wrap').outerHTML = calendarHtml(state.calendarDate);
    renderBooking(panel); // re-render for simplicity
  });
  panel.querySelector('.cal-next')?.addEventListener('click', () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
    renderBooking(panel);
  });

  // Day selection
  panel.querySelectorAll('.cal-day.available').forEach(day => {
    day.addEventListener('click', () => {
      const dateStr = day.dataset.date;
      state.selectedDate = dateStr;
      panel.querySelectorAll('.cal-day').forEach(d => d.classList.toggle('selected', d.dataset.date === dateStr));
      updateTimeSlots(panel);
    });
  });

  // Time slot
  panel.querySelectorAll('.time-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      state.selectedTime = slot.dataset.time;
      panel.querySelectorAll('.time-slot').forEach(s => s.classList.toggle('selected', s.dataset.time === slot.dataset.time));
    });
  });

  // Session options
  panel.querySelectorAll('.session-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const idx = parseInt(opt.dataset.idx);
      state.selectedSession = state.selectedCoach.sessions.filter(s => s.type === state.selectedSessionType)[idx];
      panel.querySelectorAll('.session-option').forEach(o => o.classList.toggle('selected', o.dataset.idx === opt.dataset.idx));
    });
  });

  // Continue to confirm
  panel.querySelector('#booking-continue')?.addEventListener('click', () => {
    if (!state.selectedDate) { showToast('Please select a date'); return; }
    if (!state.selectedTime) { showToast('Please select a time slot'); return; }
    if (!state.selectedSession) { showToast('Please select a session type'); return; }
    state.bookingStep = 'confirm';
    renderBooking(panel);
  });

  // Confirm booking
  panel.querySelector('#booking-confirm-btn')?.addEventListener('click', () => {
    state.bookingStep = 'confirmed';
    renderBooking(panel);
  });

  // Start over
  panel.querySelector('#booking-done-btn')?.addEventListener('click', () => {
    state.bookingStep = 'coaches';
    state.selectedCoach = null;
    state.selectedDate = null;
    state.selectedTime = null;
    state.selectedSession = null;
    renderBooking(panel);
  });
}

function bookingDetailsHtml() {
  const coach = state.selectedCoach;
  const sessionTypes = coach.sessionTypes;
  const typeIcons = { 'in-person': '🏌', 'virtual': '💻', 'group': '👥' };
  const sessions = coach.sessions.filter(s => s.type === state.selectedSessionType);
  if (!state.selectedSession && sessions.length) state.selectedSession = sessions[0];

  return `
    <div class="tab-header">
      <h1 class="serif">Book with ${escHtml(coach.name.split(' ')[0])}</h1>
      <div class="subtitle">${escHtml(coach.title.toUpperCase())}</div>
    </div>
    <div class="booking-screen">
      <button class="booking-back">← Back to Coaches</button>

      <div class="booking-section">
        <div class="booking-section-title">Session Type</div>
        <div class="session-type-grid">
          ${sessionTypes.map(type => `
            <button class="session-type-btn${state.selectedSessionType === type ? ' selected' : ''}" data-type="${type}">
              <span class="type-icon">${typeIcons[type]||'📅'}</span>${cap(type)}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="booking-section">
        <div class="booking-section-title">Select a Date</div>
        ${calendarHtml(state.calendarDate)}
      </div>

      <div class="booking-section" id="time-section" style="${state.selectedDate ? '' : 'display:none'}">
        <div class="booking-section-title">Available Times</div>
        <div class="time-slots" id="time-slots-container">
          ${timeSlotsHtml()}
        </div>
      </div>

      <div class="booking-section">
        <div class="booking-section-title">Session Duration & Price</div>
        <div class="session-options" id="session-options">
          ${sessionOptionsHtml(sessions)}
        </div>
      </div>

      <button class="btn btn-accent btn-full btn-lg" id="booking-continue">Continue to Summary →</button>
    </div>`;
}

function calendarHtml(date) {
  const now = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const coach = state.selectedCoach;

  // Get available days for this month/session type
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  let cells = '';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => { cells += `<div class="cal-day-header">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-day"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d);
    const dayName = dayNames[dayDate.getDay()];
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = dayDate < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const slots = coach?.availability?.[dayName] || [];
    const hasSlots = slots.filter(s => s.type !== state.selectedSessionType || true).length > 0;
    const isToday = dayDate.toDateString() === now.toDateString();
    const isSelected = state.selectedDate === dateStr;
    let cls = 'cal-day';
    if (isPast)        cls += ' past';
    else if (!hasSlots) cls += ' unavailable';
    else                cls += ' available';
    if (isToday)       cls += ' today';
    if (isSelected)    cls += ' selected';
    cells += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }

  return `<div class="calendar-wrap">
    <div class="calendar-header">
      <button class="cal-nav-btn cal-prev">‹</button>
      <span class="calendar-month">${monthName}</span>
      <button class="cal-nav-btn cal-next">›</button>
    </div>
    <div class="calendar-grid">${cells}</div>
  </div>`;
}

function timeSlotsHtml() {
  if (!state.selectedDate || !state.selectedCoach) return '';
  const d = new Date(state.selectedDate + 'T00:00:00');
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayName = dayNames[d.getDay()];
  const slots = state.selectedCoach.availability[dayName] || [];
  if (!slots.length) return '<p style="font-size:13px;color:var(--gray-400)">No slots available on this day.</p>';
  return slots.map(t => {
    const [h, m] = t.split(':').map(Number);
    const label = `${h > 12 ? h-12 : h}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
    return `<button class="time-slot${state.selectedTime === t ? ' selected' : ''}" data-time="${t}">${label}</button>`;
  }).join('');
}

function sessionOptionsHtml(sessions) {
  return sessions.map((s, i) => {
    const isSelected = !state.selectedSession ? i === 0 : state.selectedSession?.label === s.label;
    if (i === 0 && !state.selectedSession) state.selectedSession = s;
    return `<div class="session-option${isSelected ? ' selected' : ''}" data-idx="${i}">
      <div class="session-radio"></div>
      <div class="session-option-info">
        <div class="session-option-label">${escHtml(s.label)}</div>
        <div class="session-option-meta">${s.duration} minutes · via ${cap(s.type)}</div>
      </div>
      <div class="session-option-price">$${s.price}</div>
    </div>`;
  }).join('');
}

function updateSessionOptions(panel) {
  const sessions = state.selectedCoach.sessions.filter(s => s.type === state.selectedSessionType);
  state.selectedSession = sessions[0] || null;
  const container = panel.querySelector('#session-options');
  if (container) container.innerHTML = sessionOptionsHtml(sessions);
}

function updateTimeSlots(panel) {
  const section = panel.querySelector('#time-section');
  const container = panel.querySelector('#time-slots-container');
  if (section) section.style.display = 'block';
  if (container) {
    container.innerHTML = timeSlotsHtml();
    container.querySelectorAll('.time-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        state.selectedTime = slot.dataset.time;
        container.querySelectorAll('.time-slot').forEach(s => s.classList.toggle('selected', s.dataset.time === slot.dataset.time));
      });
    });
  }
}

function bookingConfirmHtml() {
  const coach = state.selectedCoach;
  const session = state.selectedSession;
  const dateObj = new Date(state.selectedDate + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const [h, m] = state.selectedTime.split(':').map(Number);
  const timeLabel = `${h > 12 ? h-12 : h}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;

  return `
    <div class="tab-header">
      <h1 class="serif">Confirm Booking</h1>
      <div class="subtitle">REVIEW YOUR SESSION</div>
    </div>
    <div class="booking-screen">
      <button class="booking-back">← Edit Details</button>
      <div class="booking-summary-card">
        <div class="summary-row"><span>Coach</span><span>${escHtml(coach.name)}</span></div>
        <div class="summary-row"><span>Session</span><span>${escHtml(session.label)}</span></div>
        <div class="summary-row"><span>Date</span><span>${dateLabel}</span></div>
        <div class="summary-row"><span>Time</span><span>${timeLabel}</span></div>
        <div class="summary-row"><span>Duration</span><span>${session.duration} minutes</span></div>
        <div class="summary-row"><span>Type</span><span>${cap(session.type)}</span></div>
        <div class="summary-row"><span>Total</span><span class="summary-total serif">$${session.price}</span></div>
      </div>
      <p style="font-size:12px;color:var(--gray-500);text-align:center;margin-bottom:20px;line-height:1.6">
        You'll receive a confirmation email with joining details.<br>
        Calendly scheduling link will be sent on confirmation.
      </p>
      <button class="btn btn-accent btn-full btn-lg" id="booking-confirm-btn">Confirm & Pay $${session.price} →</button>
    </div>`;
}

function bookingConfirmedHtml() {
  const ref = 'CG-' + Math.random().toString(36).slice(2,8).toUpperCase();
  return `
    <div class="tab-header">
      <h1 class="serif">Booking Confirmed</h1>
      <div class="subtitle">YOU'RE ALL SET</div>
    </div>
    <div class="booking-confirmed">
      <div class="confirmed-icon">🎉</div>
      <h2 class="confirmed-title serif">Session Booked!</h2>
      <p class="confirmed-text">
        Your session with ${escHtml(state.selectedCoach?.name)} has been confirmed.<br>
        A confirmation email has been sent with joining details and your Calendly link.
      </p>
      <div class="confirmed-ref">
        Booking Reference
        <strong>${ref}</strong>
      </div>
      <button class="btn btn-primary btn-full" id="booking-done-btn">Back to Coaches</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// 9. VIDEO LESSONS TAB
// ─────────────────────────────────────────────────────────────
const TOPICS = ['all','driving','putting','chipping','bunker','irons','strategy','mental','advanced','fitness','fundamentals'];

function renderLessons(panel = document.getElementById('tab-lessons')) {
  if (!panel.dataset.rendered) {
    panel.dataset.rendered = '1';
    panel.innerHTML = `
      <div class="tab-header">
        <h1 class="serif">Video Lessons</h1>
        <div class="subtitle">EXPERT COACHING LIBRARY</div>
      </div>
      <div class="topic-tabs" id="topic-tabs">
        ${TOPICS.map(t => `<button class="topic-tab${state.activeTopic === t ? ' active' : ''}" data-topic="${t}">${t === 'all' ? '✦ All' : cap(t)}</button>`).join('')}
      </div>
      ${!state.subscribed ? `<div class="sub-prompt">
        <h3 class="serif">Unlock the Full Library</h3>
        <p>Get unlimited access to all 10 courses — over 12 hours of expert coaching.</p>
        <div class="sub-prompt-price">$29.99</div>
        <div class="sub-prompt-period">per month · cancel anytime</div>
        <button class="btn btn-accent btn-full" id="sub-cta-btn">Start Free 7-Day Trial</button>
      </div>` : ''}
      <div class="courses-grid" id="courses-grid"></div>
      <div class="modal-overlay video-player-modal" id="video-modal">
        <div class="modal-sheet" id="video-sheet"></div>
      </div>
    `;
    panel.querySelector('#topic-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-topic]');
      if (!btn) return;
      state.activeTopic = btn.dataset.topic;
      panel.querySelectorAll('.topic-tab').forEach(t => t.classList.toggle('active', t.dataset.topic === btn.dataset.topic));
      filterCourses();
    });
    panel.querySelector('#video-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeVideoModal();
    });
    panel.querySelector('#sub-cta-btn')?.addEventListener('click', () => {
      showToast('Teachable integration coming soon — subscription placeholder ✓');
    });
  }
  filterCourses();
}

function filterCourses() {
  const grid = document.getElementById('courses-grid');
  if (!grid) return;
  const topic = state.activeTopic;
  const filtered = state.courses.filter(c => topic === 'all' || c.topic === topic);
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎬</div><h3>No courses in this topic</h3>
      <p>Check back soon for new content.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(c => courseCardHtml(c)).join('');
  grid.querySelectorAll('.course-card').forEach(card => {
    card.addEventListener('click', () => openVideoDetail(card.dataset.courseId));
  });
}

function courseCardHtml(c) {
  const progress = state.videoProgress[c.id] || 0;
  return `<div class="course-card" data-course-id="${c.id}">
    <div class="course-thumb-wrap">
      <img class="course-thumb" src="${c.thumbnail}" alt="${escHtml(c.title)}" loading="lazy">
      ${c.locked && !state.subscribed
        ? `<div class="course-locked-overlay">🔒</div>`
        : `<div class="course-play-btn">▶</div>`}
    </div>
    <div class="course-info">
      <div class="course-topic-tag">${cap(c.topic)}</div>
      <div class="course-title">${escHtml(c.title)}</div>
      <div class="course-instructor">by ${escHtml(c.instructor)}</div>
      <div class="course-meta">
        <span class="course-meta-item">📚 ${c.lessons} lessons</span>
        <span class="course-meta-item">⏱ ${c.duration}</span>
        <span class="course-meta-item">👤 ${c.level}</span>
        ${c.locked && !state.subscribed
          ? `<span class="course-price-tag">$${c.price}</span>`
          : `<span class="course-free-tag">✓ Unlocked</span>`}
      </div>
      ${progress > 0 ? `<div class="progress-bar-wrap" style="margin-top:8px"><div class="progress-bar" style="width:${progress}%"></div></div>` : ''}
    </div>
  </div>`;
}

function openVideoDetail(id) {
  const course = state.courses.find(c => c.id === id);
  if (!course) return;
  state.selectedCourse = course;
  const modal = document.getElementById('video-modal');
  const sheet = document.getElementById('video-sheet');
  sheet.innerHTML = videoDetailHtml(course);
  modal.classList.add('show');
  sheet.querySelector('.modal-close').addEventListener('click', closeVideoModal);
  // Subscribe CTA
  sheet.querySelector('.sub-modal-btn')?.addEventListener('click', () => {
    showToast('Teachable integration — subscription placeholder ✓');
    closeVideoModal();
  });
  // Lessons
  sheet.querySelectorAll('.lesson-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      const isLocked = course.locked && !state.subscribed && !course.modules[idx]?.free;
      if (isLocked) {
        showToast('Subscribe to unlock this lesson 🔒');
        return;
      }
      // Simulate progress
      const newProgress = Math.min((state.videoProgress[course.id] || 0) + Math.round(100 / course.lessons), 100);
      state.videoProgress[course.id] = newProgress;
      saveVideoProgress();
      showToast(`Playing: ${course.modules[idx]?.title || 'Lesson'} ▶`);
    });
  });
}

function videoDetailHtml(course) {
  const isLocked = course.locked && !state.subscribed;
  const progress = state.videoProgress[course.id] || 0;
  const stars = '★'.repeat(Math.round(course.rating)) + '☆'.repeat(5 - Math.round(course.rating));
  return `
    <div class="modal-handle"></div>
    <button class="modal-close" style="position:absolute;top:12px;right:12px;z-index:1">✕</button>
    <div class="video-wrap">
      ${!isLocked
        ? `<video controls preload="none" poster="${course.thumbnail}" style="width:100%;height:100%">
            <source src="${course.preview}" type="video/mp4">
           </video>`
        : `<img src="${course.thumbnail}" alt="" style="width:100%;height:100%;object-fit:cover;opacity:0.4">
           <div class="video-placeholder">
             <div class="video-placeholder-icon">🔒</div>
             <span>Subscribe to unlock</span>
           </div>`}
    </div>
    <div style="padding:16px var(--content-pad)">
      <div class="course-topic-tag">${cap(course.topic)}</div>
      <h2 class="serif" style="font-size:18px;margin:4px 0 8px;line-height:1.3">${escHtml(course.title)}</h2>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;font-size:12px;color:var(--gray-500)">
        <span><span class="stars">${stars}</span> ${course.rating}</span>
        <span>·</span><span>${course.students.toLocaleString()} students</span>
        <span>·</span><span>${course.level}</span>
      </div>
      ${progress > 0 ? `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:4px">
            <span>Your progress</span><span>${progress}%</span>
          </div>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
        </div>` : ''}
      <p style="font-size:13px;color:var(--gray-500);line-height:1.6;margin-bottom:16px">${escHtml(course.description)}</p>
      ${isLocked ? `
        <div class="sub-prompt" style="margin:0 0 16px">
          <h3 class="serif">Unlock This Course</h3>
          <p>Get full access with a Clubhouse Golf subscription.</p>
          <div class="sub-prompt-price">$29.99<span style="font-size:14px;color:rgba(255,255,255,.6)">/mo</span></div>
          <button class="btn btn-accent btn-full sub-modal-btn">Start Free Trial →</button>
        </div>` : ''}
      <h4 style="font-size:13px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">
        ${course.modules.length} Lessons · ${course.duration}
      </h4>
      <div class="lesson-list">
        ${(course.modules || []).map((mod, i) => {
          const locked = isLocked && !mod.free;
          return `<div class="lesson-item">
            <div class="lesson-num ${mod.free ? 'free' : locked ? 'locked' : ''}">${locked ? '🔒' : i + 1}</div>
            <div class="lesson-info">
              <div class="lesson-title">${escHtml(mod.title)}</div>
              <div class="lesson-dur">${mod.duration}${mod.free ? ' · <span style="color:var(--green-600)">Free preview</span>' : ''}</div>
            </div>
            ${!locked ? '<span style="color:var(--green-600);font-size:18px">▶</span>' : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function closeVideoModal() {
  document.getElementById('video-modal')?.classList.remove('show');
}

// ─────────────────────────────────────────────────────────────
// 10. SWING ANALYSIS TAB
// ─────────────────────────────────────────────────────────────
function renderSwing(panel = document.getElementById('tab-swing')) {
  if (panel.dataset.rendered) {
    renderSubmissionList();
    return;
  }
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <div class="swing-header">
      <h1 class="serif">Swing Analysis</h1>
      <p>Upload your swing video and get expert frame-by-frame feedback from our coaches.</p>
    </div>

    <div class="upload-card">
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">🎥</div>
        <div class="upload-title">Upload Your Swing</div>
        <div class="upload-desc">Record or select a video from your camera roll.<br>Face-on or down-the-line views are best.</div>
        <button class="btn btn-primary" id="upload-btn">📱 Select Video</button>
        <input type="file" id="video-file-input" accept="video/*" capture="camera" style="display:none">
        <div class="upload-limit">Max 500 MB · MP4, MOV, AVI · 10–120 seconds recommended</div>
      </div>
      <div class="upload-progress" id="upload-progress">
        <div class="upload-file-info">
          <div class="upload-file-icon">🎬</div>
          <div>
            <div class="upload-file-name" id="upload-file-name">swing_video.mp4</div>
            <div class="upload-file-size" id="upload-file-size">0 MB</div>
          </div>
        </div>
        <div class="upload-bar-wrap"><div class="upload-bar" id="upload-bar"></div></div>
        <div class="upload-status" id="upload-status">Uploading… 0%</div>
      </div>
      <div class="upload-form">
        <div class="form-group">
          <label class="form-label" for="upload-club">Club Used</label>
          <select class="form-select" id="upload-club">
            ${['Driver','3-Wood','5-Wood','3-Hybrid','4-Iron','5-Iron','6-Iron','7-Iron','8-Iron','9-Iron','PW','50° Wedge','52° Wedge','56° Wedge','60° Wedge','Putter']
              .map(c => `<option${c === state.uploadClub ? ' selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="upload-notes">Notes for Coach (optional)</label>
          <textarea class="form-textarea" id="upload-notes" placeholder="Describe what you'd like coaching on, e.g. 'I have a big slice with my driver' or 'I keep chunking my irons'…">${escHtml(state.uploadNotes)}</textarea>
        </div>
        <button class="btn btn-accent btn-full" id="submit-swing-btn" disabled>Submit for Analysis →</button>
        <p style="text-align:center;font-size:11px;color:var(--gray-400);margin-top:8px">
          Typical response within 24–48 hours · CoachNow integration hook
        </p>
      </div>
    </div>

    <div class="submissions-section">
      <div class="submissions-title">Your Submissions</div>
      <div id="submissions-list"></div>
    </div>

    <div class="modal-overlay" id="submission-modal">
      <div class="modal-sheet" id="submission-sheet"></div>
    </div>
  `;

  // File input wiring
  const zone = panel.querySelector('#upload-zone');
  const fileInput = panel.querySelector('#video-file-input');
  const uploadBtn = panel.querySelector('#upload-btn');
  const submitBtn = panel.querySelector('#submit-swing-btn');

  uploadBtn.addEventListener('click', () => fileInput.click());
  zone.addEventListener('click', e => { if (!e.target.closest('button')) fileInput.click(); });

  // Drag-and-drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file, panel);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelect(fileInput.files[0], panel);
  });

  panel.querySelector('#upload-club').addEventListener('change', e => { state.uploadClub = e.target.value; });
  panel.querySelector('#upload-notes').addEventListener('input', e => { state.uploadNotes = e.target.value; });

  submitBtn.addEventListener('click', () => {
    showToast('Swing submitted for analysis ✅ You\'ll hear back in 24–48 hours');
    panel.querySelector('#upload-zone').style.display = 'block';
    panel.querySelector('#upload-progress').classList.remove('show');
    submitBtn.disabled = true;
    state.uploadFile = null;
  });

  panel.querySelector('#submission-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSubmissionModal();
  });

  renderSubmissionList();
}

function handleFileSelect(file, panel) {
  if (!file.type.startsWith('video/')) { showToast('Please select a video file 🎬'); return; }
  if (file.size > 500 * 1024 * 1024) { showToast('File too large — max 500 MB'); return; }
  state.uploadFile = file;
  const zone = panel.querySelector('#upload-zone');
  const progress = panel.querySelector('#upload-progress');
  const bar = panel.querySelector('#upload-bar');
  const status = panel.querySelector('#upload-status');
  const submitBtn = panel.querySelector('#submit-swing-btn');

  zone.style.display = 'none';
  progress.classList.add('show');
  panel.querySelector('#upload-file-name').textContent = file.name;
  panel.querySelector('#upload-file-size').textContent = (file.size / (1024*1024)).toFixed(1) + ' MB';

  // Simulate upload progress
  let pct = 0;
  const tick = setInterval(() => {
    pct += Math.random() * 12 + 5;
    if (pct >= 100) {
      pct = 100;
      clearInterval(tick);
      status.textContent = 'Upload complete ✓';
      submitBtn.disabled = false;
    } else {
      status.textContent = `Uploading… ${Math.round(pct)}%`;
    }
    bar.style.width = Math.min(pct, 100) + '%';
  }, 300);
}

function renderSubmissionList() {
  const list = document.getElementById('submissions-list');
  if (!list) return;
  if (!state.submissions.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📹</div><h3>No submissions yet</h3>
      <p>Upload your first swing video above to get started.</p></div>`;
    return;
  }
  list.innerHTML = state.submissions.map(s => submissionCardHtml(s)).join('');
  list.querySelectorAll('.submission-card').forEach(card => {
    card.addEventListener('click', () => openSubmission(card.dataset.subId));
  });
}

function submissionCardHtml(s) {
  const date = new Date(s.submittedAt);
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `<div class="submission-card" data-sub-id="${s.id}">
    <div class="sub-card-inner">
      <div class="sub-thumb">
        <img src="${s.thumbnailUrl}" alt="">
        <div class="sub-thumb-overlay">▶</div>
      </div>
      <div class="sub-info">
        <div class="sub-title">${escHtml(s.title)}</div>
        <div class="sub-date">${dateLabel} · ${escHtml(s.club)}</div>
        <span class="sub-status ${s.status}">
          ${s.status === 'pending' ? '⏳ Awaiting Review' : '✅ Feedback Ready'}
        </span>
      </div>
    </div>
  </div>`;
}

function openSubmission(id) {
  const sub = state.submissions.find(s => s.id === id);
  if (!sub) return;
  state.selectedSubmission = sub;
  const modal = document.getElementById('submission-modal');
  const sheet = document.getElementById('submission-sheet');
  sheet.innerHTML = submissionDetailHtml(sub);
  modal.classList.add('show');
  sheet.querySelector('.modal-close').addEventListener('click', closeSubmissionModal);
}

function submissionDetailHtml(sub) {
  const date = new Date(sub.submittedAt);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const hasFeedback = sub.status === 'reviewed' && sub.feedback;
  return `
    <div class="modal-handle"></div>
    <button class="modal-close" style="position:absolute;top:12px;right:12px;z-index:1">✕</button>
    <div class="video-wrap">
      <video controls preload="none" poster="${sub.thumbnailUrl}" style="width:100%;height:100%">
        <source src="${sub.videoUrl}" type="video/mp4">
      </video>
    </div>
    <div style="padding:16px var(--content-pad)">
      <span class="sub-status ${sub.status}" style="display:inline-flex;margin-bottom:10px">
        ${sub.status === 'pending' ? '⏳ Awaiting Review' : '✅ Feedback Ready'}
      </span>
      <h2 class="serif" style="font-size:18px;margin-bottom:4px">${escHtml(sub.title)}</h2>
      <p style="font-size:12px;color:var(--gray-500);margin-bottom:12px">${dateLabel} · ${escHtml(sub.club)}</p>
      ${sub.notes ? `<div style="background:var(--gray-100);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--gray-600);margin-bottom:16px;line-height:1.5"><strong>Your notes:</strong> ${escHtml(sub.notes)}</div>` : ''}
      ${!hasFeedback ? `
        <div style="text-align:center;padding:32px 16px;color:var(--gray-400)">
          <div style="font-size:48px;margin-bottom:12px">⏳</div>
          <h3 style="color:var(--gray-500);margin-bottom:8px">Review in Progress</h3>
          <p style="font-size:13px">Your coach typically responds within ${sub.turnaround}.</p>
        </div>` : `
        <div class="feedback-section" style="padding:0">
          <h4 style="font-size:13px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Coach Feedback</h4>
          <div class="coach-feedback-header">
            <img class="coach-feedback-photo" src="${sub.coach.photo}" alt="${escHtml(sub.coach.name)}">
            <div>
              <div class="coach-feedback-name">${escHtml(sub.coach.name)}</div>
              <div class="coach-feedback-time">${new Date(sub.feedback.receivedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
            </div>
          </div>
          ${sub.annotations?.length ? `
            <h4 style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Frame-by-Frame Notes</h4>
            <div class="annotations-list">
              ${sub.annotations.map(a => `
                <div class="annotation-item ${a.type}">
                  <span class="annotation-time">${a.time.toFixed(1)}s</span>
                  <span>${escHtml(a.text)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="feedback-text">${formatFeedback(sub.feedback.text)}</div>
          ${sub.feedback.videoUrl ? `
            <h4 style="font-size:13px;font-weight:700;margin-bottom:8px">Coach's Video Response</h4>
            <div class="video-wrap" style="border-radius:var(--radius-md);overflow:hidden">
              <video controls preload="none" style="width:100%;height:100%">
                <source src="${sub.feedback.videoUrl}" type="video/mp4">
              </video>
            </div>
          ` : ''}
        </div>
      `}
    </div>`;
}

function formatFeedback(text) {
  // Convert markdown-like bold to HTML
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function closeSubmissionModal() {
  document.getElementById('submission-modal')?.classList.remove('show');
}

// ─────────────────────────────────────────────────────────────
// 11. AI GOLF ASSISTANT CHAT
// ─────────────────────────────────────────────────────────────
function setupChat() {
  const fab = document.getElementById('chat-fab');
  const modal = document.getElementById('chat-modal');

  fab.addEventListener('click', openChat);
  modal.querySelector('.chat-close').addEventListener('click', closeChat);
  modal.querySelector('.chat-settings-btn').addEventListener('click', openSettings);

  const textarea = modal.querySelector('.chat-input');
  const sendBtn = modal.querySelector('.chat-send');

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    sendBtn.disabled = !textarea.value.trim() || state.chatLoading;
  });
  sendBtn.addEventListener('click', sendMessage);

  // Suggestion chips
  modal.addEventListener('click', e => {
    const chip = e.target.closest('.suggestion-chip');
    if (chip) {
      textarea.value = chip.dataset.prompt;
      textarea.dispatchEvent(new Event('input'));
      sendMessage();
    }
  });

  renderChatMessages();
}

function openChat() {
  const modal = document.getElementById('chat-modal');
  modal.classList.add('open');
  state.chatOpen = true;
  syncFab();
  setTimeout(() => modal.querySelector('.chat-input')?.focus(), 300);
}

function closeChat() {
  const modal = document.getElementById('chat-modal');
  modal.classList.remove('open');
  state.chatOpen = false;
  syncFab();
}

// Single source of truth for FAB visibility: hidden while the chat is open,
// and hidden on the Caddy tab, which has its own Ask button.
function syncFab(tab = state.activeTab) {
  const fab = document.getElementById('chat-fab');
  if (!fab) return;
  fab.classList.toggle('hidden', state.chatOpen || tab === 'caddy');
}

function renderChatMessages() {
  const container = document.querySelector('.chat-messages');
  if (!container) return;

  if (state.chatMessages.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-logo">⛳</div>
        <div class="chat-empty-title">Caddy AI</div>
        <div class="chat-empty-text">Your personal golf assistant. Ask about club selection, swing tips, course strategy, or practice plans.</div>
        <div class="chat-empty-note">Beta — runs on your own Anthropic API key. Tap ⚙️ to add one.</div>
        <div class="chat-suggestions">
          ${['What driver should I buy for a 15 handicap?',
             'Why do I slice the ball with my driver?',
             'How do I improve my putting stroke?',
             'What wedges does a beginner need?']
            .map(q => `<button class="suggestion-chip" data-prompt="${escHtml(q)}">${q}</button>`)
            .join('')}
        </div>
      </div>`;
    return;
  }

  container.innerHTML = state.chatMessages.map(msg => {
    if (msg.role === 'user') {
      return `<div class="chat-bubble user">${escHtml(msg.content)}</div>`;
    }
    if (msg.role === 'error') {
      return `<div class="chat-error">⚠️ ${escHtml(msg.content)}</div>`;
    }
    return `<div class="chat-bubble assistant">${formatChatResponse(msg.content)}</div>`;
  }).join('');

  // Typing indicator
  if (state.chatLoading) {
    container.insertAdjacentHTML('beforeend', `
      <div class="chat-bubble typing">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`);
  }

  container.scrollTop = container.scrollHeight;
}

function formatChatResponse(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^•\s(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul style="margin:6px 0;padding-left:16px">$&</ul>')
    .replace(/\n\n/g, '</p><p style="margin-top:8px">')
    .replace(/\n/g, '<br>');
}

async function sendMessage() {
  const textarea = document.querySelector('.chat-input');
  const text = textarea?.value.trim();
  if (!text || state.chatLoading) return;

  // Check API key
  if (!state.apiKey) {
    openSettings();
    showToast('Enter your Anthropic API key to use the AI assistant');
    return;
  }

  textarea.value = '';
  textarea.style.height = 'auto';
  document.querySelector('.chat-send').disabled = true;

  // Add user message
  state.chatMessages.push({ role: 'user', content: text });
  state.chatLoading = true;
  renderChatMessages();

  // Build message history (last 10 messages for context)
  const messages = state.chatMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));

  try {
    const response = await fetchClaudeWithRetry({
      model: state.selectedModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content?.[0]?.text || 'No response received.';
    state.chatMessages.push({ role: 'assistant', content: reply });
  } catch (err) {
    console.error('[GV Chat]', err);
    state.chatMessages.push({ role: 'error', content: err.message || 'Request failed. Please check your API key and try again.' });
  } finally {
    state.chatLoading = false;
    renderChatMessages();
    document.querySelector('.chat-send').disabled = false;
  }
}

async function fetchClaudeWithRetry(body, attempt = 0) {
  const maxAttempts = 3;
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && attempt < maxAttempts) {
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, attempt) * 1000;
    await sleep(delay);
    return fetchClaudeWithRetry(body, attempt + 1);
  }

  if (!res.ok) {
    let errMsg = `API error ${res.status}`;
    try {
      const errBody = await res.json();
      errMsg = errBody.error?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────
// 11b. CUSTOMER PROFILE TAB
// ─────────────────────────────────────────────────────────────
function renderProfile() {
  const panel = document.getElementById('tab-profile');
  panel.dataset.rendered = '1';
  const p = state.profile;

  if (!p) {
    panel.innerHTML = `
      <div class="tab-header"><h1 class="serif">My Profile</h1><div class="subtitle">ACCOUNT</div></div>
      <div class="empty-state"><div class="empty-icon">👤</div><h3>Profile unavailable</h3>
      <p>We couldn't load your account details. Please try again.</p></div>`;
    return;
  }

  // Parse an ISO yyyy-mm-dd as a LOCAL date (avoids UTC off-by-one).
  const localDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const initials = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const memberSince = localDate(p.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const L = p.loyalty;
  const pct = Math.max(0, Math.min(100, Math.round(((L.points - L.tierFloor) / (L.tierCeiling - L.tierFloor)) * 100)));

  const brandGlyph = b => ({ visa: '💳', mastercard: '💳', amex: '💳' }[b.toLowerCase()] || '💳');

  const ordersHtml = p.orders.map(o => `
    <div class="profile-order">
      <div class="profile-order-top">
        <div>
          <div class="profile-order-id">${escHtml(o.id)}</div>
          <div class="profile-order-date">${localDate(o.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        <span class="order-status order-status-${o.status.toLowerCase()}">${escHtml(o.status)}</span>
      </div>
      <div class="profile-order-items">
        ${o.items.map(i => `<div class="profile-order-item"><span>${i.qty}× ${escHtml(i.name)}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}
      </div>
      <div class="profile-order-total"><span>Total</span><span class="serif">$${o.total.toFixed(2)}</span></div>
    </div>`).join('');

  const paymentsHtml = p.paymentMethods.map(m => `
    <div class="profile-card-row">
      <span class="profile-card-glyph">${brandGlyph(m.brand)}</span>
      <div class="profile-card-main">
        <div class="profile-card-title">${escHtml(m.brand)} •••• ${escHtml(m.last4)}${m.default ? ' <span class="profile-default">Default</span>' : ''}</div>
        <div class="profile-card-sub">Expires ${escHtml(m.expiry)}</div>
      </div>
    </div>`).join('');

  const addressesHtml = p.addresses.map(a => `
    <div class="profile-card-row">
      <span class="profile-card-glyph">${a.label === 'Work' ? '🏢' : '🏠'}</span>
      <div class="profile-card-main">
        <div class="profile-card-title">${escHtml(a.label)}${a.default ? ' <span class="profile-default">Default</span>' : ''}</div>
        <div class="profile-card-sub">
          ${escHtml(a.recipient)}<br>
          ${escHtml(a.line1)}${a.line2 ? ', ' + escHtml(a.line2) : ''}<br>
          ${escHtml(a.city)}, ${escHtml(a.state)} ${escHtml(a.zip)} · ${escHtml(a.country)}
        </div>
      </div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="tab-header"><h1 class="serif">My Profile</h1><div class="subtitle">ACCOUNT</div></div>

    <div class="profile-identity">
      <div class="profile-avatar">${escHtml(initials)}</div>
      <div class="profile-identity-info">
        <div class="profile-name">${escHtml(p.name)}</div>
        <div class="profile-email">${escHtml(p.email)}</div>
        <div class="profile-member">Member since ${memberSince}</div>
      </div>
      <span class="profile-tier-chip">${escHtml(L.tier)}</span>
    </div>

    <div class="loyalty-card">
      <div class="loyalty-top">
        <div>
          <div class="loyalty-label">Loyalty Points</div>
          <div class="loyalty-points">${L.points.toLocaleString()}</div>
        </div>
        <div class="loyalty-tier">⛳ ${escHtml(L.tier)} Tier</div>
      </div>
      <div class="loyalty-bar-wrap"><div class="loyalty-bar" style="width:${pct}%"></div></div>
      <div class="loyalty-next">${L.pointsToNext.toLocaleString()} points to <strong>${escHtml(L.nextTier)}</strong></div>
    </div>

    <div class="profile-section">
      <div class="profile-section-head"><h2>Previous Orders</h2><span class="profile-count">${p.orders.length}</span></div>
      ${ordersHtml}
    </div>

    <div class="profile-section">
      <div class="profile-section-head"><h2>Payment Methods</h2>
        <button class="profile-add-btn" data-add="payment">+ Add</button></div>
      ${paymentsHtml}
    </div>

    <div class="profile-section">
      <div class="profile-section-head"><h2>Address Details</h2>
        <button class="profile-add-btn" data-add="address">+ Add</button></div>
      ${addressesHtml}
    </div>

    <button class="btn btn-ghost btn-full" id="profile-signout" style="margin:8px 0 24px">Sign Out</button>
  `;

  panel.querySelectorAll('[data-add]').forEach(b =>
    b.addEventListener('click', () => showToast('Account management coming soon ✓')));
  panel.querySelector('#profile-signout')
    .addEventListener('click', () => showToast('Sign out coming soon ✓'));
}

// ─────────────────────────────────────────────────────────────
// 12. PROJECT DOCS TAB
// ─────────────────────────────────────────────────────────────
function renderDocs() {
  const panel = document.getElementById('tab-docs');
  if (panel.dataset.rendered) return;
  panel.dataset.rendered = '1';

  const docs = [
    {
      href: 'clubhouse-golf-order-processing-workflow.html',
      icon: '📦',
      title: 'Order Processing Workflow',
      desc: 'End-to-end fulfillment flow — from cart checkout through warehouse pick/pack to last-mile delivery and returns.',
      tag: 'Operations',
    },
    {
      href: 'clubhouse-golf-custom-vs-shopify-comparison.html',
      icon: '⚖️',
      title: 'Custom vs Shopify',
      desc: 'Side-by-side platform comparison covering cost, flexibility, time-to-market, and long-term scalability.',
      tag: 'Strategy',
    },
  ];

  panel.innerHTML = `
    <div class="tab-header">
      <h1 class="serif">Project Docs</h1>
      <div class="subtitle">INTERNAL REFERENCE</div>
    </div>
    <div class="docs-tab-list">
      ${docs.map(d => `
        <a class="doc-card" href="${d.href}">
          <div class="doc-card-icon">${d.icon}</div>
          <div class="doc-card-body">
            <div class="doc-card-tag">${d.tag}</div>
            <div class="doc-card-title">${d.title}</div>
            <div class="doc-card-desc">${d.desc}</div>
          </div>
          <div class="doc-card-arrow">→</div>
        </a>
      `).join('')}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// 11c. CADDY AI TAB — the chat itself stays in #chat-modal; this is its home
//      screen. The brand treats Caddy AI as a headline pillar, not a FAB.
// ─────────────────────────────────────────────────────────────
const CADDY_CAPABILITIES = [
  { label: 'Virtual Caddie',        status: 'beta' },
  { label: 'Club Recommendations',  status: 'beta' },
  { label: 'Course Strategy',       status: 'beta' },
  { label: 'Practice Plans',        status: 'beta' },
  { label: 'Swing Analysis',        status: 'coming' },
];

function renderCaddy() {
  const panel = document.getElementById('tab-caddy');
  const hasKey = !!state.apiKey;

  panel.innerHTML = `
    <div class="tab-header">
      <h1>Caddy AI</h1>
      <div class="subtitle">YOUR PERSONAL GOLF ASSISTANT</div>
    </div>

    <div class="caddy-wrap">
      <div class="story-block story-block-feature">
        <div class="story-eyebrow">Open Beta</div>
        <p class="story-lead">Ask anything about your game.</p>
        <p>Club selection, course strategy, practice plans and the rules — answered in plain language.</p>
        <button class="btn btn-accent btn-full btn-lg" id="caddy-ask">Ask Caddy →</button>
      </div>

      <button class="caddy-key ${hasKey ? 'set' : 'unset'}" id="caddy-key" type="button">
        ${hasKey
          ? `<span>✅ Connected · ${escHtml(currentModelLabel())}</span><span class="caddy-key-action">Change</span>`
          : `<span>⚪ Bring your own Anthropic API key</span><span class="caddy-key-action">Add key</span>`}
      </button>

      <div class="caddy-caps">
        ${CADDY_CAPABILITIES.map(c => `
          <div class="caddy-cap">
            <span>${escHtml(c.label)}</span>
            ${statusBadge(c.status)}
          </div>`).join('')}
      </div>

      <p class="caddy-note">
        Caddy AI runs on your own Anthropic API key and is billed to your account.
        It is a general golf advisor — it cannot see your bag, your rounds or your swing,
        so tell it what it needs to know.
      </p>
    </div>
  `;

  panel.querySelector('#caddy-ask').addEventListener('click', openChat);
  panel.querySelector('#caddy-key').addEventListener('click', openSettings);
}

function currentModelLabel() {
  const m = MODELS.find(x => x.id === state.selectedModel);
  return m ? m.label.replace(/\s*\(.*\)$/, '') : state.selectedModel;
}

// ─────────────────────────────────────────────────────────────
// 11d. VISION TAB — the brand's eight pillars, the roadmap, and the one CTA.
//      Copy is taken verbatim from chgolfco.com.
// ─────────────────────────────────────────────────────────────
const PILLARS = [
  { id: 'marketplace', icon: '🛒', title: 'Marketplace', tagline: 'Everything you can buy or sell.', status: 'coming',
    features: ['Equipment Marketplace', 'Brand Marketplace', 'Buy / Sell Used Clubs', 'Try Before You Buy',
               'Equipment Trade-In', 'Apparel & Accessories', 'Simulators', 'Health & Wellness', 'Practice & Training Aids'] },
  { id: 'caddy', icon: '🤖', title: 'Caddy AI', tagline: 'Your personal golf assistant.', status: 'beta', goto: 'caddy',
    features: ['Virtual Caddie', 'Swing Analysis', 'Club Recommendations', 'Practice Plans', 'Course Strategy'] },
  { id: 'performance', icon: '🏌', title: 'Performance', tagline: 'Track, improve, and compete.', status: 'beta', goto: 'performance',
    features: ['Shot Tracking', 'Handicap Dashboard', 'Performance Analytics', 'Virtual Coaching'] },
  { id: 'competition', icon: '🏆', title: 'Competition', tagline: 'Everything around playing.', status: 'coming',
    features: ['Tournament Platform', 'League Management', 'Challenges', 'Leaderboards', 'Fantasy Golf'] },
  { id: 'experiences', icon: '✈️', title: 'Experiences', tagline: 'Golf beyond the course.', status: 'coming',
    features: ['Golf Trips', 'Tee Time Deals', 'Course Partnerships', 'Club Fitting Network', 'Local Events'] },
  { id: 'community', icon: '👥', title: 'Community', tagline: 'Where golfers connect.', status: 'coming',
    features: ['Member Groups', 'Playing Partner Finder', 'Junior Golf', 'Forums'] },
  { id: 'technology', icon: '📡', title: 'Technology', tagline: 'Connect your golf life.', status: 'coming',
    features: ['Mobile App', 'Simulator Integration', 'Wearables', 'GPS Features', 'Smart Notifications'] },
  { id: 'memberships', icon: '⭐', title: 'Memberships', tagline: 'Exclusive perks. Real value.', status: 'coming',
    features: ['Early Access', 'Rewards', 'Loyalty & XP', 'Discounts', 'Giveaways', 'Subscription Boxes'] },
];

// Status markers rather than dates — the site's "Summer 2026" framing has
// already passed, and shipping stale dates would be its own kind of dishonest.
const ROADMAP = [
  { label: 'Founding Members',      detail: 'Join now',                              state: 'now' },
  { label: 'Brand Reveal',          detail: 'Announcement + full brand unveiled',    state: 'next' },
  { label: 'First Apparel Drop',    detail: 'Limited drop for Founding Members',     state: 'next' },
  { label: 'Community Launch',      detail: 'Discord + member community goes live',  state: 'next' },
  { label: 'Beta AI Tools',         detail: 'Early access to Caddy AI + more',       state: 'next' },
  { label: 'Clubhouse Experiences', detail: 'Tournaments, trips + real-world events', state: 'next' },
];

const JOIN_URL = 'https://chgolfco.com/?utm_source=pwa&utm_medium=app&utm_campaign=founding';

function renderVision() {
  const panel = document.getElementById('tab-vision');
  if (panel.dataset.rendered) return;
  panel.dataset.rendered = '1';

  panel.innerHTML = `
    <div class="tab-header">
      <h1>Vision</h1>
      <div class="subtitle">MODERN GOLF. MADE SIMPLE.</div>
    </div>

    <section class="brand-story">
      <article class="story-block">
        <div class="story-eyebrow">Why Clubhouse Exists</div>
        <p class="story-lead">Golf has evolved. The experience hasn't.</p>
        <p>We're building a modern golf brand centered around community, technology, experiences, and products people actually want.</p>
        <p class="story-kicker">This is just the beginning.</p>
      </article>

      <article class="story-block">
        <div class="story-eyebrow">The Clubhouse</div>
        <p class="story-lead">Golf is better together.</p>
        <p>We're building a nationwide network of golf courses, teaching professionals, brands, creators, influencers, tournament hosts, and business partners — all working together to grow the game.</p>
      </article>
    </section>

    <div class="section-header"><h2>What's Coming</h2></div>
    <div class="docs-tab-list">
      ${PILLARS.map(pillarCardHtml).join('')}
    </div>

    <div class="section-header"><h2>The Road Ahead</h2></div>
    <ol class="roadmap">
      ${ROADMAP.map(r => `
        <li class="roadmap-item roadmap-${r.state}">
          <div class="roadmap-label">${escHtml(r.label)}</div>
          <div class="roadmap-detail">${escHtml(r.detail)}</div>
        </li>`).join('')}
    </ol>

    <section class="brand-story">
      <article class="story-block story-block-feature">
        <div class="story-eyebrow">Become a Founding Member</div>
        <p class="story-lead">Be part of what's next.</p>
        <p>Founding Members are the first 500 golfers invited to join Clubhouse Golf. You'll get early access during the beta, help test new features, and shape the platform before it opens to the public.</p>
        <p class="story-kicker">Spots are limited.</p>
        <a class="btn btn-accent btn-full btn-lg" id="join-cta" href="${JOIN_URL}" target="_blank" rel="noopener">JOIN NOW →</a>
        <a class="join-secondary" href="${JOIN_URL}" target="_blank" rel="noopener">Become a Partner →</a>
      </article>
    </section>
  `;

  panel.querySelector('.docs-tab-list').addEventListener('click', e => {
    const card = e.target.closest('[data-goto]');
    if (card) activateTab(card.dataset.goto);
  });

  // The app cannot know whether the signup completed on the site, so this only
  // ever records that the user left to try — never that they are a member.
  panel.querySelector('#join-cta').addEventListener('click', () => {
    try { localStorage.setItem('gv_join_clicked', '1'); } catch (_) {}
  });
}

function pillarCardHtml(p) {
  const live = !!p.goto;
  return `
    <${live ? 'button' : 'div'} class="doc-card pillar-card${live ? '' : ' pillar-card-static'}"${live ? ` data-goto="${p.goto}" type="button"` : ''}>
      <div class="doc-card-icon">${p.icon}</div>
      <div class="doc-card-body">
        <div class="doc-card-tag">${statusBadge(p.status)}</div>
        <div class="doc-card-title">${escHtml(p.title)}</div>
        <div class="doc-card-desc">${escHtml(p.tagline)}</div>
        <ul class="story-list">${p.features.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
      </div>
      ${live ? '<div class="doc-card-arrow">→</div>' : ''}
    </${live ? 'button' : 'div'}>`;
}

// ─────────────────────────────────────────────────────────────
// 13. SETTINGS
// ─────────────────────────────────────────────────────────────
function setupSettings() {
  const modal = document.getElementById('settings-modal');
  modal.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSettings();
  });
}

function openSettings() {
  const modal = document.getElementById('settings-modal');
  const sheet = modal.querySelector('.settings-sheet');
  const hasKey = !!state.apiKey;
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <h2 class="settings-title">AI Assistant Settings</h2>
    <p class="settings-subtitle">Configure your Claude API connection. Your key is stored locally and never sent to our servers.</p>

    <div class="settings-group">
      <div class="settings-group-label">Anthropic API Key</div>
      <div class="api-key-input-wrap">
        <input class="api-key-input" id="api-key-field" type="password"
          placeholder="sk-ant-api03-…"
          value="${escHtml(state.apiKey)}"
          autocomplete="off" spellcheck="false">
        <button class="api-key-toggle" id="api-key-toggle" aria-label="Toggle visibility">👁</button>
      </div>
      <div class="api-key-status ${hasKey ? 'set' : 'unset'}">
        ${hasKey ? '✅ API key saved' : '⚪ No API key set — required for AI chat'}
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-label">Claude Model</div>
      <select class="model-select" id="model-select">
        ${MODELS.map(m => `<option value="${m.id}"${m.id === state.selectedModel ? ' selected' : ''}>${m.label}</option>`).join('')}
      </select>
    </div>

    <div class="settings-group">
      <div class="settings-group-label">Chat History</div>
      <div class="settings-row">
        <div class="settings-row-label">Messages</div>
        <div class="settings-row-value">${state.chatMessages.length} messages</div>
      </div>
      <button class="btn btn-ghost btn-full" id="clear-chat-btn" style="margin-top:4px">Clear Chat History</button>
    </div>

    <div style="margin-top:8px">
      <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noopener"
        style="font-size:12px;color:var(--green-700);display:block;text-align:center;padding:8px">
        Get your API key at console.anthropic.com →
      </a>
    </div>

    <div style="display:flex;gap:12px;margin-top:16px">
      <button class="btn btn-outline btn-full" id="settings-cancel-btn">Cancel</button>
      <button class="btn btn-accent btn-full" id="settings-save-btn">Save Settings</button>
    </div>
  `;

  // Toggle password visibility
  sheet.querySelector('#api-key-toggle').addEventListener('click', () => {
    const field = sheet.querySelector('#api-key-field');
    field.type = field.type === 'password' ? 'text' : 'password';
  });

  sheet.querySelector('#model-select').addEventListener('change', e => {
    state.selectedModel = e.target.value;
  });

  sheet.querySelector('#clear-chat-btn').addEventListener('click', () => {
    state.chatMessages = [];
    renderChatMessages();
    closeSettings();
    showToast('Chat history cleared');
  });

  sheet.querySelector('#settings-cancel-btn').addEventListener('click', closeSettings);
  sheet.querySelector('#settings-save-btn').addEventListener('click', () => {
    const key = sheet.querySelector('#api-key-field').value.trim();
    state.apiKey = key;
    state.selectedModel = sheet.querySelector('#model-select').value;
    localStorage.setItem('gv_api_key', key);
    localStorage.setItem('gv_model', state.selectedModel);
    closeSettings();
    showToast(key ? '✅ API key saved' : 'API key cleared');
    if (state.chatMessages.length === 0) renderChatMessages();
  });

  modal.classList.add('show');
}

function closeSettings() {
  document.getElementById('settings-modal')?.classList.remove('show');
}

// ─────────────────────────────────────────────────────────────
// 13. OFFLINE DETECTION
// ─────────────────────────────────────────────────────────────
function setupOfflineDetection() {
  const banner = document.getElementById('offline-banner');
  const update = () => banner.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ─────────────────────────────────────────────────────────────
// 14. INSTALL PROMPT
// ─────────────────────────────────────────────────────────────
function setupInstallPrompt() {
  const prompt = document.getElementById('install-prompt');
  const installBtn = document.getElementById('install-btn');
  const dismissBtn = document.getElementById('dismiss-install-btn');
  const iosBanner = document.getElementById('ios-banner');
  const iosDismiss = document.getElementById('ios-banner-dismiss');

  // Capture beforeinstallprompt (Android/Chrome)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    if (!sessionStorage.getItem('gv_install_dismissed')) {
      setTimeout(() => prompt.classList.add('show'), 3000);
    }
  });

  installBtn?.addEventListener('click', async () => {
    prompt.classList.remove('show');
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    if (outcome === 'accepted') showToast('Clubhouse Golf installed! ⛳');
  });

  dismissBtn?.addEventListener('click', () => {
    prompt.classList.remove('show');
    sessionStorage.setItem('gv_install_dismissed', '1');
  });

  // iOS Safari: show manual instruction
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIOS && !isStandalone && !sessionStorage.getItem('gv_ios_dismissed')) {
    setTimeout(() => iosBanner?.classList.add('show'), 4000);
  }

  iosDismiss?.addEventListener('click', () => {
    iosBanner?.classList.remove('show');
    sessionStorage.setItem('gv_ios_dismissed', '1');
  });

  // Hide prompt when app is installed
  window.addEventListener('appinstalled', () => {
    prompt.classList.remove('show');
    iosBanner?.classList.remove('show');
  });
}

// ─────────────────────────────────────────────────────────────
// 15. SERVICE WORKER
// ─────────────────────────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      .then(reg => {
        console.log('[GV] SW registered, scope:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Update available — reload to get the latest version');
            }
          });
        });
      })
      .catch(err => console.warn('[GV] SW registration failed:', err));
  }
}

// ─────────────────────────────────────────────────────────────
// 16. UTILITIES
// ─────────────────────────────────────────────────────────────
const STATUS_LABELS = { live: 'LIVE', beta: 'BETA', coming: 'COMING SOON' };
function statusBadge(status) {
  const key = STATUS_LABELS[status] ? status : 'coming';
  return `<span class="status-badge status-badge--${key}">${STATUS_LABELS[key]}</span>`;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let toastTimer = null;
function showToast(msg, duration = 3000) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}
