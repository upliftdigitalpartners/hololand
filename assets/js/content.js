import { CONFIG } from './config.js';
import { loadData } from './ai.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/**
 * Applies assets/data/content.json (edited in admin.html) to the page:
 * texts on [data-content] elements, and settings over CONFIG.
 */
export async function applyContent(products) {
  const c = await loadData('content');
  const set = c.settings || {};
  const texts = c.texts || {};

  if (set.whatsappNumber) CONFIG.whatsappNumber = String(set.whatsappNumber).replace(/\D/g, '');
  if (set.deliveryNote) CONFIG.deliveryNote = set.deliveryNote;
  if (set.socials) CONFIG.socials = { ...CONFIG.socials, ...set.socials };
  CONFIG.store = set.store || {};

  $$('[data-content]').forEach((el) => {
    const v = texts[el.dataset.content];
    if (typeof v === 'string' && v.trim()) el.textContent = v;
  });
  $$('[data-content-counter]').forEach((el) => {
    const n = parseInt(texts[el.dataset.contentCounter], 10);
    if (Number.isFinite(n)) el.dataset.counter = n;
  });

  // Style counts follow the catalogue automatically.
  const count = (cat) => products.filter((p) => p.cat === cat).length;
  $$('[data-count-cat]').forEach((el) => {
    const cat = el.dataset.countCat;
    if (cat === 'all-counter') el.dataset.counter = products.length;
    else el.textContent = count(cat);
  });

  // Cloudflare Web Analytics (cookie-free visitor stats); token set in the admin.
  const token = String(set.analyticsToken || '').trim();
  if (/^[a-f0-9]{32}$/i.test(token) && !document.querySelector('script[data-cf-beacon]')) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token });
    document.head.append(s);
  }

  if (set.announcement && set.announcement.trim()) {
    $('[data-announce-text]').textContent = set.announcement;
    $('[data-announce]').hidden = false;
    document.body.classList.add('has-announce');
  }

  const store = CONFIG.store;
  if (store.address || store.hours || store.mapUrl) {
    $('[data-store-col]').hidden = false;
    $('[data-store-address]').textContent = store.address || '';
    $('[data-store-hours]').textContent = store.hours || '';
    if (/^https:\/\//.test(store.mapUrl || '')) { $('[data-store-map]').href = store.mapUrl; $('[data-store-map]').hidden = false; }
  }
}
