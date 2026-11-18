// Meta Pixel (Facebook / Instagram ads): page views, product views, add to bag, checkout and purchases.
// On only when a Pixel ID is set in the admin (Texts & settings → Facebook & Instagram ads), and never for
// visitors whose browser asks not to be tracked (Global Privacy Control or Do Not Track).
// Item ids match the product feed: a product is its id, a size in the bag is "<id>-<size>".
import { CONFIG } from './config.js';

let on = false;

export const variantId = (id, size) => `${id}-${size}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');

export function initPixel() {
  const id = String(CONFIG.meta?.pixelId || '');
  if (on || !/^\d{6,20}$/.test(id)) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
  // Meta's standard loader, written out here because the site's security policy allows no inline scripts.
  const q = (window.fbq = function fbq(...args) { q.callMethod ? q.callMethod(...args) : q.queue.push(args); });
  if (!window._fbq) window._fbq = q;
  Object.assign(q, { push: q, loaded: true, version: '2.0', queue: [] });
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.append(s);
  window.fbq('init', id);
  window.fbq('track', 'PageView');
  on = true;
}

/** Sends a standard event. `eventID` lets Meta match it with the same event sent from the server. */
export function px(event, data, eventID) {
  if (!on) return;
  try { window.fbq('track', event, { currency: 'BDT', ...data }, eventID ? { eventID } : undefined); } catch { /* ignore */ }
}

/** Meta's own first-party cookies, sent with an order so the server's purchase event can be matched. */
export function fbCookies() {
  const get = (k) => (document.cookie.match(new RegExp(`(?:^|; )${k}=([^;]*)`)) || [])[1];
  return { fbp: get('_fbp'), fbc: get('_fbc') };
}
