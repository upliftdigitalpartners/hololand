import { CONFIG } from './config.js';
import { loadData } from './ai.js';
import { initSizer, resetSizer } from './size.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const img = (base, size = 'sm') => `assets/img/${base}-${size}.webp`;
export const money = (n) => `${CONFIG.currency}${n.toLocaleString('en-IN')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SIZES = { men: ['38', '40', '42', '44', '46'], women: ['S', 'M', 'L', 'XL'] };
const STORE_KEY = 'hololand.bag.v1';
const GIFT_KEY = 'hololand.gift.v1';

let products = [];
let byId = new Map();
let bag = [];
let giftNote = '';
let reviews = { reviews: {}, summaries: {} };
let filter = 'all';
let sort = 'featured';
let onGridChange = () => {};

function loadBag() {
  try { bag = JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { bag = []; }
  try { giftNote = localStorage.getItem(GIFT_KEY) || ''; } catch { giftNote = ''; }
  bag = bag.filter((l) => byId.has(l.id));
}
function saveBag() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(bag));
    localStorage.setItem(GIFT_KEY, giftNote);
  } catch { /* private mode */ }
}

/** Small product tile used by the stylist, photo match and gift finder. */
export function recHTML(p) {
  return `<button class="rec" data-rec="${p.id}" data-cursor="View"><img src="${img(p.images[0])}" alt="${esc(p.name)}" loading="lazy" /><div><strong>${esc(p.name)}</strong><span>${money(p.price)}</span></div></button>`;
}

const stars = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));
function ratingOf(id) {
  const list = reviews.reviews?.[id] || [];
  if (!list.length) return null;
  return { avg: list.reduce((a, r) => a + (+r.rating || 0), 0) / list.length, count: list.length };
}

export function toast(msg) {
  const t = $('[data-toast]');
  t.textContent = msg;
  t.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-visible'), 2200);
}

/* ---------------- Grid ---------------- */
function cardHTML(p, i) {
  const alt = p.images[1];
  const tag = p.tags.includes('premium') ? 'Premium' : p.tags.includes('wedding') ? 'Wedding edit' : p.cat === 'women' ? 'Winter knit' : '';
  return `
    <article class="card" data-id="${p.id}" style="--i:${i}">
      <div class="card__media arch" data-quick="${p.id}" data-cursor="View">
        ${tag ? `<span class="card__tag">${tag}</span>` : ''}
        <img src="${img(p.images[0])}" alt="${esc(p.name)}, ${esc(p.color.toLowerCase())} ${esc(p.type.toLowerCase())}" loading="lazy" />
        ${alt ? `<img class="alt" src="${img(alt)}" alt="" loading="lazy" />` : ''}
        <button class="btn card__add" data-quick="${p.id}"><span>Quick add +</span></button>
      </div>
      <div class="card__info">
        <div>
          <span class="mono">${p.code}</span>
          <h3>${esc(p.name)}</h3>
          <span class="card__color"><i class="swatch" style="background:${p.hex}"></i>${esc(p.color)}</span>
          ${ratingOf(p.id) ? `<span class="card__rating">${stars(ratingOf(p.id).avg)} <small>(${ratingOf(p.id).count})</small></span>` : ''}
        </div>
        <span class="card__price">${money(p.price)}</span>
      </div>
    </article>`;
}

function renderGrid() {
  let list = products.filter((p) => filter === 'all' || p.cat === filter);
  if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
  if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
  const grid = $('[data-grid]');
  grid.innerHTML = list.map(cardHTML).join('');
  onGridChange(grid);
}

export function setFilter(f) {
  filter = f;
  $$('[data-tabs] button').forEach((b) => b.classList.toggle('is-active', b.dataset.filter === f));
  renderGrid();
}

/* ---------------- Quick view ---------------- */
let current = null;
let currentSize = null;

export function openQuickView(id) {
  const p = byId.get(id);
  if (!p) return;
  current = p;
  currentSize = null;
  const m = $('[data-modal]');
  $('[data-qv-img]', m).src = img(p.images[0], 'lg');
  $('[data-qv-img]', m).alt = `${p.name}, ${p.color} ${p.type}`;
  $('[data-qv-code]', m).textContent = `${p.code} · ${p.type}`;
  $('[data-qv-name]', m).textContent = p.name;
  $('[data-qv-price]', m).textContent = money(p.price);
  $('[data-qv-desc]', m).textContent = p.desc;
  $('[data-qv-lang]', m).hidden = !p.desc_bn;
  $$('[data-lang]', m).forEach((b) => b.classList.toggle('is-active', b.dataset.lang === 'en'));
  $('[data-qv-fabric]', m).textContent = `${p.color} · ${p.fabric}`;
  $('[data-qv-swatch]', m).style.background = p.hex;
  $('[data-qv-thumbs]', m).innerHTML = p.images.length > 1
    ? p.images.map((b, i) => `<button class="${i ? '' : 'is-active'}" data-thumb="${b}" aria-label="Image ${i + 1}"><img src="${img(b)}" alt="" /></button>`).join('')
    : '';
  $('[data-qv-sizes]', m).innerHTML = SIZES[p.cat].map((s) => `<button data-size="${s}">${s}</button>`).join('');
  resetSizer(p);
  renderReviews(p);
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  window.lenis?.stop();
  setTimeout(() => $('.modal__close', m).focus({ preventScroll: true }), 50);
}

function renderReviews(p) {
  const box = $('[data-qv-reviews]');
  const list = reviews.reviews?.[p.id] || [];
  const sum = reviews.summaries?.[p.id];
  if (!list.length && !sum) { box.hidden = true; return; }
  const r = ratingOf(p.id);
  box.hidden = false;
  box.innerHTML = `
    <div class="reviews__head"><span class="mono">What customers say</span>${r ? `<span class="reviews__stars">${stars(r.avg)} <small>${r.avg.toFixed(1)} · ${r.count} review${r.count > 1 ? 's' : ''}</small></span>` : ''}</div>
    ${sum ? `<p class="reviews__summary">${esc(sum.summary_en || '')}</p>${sum.summary_bn ? `<p class="reviews__summary bn">${esc(sum.summary_bn)}</p>` : ''}
      <div class="reviews__chips">${(sum.pros || []).map((x) => `<span class="chip chip--pro">+ ${esc(x)}</span>`).join('')}${(sum.cons || []).map((x) => `<span class="chip chip--con">− ${esc(x)}</span>`).join('')}${sum.fit ? `<span class="chip">Fit: ${esc(sum.fit)}</span>` : ''}</div>
      <small class="reviews__ai">✦ Summarised by AI from ${r ? r.count : 'customer'} reviews</small>` : ''}
    ${list.slice(0, 3).map((x) => `<blockquote><span>${stars(+x.rating || 0)}</span> “${esc(x.text)}” <cite>${esc(x.name || 'Customer')}</cite></blockquote>`).join('')}`;
}

/** Selects a size button in the open quick view (used by the size advisor). */
export function selectSize(size) {
  const btn = $(`[data-qv-sizes] [data-size="${size}"]`);
  if (!btn) return;
  currentSize = size;
  $$('[data-size]').forEach((b) => b.classList.toggle('is-active', b === btn));
}

export function setGiftNote(text) {
  giftNote = (text || '').trim();
  saveBag();
  renderBag();
}

function closeQuickView() {
  const m = $('[data-modal]');
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
  window.lenis?.start();
}

/* ---------------- Bag ---------------- */
export function addToBag(id, size, qty = 1) {
  const line = bag.find((l) => l.id === id && l.size === size);
  if (line) line.qty += qty; else bag.push({ id, size, qty });
  saveBag();
  renderBag();
  const p = byId.get(id);
  toast(`${p.name} (${size}) added to bag`);
}

function bagTotal() { return bag.reduce((s, l) => s + byId.get(l.id).price * l.qty, 0); }

function renderBag() {
  const count = bag.reduce((s, l) => s + l.qty, 0);
  const badge = $('[data-bag-count]');
  badge.textContent = count;
  badge.classList.toggle('has-items', count > 0);
  $('[data-bag-total]').textContent = money(bagTotal());
  $('[data-checkout]').disabled = !count;
  $('[data-gift-note]').hidden = !giftNote;
  $('[data-gift-note-text]').textContent = giftNote;
  $('[data-bag-items]').innerHTML = count ? bag.map((l, i) => {
    const p = byId.get(l.id);
    return `
      <div class="line-item">
        <img src="${img(p.images[0])}" alt="" />
        <div>
          <strong>${esc(p.name)}</strong>
          <small>${p.code} · Size ${esc(l.size)}</small><br />
          <div class="qty"><button data-qty="${i}" data-d="-1" aria-label="Decrease">−</button><span>${l.qty}</span><button data-qty="${i}" data-d="1" aria-label="Increase">+</button></div>
        </div>
        <div class="line-item__price">${money(p.price * l.qty)}<button class="line-item__remove" data-remove="${i}">Remove</button></div>
      </div>`;
  }).join('') : '<p class="drawer__empty">Your bag is empty.<br />Find something you love ✦</p>';
}

export function openBag() {
  const d = $('[data-drawer]');
  d.classList.add('is-open');
  d.setAttribute('aria-hidden', 'false');
  window.lenis?.stop();
}
function closeBag() {
  const d = $('[data-drawer]');
  d.classList.remove('is-open');
  d.setAttribute('aria-hidden', 'true');
  window.lenis?.start();
}

function checkout() {
  if (!bag.length) return;
  const lines = bag.map((l) => {
    const p = byId.get(l.id);
    return `• ${p.code} ${p.name} (Size ${l.size}) × ${l.qty} = ${money(p.price * l.qty)}`;
  });
  const gift = giftNote ? `\n\n🎁 This is a gift. Please include this card:\n"${giftNote}"` : '';
  const text = `Assalamu alaikum Hololand! I'd like to order:\n\n${lines.join('\n')}\n\nSubtotal: ${money(bagTotal())}${gift}\n\nName:\nPhone:\nDelivery address:`;
  window.open(`https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/* ---------------- Init ---------------- */
export function initShop(list, { onRender } = {}) {
  products = list;
  byId = new Map(list.map((p) => [p.id, p]));
  onGridChange = onRender || onGridChange;
  loadBag();
  renderGrid();
  renderBag();
  initSizer(selectSize);
  loadData('reviews').then((r) => { reviews = { reviews: {}, summaries: {}, ...r }; if (Object.keys(reviews.reviews).length) renderGrid(); });

  $$('[data-tabs] button').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  $('[data-sort]').addEventListener('change', (e) => { sort = e.target.value; renderGrid(); });

  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { e.preventDefault(); openQuickView(q.dataset.quick); return; }
    if (e.target.closest('[data-close-modal]')) closeQuickView();
    if (e.target.closest('[data-open-bag]')) openBag();
    if (e.target.closest('[data-close-bag]')) closeBag();

    const size = e.target.closest('[data-size]');
    if (size) {
      currentSize = size.dataset.size;
      $$('[data-size]').forEach((b) => b.classList.toggle('is-active', b === size));
    }
    const thumb = e.target.closest('[data-thumb]');
    if (thumb) {
      $('[data-qv-img]').src = img(thumb.dataset.thumb, 'lg');
      $$('[data-thumb]').forEach((b) => b.classList.toggle('is-active', b === thumb));
    }
    const qty = e.target.closest('[data-qty]');
    if (qty) {
      const l = bag[+qty.dataset.qty];
      l.qty += +qty.dataset.d;
      if (l.qty < 1) bag.splice(+qty.dataset.qty, 1);
      saveBag(); renderBag();
    }
    const lang = e.target.closest('[data-lang]');
    if (lang && current) {
      $('[data-qv-desc]').textContent = lang.dataset.lang === 'bn' ? current.desc_bn : current.desc;
      $$('[data-lang]').forEach((b) => b.classList.toggle('is-active', b === lang));
    }
    if (e.target.closest('[data-gift-note-clear]')) setGiftNote('');
    const rm = e.target.closest('[data-remove]');
    if (rm) { bag.splice(+rm.dataset.remove, 1); saveBag(); renderBag(); }
  });

  $('[data-qv-add]').addEventListener('click', () => {
    if (!current) return;
    if (!currentSize) {
      toast('Please pick a size');
      $('[data-qv-sizes]').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
      return;
    }
    addToBag(current.id, currentSize);
    closeQuickView();
    setTimeout(openBag, 350);
  });
  $('[data-checkout]').addEventListener('click', checkout);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('[data-modal]').classList.contains('is-open')) closeQuickView();
    if ($('[data-drawer]').classList.contains('is-open')) closeBag();
  });
}
