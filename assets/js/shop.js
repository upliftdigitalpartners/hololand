// Store module shared by every page: product cards, quick view, bag and WhatsApp checkout.
import { CONFIG } from './config.js';
import { loadData } from './ai.js';
import { createSizer } from './size.js';
import { track } from './track.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const img = (base, size = 'sm') => `assets/img/${String(base).replace(/[^a-z0-9-]/gi, '')}-${size}.webp`;
export const money = (n) => `${CONFIG.currency}${n.toLocaleString('en-IN')}`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const productUrl = (id) => `product.html?id=${encodeURIComponent(id)}`;
/** Only allow #rrggbb colours into style attributes. */
export const safeHex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : '#888888');
const safeImg = (b) => String(b).replace(/[^a-z0-9-]/gi, '');

const STORE_KEY = 'hololand.bag.v1';
const GIFT_KEY = 'hololand.gift.v1';

let products = [];
let byId = new Map();
let bag = [];
let giftNote = '';
let reviews = { reviews: {}, summaries: {} };
export const reviewsReady = loadData('reviews').then((r) => { reviews = { reviews: {}, summaries: {}, ...r }; });

export const getProduct = (id) => byId.get(id);

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

export function toast(msg) {
  const t = $('[data-toast]');
  t.textContent = msg;
  t.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-visible'), 2200);
}

/* ---------------- Reviews ---------------- */
export const stars = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));
export function ratingOf(id) {
  const list = reviews.reviews?.[id] || [];
  if (!list.length) return null;
  return { avg: list.reduce((a, r) => a + (+r.rating || 0), 0) / list.length, count: list.length };
}
export function renderReviews(box, p, { max = 3 } = {}) {
  const list = reviews.reviews?.[p.id] || [];
  const sum = reviews.summaries?.[p.id];
  if (!list.length && !sum) { box.hidden = true; return; }
  const r = ratingOf(p.id);
  box.hidden = false;
  box.innerHTML = `
    <div class="reviews__head"><span class="mono">What customers say</span>${r ? `<span class="reviews__stars">${stars(r.avg)} <small>${r.avg.toFixed(1)} · ${r.count} review${r.count > 1 ? 's' : ''}</small></span>` : ''}</div>
    ${sum ? `<p class="reviews__summary">${esc(sum.summary_en || '')}</p>${sum.summary_bn ? `<p class="reviews__summary bn">${esc(sum.summary_bn)}</p>` : ''}
      <div class="reviews__chips">${(sum.pros || []).map((x) => `<span class="chip chip--pro">+ ${esc(x)}</span>`).join('')}${(sum.cons || []).map((x) => `<span class="chip chip--con">− ${esc(x)}</span>`).join('')}${sum.fit ? `<span class="chip">Fit: ${esc(sum.fit)}</span>` : ''}</div>
      <small class="reviews__ai">Summary of ${r ? r.count : 'customer'} customer reviews</small>` : ''}
    ${list.slice(0, max).map((x) => `<blockquote><span>${stars(+x.rating || 0)}</span> “${esc(x.text)}” <cite>${esc(x.name || 'Customer')}</cite></blockquote>`).join('')}`;
}

/* ---------------- Cards ---------------- */
export function cardHTML(p, i = 0) {
  const alt = p.images[1];
  const tag = p.tags.includes('premium') ? 'Premium' : p.tags.includes('wedding') ? 'Wedding edit' : p.cat === 'women' ? 'Winter knit' : '';
  const r = ratingOf(p.id);
  return `
    <article class="card" data-id="${p.id}" style="--i:${i}">
      <div class="card__frame">
        <a class="card__media arch" href="${productUrl(p.id)}" data-cursor="View" aria-label="${esc(p.name)}">
          ${tag ? `<span class="card__tag">${tag}</span>` : ''}
          <img src="${img(p.images[0])}" alt="${esc(p.name)}, ${esc(p.color.toLowerCase())} ${esc(p.type.toLowerCase())}" loading="lazy" />
          ${alt ? `<img class="alt" src="${img(alt)}" alt="" loading="lazy" />` : ''}
        </a>
        <button class="btn card__add" data-quick="${p.id}"><span>Quick add +</span></button>
      </div>
      <a class="card__info" href="${productUrl(p.id)}">
        <div>
          <span class="mono">${esc(p.code)}</span>
          <h3>${esc(p.name)}</h3>
          <span class="card__color"><i class="swatch" style="background:${safeHex(p.hex)}"></i>${esc(p.color)}</span>
          ${r ? `<span class="card__rating">${stars(r.avg)} <small>(${r.count})</small></span>` : ''}
        </div>
        <span class="card__price">${money(p.price)}</span>
      </a>
    </article>`;
}

/** Small product tile used by the stylist, photo match and gift finder. */
export function recHTML(p) {
  return `<button class="rec" data-rec="${p.id}" data-cursor="View"><img src="${img(p.images[0])}" alt="${esc(p.name)}" loading="lazy" /><div><strong>${esc(p.name)}</strong><span>${money(p.price)}</span></div></button>`;
}

/* ---------------- Quick view ---------------- */
let current = null;
let qvSizer = null;

export function openQuickView(id) {
  const p = byId.get(id);
  if (!p) return;
  current = p;
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
  $('[data-qv-swatch]', m).style.background = safeHex(p.hex);
  $('[data-qv-link]', m).href = productUrl(p.id);
  $('[data-qv-thumbs]', m).innerHTML = p.images.length > 1
    ? p.images.map((b, i) => `<button class="${i ? '' : 'is-active'}" data-thumb="${safeImg(b)}" aria-label="Image ${i + 1}"><img src="${img(b)}" alt="" /></button>`).join('')
    : '';
  qvSizer.setProduct(p);
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  window.lenis?.stop();
  setTimeout(() => $('.modal__close', m).focus({ preventScroll: true }), 50);
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
  toast(`${byId.get(id).name} (${size}) added to bag`);
  track('bag', { product: id });
}

export function setGiftNote(text) {
  giftNote = (text || '').trim();
  saveBag();
  renderBag();
}

function bagTotal() { return bag.reduce((s, l) => s + byId.get(l.id).price * l.qty, 0); }

function renderBag() {
  const count = bag.reduce((s, l) => s + l.qty, 0);
  const badge = $('[data-bag-count]');
  badge.textContent = count;
  badge.classList.toggle('has-items', count > 0);
  $('[data-bag-total]').textContent = money(bagTotal());
  $('[data-checkout]').disabled = !count;
  $('[data-checkout-wa]').hidden = !count;
  $('[data-gift-note]').hidden = !giftNote;
  $('[data-gift-note-text]').textContent = giftNote;
  $('[data-bag-items]').innerHTML = count ? bag.map((l, i) => {
    const p = byId.get(l.id);
    return `
      <div class="line-item">
        <a href="${productUrl(p.id)}"><img src="${img(p.images[0])}" alt="" /></a>
        <div>
          <strong>${esc(p.name)}</strong>
          <small>${esc(p.code)} · Size ${esc(l.size)}</small><br />
          <div class="qty"><button data-qty="${i}" data-d="-1" aria-label="Decrease">−</button><span>${l.qty}</span><button data-qty="${i}" data-d="1" aria-label="Increase">+</button></div>
        </div>
        <div class="line-item__price">${money(p.price * l.qty)}<button class="line-item__remove" data-remove="${i}">Remove</button></div>
      </div>`;
  }).join('') : '<p class="drawer__empty">Your bag is empty.<br /><a class="link-btn" href="shop.html">Start shopping →</a></p>';
}

export function openBag() {
  const d = $('[data-drawer]');
  showView('bag');
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

/* ---------------- Checkout ---------------- */
const TITLES = { bag: 'Your bag', checkout: 'Checkout', done: 'Order placed' };
function showView(name) {
  $$('[data-drawer] [data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; });
  $('[data-drawer-title]').textContent = TITLES[name];
  $('[data-checkout-back]').hidden = name !== 'checkout';
}

const delivery = () => ({ inside: 70, outside: 130, freeOver: 5000, ...(CONFIG.delivery || {}) });
function deliveryFee(area, subtotal) {
  const d = delivery();
  if (!area) return null;
  return d.freeOver && subtotal >= d.freeOver ? 0 : d[area];
}

const BN = '০১২৩৪৫৬৭৮৯';
export function normalizePhone(v) {
  let d = String(v || '').replace(/[০-৯]/g, (c) => BN.indexOf(c)).replace(/\D/g, '');
  if (d.startsWith('88')) d = d.slice(2);
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

function updateSummary() {
  const f = $('[data-checkout-form]');
  const sub = bagTotal();
  const fee = deliveryFee(f.elements.area.value, sub);
  const d = delivery();
  $('[data-fee="inside"]').textContent = sub >= d.freeOver && d.freeOver ? 'Free delivery' : `${money(d.inside)} delivery`;
  $('[data-fee="outside"]').textContent = sub >= d.freeOver && d.freeOver ? 'Free delivery' : `${money(d.outside)} delivery`;
  $('[data-co-subtotal]').textContent = money(sub);
  $('[data-co-delivery]').textContent = fee == null ? 'Choose area' : fee ? money(fee) : 'Free';
  $('[data-co-total]').textContent = money(sub + (fee || 0));
}

const REMEMBER = 'hl.customer';
function checkout() {
  if (!bag.length) return;
  if (!CONFIG.stylistEndpoint) { whatsappCheckout(); return; }
  const f = $('[data-checkout-form]');
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER) || 'null');
    if (saved) {
      for (const k of ['name', 'phone', 'address']) if (!f.elements[k].value) f.elements[k].value = saved[k] || '';
      if (saved.area && !f.elements.area.value) f.elements.area.value = saved.area;
      f.elements.remember.checked = true;
    }
  } catch { /* ignore */ }
  coError('');
  updateSummary();
  showView('checkout');
  setTimeout(() => (f.elements.name.value ? f.elements.phone : f.elements.name).focus({ preventScroll: true }), 350);
}

function coError(msg, withWa) {
  const el = $('[data-co-error]');
  el.hidden = !msg;
  el.textContent = msg;
  if (withWa) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link-btn'; b.textContent = 'Order on WhatsApp instead';
    b.addEventListener('click', whatsappCheckout);
    el.append(' ', b);
  }
}

async function placeOrder(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = (k) => f.elements[k].value.trim();
  const phone = normalizePhone(v('phone'));
  const fail = (msg, field) => { coError(msg); if (field) f.elements[field].focus?.(); };
  if (v('name').length < 2) return fail('Please enter your name.', 'name');
  if (!phone) return fail('Please enter a valid mobile number, like 01712345678.', 'phone');
  if (!f.elements.area.value) return fail('Please choose your delivery area.');
  if (v('address').length < 8) return fail('Please enter your full delivery address.', 'address');
  coError('');

  const btn = $('[data-place-order]');
  btn.disabled = true; btn.innerHTML = '<span>Placing order…</span>';
  const body = {
    name: v('name'), phone, area: f.elements.area.value, address: v('address'), payment: f.elements.payment.value,
    note: v('note'), gift: giftNote, website: f.elements.website.value,
    items: bag.map((l) => ({ id: l.id, size: l.size, qty: l.qty })),
  };
  try {
    const res = await fetch(`${CONFIG.stylistEndpoint.replace(/\/$/, '')}/order`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw Object.assign(new Error(data.error || 'We could not place your order.'), { status: res.status });
    try {
      if (f.elements.remember.checked) localStorage.setItem(REMEMBER, JSON.stringify({ name: body.name, phone, address: body.address, area: body.area }));
      else localStorage.removeItem(REMEMBER);
    } catch { /* ignore */ }
    track('order', { value: data.total });
    showDone(data, body);
    bag = []; giftNote = '';
    saveBag(); renderBag();
    f.elements.note.value = '';
  } catch (err) {
    coError(err.status && err.status < 500 ? err.message : 'Sorry, something went wrong and your order was not placed.', true);
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Place order</span>';
  }
}

function showDone(data, body) {
  $('[data-done-title]').textContent = `Thank you, ${body.name.split(' ')[0]}!`;
  $('[data-done-id]').textContent = data.id;
  $('[data-done-text]').textContent = `We’ll call or message you on ${body.phone} to confirm${body.payment === 'bkash' ? ' and send bKash payment details' : ''}. Total ${money(data.total)}${data.delivery ? ` including ${money(data.delivery)} delivery` : ' with free delivery'}.`;
  $('[data-done-items]').innerHTML = (data.items || []).map((l) => `<span>${esc(l.name)} · ${esc(l.size)} × ${l.qty}</span><span>${money(l.price * l.qty)}</span>`).join('');
  const text = `Assalamu alaikum Hololand! I just placed order ${data.id} on the website (${body.name}, ${money(data.total)}).`;
  $('[data-done-wa]').href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
  showView('done');
}

function whatsappCheckout() {
  if (!bag.length) return;
  const lines = bag.map((l) => {
    const p = byId.get(l.id);
    return `• ${p.code} ${p.name} (Size ${l.size}) × ${l.qty} = ${money(p.price * l.qty)}`;
  });
  const gift = giftNote ? `\n\n🎁 This is a gift. Please include this card:\n"${giftNote}"` : '';
  const text = `Assalamu alaikum Hololand! I'd like to order:\n\n${lines.join('\n')}\n\nSubtotal: ${money(bagTotal())}${gift}\n\nName:\nPhone:\nDelivery address:`;
  track('order', { value: bagTotal() });
  window.open(`https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/** WhatsApp link asking about one product. */
export function askLink(p) {
  const text = `Assalamu alaikum Hololand! I have a question about ${p.code} ${p.name} (${money(p.price)}): ${location.origin}${location.pathname.replace(/[^/]*$/, '')}${productUrl(p.id)}`;
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

/* ---------------- Init ---------------- */
export function initStore(list) {
  products = list;
  byId = new Map(list.map((p) => [p.id, p]));
  loadBag();
  renderBag();
  qvSizer = createSizer($('[data-modal] [data-sizer-root]') || $('[data-modal] .modal__panel'));

  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { e.preventDefault(); openQuickView(q.dataset.quick); return; }
    if (e.target.closest('[data-close-modal]')) closeQuickView();
    if (e.target.closest('[data-open-bag]')) openBag();
    if (e.target.closest('[data-close-bag]')) closeBag();
    const thumb = e.target.closest('[data-modal] [data-thumb]');
    if (thumb) {
      $('[data-qv-img]').src = img(thumb.dataset.thumb, 'lg');
      $$('[data-modal] [data-thumb]').forEach((b) => b.classList.toggle('is-active', b === thumb));
    }
    const qty = e.target.closest('[data-qty]');
    if (qty) {
      const l = bag[+qty.dataset.qty];
      l.qty += +qty.dataset.d;
      if (l.qty < 1) bag.splice(+qty.dataset.qty, 1);
      saveBag(); renderBag();
    }
    const lang = e.target.closest('[data-modal] [data-lang]');
    if (lang && current) {
      $('[data-qv-desc]').textContent = lang.dataset.lang === 'bn' ? current.desc_bn : current.desc;
      $$('[data-modal] [data-lang]').forEach((b) => b.classList.toggle('is-active', b === lang));
    }
    if (e.target.closest('[data-gift-note-clear]')) setGiftNote('');
    const rm = e.target.closest('[data-remove]');
    if (rm) { bag.splice(+rm.dataset.remove, 1); saveBag(); renderBag(); }
  });

  $('[data-qv-add]').addEventListener('click', () => {
    if (!current) return;
    if (!qvSizer.size) { toast('Please pick a size'); qvSizer.shake(); return; }
    addToBag(current.id, qvSizer.size);
    closeQuickView();
    setTimeout(openBag, 350);
  });
  $('[data-checkout]').addEventListener('click', checkout);
  $('[data-checkout-wa]').addEventListener('click', whatsappCheckout);
  $('[data-checkout-back]').addEventListener('click', () => showView('bag'));
  $('[data-checkout-form]').addEventListener('submit', placeOrder);
  $('[data-checkout-form]').addEventListener('change', updateSummary);
  $('[data-checkout-form]').addEventListener('input', () => { if (!$('[data-co-error]').hidden) coError(''); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('[data-modal]').classList.contains('is-open')) closeQuickView();
    if ($('[data-drawer]').classList.contains('is-open')) closeBag();
  });
}
