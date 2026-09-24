import { CONFIG } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const urlIn = $('[data-url]'), tokenIn = $('[data-token]');
try {
  urlIn.value = sessionStorage.getItem('hl.url') || CONFIG.stylistEndpoint || '';
  tokenIn.value = sessionStorage.getItem('hl.token') || '';
} catch { urlIn.value = CONFIG.stylistEndpoint || ''; }
const remember = () => { try { sessionStorage.setItem('hl.url', urlIn.value.trim()); sessionStorage.setItem('hl.token', tokenIn.value); } catch { /* ignore */ } };
urlIn.addEventListener('change', remember);
tokenIn.addEventListener('change', remember);

function toast(msg) {
  const t = $('[data-toast]');
  t.textContent = msg; t.classList.add('is-visible');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('is-visible'), 2000);
}
function status(el, msg, kind = '') { el.textContent = msg; el.className = `status ${kind}`; }

async function api(path, body) {
  const base = urlIn.value.trim().replace(/\/$/, '');
  if (!base) throw new Error('Add your Worker URL first.');
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': tokenIn.value },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Wrong or missing admin token.');
  if (res.status === 403) throw new Error('This page’s address isn’t allowed by the Worker. Check SITE_URL / ALLOWED_ORIGINS.');
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- data ---------- */
const catalog = await fetch('assets/data/products.json').then((r) => r.json());
const reviewsDoc = await fetch('assets/data/reviews.json').then((r) => r.json()).catch(() => ({ reviews: {}, summaries: {} }));
reviewsDoc.reviews ||= {}; reviewsDoc.summaries ||= {};
const products = catalog.products;
const options = products.map((p) => `<option value="${p.id}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
$('[data-copy-product]').innerHTML = `<option value="__all">All products (one by one)</option>${options}`;
$('[data-rev-product]').innerHTML = options;

/* ---------- tabs + connection ---------- */
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
  $$('[data-tab-pane]').forEach((p) => p.classList.toggle('is-active', p.dataset.tabPane === b.dataset.tab));
}));
$('[data-tab-pane="copy"]').classList.add('is-active');

$('[data-test]').addEventListener('click', async () => {
  const el = $('[data-conn-status]');
  remember();
  try {
    const base = urlIn.value.trim().replace(/\/$/, '');
    const info = await fetch(base).then((r) => r.json());
    if (!info.groqKey) return status(el, 'Worker reached, but GROQ_API_KEY is not set.', 'err');
    if (!info.adminTools) return status(el, 'Worker reached, but ADMIN_TOKEN is not set, so admin tools are off.', 'err');
    status(el, `Connected ✓ Groq key found, admin tools on${info.siteUrl ? `, site: ${info.siteUrl}` : ''}.`, 'ok');
  } catch { status(el, 'Could not reach the Worker. Check the URL.', 'err'); }
});

/* ---------- copy generator ---------- */
const generated = {};
const field = (label, text) => `<div class="field"><b>${label}<button data-copy-text="${esc(text)}">Copy</button></b><div>${esc(text)}</div></div>`;

function renderCopy(p, c) {
  return `<div class="out-card"><img src="assets/img/${p.images[0]}-sm.webp" alt="" /><div>
    <p class="mono">${esc(p.code)} · ${esc(p.name)}</p>
    ${field('Description (EN)', c.desc_en)}${field('Description (বাংলা)', c.desc_bn)}
    ${field('SEO title', c.seo_title)}${field('SEO description', c.seo_description)}
    ${field('Facebook post', c.facebook)}${field('Instagram caption', `${c.instagram}\n\n${(c.hashtags || []).join(' ')}`)}
  </div></div>`;
}

$('[data-copy-go]').addEventListener('click', async () => {
  const el = $('[data-copy-status]'), out = $('[data-copy-out]');
  const sel = $('[data-copy-product]').value;
  const list = sel === '__all' ? products : products.filter((p) => p.id === sel);
  out.innerHTML = '';
  for (const [i, p] of list.entries()) {
    status(el, `Writing ${p.code} (${i + 1}/${list.length})…`);
    try {
      const c = await api('/copy', { product_id: p.id, tone: $('[data-copy-tone]').value });
      generated[p.id] = c;
      out.insertAdjacentHTML('beforeend', renderCopy(p, c));
    } catch (err) { status(el, err.message, 'err'); return; }
  }
  status(el, `Done ✓ ${list.length} product${list.length > 1 ? 's' : ''}. Download products.json to use the new descriptions on the site.`, 'ok');
  $('[data-copy-download]').disabled = false;
});

$('[data-copy-download]').addEventListener('click', () => {
  const updated = { ...catalog, products: products.map((p) => generated[p.id] ? { ...p, desc: generated[p.id].desc_en || p.desc, desc_bn: generated[p.id].desc_bn || p.desc_bn } : p) };
  download('products.json', updated);
  toast('Upload it to assets/data/ on GitHub');
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy-text]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copyText); toast('Copied'); } catch { toast('Select and copy manually'); }
});

/* ---------- review summarizer ---------- */
function showExisting() {
  const id = $('[data-rev-product]').value;
  const n = (reviewsDoc.reviews[id] || []).length;
  $('[data-rev-existing]').textContent = n ? `${n} review${n > 1 ? 's' : ''} already saved for this product. New ones are added to them.` : 'No reviews saved yet for this product.';
  const s = reviewsDoc.summaries[id];
  $('[data-rev-out]').innerHTML = s ? summaryCard(id, s) : '';
}
$('[data-rev-product]').addEventListener('change', showExisting);
showExisting();

function parseReviews(text) {
  const today = new Date().toISOString().slice(0, 10);
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split('|').map((s) => s.trim());
    if (parts.length >= 3) return { name: parts[0], rating: Math.min(5, Math.max(1, +parts[1] || 5)), text: parts.slice(2).join(' | '), date: today };
    if (parts.length === 2 && +parts[0]) return { name: '', rating: +parts[0], text: parts[1], date: today };
    return { name: '', rating: 5, text: l, date: today };
  });
}

function summaryCard(id, s) {
  const p = products.find((x) => x.id === id);
  return `<div class="out-card"><img src="assets/img/${p.images[0]}-sm.webp" alt="" /><div>
    <p class="mono">${esc(p.code)} · ${s.count} reviews · ${s.rating}★</p>
    ${field('Summary (EN)', s.summary_en)}${field('Summary (বাংলা)', s.summary_bn || '')}
    ${field('Pros', (s.pros || []).join(', '))}${field('Cons', (s.cons || []).join(', ') || '(none)')}${field('Fit', s.fit || '(unknown)')}
  </div></div>`;
}

$('[data-rev-go]').addEventListener('click', async () => {
  const el = $('[data-rev-status]');
  const id = $('[data-rev-product]').value;
  const fresh = parseReviews($('[data-rev-text]').value);
  const all = [...(reviewsDoc.reviews[id] || []), ...fresh];
  if (!all.length) return status(el, 'Paste at least one review.', 'err');
  status(el, 'Summarising…');
  try {
    const s = await api('/summarize', { product_id: id, reviews: all });
    const rating = +(all.reduce((a, r) => a + r.rating, 0) / all.length).toFixed(1);
    reviewsDoc.reviews[id] = all;
    reviewsDoc.summaries[id] = { summary_en: s.summary_en, summary_bn: s.summary_bn, pros: s.pros || [], cons: s.cons || [], fit: s.fit || '', rating, count: all.length };
    $('[data-rev-text]').value = '';
    $('[data-rev-out]').innerHTML = summaryCard(id, reviewsDoc.summaries[id]);
    showExisting();
    status(el, 'Done ✓ Summarise more products, then download reviews.json once.', 'ok');
    $('[data-rev-download]').disabled = false;
  } catch (err) { status(el, err.message, 'err'); }
});

$('[data-rev-download]').addEventListener('click', () => {
  download('reviews.json', reviewsDoc);
  toast('Upload it to assets/data/ on GitHub');
});
