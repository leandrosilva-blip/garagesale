/* ══════════════════════════════════════
   GARAGE SALE — GOLFLEET
   script.js — consome a API REST
══════════════════════════════════════ */

const supabase = createClient(
  'https://mupajexrxmsvyadjvrht.supabase.co/rest/v1/',   // ← Settings → API → Project URL
  'sb_publishable_N4bOCHs1zbd4rPqqEy0hUw_kQpNET98'       // ← Settings → API → anon public key
)

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
   HTTP HELPERS
══════════════════════════════════════ */
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(API + path, { ...options, headers });

  // Token expirado — desloga
  if (res.status === 401 && authToken) {
    authToken = null;
    sessionStorage.removeItem('gs_token');
    showAdmin();
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

/* ══════════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════════ */
let currentProductId = null;

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function goToCatalog() {
  showPage('page-catalog');
  activeFilter = null;
  await Promise.all([loadCategories(), loadProducts()]);
}

function updateHeaderStatus(products) {
  const avail = (products || []).filter(p => !p.sold).length;
  const el = document.getElementById('header-status');
  if (document.getElementById('page-catalog').classList.contains('active')) {
    el.textContent = avail + ' disponível' + (avail !== 1 ? 'is' : '');
  } else {
    el.textContent = '';
  }
}

/* ══════════════════════════════════════
   FILTER
══════════════════════════════════════ */
let activeFilter    = null;
let allProducts     = [];
let allCategories   = [];
let mobileFilterOpen = false;

async function loadCategories() {
  try {
    allCategories = await apiFetch('/categories');
    renderFilterBar();
    renderMobileFilter();
  } catch (e) {
    console.error('Erro ao carregar categorias:', e);
  }
}

async function loadProducts() {
  try {
    allProducts = await apiFetch('/products');
    renderCatalog();
    updateHeaderStatus(allProducts);
  } catch (e) {
    console.error('Erro ao carregar produtos:', e);
    document.getElementById('products-area').innerHTML =
      '<p class="empty-state">Erro ao carregar produtos. Tente recarregar a página.</p>';
  }
}

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
  if (lbl) lbl.textContent = activeFilter === null
    ? 'Todos'
    : (allCategories.find(c => c.id === activeFilter)?.name || 'Todos');
}

function toggleMobileFilter() {
  mobileFilterOpen = !mobileFilterOpen;
  document.getElementById('filter-mobile-dropdown').classList.toggle('open', mobileFilterOpen);
  document.getElementById('filter-mobile-btn').classList.toggle('open', mobileFilterOpen);
}

function setFilterMobile(catId, name) {
  activeFilter = catId === 'null' ? null : parseInt(catId);
  mobileFilterOpen = false;
  document.getElementById('filter-mobile-dropdown').classList.remove('open');
  document.getElementById('filter-mobile-btn').classList.remove('open');
  document.getElementById('filter-mobile-label').textContent = name;
  renderMobileFilter();
  renderCatalog();
}

function setFilter(catId) {
  activeFilter = catId === 'null' || catId === null ? null : parseInt(catId);
  renderFilterBar();
  renderCatalog();
}

/* ══════════════════════════════════════
   CATALOG RENDER
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

  // Agrupa por categoria
  const grouped = {};
  const orderedCats = activeFilter === null
    ? allCategories
    : allCategories.filter(c => c.id === activeFilter);

  orderedCats.forEach(c => { grouped[c.id] = { name: c.name, items: [] }; });
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
}

function imgSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
}

/* ══════════════════════════════════════
   MODAL
══════════════════════════════════════ */
function openModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  currentProductId = id;

  const backdrop = document.getElementById('modal-backdrop');
  const content  = document.getElementById('modal-content');

  const imgHtml = p.images && p.images.length > 0
    ? `<div class="modal-img"><img src="${escHtml(p.images[0])}" alt="${escHtml(p.name)}"></div>` : '';

  const thumbs = p.images && p.images.length > 1
    ? `<div class="imgs-row">${p.images.slice(1).map(u => `<img class="img-thumb" src="${escHtml(u)}" alt="">`).join('')}</div>` : '';

  const opts = [];
  for (let i = 1; i <= Math.min(Math.floor(p.price / 100), 10); i++)
    opts.push(`<option value="${i}">${i}x de R$ ${fmtM(p.price / i)}</option>`);

  if (p.sold) {
    content.innerHTML = `
      ${imgHtml}
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
      ${imgHtml}
      ${thumbs ? `<div style="padding:0.75rem 1.75rem 0">${thumbs}</div>` : ''}
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
            <p class="installment-info" id="installment-info">Parcela de R$ ${fmtM(p.price)} na folha</p>
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
    setTimeout(() => updInst(p.price), 10);
  }

  backdrop.classList.add('open');
  backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };
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
   PURCHASE
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

  // Desabilita botão para evitar duplo clique
  const btn = document.querySelector('.btn-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }

  try {
    const result = await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({
        product_id: currentProductId,
        nome:       name.value.trim(),
        email:      email.value.trim(),
        parcelas:   parseInt(parcelas.value),
        entrega:    entrega.value
      })
    });

    closeModal();

    // Atualiza produto localmente como vendido (sem recarregar tudo)
    const idx = allProducts.findIndex(p => p.id === currentProductId);
    if (idx !== -1) allProducts[idx].sold = true;
    renderCatalog();
    updateHeaderStatus(allProducts);

    showSuccessPage(result.order);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar compra'; }
    if (err.message.includes('já foi vendido')) {
      // Atualiza estado local e mostra como vendido
      const idx = allProducts.findIndex(p => p.id === currentProductId);
      if (idx !== -1) allProducts[idx].sold = true;
      openModal(currentProductId);
    } else {
      alert('Erro: ' + err.message);
    }
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
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.25rem 1.5rem;max-width:420px;width:100%;margin-bottom:1.5rem;">
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
    <button class="btn-primary" style="margin-top:1.5rem"
            onclick="this.parentElement.remove();">
      Ver outros produtos
    </button>`;
  document.body.appendChild(wrap);
}

/* ══════════════════════════════════════
   ADMIN — LOGIN
══════════════════════════════════════ */
function showAdmin() {
  showPage('page-admin');
  currentUser = null;
  document.getElementById('admin-auth').style.display = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-pw').value = '';
  document.getElementById('admin-login-input').value = '';
  document.getElementById('pw-error').style.display = 'none';
}

async function checkAdmin() {
  const login = document.getElementById('admin-login-input').value.trim();
  const pw    = document.getElementById('admin-pw').value;

  try {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password: pw })
    });

    authToken   = result.token;
    currentUser = result.user;
    sessionStorage.setItem('gs_token', authToken);

    document.getElementById('admin-auth').style.display  = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('admin-user-badge').textContent =
      currentUser.name + (currentUser.role === 'viewer' ? ' · Visualização' : ' · Admin');

    const tabs = document.querySelectorAll('.tab-btn');
    [1, 2, 3].forEach(i => tabs[i].style.display = currentUser.role === 'viewer' ? 'none' : '');

    await renderAdminOrders();
    if (currentUser.role !== 'viewer') {
      await renderAdminProducts();
      await renderAdminCategories();
      await renderAdminUsers();
    }
    switchTab('orders');
  } catch (err) {
    document.getElementById('pw-error').style.display = 'block';
  }
}

function switchTab(tab) {
  const tabs = ['orders', 'products', 'categories', 'users'];
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', tabs[i] === tab));
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  if (tab === 'users')      renderAdminUsers();
  if (tab === 'categories') renderAdminCategories();
}

/* ══════════════════════════════════════
   ADMIN — ORDERS
══════════════════════════════════════ */
async function renderAdminOrders() {
  const list = document.getElementById('orders-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const orders = await apiFetch('/orders');
    if (!orders.length) {
      list.innerHTML = '<p class="empty-state">Nenhum pedido registrado ainda.</p>';
      return;
    }
    list.innerHTML = orders.map(o => `
      <div class="admin-card">
        <div class="order-row">
          <div class="order-info">
            <p><strong>${escHtml(o.nome)}</strong></p>
            <p class="small">${escHtml(o.email)}</p>
            <p style="margin-top:0.5rem;color:var(--purple-light);font-weight:600">${escHtml(o.product_name)}</p>
            <p class="small">R$ ${fmtM(o.product_price)} — ${o.parcelas}x de R$ ${fmtM(o.valor_parcela)}</p>
            <p class="small">Recebimento: ${o.entrega === 'presencial' ? 'Presencial' : 'Transportadora'}</p>
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
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Erro ao carregar pedidos: ${escHtml(err.message)}</p>`;
  }
}

async function clearOrders() {
  if (!confirm('Apagar TODOS os pedidos?')) return;
  try {
    await apiFetch('/orders', { method: 'DELETE' });
    renderAdminOrders();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function exportCSV() {
  try {
    const orders = await apiFetch('/orders');
    if (!orders.length) { alert('Nenhum pedido para exportar.'); return; }
    const header = ['Data','Nome','E-mail','Produto','Valor Total','Parcelas','Valor Parcela','Recebimento'];
    const rows   = orders.map(o => [
      new Date(o.created_at).toLocaleString('pt-BR'),
      o.nome, o.email, o.product_name,
      'R$ ' + fmtM(o.product_price),
      o.parcelas, 'R$ ' + fmtM(o.valor_parcela),
      o.entrega === 'presencial' ? 'Presencial' : 'Transportadora'
    ]);
    const csv = [header, ...rows].map(r =>
      r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'pedidos-garagesale.csv';
    a.click();
  } catch (err) {
    alert('Erro ao exportar: ' + err.message);
  }
}

/* ══════════════════════════════════════
   ADMIN — PRODUCTS
══════════════════════════════════════ */
async function renderAdminProducts() {
  const list = document.getElementById('products-edit-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const products = await apiFetch('/products');
    if (!products.length) { list.innerHTML = '<p class="empty-state">Nenhum produto.</p>'; return; }

    const catOptions = allCategories.map(c =>
      `<option value="${c.id}">${escHtml(c.name)}</option>`
    ).join('');

    list.innerHTML = products.map(p => `
      <div class="product-edit-card" id="pedit-${p.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
          <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;color:var(--white)">${escHtml(p.name)}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${p.sold ? '<span class="tag tag-amber">Vendido</span>' : '<span class="tag tag-green">Disponível</span>'}
            ${p.sold ? `<button class="reset-btn" onclick="reactivateProduct(${p.id})">Reativar</button>` : ''}
            <button class="btn-danger" onclick="deleteProduct(${p.id})">Remover</button>
          </div>
        </div>
        <label>Nome do produto</label>
        <input type="text" value="${escHtml(p.name)}" id="pname-${p.id}">
        <label>Categoria</label>
        <select id="pcat-${p.id}">
          <option value="">Sem categoria</option>
          ${allCategories.map(c =>
            `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`
          ).join('')}
        </select>
        <label>Descrição / avarias</label>
        <textarea rows="3" id="pdesc-${p.id}">${escHtml(p.description)}</textarea>
        <label>Preço (R$)</label>
        <input type="number" value="${p.price}" id="pprice-${p.id}" min="0" step="0.01">
        <label>Fotos do produto</label>
        <div id="pimgs-${p.id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          ${(p.images || []).map((url, i) =>
            `<div style="position:relative;">
               <img src="${escHtml(url)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">
             </div>`
          ).join('')}
        </div>
        <input type="file" id="pfile-${p.id}" accept="image/jpeg,image/png,image/webp"
               style="background:var(--input-bg);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:0.5rem;width:100%;">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem;">
          <button class="btn-save" onclick="saveProduct(${p.id})">Salvar dados</button>
          <button class="btn-save" onclick="uploadProductImage(${p.id})">Enviar foto</button>
        </div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Erro: ${escHtml(err.message)}</p>`;
  }
}

async function saveProduct(id) {
  try {
    await apiFetch(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name:        document.getElementById(`pname-${id}`).value.trim(),
        category_id: document.getElementById(`pcat-${id}`).value || null,
        description: document.getElementById(`pdesc-${id}`).value.trim(),
        price:       parseFloat(document.getElementById(`pprice-${id}`).value) || 0
      })
    });
    await loadProducts();
    await renderAdminProducts();
    alert('Produto salvo!');
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function uploadProductImage(id) {
  const input = document.getElementById(`pfile-${id}`);
  if (!input.files.length) { alert('Selecione uma imagem.'); return; }

  const formData = new FormData();
  formData.append('image', input.files[0]);

  try {
    const res = await fetch(`${API}/products/${id}/images`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body:    formData
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    await loadProducts();
    await renderAdminProducts();
    alert('Foto enviada!');
  } catch (err) {
    alert('Erro ao enviar foto: ' + err.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('Remover este produto?')) return;
  try {
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    await loadProducts();
    await renderAdminProducts();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function reactivateProduct(id) {
  try {
    await apiFetch(`/products/${id}/sold`, {
      method: 'PATCH',
      body: JSON.stringify({ sold: false })
    });
    await loadProducts();
    await renderAdminProducts();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function addNewProduct() {
  try {
    const p = await apiFetch('/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'Novo produto', price: 100 })
    });
    await loadProducts();
    await renderAdminProducts();
    const el = document.getElementById(`pedit-${p.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

/* ══════════════════════════════════════
   ADMIN — CATEGORIES
══════════════════════════════════════ */
async function renderAdminCategories() {
  const list = document.getElementById('categories-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const cats = await apiFetch('/categories');
    allCategories = cats;

    if (!cats.length) { list.innerHTML = '<p class="empty-state">Nenhuma categoria.</p>'; return; }

    const products = await apiFetch('/products');

    list.innerHTML = cats.map((c, i) => {
      const count = products.filter(p => p.category_id === c.id).length;
      return `
        <div class="admin-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <button onclick="moveCat(${i}, -1)" ${i === 0 ? 'disabled' : ''}
                style="background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:11px;${i === 0 ? 'opacity:0.3;' : ''}">▲</button>
              <button onclick="moveCat(${i}, 1)"  ${i === cats.length-1 ? 'disabled' : ''}
                style="background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:11px;${i === cats.length-1 ? 'opacity:0.3;' : ''}">▼</button>
            </div>
            <div>
              <p style="font-family:'Syne',sans-serif;font-weight:700;color:var(--white);font-size:1rem;">${escHtml(c.name)}</p>
              <p style="font-size:12px;color:var(--muted);margin-top:2px;">${count} produto${count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <input type="text" value="${escHtml(c.name)}" id="cat-edit-${c.id}"
              style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;padding:0.4rem 0.7rem;outline:none;width:160px;">
            <button class="btn-save" style="margin-top:0;" onclick="renameCategory(${c.id})">Renomear</button>
            <button class="btn-danger" style="margin-left:0;" onclick="deleteCategory(${c.id})">Remover</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Erro: ${escHtml(err.message)}</p>`;
  }
}

async function saveNewCategory() {
  const input = document.getElementById('new-cat-name');
  const name  = input.value.trim();
  if (!name) { alert('Digite um nome.'); return; }
  try {
    await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    await renderAdminCategories();
    await loadCategories();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function renameCategory(id) {
  const newName = document.getElementById(`cat-edit-${id}`).value.trim();
  if (!newName) { alert('Nome não pode ser vazio.'); return; }
  try {
    await apiFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name: newName }) });
    await renderAdminCategories();
    await loadCategories();
    await loadProducts();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function deleteCategory(id) {
  if (!confirm('Remover esta categoria? Produtos ficarão sem categoria.')) return;
  try {
    await apiFetch(`/categories/${id}`, { method: 'DELETE' });
    await renderAdminCategories();
    await loadCategories();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function moveCat(idx, dir) {
  const cats = allCategories;
  const t    = idx + dir;
  if (t < 0 || t >= cats.length) return;
  const ids = cats.map(c => c.id);
  [ids[idx], ids[t]] = [ids[t], ids[idx]];
  try {
    await apiFetch('/categories/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) });
    await renderAdminCategories();
    await loadCategories();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

/* ══════════════════════════════════════
   ADMIN — USERS
══════════════════════════════════════ */
async function renderAdminUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const users = await apiFetch('/auth/users');
    list.innerHTML = users.map(u => `
      <div class="product-edit-card" style="margin-bottom:1rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">
          <div>
            <p style="font-family:'Syne',sans-serif;font-weight:700;color:var(--white);font-size:1rem;">${escHtml(u.name)}</p>
            <p style="font-size:12px;color:var(--muted);margin-top:2px;">
              Login: <strong style="color:var(--purple-light)">${escHtml(u.login)}</strong>
            </p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="tag ${u.role === 'admin' ? 'tag-purple' : 'tag-amber'}">
              ${u.role === 'admin' ? 'Admin' : 'Visualização'}
            </span>
            ${u.is_root ? '<span class="tag tag-green">Raiz</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin:0;">Acesso:</label>
          <select onchange="changeUserRole(${u.id}, this.value)"
            style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;padding:0.4rem 0.7rem;outline:none;"
            ${u.is_root ? 'disabled' : ''}>
            <option value="admin"  ${u.role === 'admin'  ? 'selected' : ''}>Administrador completo</option>
            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Somente visualização</option>
          </select>
          <button class="btn-save" style="margin-top:0;" onclick="changeUserPassword(${u.id})">Alterar senha</button>
          ${!u.is_root
            ? `<button class="btn-danger" style="margin-left:0;" onclick="deleteUser(${u.id})">Remover</button>`
            : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Erro: ${escHtml(err.message)}</p>`;
  }
}

function showAddUserForm() {
  const f = document.getElementById('add-user-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  ['new-user-name', 'new-user-login', 'new-user-pw'].forEach(id =>
    document.getElementById(id).value = '');
}

async function saveNewUser() {
  const name  = document.getElementById('new-user-name').value.trim();
  const login = document.getElementById('new-user-login').value.trim();
  const pw    = document.getElementById('new-user-pw').value;
  const role  = document.getElementById('new-user-role').value;
  if (!name || !login || !pw) { alert('Preencha todos os campos.'); return; }
  try {
    await apiFetch('/auth/users', {
      method: 'POST',
      body: JSON.stringify({ name, login, password: pw, role })
    });
    document.getElementById('add-user-form').style.display = 'none';
    renderAdminUsers();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function changeUserPassword(id) {
  const pw = prompt('Nova senha (mínimo 6 caracteres):');
  if (!pw) return;
  try {
    await apiFetch(`/auth/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password: pw })
    });
    alert('Senha alterada!');
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function changeUserRole(id, role) {
  try {
    await apiFetch(`/auth/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
  } catch (err) {
    alert('Erro: ' + err.message);
    renderAdminUsers();
  }
}

async function deleteUser(id) {
  if (!confirm('Remover este usuário?')) return;
  try {
    await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
    renderAdminUsers();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
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
