import { CONFIG } from './config.js';

// Refuse to run inside another site's frame (clickjacking).
if (window.top !== window.self) { document.body.innerHTML = ''; throw new Error('framed'); }

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = CONFIG.stylistEndpoint.replace(/\/$/, '');
const FILES = { products: 'assets/data/products.json', faq: 'assets/data/faq.json', content: 'assets/data/content.json', reviews: 'assets/data/reviews.json' };

const state = { products: null, faq: null, content: null, reviews: null };
const dirty = new Set();
const pending = new Map(); // image base name -> { lg, sm (base64), preview (data URL) }
let token = null;

/* ---------------- helpers ---------------- */
function toast(msg, ms = 2600) {
  const t = $('[data-toast]');
  t.textContent = msg; t.classList.add('is-visible');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('is-visible'), ms);
}
function status(el, msg, kind = '') { el.textContent = msg; el.className = `status ${kind}`; }
function notice(html) { const n = $('[data-notice]'); n.innerHTML = html; n.hidden = !html; }

async function api(path, body) {
  if (!API) throw new Error('No Worker address in assets/js/config.js (stylistEndpoint).');
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/admin/login') { logout('Your session expired. Please sign in again.'); throw new Error('Signed out'); }
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function markDirty(key) {
  dirty.add(key);
  const n = dirty.size + [...pending.keys()].filter(isImageUsed).length;
  const btn = $('[data-publish]');
  btn.disabled = false;
  btn.innerHTML = `<span>Publish</span> <b>${n}</b>`;
}
function resetDirty() {
  dirty.clear();
  const btn = $('[data-publish]');
  btn.disabled = true;
  btn.innerHTML = '<span>Publish</span>';
}
const isImageUsed = (base) => state.products?.products.some((p) => p.images.includes(base));
const imgSrc = (base) => pending.get(base)?.preview || `assets/img/${base}-sm.webp`;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

/* ---------------- login ---------------- */
function showApp() { $('[data-login]').hidden = true; $('[data-app]').hidden = false; }
function logout(msg) {
  token = null;
  try { sessionStorage.removeItem('hl.admin'); } catch { /* ignore */ }
  $('[data-app]').hidden = true; $('[data-login]').hidden = false;
  if (msg) status($('[data-login-status]'), msg, 'err');
}

$('[data-login-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('[data-login-status]');
  status(el, 'Signing in…');
  try {
    const { token: t, expires } = await api('/admin/login', { password: e.target.elements.password.value });
    token = t;
    try { sessionStorage.setItem('hl.admin', JSON.stringify({ token: t, expires })); } catch { /* ignore */ }
    e.target.reset();
    status(el, '');
    await start();
  } catch (err) { status(el, err.message, 'err'); }
});
$('[data-logout]').addEventListener('click', () => {
  if (dirty.size && !confirm('You have unpublished changes. Log out anyway?')) return;
  logout();
});

/* ---------------- load ---------------- */
async function start() {
  showApp();
  notice('');
  let files = {};
  try {
    ({ files } = await api('/admin/load', { paths: Object.values(FILES) }));
  } catch (err) {
    if (err.message === 'Signed out') return;
    notice(`⚠️ ${esc(err.message)}<br>Showing the live site's data instead. You can edit, but <strong>Publish</strong> won't work until this is fixed.`);
  }
  for (const [key, path] of Object.entries(FILES)) {
    const text = files[path] ?? await fetch(`${path}?t=${Date.now()}`).then((r) => r.text()).catch(() => '{}');
    try { state[key] = JSON.parse(text); } catch { state[key] = {}; }
  }
  state.faq.faq ||= [];
  state.reviews.reviews ||= {}; state.reviews.summaries ||= {};
  state.content.settings ||= {}; state.content.texts ||= {};
  resetDirty();
  renderProducts(); renderTexts(); renderFaq(); renderReviewsTab();
}

/* ---------------- tabs ---------------- */
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
  $$('[data-tab-pane]').forEach((p) => p.classList.toggle('is-active', p.dataset.tabPane === b.dataset.tab));
}));

/* ---------------- products list ---------------- */
function renderProducts() {
  const q = $('[data-search]').value.trim().toLowerCase();
  const cat = $('[data-cat-filter]').value;
  const list = state.products.products.filter((p) => (!cat || p.cat === cat) && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q)));
  $('[data-plist]').innerHTML = list.map((p) => `
    <div class="prow ${p.hidden ? 'is-hidden' : ''}" data-id="${esc(p.id)}">
      <img src="${esc(imgSrc(p.images[0]))}" alt="" loading="lazy" />
      <div class="prow__name"><strong>${esc(p.name)}</strong><span>${esc(p.code)} · ${p.cat === 'men' ? 'Panjabi' : 'Knitwear'}${p.hidden ? ' · hidden' : ''}</span></div>
      <label class="prow__price">৳<input type="number" min="1" value="${esc(p.price)}" data-price aria-label="Price" /></label>
      <label class="check"><input type="checkbox" data-shown ${p.hidden ? '' : 'checked'} /> Shown</label>
      <button class="btn btn--ghost btn--sm" data-edit><span>Edit</span></button>
    </div>`).join('') || '<p class="hint">No products match.</p>';
}
$('[data-search]').addEventListener('input', renderProducts);
$('[data-cat-filter]').addEventListener('change', renderProducts);
$('[data-plist]').addEventListener('change', (e) => {
  const row = e.target.closest('[data-id]');
  const p = state.products.products.find((x) => x.id === row.dataset.id);
  if (e.target.matches('[data-price]')) { const v = Math.round(+e.target.value); if (v > 0) { p.price = v; markDirty('products'); } }
  if (e.target.matches('[data-shown]')) { p.hidden = !e.target.checked || undefined; if (!p.hidden) delete p.hidden; markDirty('products'); renderProducts(); }
});
$('[data-plist]').addEventListener('click', (e) => {
  if (e.target.closest('[data-edit]')) openEditor(e.target.closest('[data-id]').dataset.id);
});
$('[data-new-product]').addEventListener('click', () => openEditor(null));

/* ---------------- product editor ---------------- */
let editing = null;   // product object being edited
let isNew = false;
const form = $('[data-editor-form]');
const F = (k) => form.elements[k];

function openEditor(id) {
  isNew = !id;
  editing = id ? state.products.products.find((p) => p.id === id)
    : { id: '', code: '', name: '', cat: 'men', type: 'Panjabi', price: 0, color: '', hex: '#6b1b24', images: [], fabric: '', tags: [], desc: '' };
  $('[data-editor-title]').textContent = isNew ? 'New product' : `Edit ${editing.code}`;
  for (const k of ['name', 'code', 'price', 'cat', 'type', 'color', 'hex', 'fabric', 'desc', 'desc_bn']) F(k).value = editing[k] ?? '';
  F('tags').value = (editing.tags || []).join(', ');
  F('hide').checked = !!editing.hidden;
  F('code').readOnly = !isNew;
  $('[data-social-out]').hidden = true;
  $('[data-delete-product]').hidden = isNew;
  renderPhotos();
  $('[data-editor]').hidden = false;
  F('name').focus();
}
function closeEditor() { $('[data-editor]').hidden = true; editing = null; }
$$('[data-close-editor]').forEach((b) => b.addEventListener('click', () => {
  if (isNew && editing && !editing.id) { closeEditor(); return; } // discard unsaved new product
  closeEditor();
}));

function renderPhotos() {
  $('[data-photos]').innerHTML = editing.images.map((b, i) => `
    <div class="photo"><img src="${esc(imgSrc(b))}" alt="" />
      <div class="photo__btns">
        <button type="button" data-move="${i}" data-d="-1" aria-label="Move left" ${i ? '' : 'disabled'}>◀</button>
        <button type="button" data-remove-photo="${i}" aria-label="Remove">✕</button>
        <button type="button" data-move="${i}" data-d="1" aria-label="Move right" ${i < editing.images.length - 1 ? '' : 'disabled'}>▶</button>
      </div></div>`).join('') || '<p class="hint">No photos yet.</p>';
}
$('[data-photos]').addEventListener('click', (e) => {
  const mv = e.target.closest('[data-move]');
  if (mv) {
    const i = +mv.dataset.move, j = i + +mv.dataset.d;
    [editing.images[i], editing.images[j]] = [editing.images[j], editing.images[i]];
    renderPhotos(); if (!isNew) markDirty('products');
  }
  const rm = e.target.closest('[data-remove-photo]');
  if (rm) { editing.images.splice(+rm.dataset.removePhoto, 1); renderPhotos(); if (!isNew) markDirty('products'); }
});

async function toWebp(file, width) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const landscape = bmp.width > bmp.height;
  const scale = Math.min(1, landscape ? (width * 1.5) / bmp.height : width / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.8));
  if (!blob || blob.type !== 'image/webp') throw new Error('This browser can’t create WebP images. Please use Chrome, Edge or Firefox.');
  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return { dataUrl, b64: dataUrl.split(',')[1] };
}

$('[data-photo-upload]').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const prefix = slug(F('code').value || editing.id || 'item') || 'item';
  for (const file of files) {
    toast(`Processing ${file.name}…`);
    try {
      const lg = await toWebp(file, 1100), sm = await toWebp(file, 520);
      const base = `${prefix}-${Date.now().toString(36)}`;
      pending.set(base, { lg: lg.b64, sm: sm.b64, preview: sm.dataUrl });
      editing.images.push(base);
      renderPhotos();
      if (!isNew) markDirty('products');
    } catch (err) { toast(err.message, 5000); }
  }
});

function readForm() {
  const p = editing;
  p.name = F('name').value.trim();
  p.code = F('code').value.trim().toUpperCase();
  p.price = Math.round(+F('price').value);
  p.cat = F('cat').value;
  p.type = F('type').value.trim() || (p.cat === 'men' ? 'Panjabi' : 'Knitwear');
  p.color = F('color').value.trim();
  p.hex = F('hex').value;
  p.fabric = F('fabric').value.trim();
  p.tags = F('tags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  p.desc = F('desc').value.trim();
  const bn = F('desc_bn').value.trim();
  if (bn) p.desc_bn = bn; else delete p.desc_bn;
  if (F('hide').checked) p.hidden = true; else delete p.hidden;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  readForm();
  if (!editing.images.length) { toast('Add at least one photo'); return; }
  if (isNew) {
    editing.id = slug(editing.code) || slug(editing.name);
    if (!editing.id) { toast('Add a code'); return; }
    if (state.products.products.some((p) => p.id === editing.id)) { toast(`A product with code ${editing.code} already exists`); return; }
    state.products.products.unshift(editing);
  }
  markDirty('products');
  closeEditor();
  renderProducts(); renderReviewsTab();
  toast('Saved. Click Publish when you’re ready.');
});

$('[data-delete-product]').addEventListener('click', () => {
  if (!confirm(`Delete ${editing.name}? This removes it from the website after you publish.`)) return;
  state.products.products = state.products.products.filter((p) => p !== editing);
  markDirty('products');
  closeEditor(); renderProducts(); renderReviewsTab();
});

const field = (label, text) => `<div class="field"><b>${label}<button type="button" data-copy="${esc(text)}">Copy</button></b><div>${esc(text)}</div></div>`;
$('[data-ai-copy]').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  readForm();
  btn.disabled = true; btn.querySelector('span').textContent = '✦ Writing…';
  try {
    const c = await api('/copy', { product: editing, tone: 'elegant, modern, warm' });
    if (c.desc_en) F('desc').value = c.desc_en;
    if (c.desc_bn) F('desc_bn').value = c.desc_bn;
    const out = $('[data-social-out]');
    out.innerHTML = field('SEO title', c.seo_title || '') + field('SEO description', c.seo_description || '') + field('Facebook post', c.facebook || '') + field('Instagram caption', `${c.instagram || ''}\n\n${(c.hashtags || []).join(' ')}`);
    out.hidden = false;
    toast('Descriptions filled in. Check them, then click Done.');
  } catch (err) { toast(err.message, 5000); }
  btn.disabled = false; btn.querySelector('span').textContent = '✦ Write descriptions & social posts with AI';
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch { toast('Select and copy manually'); }
});

/* ---------------- texts & settings ---------------- */
const TEXT_FIELDS = [
  { group: 'Announcement bar', help: 'A thin orange bar at the very top of the site. Leave empty to hide it.', fields: [['settings.announcement', 'Announcement', 'e.g. Eid sale: 15% off all panjabis this week']] },
  { group: 'Contact & store', fields: [
    ['settings.whatsappNumber', 'WhatsApp number (orders go here)', '8801XXXXXXXXX'],
    ['settings.deliveryNote', 'Delivery / payment note'],
    ['settings.store.address', 'Store address'],
    ['settings.store.hours', 'Opening hours', 'e.g. Sat–Thu 11am–9pm'],
    ['settings.store.mapUrl', 'Google Maps link', 'https://maps.app.goo.gl/…'],
  ] },
  { group: 'Social links', fields: [['settings.socials.facebook', 'Facebook'], ['settings.socials.instagram', 'Instagram'], ['settings.socials.tiktok', 'TikTok']] },
  { group: 'Homepage', fields: [
    ['texts.hero.eyebrow', 'Hero: small line above the title'],
    ['texts.hero.line1', 'Hero: title line 1'],
    ['texts.hero.line2', 'Hero: title line 2 (orange italic)'],
    ['texts.hero.sub', 'Hero: subtitle', '', true],
    ['texts.collections.men', 'Men’s collection card text', '', true],
    ['texts.collections.women', 'Women’s collection card text', '', true],
  ] },
  { group: 'Our story', fields: [
    ['texts.story.text', 'Story paragraph', '', true],
    ['texts.story.stat1', 'Stat 1 label (number = product count, automatic)'],
    ['texts.story.stat2Number', 'Stat 2 number'], ['texts.story.stat2', 'Stat 2 label'],
    ['texts.story.stat3Number', 'Stat 3 number (shown with %)'], ['texts.story.stat3', 'Stat 3 label'],
  ] },
];
// 'texts.hero.sub' → state.content.texts['hero.sub']; 'settings.store.address' → nested
function getVal(path) {
  if (path.startsWith('texts.')) return state.content.texts[path.slice(6)] ?? '';
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), state.content) ?? '';
}
function setVal(path, v) {
  if (path.startsWith('texts.')) { state.content.texts[path.slice(6)] = v; return; }
  const keys = path.split('.');
  let o = state.content;
  for (const k of keys.slice(0, -1)) o = o[k] ||= {};
  o[keys.at(-1)] = v;
}
function renderTexts() {
  $('[data-texts]').innerHTML = TEXT_FIELDS.map((g) => `
    <div class="fgroup"><h3>${g.group}</h3>${g.help ? `<p>${g.help}</p>` : ''}
      ${g.fields.map(([path, label, ph = '', long]) => `<label class="f"><span>${label}</span>${long
        ? `<textarea rows="3" data-path="${path}" placeholder="${esc(ph)}">${esc(getVal(path))}</textarea>`
        : `<input data-path="${path}" value="${esc(getVal(path))}" placeholder="${esc(ph)}" />`}</label>`).join('')}
    </div>`).join('');
}
$('[data-texts]').addEventListener('input', (e) => {
  const path = e.target.dataset.path;
  if (!path) return;
  setVal(path, e.target.value);
  markDirty('content');
});

/* ---------------- FAQ ---------------- */
function renderFaq() {
  $('[data-faq-list]').innerHTML = state.faq.faq.map((f, i) => `
    <div class="faqcard" data-i="${i}">
      <div class="faqcard__head"><span class="mono">Question ${i + 1}</span><button class="link-btn danger" data-faq-del>Delete</button></div>
      <div class="grid2">
        <label class="f"><span>Question (English)</span><input data-k="q" value="${esc(f.q)}" /></label>
        <label class="f"><span>Question (বাংলা)</span><input class="bn" data-k="q_bn" value="${esc(f.q_bn)}" /></label>
        <label class="f"><span>Answer (English)</span><textarea rows="3" data-k="a">${esc(f.a)}</textarea></label>
        <label class="f"><span>Answer (বাংলা)</span><textarea rows="3" class="bn" data-k="a_bn">${esc(f.a_bn)}</textarea></label>
      </div>
      <label class="f"><span>Keywords (comma separated, English + Bangla)</span><input data-k="keywords" value="${esc((f.keywords || []).join(', '))}" /></label>
    </div>`).join('');
}
$('[data-faq-list]').addEventListener('input', (e) => {
  const card = e.target.closest('[data-i]');
  const f = state.faq.faq[+card.dataset.i];
  const k = e.target.dataset.k;
  f[k] = k === 'keywords' ? e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : e.target.value;
  markDirty('faq');
});
$('[data-faq-list]').addEventListener('click', (e) => {
  if (!e.target.closest('[data-faq-del]')) return;
  const i = +e.target.closest('[data-i]').dataset.i;
  if (!confirm('Delete this question?')) return;
  state.faq.faq.splice(i, 1); markDirty('faq'); renderFaq();
});
$('[data-faq-add]').addEventListener('click', () => {
  state.faq.faq.push({ id: `q-${Date.now().toString(36)}`, q: '', a: '', q_bn: '', a_bn: '', keywords: [] });
  markDirty('faq'); renderFaq();
  $$('.faqcard').at(-1).querySelector('input').focus();
});

/* ---------------- reviews ---------------- */
function renderReviewsTab() {
  const sel = $('[data-rev-product]');
  const cur = sel.value;
  sel.innerHTML = state.products.products.map((p) => `<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
  if (cur) sel.value = cur;
  showReviews();
}
function showReviews() {
  const id = $('[data-rev-product]').value;
  const list = state.reviews.reviews[id] || [];
  const s = state.reviews.summaries[id];
  $('[data-rev-existing]').textContent = list.length ? `${list.length} review${list.length > 1 ? 's' : ''} saved for this product. New ones are added to them.` : 'No reviews yet for this product.';
  $('[data-rev-out]').innerHTML = s ? `<div class="revcard"><strong>${s.rating}★ · ${s.count} reviews</strong><span>${esc(s.summary_en)}</span><span class="bn">${esc(s.summary_bn || '')}</span><span>+ ${esc((s.pros || []).join(', '))}${s.cons?.length ? ` · − ${esc(s.cons.join(', '))}` : ''}${s.fit ? ` · Fit: ${esc(s.fit)}` : ''}</span></div>` : '';
}
$('[data-rev-product]').addEventListener('change', showReviews);
function parseReviews(text) {
  const today = new Date().toISOString().slice(0, 10);
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split('|').map((s) => s.trim());
    if (parts.length >= 3) return { name: parts[0], rating: Math.min(5, Math.max(1, +parts[1] || 5)), text: parts.slice(2).join(' | '), date: today };
    if (parts.length === 2 && +parts[0]) return { name: '', rating: Math.min(5, Math.max(1, +parts[0])), text: parts[1], date: today };
    return { name: '', rating: 5, text: l, date: today };
  });
}
$('[data-rev-go]').addEventListener('click', async () => {
  const el = $('[data-rev-status]');
  const id = $('[data-rev-product]').value;
  const all = [...(state.reviews.reviews[id] || []), ...parseReviews($('[data-rev-text]').value)];
  if (!all.length) return status(el, 'Paste at least one review.', 'err');
  status(el, 'Summarising…');
  try {
    const s = await api('/summarize', { reviews: all });
    state.reviews.reviews[id] = all;
    state.reviews.summaries[id] = { summary_en: s.summary_en, summary_bn: s.summary_bn, pros: s.pros || [], cons: s.cons || [], fit: s.fit || '', rating: +(all.reduce((a, r) => a + r.rating, 0) / all.length).toFixed(1), count: all.length };
    $('[data-rev-text]').value = '';
    markDirty('reviews'); showReviews();
    status(el, 'Saved ✓ Click Publish to show it on the site.', 'ok');
  } catch (err) { status(el, err.message, 'err'); }
});
$('[data-rev-clear]').addEventListener('click', () => {
  const id = $('[data-rev-product]').value;
  if (!state.reviews.reviews[id] && !state.reviews.summaries[id]) return;
  if (!confirm('Remove all reviews and the summary for this product?')) return;
  delete state.reviews.reviews[id]; delete state.reviews.summaries[id];
  markDirty('reviews'); showReviews();
});

/* ---------------- publish ---------------- */
$('[data-publish]').addEventListener('click', async () => {
  const btn = $('[data-publish]');
  const files = [...dirty].map((k) => ({ path: FILES[k], content: JSON.stringify(state[k], null, 2) + '\n' }));
  const newImages = [...pending.entries()].filter(([base, v]) => !v.published && isImageUsed(base));
  for (const [base, v] of newImages) {
    files.push({ path: `assets/img/${base}-lg.webp`, content: v.lg, encoding: 'base64' });
    files.push({ path: `assets/img/${base}-sm.webp`, content: v.sm, encoding: 'base64' });
  }
  if (!files.length) return;
  btn.disabled = true; btn.innerHTML = '<span>Publishing…</span>';
  try {
    const what = [...dirty].join(', ') + (newImages.length ? `${dirty.size ? ', ' : ''}${newImages.length} photo(s)` : '');
    const res = await api('/admin/publish', { files, message: `Admin: update ${what}` });
    newImages.forEach(([, v]) => { v.published = true; v.lg = v.sm = null; });
    resetDirty();
    notice(`✓ Published. The website updates in about a minute. <a class="link-btn" href="${esc(res.url)}" target="_blank" rel="noopener">See the change on GitHub ↗</a>`);
    toast('Published ✓ Live in about a minute');
  } catch (err) {
    btn.disabled = false; btn.innerHTML = '<span>Publish</span>';
    if (err.message !== 'Signed out') notice(`⚠️ Publish failed: ${esc(err.message)}`);
  }
});

window.addEventListener('beforeunload', (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- resume session ---------------- */
try {
  const saved = JSON.parse(sessionStorage.getItem('hl.admin') || 'null');
  if (saved && saved.expires > Date.now()) { token = saved.token; start(); }
} catch { /* ignore */ }
