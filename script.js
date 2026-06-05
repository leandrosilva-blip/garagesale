/* ══════════════════════════════════════
   GARAGE SALE — GOLFLEET
   script.js — Supabase SDK
══════════════════════════════════════ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://mupajexrxmsvyadjvrht.supabase.co',
  'sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98'
);

/* ══════════════════════════════════════
   TEMA
══════════════════════════════════════ */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('gs_theme', next);
}
(function () {
  const saved = localStorage.getItem('gs_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

/* ══════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════ */
let currentUser      = null;
let currentProductId = null;
let allProducts      = [];
let allCategories    = [];
let activeFilter     = null;
let mobileFilterOpen = false;

/* ══════════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════════ */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function goToCatalog() {
  showPage('page-catalog');
  activeFilter = null;
  await Promise.all([loadCategories(), loadProducts()]);
}

function updateHeaderStatus() {
  const avail = allProducts.filter(p => !p.sold).length;
  const el = document.getElementById('header-status');
  el.textContent = document.getElementById('page-catalog').classList.contains('active')
    ? avail + ' disponível' + (avail !== 1 ? 'is' : '') : '';
}

/* ══════════════════════════════════════
   CARREGAR DADOS
══════════════════════════════════════ */
async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  if (error) { console.error('Erro ao carregar categorias:', error); return; }
  allCategories = data || [];
  renderFilterBar();
  renderMobileFilter();
}

async function loadProducts() {
  // Carrega produtos com categoria e imagens em uma única query
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories ( id, name ),
      product_images ( id, url, sort_order )
    `)
    .order('created_at');

  if (error) {
    console.error('Erro ao carregar produtos:', error);
    document.getElementById('products-area').innerHTML =
      '<p class="empty-state">Erro ao carregar produtos. Tente recarregar a página.</p>';
    return;
  }

  // Normaliza o formato
  allProducts = (data || []).map(p => ({
    ...p,
    category:    p.categories?.name || '',
    category_id: p.category_id,
    images:      (p.product_images || [])
                   .sort((a, b) => a.sort_order - b.sort_order)
                   .map(i => i.url)
  }));

  renderCatalog();
  updateHeaderStatus();
}

/* ══════════════════════════════════════
   FILTRO DESKTOP
══════════════════════════════════════ */
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const cats = [{ id: null, name: 'Todos' }, ...allCategories];
  bar.innerHTML = cats.map(c =>
    `<button class="filter-chip${activeFilter === c.id ? ' active' : ''}"
             onclick="setFilter(${c.id === null ? 'null' : c.id})">
       ${escHtml(c.name)}
     </button>`
  ).join('');
}

function setFilter(catId) {
  activeFilter = catId === 'null' || catId === null ? null : parseInt(catId);
  renderFilterBar();
  renderCatalog();
}

/* ══════════════════════════════════════
   FILTRO MOBILE (HAMBURGER)
══════════════════════════════════════ */
function renderMobileFilter() {
  const dd  = document.getElementById('filter-mobile-dropdown');
  const lbl = document.getElementById('filter-mobile-label');
  if (!dd) return;
  const cats = [{ id: null, name: 'Todos' }, ...allCategories];
  dd.innerHTML = cats.map(c =>
    `<button class="filter-mobile-option${activeFilter === c.id ? ' active' : ''}"
             onclick="setFilterMobile(${c.id === null ? 'null' : c.id}, '${escHtml(c.name)}')">
       ${escHtml(c.name)}
     </button>`
  ).join('');
  if (lbl) {
    const active = allCategories.find(c => c.id === activeFilter);
    lbl.textContent = active ? active.name : 'Todos';
  }
}

function toggleMobileFilter() {
  mobileFilterOpen = !mobileFilterOpen;
  document.getElementById('filter-mobile-dropdown').classList.toggle('open', mobileFilterOpen);
  document.getElementById('filter-mobile-btn').classList.toggle('open', mobileFilterOpen);
}

function setFilterMobile(catId, name) {
  activeFilter = catId === 'null' || catId === null ? null : parseInt(catId);
  mobileFilterOpen = false;
  document.getElementById('filter-mobile-dropdown').classList.remove('open');
  document.getElementById('filter-mobile-btn').classList.remove('open');
  document.getElementById('filter-mobile-label').textContent = name;
  renderMobileFilter();
  renderCatalog();
}

/* ══════════════════════════════════════
   CATÁLOGO
══════════════════════════════════════ */
function renderCatalog() {
  const area = document.getElementById('products-area');
  area.innerHTML = '';

  const filtered = activeFilter === null
    ? allProducts
    : allProducts.filter(p => p.category_id === activeFilter);

  if (!filtered.length) {
    area.innerHTML = '<p class="empty-state">Nenhum produto nesta categoria.</p>';
    return;
  }

  // Agrupa por categoria mantendo a ordem
  const grouped  = {};
  const ordCats  = activeFilter === null
    ? allCategories
    : allCategories.filter(c => c.id === activeFilter);

  ordCats.forEach(c => { grouped[c.id] = { name: c.name, items: [] }; });
  filtered.forEach(p => {
    if (!grouped[p.category_id])
      grouped[p.category_id] = { name: p.category || 'Sem categoria', items: [] };
    grouped[p.category_id].items.push(p);
  });

  let hasAny = false;
  Object.values(grouped).forEach(({ name, items }) => {
    if (!items.length) return;
    hasAny = true;

    const sec = document.createElement('div');
    sec.className = 'category-section';
    sec.innerHTML = `<p class="category-title">${escHtml(name)}</p>`;
    area.appendChild(sec);

    const row = document.createElement('div');
    row.className = 'products-row';
    area.appendChild(row);

    items.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card' + (p.sold ? ' sold' : '');

      const imgHtml = p.images && p.images.length > 0
        ? `<div class="product-img">
             <img src="${escHtml(p.images[0])}" alt="${escHtml(p.name)}"
                  onerror="this.parentElement.outerHTML='<div class=product-img-placeholder>${imgSVG()}</div>'">
           </div>`
        : `<div class="product-img-placeholder">${imgSVG()}</div>`;

      const soldOv = p.sold
        ? `<div class="sold-overlay"><div class="sold-badge">Vendido</div></div>` : '';

      card.innerHTML = `
        <div style="position:relative">${imgHtml}${soldOv}</div>
        <div class="product-info">
          <p class="product-category">${escHtml(p.category || '')}</p>
          <p class="product-name">${escHtml(p.name)}</p>
          <p class="product-desc">${escHtml(p.description)}</p>
          <div class="product-footer">
            <span class="product-price">R$ ${fmtM(p.price)}</span>
            ${p.sold
              ? '<span style="font-size:12px;color:var(--danger)">Indisponível</span>'
              : `<button class="btn-buy" onclick="openModal(${p.id})">Comprar</button>`}
          </div>
        </div>`;

      if (!p.sold) card.addEventListener('click', e => {
        if (!e.target.classList.contains('btn-buy')) openModal(p.id);
      });

      row.appendChild(card);
    });
  });

  if (!hasAny) area.innerHTML = '<p class="empty-state">Nenhum produto cadastrado ainda.</p>';
  updateHeaderStatus();
}

function imgSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="m21 15-5-5L5 21"/>
  </svg>`;
}

/* ══════════════════════════════════════
   MODAL DE COMPRA
══════════════════════════════════════ */
// Índice da imagem atual no carrossel
let galleryIndex = 0;

function openModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  currentProductId = id;
  galleryIndex = 0;

  const backdrop = document.getElementById('modal-backdrop');
  const content  = document.getElementById('modal-content');
  const imgs     = p.images && p.images.length > 0 ? p.images : [];

  const gallery = imgs.length > 0 ? `
    <div class="gallery-wrap">
      <!-- Imagem principal -->
      <div class="gallery-main" id="gallery-main">
        <img id="gallery-active-img"
             src="${escHtml(imgs[0])}"
             alt="${escHtml(p.name)}"
             onclick="openZoom(${JSON.stringify(imgs).replace(/"/g,'&quot;')})">
        ${imgs.length > 1 ? `
          <button class="gallery-arrow gallery-prev" onclick="galleryNav(-1)">&#8249;</button>
          <button class="gallery-arrow gallery-next" onclick="galleryNav(1)">&#8250;</button>
          <div class="gallery-dots" id="gallery-dots">
            ${imgs.map((_, i) => `<span class="gallery-dot${i===0?' active':''}" onclick="galleryGo(${i})"></span>`).join('')}
          </div>` : ''}
      </div>
      <!-- Miniaturas -->
      ${imgs.length > 1 ? `
        <div class="gallery-thumbs" id="gallery-thumbs">
          ${imgs.map((url, i) => `
            <img src="${escHtml(url)}" alt=""
                 class="gallery-thumb${i===0?' active':''}"
                 onclick="galleryGo(${i})">
          `).join('')}
        </div>` : ''}
    </div>` : '';

  const opts = [];
  for (let i = 1; i <= Math.min(Math.floor(p.price / 100), 10); i++)
    opts.push(`<option value="${i}">${i}x de R$ ${fmtM(p.price / i)}</option>`);

  if (p.sold) {
    content.innerHTML = `
      ${gallery}
      <div class="modal-body">
        <p class="modal-category">${escHtml(p.category || '')}</p>
        <p class="modal-title">${escHtml(p.name)}</p>
        <div class="sold-notice">
          <strong>Este item já foi adquirido por outro colaborador.</strong><br>
          Entre em contato com garagesale@golfleet.com.br
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick="closeModal()">Fechar</button>
        </div>
      </div>`;
  } else {
    content.innerHTML = `
      ${gallery}
      <div class="modal-body">
        <p class="modal-category">${escHtml(p.category || '')}</p>
        <p class="modal-title">${escHtml(p.name)}</p>
        <p class="modal-desc">${escHtml(p.description)}</p>
        <p class="modal-price">R$ ${fmtM(p.price)}</p>
        <div class="form-section">
          <h4>Seus dados</h4>
          <div class="form-row" id="fr-name">
            <label>Nome completo *</label>
            <input type="text" id="f-name" placeholder="Seu nome">
            <p class="error-msg">Informe seu nome.</p>
          </div>
          <div class="form-row" id="fr-email">
            <label>E-mail corporativo *</label>
            <input type="email" id="f-email" placeholder="seunome@golfleet.com.br">
            <p class="error-msg">Informe um e-mail válido.</p>
          </div>
          <div class="form-row" id="fr-parcelas">
            <label>Parcelamento *</label>
            <select id="f-parcelas" onchange="updInst(${p.price})">${opts.join('')}</select>
            <p class="installment-info" id="installment-info">
              Parcela de R$ ${fmtM(p.price)} na folha
            </p>
          </div>
          <div class="form-row" id="fr-entrega">
            <label>Forma de recebimento *</label>
            <select id="f-entrega">
              <option value="presencial">Presencialmente (Londrina)</option>
              <option value="correio">Enviado via transportadora</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
          <button class="btn-primary btn-confirm" onclick="submitPurchase()">
            Confirmar compra
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>`;
    setTimeout(() => updInst(p.price), 10);
  }

  backdrop.classList.add('open');
  backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };

  // Swipe touch na galeria mobile
  setTimeout(() => {
    const mainEl = document.getElementById('gallery-main');
    if (!mainEl) return;
    let touchStartX = 0;
    let touchStartY = 0;

    mainEl.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    mainEl.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      // Só ativa swipe horizontal (dx > dy para não conflitar com scroll)
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        galleryNav(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }, 100);
}

// Navega pelo carrossel
function galleryNav(dir) {
  const p    = allProducts.find(x => x.id === currentProductId);
  const imgs = p?.images || [];
  galleryIndex = (galleryIndex + dir + imgs.length) % imgs.length;
  galleryGo(galleryIndex);
}

function galleryGo(idx) {
  const p    = allProducts.find(x => x.id === currentProductId);
  const imgs = p?.images || [];
  if (!imgs.length) return;
  galleryIndex = idx;

  // Troca imagem principal com animação
  const mainImg = document.getElementById('gallery-active-img');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => {
      mainImg.src = imgs[idx];
      mainImg.style.opacity = '1';
    }, 150);
  }

  // Atualiza dots
  document.querySelectorAll('.gallery-dot').forEach((d, i) =>
    d.classList.toggle('active', i === idx));

  // Atualiza miniaturas
  document.querySelectorAll('.gallery-thumb').forEach((t, i) =>
    t.classList.toggle('active', i === idx));
}

// Abre zoom em tela cheia
function openZoom(imgsJson) {
  const imgs = typeof imgsJson === 'string' ? JSON.parse(imgsJson) : imgsJson;
  let zi = galleryIndex;

  const overlay = document.createElement('div');
  overlay.id = 'zoom-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:500;
    display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;
  `;

  const render = () => {
    overlay.innerHTML = `
      <button onclick="document.getElementById('zoom-overlay').remove()"
        style="position:absolute;top:1rem;right:1.25rem;background:transparent;border:none;
               color:white;font-size:2rem;cursor:pointer;line-height:1;">✕</button>
      <img src="${escHtml(imgs[zi])}"
           style="max-width:92vw;max-height:80vh;object-fit:contain;border-radius:8px;
                  transition:opacity 0.2s;">
      ${imgs.length > 1 ? `
        <div style="display:flex;gap:10px;align-items:center;">
          <button onclick="zoomNav(-1)" style="background:rgba(255,255,255,0.15);border:none;
            color:white;width:40px;height:40px;border-radius:50%;font-size:1.4rem;cursor:pointer;">‹</button>
          <span style="color:rgba(255,255,255,0.6);font-size:13px;">${zi+1} / ${imgs.length}</span>
          <button onclick="zoomNav(1)" style="background:rgba(255,255,255,0.15);border:none;
            color:white;width:40px;height:40px;border-radius:50%;font-size:1.4rem;cursor:pointer;">›</button>
        </div>
        <div style="display:flex;gap:8px;">
          ${imgs.map((url, i) => `
            <img src="${escHtml(url)}" onclick="zoomGo(${i})"
              style="width:56px;height:56px;object-fit:cover;border-radius:6px;cursor:pointer;
                     border:2px solid ${i===zi?'var(--purple)':'rgba(255,255,255,0.2)'};
                     opacity:${i===zi?1:0.6};transition:all 0.2s;">
          `).join('')}
        </div>` : ''}
    `;
    // Re-bind nav functions
    window.zoomNav = (d) => { zi = (zi + d + imgs.length) % imgs.length; render(); };
    window.zoomGo  = (i) => { zi = i; render(); };
  };

  render();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  // Swipe touch no zoom
  let tzx = 0, tzy = 0;
  overlay.addEventListener('touchstart', e => {
    tzx = e.touches[0].clientX;
    tzy = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tzx;
    const dy = e.changedTouches[0].clientY - tzy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      zi = (zi + (dx < 0 ? 1 : -1) + imgs.length) % imgs.length;
      render();
    }
  }, { passive: true });

  document.body.appendChild(overlay);
}

function updInst(price) {
  const sel  = document.getElementById('f-parcelas');
  const info = document.getElementById('installment-info');
  if (!sel || !info) return;
  const n = parseInt(sel.value);
  info.textContent = n === 1
    ? `Desconto único de R$ ${fmtM(price)} na folha`
    : `${n}x de R$ ${fmtM(price / n)} na folha`;
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  currentProductId = null;
}

/* ══════════════════════════════════════
   FINALIZAR COMPRA
══════════════════════════════════════ */
async function submitPurchase() {
  const name     = document.getElementById('f-name');
  const email    = document.getElementById('f-email');
  const parcelas = document.getElementById('f-parcelas');
  const entrega  = document.getElementById('f-entrega');
  let valid = true;

  const setErr = (rid, inp, show) => {
    document.getElementById(rid).classList.toggle('has-error', show);
    inp.classList.toggle('error', show);
  };

  setErr('fr-name', name, !name.value.trim());
  if (!name.value.trim()) valid = false;
  const eOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
  setErr('fr-email', email, !eOk);
  if (!eOk) valid = false;
  if (!valid) return;

  const btn = document.querySelector('.btn-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }

  try {
    // Verifica se ainda está disponível
    const { data: prod } = await supabase
      .from('products')
      .select('id, sold, price, name')
      .eq('id', currentProductId)
      .single();

    if (prod.sold) {
      const idx = allProducts.findIndex(p => p.id === currentProductId);
      if (idx !== -1) allProducts[idx].sold = true;
      renderCatalog();
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar compra'; }
      openModal(currentProductId);
      return;
    }

    const n            = parseInt(parcelas.value);
    const valorParcela = (prod.price / n).toFixed(2);

    // Cria o pedido
    const { error: orderErr } = await supabase
      .from('orders')
      .insert({
        product_id:    prod.id,
        product_name:  prod.name,
        product_price: prod.price,
        nome:          name.value.trim(),
        email:         email.value.trim(),
        parcelas:      n,
        valor_parcela: valorParcela,
        entrega:       entrega.value
      });

    if (orderErr) throw new Error(orderErr.message);

    // Marca produto como vendido
    const { error: soldErr } = await supabase
      .from('products')
      .update({ sold: true, sold_at: new Date().toISOString() })
      .eq('id', currentProductId);

    if (soldErr) throw new Error(soldErr.message);

    // Atualiza estado local
    const idx = allProducts.findIndex(p => p.id === currentProductId);
    if (idx !== -1) allProducts[idx].sold = true;

    closeModal();
    renderCatalog();
    updateHeaderStatus();
    showSuccessPage({
      nome:          name.value.trim(),
      email:         email.value.trim(),
      product_name:  prod.name,
      product_price: prod.price,
      parcelas:      n,
      valor_parcela: valorParcela,
      entrega:       entrega.value
    });

  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar compra'; }
    alert('Erro ao finalizar compra: ' + err.message);
  }
}

function showSuccessPage(order) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:150;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:2rem;overflow-y:auto;';
  wrap.innerHTML = `
    <div class="success-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           style="width:36px;height:36px;color:var(--success)">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    </div>
    <h2 style="font-size:1.8rem;font-weight:800;color:var(--white);text-align:center;margin-bottom:0.5rem">
      Compra registrada!
    </h2>
    <p style="color:var(--muted);text-align:center;font-size:14px;margin-bottom:1.5rem;max-width:400px">
      Obrigado, <strong style="color:var(--text)">${escHtml(order.nome)}</strong>.
      Seu pedido foi registrado e será descontado em folha.
    </p>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
                padding:1.25rem 1.5rem;max-width:420px;width:100%;margin-bottom:1.5rem;">
      <p style="font-size:12px;color:var(--muted);margin-bottom:0.2rem">Produto</p>
      <p style="font-weight:600;color:var(--white);margin-bottom:1rem">${escHtml(order.product_name)}</p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:0.2rem">Parcelamento</p>
      <p style="color:var(--purple-light);font-weight:600;margin-bottom:1rem">
        ${order.parcelas}x de R$ ${fmtM(order.valor_parcela)}
      </p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:0.2rem">Recebimento</p>
      <p style="color:var(--text)">
        ${order.entrega === 'presencial' ? 'Presencialmente em Londrina' : 'Enviado via transportadora'}
      </p>
    </div>
    <p style="font-size:12px;color:var(--muted);text-align:center">
      Comprovante para <strong style="color:var(--purple-light)">${escHtml(order.email)}</strong>
    </p>
    <button class="btn-primary" style="margin-top:1.5rem" onclick="this.parentElement.remove();">
      Ver outros produtos
    </button>`;
  document.body.appendChild(wrap);
}

/* ══════════════════════════════════════
   ADMIN — LOGIN
══════════════════════════════════════ */
function showAdmin() {
  showPage('page-admin');
  document.getElementById('admin-auth').style.display  = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-pw').value            = '';
  document.getElementById('admin-login-input').value   = '';
  document.getElementById('pw-error').style.display    = 'none';
}

async function checkAdmin() {
  const email    = document.getElementById('admin-login-input').value.trim();
  const password = document.getElementById('admin-pw').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById('pw-error').style.display = 'block';
    return;
  }

  currentUser = data.user;
  document.getElementById('admin-auth').style.display  = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  document.getElementById('admin-user-badge').textContent =
    (currentUser.user_metadata?.name || email) + ' · Admin';

  await renderAdminOrders();
  await renderAdminProducts();
  await renderAdminCategories();
  switchTab('orders');
}

async function adminLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  showPage('page-terms');
}

function switchTab(tab) {
  const tabs = ['orders', 'products', 'categories'];
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', tabs[i] === tab));
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  if (tab === 'categories') renderAdminCategories();
  if (tab === 'products')   renderAdminProducts();
  if (tab === 'orders')     renderAdminOrders();
}

/* ══════════════════════════════════════
   ADMIN — PEDIDOS
══════════════════════════════════════ */
async function renderAdminOrders() {
  const list = document.getElementById('orders-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { list.innerHTML = `<p class="empty-state">Erro: ${escHtml(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = '<p class="empty-state">Nenhum pedido ainda.</p>'; return; }

  list.innerHTML = data.map(o => `
    <div class="admin-card">
      <div class="order-row">
        <div class="order-info">
          <p><strong>${escHtml(o.nome)}</strong></p>
          <p class="small">${escHtml(o.email)}</p>
          <p style="margin-top:0.5rem;color:var(--purple-light);font-weight:600">
            ${escHtml(o.product_name)}
          </p>
          <p class="small">
            R$ ${fmtM(o.product_price)} — ${o.parcelas}x de R$ ${fmtM(o.valor_parcela)}
          </p>
          <p class="small">
            Recebimento: ${o.entrega === 'presencial' ? 'Presencial' : 'Transportadora'}
          </p>
          <p class="small" style="color:var(--muted)">
            ${new Date(o.created_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <span class="tag tag-green">Confirmado</span>
          <span class="tag ${o.entrega === 'presencial' ? 'tag-amber' : 'tag-blue'}">
            ${o.entrega === 'presencial' ? 'Presencial' : 'Correio'}
          </span>
        </div>
      </div>
    </div>`).join('');
}

async function clearOrders() {
  if (!confirm('Apagar TODOS os pedidos?')) return;
  const { error } = await supabase.from('orders').delete().neq('id', 0);
  if (error) { alert('Erro: ' + error.message); return; }
  renderAdminOrders();
}

async function exportCSV() {
  const { data, error } = await supabase
    .from('orders').select('*').order('created_at', { ascending: false });
  if (error) { alert('Erro: ' + error.message); return; }
  if (!data.length) { alert('Nenhum pedido para exportar.'); return; }

  const header = ['Data','Nome','E-mail','Produto','Valor Total','Parcelas','Valor Parcela','Recebimento'];
  const rows   = data.map(o => [
    new Date(o.created_at).toLocaleString('pt-BR'),
    o.nome, o.email, o.product_name,
    'R$ ' + fmtM(o.product_price),
    o.parcelas, 'R$ ' + fmtM(o.valor_parcela),
    o.entrega === 'presencial' ? 'Presencial' : 'Transportadora'
  ]);
  const csv = [header, ...rows].map(r =>
    r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')
  ).join('\n');
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'pedidos-garagesale.csv';
  a.click();
}

/* ══════════════════════════════════════
   ADMIN — PRODUTOS
══════════════════════════════════════ */
async function renderAdminProducts() {
  const list = document.getElementById('products-edit-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';

  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id,name), product_images(id,url,sort_order)')
    .order('created_at');

  if (error) { list.innerHTML = `<p class="empty-state">Erro: ${escHtml(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = '<p class="empty-state">Nenhum produto.</p>'; return; }

  list.innerHTML = data.map(p => {
    const imgs = (p.product_images || []).sort((a,b) => a.sort_order - b.sort_order);
    return `
      <div class="product-edit-card" id="pedit-${p.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
          <span style="font-family:'Syne',sans-serif;font-weight:700;
                       font-size:1rem;color:var(--white)">${escHtml(p.name)}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${p.sold
              ? '<span class="tag tag-amber">Vendido</span>'
              : '<span class="tag tag-green">Disponível</span>'}
            ${p.sold
              ? `<button class="reset-btn" onclick="reactivateProduct(${p.id})">Reativar</button>`
              : ''}
            <button class="btn-danger" onclick="deleteProduct(${p.id})">Remover</button>
          </div>
        </div>
        <label>Nome do produto</label>
        <input type="text" value="${escHtml(p.name)}" id="pname-${p.id}">
        <label>Categoria</label>
        <select id="pcat-${p.id}">
          <option value="">Sem categoria</option>
          ${allCategories.map(c =>
            `<option value="${c.id}" ${p.category_id === c.id ? 'selected':''}>${escHtml(c.name)}</option>`
          ).join('')}
        </select>
        <label>Descrição / avarias</label>
        <textarea rows="3" id="pdesc-${p.id}">${escHtml(p.description || '')}</textarea>
        <label>Preço (R$)</label>
        <input type="number" value="${p.price}" id="pprice-${p.id}" min="0" step="0.01">
        <label>Fotos atuais</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          ${imgs.map(img =>
            `<div style="position:relative;">
               <img src="${escHtml(img.url)}"
                    style="width:80px;height:80px;object-fit:cover;border-radius:6px;
                           border:1px solid var(--border);">
               <button onclick="deleteProductImage(${img.id}, ${p.id})"
                 style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;
                        border-radius:50%;background:var(--danger);border:none;
                        color:white;cursor:pointer;font-size:12px;line-height:1;">✕</button>
             </div>`
          ).join('')}
        </div>
        <label>Adicionar foto</label>
        <input type="file" id="pfile-${p.id}" accept="image/jpeg,image/png,image/webp"
               style="background:var(--input-bg);border:1px solid var(--border);
                      border-radius:8px;color:var(--text);padding:0.5rem;width:100%;">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem;">
          <button class="btn-save" onclick="saveProduct(${p.id})">Salvar dados</button>
          <button class="btn-save" onclick="uploadProductImage(${p.id})">Enviar foto</button>
        </div>
      </div>`;
  }).join('');
}

async function saveProduct(id) {
  const { error } = await supabase
    .from('products')
    .update({
      name:        document.getElementById(`pname-${id}`).value.trim(),
      category_id: document.getElementById(`pcat-${id}`).value || null,
      description: document.getElementById(`pdesc-${id}`).value.trim(),
      price:       parseFloat(document.getElementById(`pprice-${id}`).value) || 0,
      updated_at:  new Date().toISOString()
    })
    .eq('id', id);

  if (error) { alert('Erro: ' + error.message); return; }
  await loadProducts();
  await renderAdminProducts();
  alert('Produto salvo!');
}

async function uploadProductImage(id) {
  const input = document.getElementById(`pfile-${id}`);
  if (!input.files.length) { alert('Selecione uma imagem.'); return; }

  const file     = input.files[0];
  const fileName = `${id}/${Date.now()}-${file.name.replace(/\s/g, '_')}`;

  // Faz upload para o Supabase Storage
  const { error: upErr } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: false });

  if (upErr) { alert('Erro no upload: ' + upErr.message); return; }

  // Pega a URL pública
  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  // Descobre a próxima ordem
  const { data: lastImg } = await supabase
    .from('product_images')
    .select('sort_order')
    .eq('product_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = lastImg && lastImg.length ? lastImg[0].sort_order + 1 : 0;

  // Salva referência no banco
  const { error: dbErr } = await supabase
    .from('product_images')
    .insert({ product_id: id, url: urlData.publicUrl, sort_order: nextOrder });

  if (dbErr) { alert('Erro ao salvar imagem: ' + dbErr.message); return; }

  await loadProducts();
  await renderAdminProducts();
  alert('Foto enviada!');
}

async function deleteProductImage(imgId, productId) {
  if (!confirm('Remover esta foto?')) return;
  const { error } = await supabase
    .from('product_images').delete().eq('id', imgId);
  if (error) { alert('Erro: ' + error.message); return; }
  await loadProducts();
  await renderAdminProducts();
}

async function deleteProduct(id) {
  if (!confirm('Remover este produto?')) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await loadProducts();
  await renderAdminProducts();
}

async function reactivateProduct(id) {
  const { error } = await supabase
    .from('products').update({ sold: false, sold_at: null }).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await loadProducts();
  await renderAdminProducts();
}

async function addNewProduct() {
  const { data, error } = await supabase
    .from('products')
    .insert({ name: 'Novo produto', price: 100, description: '' })
    .select()
    .single();
  if (error) { alert('Erro: ' + error.message); return; }
  await loadProducts();
  await renderAdminProducts();
  const el = document.getElementById(`pedit-${data.id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ══════════════════════════════════════
   ADMIN — CATEGORIAS
══════════════════════════════════════ */
async function renderAdminCategories() {
  const list = document.getElementById('categories-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';

  const { data: cats, error } = await supabase
    .from('categories').select('*').order('sort_order');
  if (error) { list.innerHTML = `<p class="empty-state">Erro: ${escHtml(error.message)}</p>`; return; }

  const { data: prods } = await supabase.from('products').select('category_id');

  list.innerHTML = cats.map((c, i) => {
    const count = (prods || []).filter(p => p.category_id === c.id).length;
    return `
      <div class="admin-card" style="display:flex;align-items:center;
            justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button onclick="moveCat(${c.id}, ${i}, -1, ${JSON.stringify(cats.map(x=>x.id))})"
              ${i === 0 ? 'disabled' : ''}
              style="background:transparent;border:1px solid var(--border);color:var(--muted);
                     border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:11px;
                     ${i === 0 ? 'opacity:0.3;' : ''}">▲</button>
            <button onclick="moveCat(${c.id}, ${i}, 1, ${JSON.stringify(cats.map(x=>x.id))})"
              ${i === cats.length-1 ? 'disabled' : ''}
              style="background:transparent;border:1px solid var(--border);color:var(--muted);
                     border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:11px;
                     ${i === cats.length-1 ? 'opacity:0.3;' : ''}">▼</button>
          </div>
          <div>
            <p style="font-family:'Syne',sans-serif;font-weight:700;
                      color:var(--white);font-size:1rem;">${escHtml(c.name)}</p>
            <p style="font-size:12px;color:var(--muted);margin-top:2px;">
              ${count} produto${count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <input type="text" value="${escHtml(c.name)}" id="cat-edit-${c.id}"
            style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;
                   color:var(--text);font-size:13px;padding:0.4rem 0.7rem;outline:none;width:160px;">
          <button class="btn-save" style="margin-top:0;" onclick="renameCategory(${c.id})">
            Renomear
          </button>
          <button class="btn-danger" style="margin-left:0;" onclick="deleteCategory(${c.id})">
            Remover
          </button>
        </div>
      </div>`;
  }).join('');
}

async function saveNewCategory() {
  const input = document.getElementById('new-cat-name');
  const name  = input.value.trim();
  if (!name) { alert('Digite um nome.'); return; }

  const { data: last } = await supabase
    .from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const nextOrder = last && last.length ? last[0].sort_order + 1 : 1;

  const { error } = await supabase
    .from('categories').insert({ name, sort_order: nextOrder });
  if (error) { alert('Erro: ' + error.message); return; }

  input.value = '';
  await loadCategories();
  await renderAdminCategories();
}

async function renameCategory(id) {
  const newName = document.getElementById(`cat-edit-${id}`).value.trim();
  if (!newName) { alert('Nome não pode ser vazio.'); return; }
  const { error } = await supabase
    .from('categories').update({ name: newName }).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await loadCategories();
  await renderAdminCategories();
  await loadProducts();
}

async function deleteCategory(id) {
  if (!confirm('Remover esta categoria? Produtos ficarão sem categoria.')) return;
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  await loadCategories();
  await renderAdminCategories();
}

async function moveCat(id, idx, dir, ids) {
  const t = idx + dir;
  if (t < 0 || t >= ids.length) return;
  // Troca sort_order entre os dois
  const { error: e1 } = await supabase
    .from('categories').update({ sort_order: t + 1 }).eq('id', ids[idx]);
  const { error: e2 } = await supabase
    .from('categories').update({ sort_order: idx + 1 }).eq('id', ids[t]);
  if (e1 || e2) { alert('Erro ao reordenar.'); return; }
  await loadCategories();
  await renderAdminCategories();
}

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtM(v) {
  return parseFloat(v).toLocaleString('pt-BR',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ══════════════════════════════════════
   EXPÕE FUNÇÕES PARA O HTML
   (necessário por causa do type="module")
══════════════════════════════════════ */
window.toggleTheme        = toggleTheme;
window.goToCatalog        = goToCatalog;
window.showAdmin          = showAdmin;
window.checkAdmin         = checkAdmin;
window.adminLogout        = adminLogout;
window.showPage           = showPage;
window.closeModal         = closeModal;
window.openModal          = openModal;
window.galleryNav         = galleryNav;
window.galleryGo          = galleryGo;
window.openZoom           = openZoom;
window.submitPurchase     = submitPurchase;
window.updInst            = updInst;
window.toggleMobileFilter = toggleMobileFilter;
window.setFilter          = setFilter;
window.setFilterMobile    = setFilterMobile;
window.switchTab          = switchTab;

// Pedidos
window.clearOrders        = clearOrders;
window.exportCSV          = exportCSV;
window.renderAdminOrders  = renderAdminOrders;

// Produtos
window.addNewProduct         = addNewProduct;
window.saveProduct           = saveProduct;
window.deleteProduct         = deleteProduct;
window.reactivateProduct     = reactivateProduct;
window.uploadProductImage    = uploadProductImage;
window.deleteProductImage    = deleteProductImage;
window.renderAdminProducts   = renderAdminProducts;

// Categorias
window.saveNewCategory    = saveNewCategory;
window.renameCategory     = renameCategory;
window.deleteCategory     = deleteCategory;
window.moveCat            = moveCat;
window.renderAdminCategories = renderAdminCategories;
