// Live stock per size, from the Worker (set in admin → Products → Edit → Stock).
// A size that isn't tracked is always available.
import { CONFIG } from './config.js';
import { catOf } from './categories.js';

let stock = {};
let online = false; // the Worker also says whether online payment (SSLCommerz) is on: 'live', 'sandbox' or false
// While SSLCommerz is on test keys, only devices opened once with ?paytest=1 see "Pay online" (?paytest=0 turns it off).
const payTester = (() => {
  try {
    const q = new URLSearchParams(location.search).get('paytest');
    if (q === '1') localStorage.setItem('hl.paytest', '1');
    if (q === '0') localStorage.removeItem('hl.paytest');
    return localStorage.getItem('hl.paytest') === '1';
  } catch { return false; }
})();
const endpoint = (CONFIG.stylistEndpoint || '').replace(/\/$/, '');

export function refreshStock() {
  if (!endpoint) return Promise.resolve(stock);
  // Default credentials so it reuses the <link rel=preload> in each page's head (no cookies go cross-origin either way).
  return fetch(`${endpoint}/stock`)
    .then((r) => (r.ok ? r.json() : { stock }))
    .then((d) => { stock = d.stock || {}; online = d.online === 'live' || (d.online === 'sandbox' && payTester); return stock; })
    .catch(() => stock);
}
export const stockReady = refreshStock();

/** Waits for stock, but never holds the page up for long. */
export const stockLoaded = (ms = 800) => Promise.race([stockReady, new Promise((r) => setTimeout(r, ms))]);

/** True when the checkout can offer “Pay online”. */
export const onlinePay = () => online;

/** How many are left of a size, or null if that size isn't tracked. */
export function left(id, size) {
  const n = stock[id]?.[size];
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

/** True when every size of the product is tracked and none are left. */
export function soldOut(p) {
  const sizes = catOf(p.cat).sizes;
  return sizes.length > 0 && sizes.every((s) => left(p.id, s) === 0);
}

/** "Only 2 left" style note for a size, or ''. */
export function lowNote(id, size) {
  const n = left(id, size);
  return n !== null && n > 0 && n <= 3 ? `Only ${n} left in ${size}` : '';
}
