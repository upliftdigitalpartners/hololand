// Live stock per size, from the Worker (set in admin → Products → Edit → Stock).
// A size that isn't tracked is always available.
import { CONFIG } from './config.js';
import { catOf } from './categories.js';

let stock = {};
const endpoint = (CONFIG.stylistEndpoint || '').replace(/\/$/, '');

export function refreshStock() {
  if (!endpoint) return Promise.resolve(stock);
  return fetch(`${endpoint}/stock`, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : { stock }))
    .then((d) => { stock = d.stock || {}; return stock; })
    .catch(() => stock);
}
export const stockReady = refreshStock();

/** Waits for stock, but never holds the page up for long. */
export const stockLoaded = (ms = 800) => Promise.race([stockReady, new Promise((r) => setTimeout(r, ms))]);

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
