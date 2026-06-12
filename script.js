/* ══════════════════════════════════════
   GARAGE SALE — GOLFLEET
   script.js — Versão limpa e completa
══════════════════════════════════════ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://mupajexrxmsvyadjvrht.supabase.co',
  'sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98'
);

/* ══════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════ */
let currentUser      = null;
let currentProductId = null;
let allProducts      = [];
let allCategories    = [];
let activeFilter     = null;
let mobileFilterOpen = false;
let storeOpen        = false;
let galleryIndex     = 0;
let pollingInterval  = null;
let realtimeChannel  = null;

// SESSION_ID único por carregamento — muda a cada refresh
const SESSION_ID = 'sess_' + Math.random().toString(36).slice(2) + '_' + Date.now();

// Ao carregar: limpa reservas expiradas (mais de 10 min)
(async function clearExpiredReservations() {
  try {
    const tenAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await fetch(
      'https://mupajexrxmsvyadjvrht.supabase.co/rest/v1/reservations?created_at=lt.' + encodeURIComponent(tenAgo),
      {
        method: 'DELETE',
        headers: {
          'apikey':        'sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98',
          'Authorization': 'Bearer sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98',
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal'
        }
      }
    );
  } catch(e) { /* silencioso */ }
})();

// Ao fechar/recarregar: remove reserva desta sessão
window.addEventListener('beforeunload', () => {
  fetch(
    'https://mupajexrxmsvyadjvrht.supabase.co/rest/v1/reservations?session_id=eq.' + SESSION_ID,
    {
      method:    'DELETE',
      keepalive: true,
      headers: {
        'apikey':        'sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98',
        'Authorization': 'Bearer sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98',
        'Content-Type':  'application/json'
      }
    }
  ).catch(() => {});
});

// Se ficar oculto por 30s (minimizar app), remove reserva
let hiddenTimer = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenTimer = setTimeout(async () => {
      if (currentProductId) await removeReservation();
    }, 30000);
  } else {
    if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
  }
});

/* ══════════════════════════════════════
   TEMA
══════════════════════════════════════ */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('gs_theme', next);
}
(function() {
  const saved = localStorage.getItem('gs_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

/* ══════════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════════ */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function goToCatalog() {
  // Verifica status da loja
  try {
    const { data } = await supabase
      .from('site_settings').select('value').eq('key', 'store_open').single();
    storeOpen = data?.value === 'true';
  } catch(e) { storeOpen = false; }

  showPage('page-catalog');
  activeFilter = null;
  await Promise.all([loadCategories(), loadProducts()]);
  startRealtime();
}

/* ══════════════════════════════════════
   REALTIME + POLLING
══════════════════════════════════════ */
function startRealtime() {
  stopRealtime();

  realtimeChannel = supabase
    .channel('catalog-' + Date.now())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' },
      async (payload) => {
        if (payload.new) {
          const idx = allProducts.findIndex(p => p.id === payload.new.id);
          if (idx !== -1) {
            allProducts[idx].sold    = payload.new.sold;
            allProducts[idx].sold_at = payload.new.sold_at;
          }
        }
        renderCatalog();
        updateHeaderStatus();
        await loadProducts();
      }
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' },
      async () => { await loadProducts(); }
    )
    .subscribe();

  // Polling a cada 3s — fallback para todos os dispositivos
  pollingInterval = setInterval(async () => { await loadProducts(); }, 3000);
}

function stopRealtime() {
  if (realtimeChannel) { realtimeChannel.unsubscribe(); realtimeChannel = null; }
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

/* ══════════════════════════════════════
   CARREGAR DADOS
══════════════════════════════════════ */
async function loadCategories() {
  const { data, error } = await supabase
    .from('categories').select('*').order('sort_order');
  if (!error) {
    allCategories = data || [];
    renderFilterBar();
    renderMobileFilter();
  }
}

async function loadProducts() {
  const now = new Date().toISOString();
  const [prodRes, resRes] = await Promise.all([
    supabase.from('products')
      .select('*, categories(id,name), product_images(id,url,sort_order)')
      .order('created_at'),
    supabase.from('reservations')
      .select('product_id, session_id').gt('expires_at', now)
  ]);

  if (prodRes.error) {
    console.error('Erro ao carregar produtos:', prodRes.error);
    return;
  }

  const reservedMap = {};
  (resRes.data || []).forEach(r => { reservedMap[r.product_id] = r.session_id; });

  allProducts = (prodRes.data || []).map(p => ({
    ...p,
    category:     p.categories?.name || '',
    category_id:  p.category_id,
    images:       (p.product_images || [])
                    .sort((a,b) => a.sort_order - b.sort_order)
                    .map(i => i.url),
    reserved:     !!(reservedMap[p.id] && reservedMap[p.id] !== SESSION_ID),
    reservedByMe: reservedMap[p.id] === SESSION_ID
  }));

  // Só atualiza o catálogo se estiver nessa página
  const catalogPage = document.getElementById('page-catalog');
  if (catalogPage && catalogPage.classList.contains('active')) {
    renderCatalog();
    updateHeaderStatus();
    updateStoreBanner();
  }
}

// Versão leve para o admin — sem tocar na UI do catálogo
async function reloadAdminProducts() {
  const { data } = await supabase
    .from('products')
    .select('*, categories(id,name), product_images(id,url,sort_order)')
    .order('created_at');
  if (data) {
    allProducts = data.map(p => ({
      ...p,
      category:    p.categories?.name || '',
      category_id: p.category_id,
      images:      (p.product_images || [])
                     .sort((a,b) => a.sort_order - b.sort_order)
                     .map(i => i.url),
      reserved: false, reservedByMe: false
    }));
  }
}

/* ══════════════════════════════════════
   HEADER STATUS
══════════════════════════════════════ */
function updateHeaderStatus() {
  const avail = allProducts.filter(p => !p.sold).length;
  const el    = document.getElementById('header-status');
  if (!el) return;
  const onCatalog = document.getElementById('page-catalog')?.classList.contains('active');
  el.textContent = onCatalog ? avail + ' disponível' + (avail !== 1 ? 'is' : '') : '';
}

function updateStoreBanner() {
  const existing = document.getElementById('store-banner');
  if (existing) existing.remove();
  if (storeOpen) return;

  const header = document.querySelector('.catalog-header');
  if (!header) return;

  const banner = document.createElement('div');
  banner.id = 'store-banner';
  banner.style.cssText = 'background:rgba(155,81,224,0.08);border:1px solid var(--purple-dark);border-radius:10px;padding:0.75rem 1.25rem;margin:0 2.5rem 1rem;display:flex;align-items:center;gap:0.6rem;font-size:13px;color:var(--purple-light);';
  banner.innerHTML = '<span style="font-size:1.1rem;">🔒</span><span>Visualização disponível, mas as <strong>vendas estão temporariamente fechadas</strong>.</span>';
  header.insertAdjacentElement('afterend', banner);
}

/* ══════════════════════════════════════
   FILTROS
══════════════════════════════════════ */
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const cats = [{ id: null, name: 'Todos' }, ...allCategories];
  bar.innerHTML = cats.map(c =>
    `<button class="filter-chip${activeFilter === c.id ? ' active' : ''}"
             onclick="setFilter(${c.id === null ? 'null' : c.id})">${escHtml(c.name)}</button>`
  ).join('');
}

function renderMobileFilter() {
  const dd  = document.getElementById('filter-mobile-dropdown');
  const lbl = document.getElementById('filter-mobile-label');
  if (!dd) return;
  const cats = [{ id: null, name: 'Todos' }, ...allCategories];
  dd.innerHTML = cats.map(c =>
    `<button class="filter-mobile-option${activeFilter === c.id ? ' active' : ''}"
             onclick="setFilterMobile(${c.id === null ? 'null' : c.id}, '${escHtml(c.name)}')">${escHtml(c.name)}</button>`
  ).join('');
  if (lbl) lbl.textContent = allCategories.find(c => c.id === activeFilter)?.name || 'Todos';
}

function toggleMobileFilter() {
  mobileFilterOpen = !mobileFilterOpen;
  document.getElementById('filter-mobile-dropdown')?.classList.toggle('open', mobileFilterOpen);
  document.getElementById('filter-mobile-btn')?.classList.toggle('open', mobileFilterOpen);
}

function setFilter(catId) {
  activeFilter = (catId === 'null' || catId === null) ? null : parseInt(catId);
  renderFilterBar();
  renderCatalog();
}

function setFilterMobile(catId, name) {
  activeFilter = (catId === 'null' || catId === null) ? null : parseInt(catId);
  mobileFilterOpen = false;
  document.getElementById('filter-mobile-dropdown')?.classList.remove('open');
  document.getElementById('filter-mobile-btn')?.classList.remove('open');
  document.getElementById('filter-mobile-label').textContent = name;
  renderMobileFilter();
  renderCatalog();
}

/* ══════════════════════════════════════
   CATÁLOGO
══════════════════════════════════════ */
function renderCatalog() {
  const area = document.getElementById('products-area');
  if (!area) return;
  area.innerHTML = '';

  const filtered = activeFilter === null
    ? allProducts
    : allProducts.filter(p => p.category_id === activeFilter);

  if (!filtered.length) {
    area.innerHTML = '<p class="empty-state">Nenhum produto nesta categoria.</p>';
    return;
  }

  const grouped   = {};
  const ordCats   = activeFilter === null ? allCategories : allCategories.filter(c => c.id === activeFilter);
  ordCats.forEach(c => { grouped[c.id] = { name: c.name, items: [] }; });
  filtered.forEach(p => {
    if (!grouped[p.category_id]) grouped[p.category_id] = { name: p.category || 'Sem categoria', items: [] };
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
        ? `<div class="product-img"><img src="${escHtml(p.images[0])}" alt="${escHtml(p.name)}"
               onerror="this.parentElement.outerHTML='<div class=product-img-placeholder>${imgSVG()}</div>'"></div>`
        : `<div class="product-img-placeholder">${imgSVG()}</div>`;

      const soldOv = p.sold
        ? `<div class="sold-overlay"><div class="sold-badge">Vendido</div></div>` : '';
      const resOv = (!p.sold && p.reserved)
        ? `<div class="sold-overlay" style="background:rgba(155,81,224,0.6)"><div class="sold-badge" style="background:var(--purple)">Reservado</div></div>` : '';

      let action = '';
      if (p.sold)          action = '<span style="font-size:12px;color:var(--danger)">Indisponível</span>';
      else if (p.reserved) action = '<span style="font-size:12px;color:var(--purple-light)">Em negociação</span>';
      else if (!storeOpen) action = '<span style="font-size:11px;color:var(--muted);border:1px solid var(--border);padding:0.4rem 0.8rem;border-radius:6px;">Vendas fechadas</span>';
      else                 action = `<button class="btn-buy" onclick="openModal(${p.id})">Comprar</button>`;

      card.innerHTML = `
        <div style="position:relative">${imgHtml}${soldOv}${resOv}</div>
        <div class="product-info">
          <p class="product-category">${escHtml(p.category || '')}</p>
          <p class="product-name">${escHtml(p.name)}</p>
          <p class="product-desc">${escHtml(p.description)}</p>
          <div class="product-footer">
            <span class="product-price">R$ ${fmtM(p.price)}</span>
            ${action}
          </div>
        </div>`;

      if (!p.sold && !p.reserved && storeOpen)
        card.addEventListener('click', e => { if (!e.target.classList.contains('btn-buy')) openModal(p.id); });

      row.appendChild(card);
    });
  });

  if (!hasAny) area.innerHTML = '<p class="empty-state">Nenhum produto cadastrado ainda.</p>';
}

function imgSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
}

/* ══════════════════════════════════════
   GALERIA
══════════════════════════════════════ */
function buildGallery(p) {
  const imgs = p.images || [];
  if (!imgs.length) return '';

  const arrows = imgs.length > 1
    ? `<button class="gallery-arrow gallery-prev" data-dir="-1">&#8249;</button>
       <button class="gallery-arrow gallery-next" data-dir="1">&#8250;</button>
       <div class="gallery-dots" id="gallery-dots">
         ${imgs.map((_, i) => `<span class="gallery-dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}
       </div>` : '';

  const thumbs = imgs.length > 1
    ? `<div class="gallery-thumbs">
         ${imgs.map((url, i) => `<img src="${escHtml(url)}" alt="" class="gallery-thumb${i===0?' active':''}" data-idx="${i}">`).join('')}
       </div>` : '';

  return `
    <div class="gallery-wrap">
      <div class="gallery-main" id="gallery-main">
        <img id="gallery-active-img" src="${escHtml(imgs[0])}" alt="${escHtml(p.name)}">
        ${arrows}
      </div>
      ${thumbs}
    </div>`;
}

function bindGalleryEvents(imgs) {
  document.querySelectorAll('.gallery-arrow').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); galleryNav(parseInt(btn.dataset.dir), imgs); });
  });
  document.querySelectorAll('.gallery-dot').forEach(dot => {
    dot.addEventListener('click', e => { e.stopPropagation(); galleryGo(parseInt(dot.dataset.idx), imgs); });
  });
  document.querySelectorAll('.gallery-thumb').forEach(th => {
    th.addEventListener('click', e => { e.stopPropagation(); galleryGo(parseInt(th.dataset.idx), imgs); });
  });
  const mainImg = document.getElementById('gallery-active-img');
  if (mainImg) {
    mainImg.style.cursor = 'zoom-in';
    mainImg.addEventListener('click', e => { e.stopPropagation(); openZoom(imgs); });
  }
  const mainEl = document.getElementById('gallery-main');
  if (mainEl) {
    let tx = 0, ty = 0;
    mainEl.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    mainEl.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) galleryNav(dx < 0 ? 1 : -1, imgs);
    }, { passive: true });
  }
}

function galleryNav(dir, imgs) {
  if (!imgs) { const p = allProducts.find(x => x.id === currentProductId); imgs = p?.images || []; }
  galleryIndex = (galleryIndex + dir + imgs.length) % imgs.length;
  galleryGo(galleryIndex, imgs);
}

function galleryGo(idx, imgs) {
  if (!imgs) { const p = allProducts.find(x => x.id === currentProductId); imgs = p?.images || []; }
  galleryIndex = idx;
  const mainImg = document.getElementById('gallery-active-img');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => { mainImg.src = imgs[idx]; mainImg.style.opacity = '1'; }, 150);
  }
  document.querySelectorAll('.gallery-dot').forEach((d,i)   => d.classList.toggle('active', i === idx));
  document.querySelectorAll('.gallery-thumb').forEach((t,i)  => t.classList.toggle('active', i === idx));
}

function openZoom(imgs) {
  let zi = galleryIndex;
  const overlay = document.createElement('div');
  overlay.id = 'zoom-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:500;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;';

  const render = () => {
    overlay.innerHTML =
      `<button onclick="document.getElementById('zoom-overlay').remove()"
         style="position:absolute;top:1rem;right:1.25rem;background:transparent;border:none;color:white;font-size:2rem;cursor:pointer;">✕</button>
       <img src="${escHtml(imgs[zi])}"
            style="max-width:92vw;max-height:80vh;object-fit:contain;border-radius:8px;transition:opacity 0.2s;">
       ${imgs.length > 1 ? `
         <div style="display:flex;gap:10px;align-items:center;">
           <button onclick="zoomNav(-1)" style="background:rgba(255,255,255,0.15);border:none;color:white;width:40px;height:40px;border-radius:50%;font-size:1.4rem;cursor:pointer;">‹</button>
           <span style="color:rgba(255,255,255,0.6);font-size:13px;">${zi+1} / ${imgs.length}</span>
           <button onclick="zoomNav(1)"  style="background:rgba(255,255,255,0.15);border:none;color:white;width:40px;height:40px;border-radius:50%;font-size:1.4rem;cursor:pointer;">›</button>
         </div>
         <div style="display:flex;gap:8px;">
           ${imgs.map((url,i) => `<img src="${escHtml(url)}" onclick="zoomGo(${i})"
             style="width:56px;height:56px;object-fit:cover;border-radius:6px;cursor:pointer;
                    border:2px solid ${i===zi?'var(--purple)':'rgba(255,255,255,0.2)'};
                    opacity:${i===zi?1:0.6};transition:all 0.2s;">`).join('')}
         </div>` : ''}`;
    window.zoomNav = d => { zi = (zi + d + imgs.length) % imgs.length; render(); };
    window.zoomGo  = i => { zi = i; render(); };
  };

  render();

  // Swipe no zoom
  let tz = 0;
  overlay.addEventListener('touchstart', e => { tz = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend',   e => {
    const dx = e.changedTouches[0].clientX - tz;
    if (Math.abs(dx) > 40) { zi = (zi + (dx < 0 ? 1 : -1) + imgs.length) % imgs.length; render(); }
  }, { passive: true });

  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

/* ══════════════════════════════════════
   MODAL DE COMPRA
══════════════════════════════════════ */
async function openModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  currentProductId = id;
  galleryIndex = 0;

  const backdrop = document.getElementById('modal-backdrop');
  const content  = document.getElementById('modal-content');
  const gallery  = buildGallery(p);

  // Loja fechada — só mostra detalhes
  if (!storeOpen) {
    content.innerHTML = `
      ${gallery}
      <div class="modal-body">
        <p class="modal-category">${escHtml(p.category || '')}</p>
        <p class="modal-title">${escHtml(p.name)}</p>
        <p class="modal-desc">${escHtml(p.description)}</p>
        <p class="modal-price">R$ ${fmtM(p.price)}</p>
        <div class="sold-notice" style="background:rgba(155,81,224,0.08);border-color:rgba(155,81,224,0.3);color:var(--purple-light)">
          🔒 <strong>Vendas temporariamente fechadas.</strong><br>
          Você pode visualizar os produtos, mas as compras não estão disponíveis no momento.
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick="closeModal()">Fechar</button>
        </div>
      </div>`;
    backdrop.classList.add('open');
    backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };
    setTimeout(() => bindGalleryEvents(p.images || []), 80);
    addSwipeToClose();
    return;
  }

  // Produto já vendido
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
    backdrop.classList.add('open');
    backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };
    setTimeout(() => bindGalleryEvents(p.images || []), 80);
    addSwipeToClose();
    return;
  }

  // Verificar reserva de outra sessão
  const now = new Date().toISOString();
  const { data: resData } = await supabase
    .from('reservations')
    .select('session_id')
    .eq('product_id', id)
    .gt('expires_at', now)
    .neq('session_id', SESSION_ID)
    .limit(1);
  const isReservedByOther = resData && resData.length > 0;

  if (!isReservedByOther) createReservation(id);

  if (isReservedByOther) {
    content.innerHTML = `
      ${gallery}
      <div class="modal-body">
        <p class="modal-category">${escHtml(p.category || '')}</p>
        <p class="modal-title">${escHtml(p.name)}</p>
        <div class="sold-notice" style="background:rgba(155,81,224,0.08);border-color:rgba(155,81,224,0.3);color:var(--purple-light)">
          <strong>Outro colaborador está finalizando a compra deste item.</strong><br>
          Aguarde alguns minutos e tente novamente.
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick="closeModal()">Fechar</button>
        </div>
      </div>`;
    backdrop.classList.add('open');
    backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };
    setTimeout(() => bindGalleryEvents(p.images || []), 80);
    addSwipeToClose();
    return;
  }

  // Formulário normal
  const opts = [];
  for (let i = 1; i <= Math.min(Math.floor(p.price / 100), 10); i++)
    opts.push(`<option value="${i}">${i}x de R$ ${fmtM(p.price / i)}</option>`);

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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>`;

  backdrop.classList.add('open');
  backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };
  setTimeout(() => {
    updInst(p.price);
    bindGalleryEvents(p.images || []);
  }, 80);
  addSwipeToClose();
}

function addSwipeToClose() {
  setTimeout(() => {
    const modalEl = document.getElementById('modal-content');
    if (!modalEl) return;
    // Barra de swipe
    if (!modalEl.querySelector('.modal-swipe-bar')) {
      const bar = document.createElement('div');
      bar.className = 'modal-swipe-bar';
      modalEl.insertBefore(bar, modalEl.firstChild);
    }
    let startY = 0, startScrollTop = 0;
    modalEl.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
      startScrollTop = modalEl.scrollTop;
    }, { passive: true });
    modalEl.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0 && startScrollTop === 0) {
        modalEl.style.transform  = `translateY(${Math.min(dy * 0.5, 120)}px)`;
        modalEl.style.transition = 'none';
      }
    }, { passive: true });
    modalEl.addEventListener('touchend', e => {
      const dy = e.changedTouches[0].clientY - startY;
      modalEl.style.transition = 'transform 0.3s ease';
      if (dy > 100 && startScrollTop === 0) {
        modalEl.style.transform = 'translateY(100%)';
        setTimeout(() => { modalEl.style.transform = ''; modalEl.style.transition = ''; closeModal(); }, 280);
      } else {
        modalEl.style.transform = '';
      }
    }, { passive: true });
  }, 100);
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

async function closeModal() {
  document.getElementById('modal-backdrop')?.classList.remove('open');
  if (currentProductId) await removeReservation();
  currentProductId = null;
}

/* ══════════════════════════════════════
   RESERVAS
══════════════════════════════════════ */
async function createReservation(productId) {
  await supabase.from('reservations').delete().eq('session_id', SESSION_ID);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('reservations').insert({
    product_id: productId,
    session_id: SESSION_ID,
    expires_at: expiresAt
  });
}

async function removeReservation() {
  await supabase.from('reservations').delete().eq('session_id', SESSION_ID);
}

/* ══════════════════════════════════════
   FINALIZAR COMPRA
══════════════════════════════════════ */
async function submitPurchase() {
  if (!storeOpen) { closeModal(); return; }

  const name     = document.getElementById('f-name');
  const email    = document.getElementById('f-email');
  const parcelas = document.getElementById('f-parcelas');
  const entrega  = document.getElementById('f-entrega');
  let valid = true;

  const setErr = (rid, inp, show) => {
    document.getElementById(rid)?.classList.toggle('has-error', show);
    inp?.classList.toggle('error', show);
  };

  setErr('fr-name', name, !name?.value.trim());
  if (!name?.value.trim()) valid = false;
  const eOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.value.trim() || '');
  setErr('fr-email', email, !eOk);
  if (!eOk) valid = false;
  if (!valid) return;

  const btn = document.querySelector('.btn-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }

  try {
    // Verifica se produto ainda está disponível
    const { data: prod } = await supabase
      .from('products').select('id,name,price,sold').eq('id', currentProductId).single();

    if (prod.sold) {
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar compra'; }
      const idx = allProducts.findIndex(p => p.id === currentProductId);
      if (idx !== -1) allProducts[idx].sold = true;
      await removeReservation();
      closeModal();
      renderCatalog();
      updateHeaderStatus();
      alert('⚠️ Este produto foi adquirido por outro colaborador.');
      return;
    }

    const n            = parseInt(parcelas.value);
    const valorParcela = (prod.price / n).toFixed(2);

    // Marca como vendido
    const { error: soldErr } = await supabase
      .from('products')
      .update({ sold: true, sold_at: new Date().toISOString() })
      .eq('id', currentProductId)
      .eq('sold', false);

    if (soldErr) throw new Error(soldErr.message);

    // Cria o pedido
    const { error: orderErr } = await supabase.from('orders').insert({
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

    await removeReservation();

    const purchaseData = {
      nome: name.value.trim(), email: email.value.trim(),
      product_name: prod.name, product_price: prod.price,
      parcelas: n, valor_parcela: valorParcela, entrega: entrega.value
    };

    // Atualiza local imediatamente
    const idx = allProducts.findIndex(p => p.id === currentProductId);
    if (idx !== -1) { allProducts[idx].sold = true; allProducts[idx].reserved = false; }

    closeModal();
    renderCatalog();
    updateHeaderStatus();
    showSuccessPage(purchaseData);
    await loadProducts();

  } catch(err) {
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
           style="width:36px;height:36px;color:var(--success)"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <h2 style="font-size:1.8rem;font-weight:800;color:var(--white);text-align:center;margin-bottom:0.5rem">
      Compra registrada!
    </h2>
    <p style="color:var(--muted);text-align:center;font-size:14px;margin-bottom:1.5rem;max-width:400px">
      Obrigado, <strong style="color:var(--text)">${escHtml(order.nome)}</strong>.
      Seu pedido foi registrado e será descontado em folha.
    </p>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.25rem 1.5rem;max-width:420px;width:100%;margin-bottom:1.5rem;">
      <p style="font-size:12px;color:var(--muted);margin-bottom:0.2rem">Produto</p>
      <p style="font-weight:600;color:var(--white);margin-bottom:1rem">${escHtml(order.product_name)}</p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:0.2rem">Parcelamento</p>
      <p style="color:var(--purple-light);font-weight:600;margin-bottom:1rem">
        ${order.parcelas}x de R$ ${fmtM(order.valor_parcela)}
      </p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:0.2rem">Recebimento</p>
      <p style="color:var(--text)">${order.entrega === 'presencial' ? 'Presencialmente em Londrina' : 'Enviado via transportadora'}</p>
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
  stopRealtime();
  showPage('page-admin');
  currentUser = null;
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

  await renderAdminCategories(); // carrega categorias primeiro
  await Promise.all([renderAdminOrders(), renderAdminProducts(), renderAdminSettings()]);
  switchTab('orders');
}

async function adminLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  showPage('page-terms');
}

function switchTab(tab) {
  const tabs = ['orders', 'products', 'categories', 'settings'];
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', tabs[i] === tab));
  tabs.forEach(t => { document.getElementById('tab-'+t)?.classList.toggle('active', t === tab); });
  if (tab === 'orders')     renderAdminOrders();
  if (tab === 'products')   renderAdminProducts();
  if (tab === 'categories') renderAdminCategories();
  if (tab === 'settings')   renderAdminSettings();
}

/* ══════════════════════════════════════
   ADMIN — PEDIDOS
══════════════════════════════════════ */
async function renderAdminOrders() {
  const list = document.getElementById('orders-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Carregando...</p>';

  const { data, error } = await supabase
    .from('orders').select('*').order('created_at', { ascending: false });

  if (error) { list.innerHTML = `<p class="empty-state">Erro: ${escHtml(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = '<p class="empty-state">Nenhum pedido ainda.</p>'; return; }

  list.innerHTML = data.map(o =>
    `<div class="admin-card">
      <div class="order-row">
        <div class="order-info">
          <p><strong>${escHtml(o.nome)}</strong></p>
          <p class="small">${escHtml(o.email)}</p>
          <p style="margin-top:0.5rem;color:var(--purple-light);font-weight:600">${escHtml(o.product_name)}</p>
          <p class="small">R$ ${fmtM(o.product_price)} — ${o.parcelas}x de R$ ${fmtM(o.valor_parcela)}</p>
          <p class="small">Recebimento: ${o.entrega === 'presencial' ? 'Presencial' : 'Transportadora'}</p>
          <p class="small" style="color:var(--muted)">${new Date(o.created_at).toLocaleString('pt-BR')}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <span class="tag tag-green">Confirmado</span>
          <span class="tag ${o.entrega === 'presencial' ? 'tag-amber' : 'tag-blue'}">
            ${o.entrega === 'presencial' ? 'Presencial' : 'Correio'}
          </span>
          <button onclick="deleteOrder(${o.id}, ${o.product_id})"
            style="margin-top:4px;background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.25);
                   color:#e06060;font-family:Syne,sans-serif;font-weight:600;font-size:11px;
                   letter-spacing:0.08em;text-transform:uppercase;padding:0.3rem 0.7rem;
                   border-radius:6px;cursor:pointer;">
            Apagar
          </button>
        </div>
      </div>
    </div>`
  ).join('');
}

async function deleteOrder(orderId, productId) {
  if (!confirm('Apagar este pedido? O produto voltará a ficar disponível.')) return;
  try {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) throw new Error(error.message);
    if (productId) {
      await supabase.from('products').update({ sold: false, sold_at: null }).eq('id', productId);
    }
    await Promise.all([renderAdminOrders(), reloadAdminProducts()]);
  } catch(err) { alert('Erro: ' + err.message); }
}

async function clearOrders() {
  if (!confirm('Apagar TODOS os pedidos?')) return;
  try {
    const { error } = await supabase.from('orders').delete().neq('id', 0);
    if (error) throw new Error(error.message);
    await renderAdminOrders();
  } catch(err) { alert('Erro: ' + err.message); }
}

async function exportCSV() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) { alert('Erro: ' + error.message); return; }
  if (!data.length) { alert('Nenhum pedido para exportar.'); return; }
  const header = ['Data','Nome','E-mail','Produto','Valor Total','Parcelas','Valor Parcela','Recebimento'];
  const rows   = data.map(o => [
    new Date(o.created_at).toLocaleString('pt-BR'),
    o.nome, o.email, o.product_name,
    'R$ ' + fmtM(o.product_price), o.parcelas, 'R$ ' + fmtM(o.valor_parcela),
    o.entrega === 'presencial' ? 'Presencial' : 'Transportadora'
  ]);
  const csv = [header,...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'pedidos-garagesale.csv';
  a.click();
}

/* ══════════════════════════════════════
   ADMIN — PRODUTOS
══════════════════════════════════════ */
async function renderAdminProducts() {
  const list = document.getElementById('products-edit-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Carregando...</p>';

  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id,name), product_images(id,url,sort_order)')
    .order('created_at');

  if (error) { list.innerHTML = `<p class="empty-state">Erro: ${escHtml(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = '<p class="empty-state">Nenhum produto.</p>'; return; }

  const { data: freshCats } = await supabase.from('categories').select('id,name').order('sort_order');
  const cats = freshCats || [];

  list.innerHTML = data.map(p => {
    const imgs       = (p.product_images || []).sort((a,b) => a.sort_order - b.sort_order);
    const catOptions = cats.map(c => `<option value="${c.id}" ${p.category_id===c.id?'selected':''}>${escHtml(c.name)}</option>`).join('');
    const thumb      = imgs.length > 0
      ? `<img src="${escHtml(imgs[0].url)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;">`
      : `<div style="width:44px;height:44px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);flex-shrink:0;"></div>`;
    const statusTag  = p.sold ? '<span class="tag tag-amber">Vendido</span>' : '<span class="tag tag-green">Disponível</span>';
    const reativar   = p.sold ? `<button class="reset-btn" onclick="event.stopPropagation();reactivateProduct(${p.id})">Reativar</button>` : '';

    return `
      <div class="product-edit-card" id="pedit-${p.id}" style="padding:0;overflow:hidden;">
        <div onclick="toggleProductCard(${p.id})"
             style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
                    gap:0.5rem;padding:1rem 1.25rem;cursor:pointer;user-select:none;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            ${thumb}
            <div>
              <p style="font-family:Syne,sans-serif;font-weight:700;font-size:0.95rem;color:var(--white);">${escHtml(p.name)}</p>
              <p style="font-size:11px;color:var(--muted);margin-top:1px;">R$ ${fmtM(p.price)} · ${escHtml(p.categories?.name || 'Sem categoria')}</p>
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${statusTag}${reativar}
            <button class="btn-danger" style="margin-left:0;" onclick="event.stopPropagation();deleteProduct(${p.id})">Remover</button>
            <span id="arrow-${p.id}" style="color:var(--muted);font-size:1.1rem;transition:transform 0.2s;">▼</span>
          </div>
        </div>
        <div id="body-${p.id}" style="display:none;padding:0 1.25rem 1.25rem;border-top:1px solid var(--border);">
          <div style="height:0.75rem;"></div>
          <label>Nome do produto</label>
          <input type="text" value="${escHtml(p.name)}" id="pname-${p.id}">
          <label>Categoria</label>
          <select id="pcat-${p.id}"><option value="">Sem categoria</option>${catOptions}</select>
          <label>Descrição / avarias</label>
          <textarea rows="3" id="pdesc-${p.id}">${escHtml(p.description || '')}</textarea>
          <label>Preço (R$)</label>
          <input type="number" value="${p.price}" id="pprice-${p.id}" min="0" step="0.01">
          <label>Fotos atuais</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            ${imgs.map(img =>
              `<div style="position:relative;">
                 <img src="${escHtml(img.url)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">
                 <button onclick="deleteProductImage(${img.id},${p.id})"
                   style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;
                          background:var(--danger);border:none;color:white;cursor:pointer;font-size:12px;">✕</button>
               </div>`
            ).join('')}
          </div>
          <label>Adicionar foto</label>
          <input type="file" id="pfile-${p.id}" accept="image/jpeg,image/png,image/webp"
                 style="background:var(--input-bg);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:0.5rem;width:100%;">
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem;">
            <button class="btn-save" onclick="saveProduct(${p.id})">Salvar dados</button>
            <button class="btn-save" onclick="uploadProductImage(${p.id})">Enviar foto</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleProductCard(id) {
  const body  = document.getElementById('body-'  + id);
  const arrow = document.getElementById('arrow-' + id);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display    = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function saveProduct(id) {
  const btn = document.querySelector(`#pedit-${id} .btn-save`);
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    const { error } = await supabase.from('products').update({
      name:        document.getElementById(`pname-${id}`).value.trim(),
      category_id: document.getElementById(`pcat-${id}`).value || null,
      description: document.getElementById(`pdesc-${id}`).value.trim(),
      price:       parseFloat(document.getElementById(`pprice-${id}`).value) || 0,
      updated_at:  new Date().toISOString()
    }).eq('id', id);
    if (error) throw new Error(error.message);
    await reloadAdminProducts();
    await renderAdminProducts();
    const newBtn = document.querySelector(`#pedit-${id} .btn-save`);
    if (newBtn) { newBtn.textContent = '✅ Salvo!'; setTimeout(() => { newBtn.textContent = 'Salvar dados'; }, 2000); }
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar dados'; }
    alert('Erro: ' + err.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('Remover este produto?')) return;
  try {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await reloadAdminProducts();
    await renderAdminProducts();
  } catch(err) { alert('Erro: ' + err.message); }
}

async function reactivateProduct(id) {
  try {
    const { error } = await supabase.from('products').update({ sold: false, sold_at: null }).eq('id', id);
    if (error) throw new Error(error.message);
    await reloadAdminProducts();
    await renderAdminProducts();
  } catch(err) { alert('Erro: ' + err.message); }
}

async function addNewProduct() {
  try {
    const { data, error } = await supabase
      .from('products').insert({ name: 'Novo produto', price: 100, description: '' })
      .select().single();
    if (error) throw new Error(error.message);
    await reloadAdminProducts();
    await renderAdminProducts();
    const el = document.getElementById(`pedit-${data.id}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => toggleProductCard(data.id), 300); }
  } catch(err) { alert('Erro: ' + err.message); }
}

async function uploadProductImage(id) {
  const input = document.getElementById(`pfile-${id}`);
  if (!input?.files.length) { alert('Selecione uma imagem.'); return; }
  const file     = input.files[0];
  const fileName = `${id}/${Date.now()}-${file.name.replace(/\s/g,'_')}`;
  const { error: upErr } = await supabase.storage.from('product-images').upload(fileName, file, { upsert: false });
  if (upErr) { alert('Erro no upload: ' + upErr.message); return; }
  const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
  const { data: lastImg } = await supabase.from('product_images').select('sort_order')
    .eq('product_id', id).order('sort_order', { ascending: false }).limit(1);
  const nextOrder = lastImg?.length ? lastImg[0].sort_order + 1 : 0;
  const { error: dbErr } = await supabase.from('product_images')
    .insert({ product_id: id, url: urlData.publicUrl, sort_order: nextOrder });
  if (dbErr) { alert('Erro ao salvar imagem: ' + dbErr.message); return; }
  await reloadAdminProducts();
  await renderAdminProducts();
  alert('Foto enviada!');
}

async function deleteProductImage(imgId, productId) {
  if (!confirm('Remover esta foto?')) return;
  const { error } = await supabase.from('product_images').delete().eq('id', imgId);
  if (error) { alert('Erro: ' + error.message); return; }
  await reloadAdminProducts();
  await renderAdminProducts();
}

/* ══════════════════════════════════════
   ADMIN — CATEGORIAS
══════════════════════════════════════ */
async function renderAdminCategories() {
  const list = document.getElementById('categories-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const { data: cats, error } = await supabase.from('categories').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    allCategories = cats || [];
    const { data: prods } = await supabase.from('products').select('category_id');
    if (!cats.length) { list.innerHTML = '<p class="empty-state">Nenhuma categoria.</p>'; return; }
    list.innerHTML = cats.map((cat, i) => {
      const count = (prods||[]).filter(p => p.category_id === cat.id).length;
      const upDis = i === 0 ? 'disabled style="opacity:0.3;"' : '';
      const dnDis = i === cats.length-1 ? 'disabled style="opacity:0.3;"' : '';
      const ids   = JSON.stringify(cats.map(x => x.id));
      return '<div class="admin-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">' +
        '<div style="display:flex;align-items:center;gap:0.75rem;">' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            `<button onclick="moveCat(${cat.id},${i},-1,'${ids}')" ${upDis} style="background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:11px;">▲</button>` +
            `<button onclick="moveCat(${cat.id},${i},1,'${ids}')"  ${dnDis} style="background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:11px;">▼</button>` +
          '</div>' +
          '<div>' +
            `<p style="font-family:Syne,sans-serif;font-weight:700;color:var(--white);font-size:1rem;">${escHtml(cat.name)}</p>` +
            `<p style="font-size:12px;color:var(--muted);margin-top:2px;">${count} produto${count!==1?'s':''}</p>` +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
          `<input type="text" value="${escHtml(cat.name)}" id="cat-edit-${cat.id}" style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;padding:0.4rem 0.7rem;outline:none;width:160px;">` +
          `<button class="btn-save" style="margin-top:0;" onclick="renameCategory(${cat.id})">Renomear</button>` +
          `<button class="btn-danger" style="margin-left:0;" onclick="deleteCategory(${cat.id})">Remover</button>` +
        '</div>' +
      '</div>';
    }).join('');
  } catch(err) {
    list.innerHTML = '<p class="empty-state">Erro: ' + escHtml(err.message) + '</p>';
  }
}

async function saveNewCategory() {
  const input = document.getElementById('new-cat-name');
  const name  = input.value.trim();
  if (!name) { alert('Digite um nome.'); return; }
  try {
    const { data: last } = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const nextOrder = last?.length ? last[0].sort_order + 1 : 1;
    const { error } = await supabase.from('categories').insert({ name, sort_order: nextOrder });
    if (error) throw new Error(error.message);
    input.value = '';
    await renderAdminCategories();
  } catch(err) { alert('Erro: ' + err.message); }
}

async function renameCategory(id) {
  const newName = document.getElementById('cat-edit-' + id)?.value.trim();
  if (!newName) { alert('Nome não pode ser vazio.'); return; }
  try {
    const { error } = await supabase.from('categories').update({ name: newName }).eq('id', id);
    if (error) throw new Error(error.message);
    await renderAdminCategories();
    await reloadAdminProducts();
    await renderAdminProducts();
  } catch(err) { alert('Erro: ' + err.message); }
}

async function deleteCategory(id) {
  if (!confirm('Remover esta categoria? Produtos ficarão sem categoria.')) return;
  try {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await renderAdminCategories();
    await reloadAdminProducts();
    await renderAdminProducts();
  } catch(err) { alert('Erro: ' + err.message); }
}

async function moveCat(id, idx, dir, idsJson) {
  const ids = typeof idsJson === 'string' ? JSON.parse(idsJson) : idsJson;
  const t   = idx + dir;
  if (t < 0 || t >= ids.length) return;
  try {
    await Promise.all([
      supabase.from('categories').update({ sort_order: t   + 1 }).eq('id', ids[idx]),
      supabase.from('categories').update({ sort_order: idx + 1 }).eq('id', ids[t])
    ]);
    await renderAdminCategories();
  } catch(err) { alert('Erro ao reordenar: ' + err.message); }
}

/* ══════════════════════════════════════
   ADMIN — CONFIGURAÇÕES
══════════════════════════════════════ */
async function renderAdminSettings() {
  const list = document.getElementById('settings-content');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const { data, error } = await supabase
      .from('site_settings').select('value').eq('key', 'store_open').single();
    if (error) throw new Error(error.message);
    const isOpen = data.value === 'true';
    const statusTag = isOpen
      ? '<span class="tag tag-green" style="font-size:13px;padding:0.4rem 1rem;">🟢 Aberta</span>'
      : '<span class="tag tag-amber" style="font-size:13px;padding:0.4rem 1rem;">🔴 Fechada</span>';
    const openBtn = isOpen
      ? '<button class="btn-primary" disabled style="opacity:0.4;cursor:not-allowed;">🟢 Abrir loja</button>'
      : '<button class="btn-primary" onclick="toggleStore(true)">🟢 Abrir loja</button>';
    const closeBtn = isOpen
      ? '<button class="btn-danger" onclick="toggleStore(false)" style="margin-left:0;padding:0.9rem 2rem;border-radius:10px;font-size:14px;">🔴 Fechar loja</button>'
      : '<button class="btn-danger" disabled style="margin-left:0;padding:0.9rem 2rem;border-radius:10px;font-size:14px;opacity:0.4;cursor:not-allowed;">🔴 Fechar loja</button>';
    list.innerHTML =
      '<div class="admin-card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">' +
          '<div>' +
            '<p style="font-family:Syne,sans-serif;font-weight:700;font-size:1.1rem;color:var(--white);margin-bottom:0.3rem;">Status da loja</p>' +
            '<p style="font-size:13px;color:var(--muted);">Controla se os colaboradores podem comprar. O catálogo permanece visível.</p>' +
          '</div>' + statusTag +
        '</div>' +
        '<div style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;">' + openBtn + closeBtn + '</div>' +
        '<div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--border);">' +
          '<p style="font-size:12px;color:var(--muted);line-height:1.7;">' +
            '<strong style="color:var(--text);">Loja aberta:</strong> colaboradores podem comprar.<br>' +
            '<strong style="color:var(--text);">Loja fechada:</strong> catálogo visível mas botão Comprar desativado.' +
          '</p>' +
        '</div>' +
      '</div>';
  } catch(err) {
    list.innerHTML =
      '<div class="admin-card">' +
        '<p style="color:var(--danger);font-weight:600;margin-bottom:0.5rem;">⚠️ Tabela site_settings não encontrada</p>' +
        '<p style="font-size:13px;color:var(--muted);">Execute no Supabase SQL Editor:</p>' +
        '<pre style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-top:0.75rem;font-size:12px;color:var(--text);overflow-x:auto;white-space:pre-wrap;">' +
        'create table site_settings (\n  key text primary key,\n  value text not null\n);\ninsert into site_settings (key,value) values (\'store_open\',\'false\');\nalter table site_settings enable row level security;\ncreate policy "public read settings" on site_settings for select using (true);\ncreate policy "admin update settings" on site_settings for update using (auth.role() = \'authenticated\');' +
        '</pre>' +
      '</div>';
  }
}

async function toggleStore(open) {
  const { error } = await supabase.from('site_settings')
    .update({ value: open ? 'true' : 'false' }).eq('key', 'store_open');
  if (error) { alert('Erro: ' + error.message); return; }
  storeOpen = open;
  await renderAdminSettings();
  alert(open ? '✅ Loja aberta!' : '✅ Loja fechada!');
}

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtM(v) {
  return parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ══════════════════════════════════════
   EXPÕE TODAS AS FUNÇÕES PARA O HTML
   (necessário por causa do type="module")
══════════════════════════════════════ */
window.toggleTheme         = toggleTheme;
window.goToCatalog         = goToCatalog;
window.showAdmin           = showAdmin;
window.checkAdmin          = checkAdmin;
window.adminLogout         = adminLogout;
window.showPage            = showPage;
window.closeModal          = closeModal;
window.openModal           = openModal;
window.submitPurchase      = submitPurchase;
window.updInst             = updInst;
window.toggleMobileFilter  = toggleMobileFilter;
window.setFilter           = setFilter;
window.setFilterMobile     = setFilterMobile;
window.switchTab           = switchTab;
window.toggleProductCard   = toggleProductCard;
window.galleryNav          = galleryNav;
window.galleryGo           = galleryGo;
window.openZoom            = openZoom;
window.zoomNav             = (d) => {};
window.zoomGo              = (i) => {};
window.startRealtime       = startRealtime;
window.stopRealtime        = stopRealtime;
window.updateHeaderStatus  = updateHeaderStatus;
window.renderCatalog       = renderCatalog;
window.loadProducts        = loadProducts;
window.reloadAdminProducts = reloadAdminProducts;
window.renderAdminOrders   = renderAdminOrders;
window.renderAdminProducts = renderAdminProducts;
window.renderAdminCategories = renderAdminCategories;
window.renderAdminSettings = renderAdminSettings;
window.addNewProduct       = addNewProduct;
window.saveProduct         = saveProduct;
window.deleteProduct       = deleteProduct;
window.reactivateProduct   = reactivateProduct;
window.uploadProductImage  = uploadProductImage;
window.deleteProductImage  = deleteProductImage;
window.saveNewCategory     = saveNewCategory;
window.renameCategory      = renameCategory;
window.deleteCategory      = deleteCategory;
window.moveCat             = moveCat;
window.toggleStore         = toggleStore;
window.clearOrders         = clearOrders;
window.deleteOrder         = deleteOrder;
window.exportCSV           = exportCSV;
window.removeReservation   = removeReservation;
window.createReservation   = createReservation;
