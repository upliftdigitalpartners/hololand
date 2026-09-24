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
  if (set.delivery) {
    const n = (v) => (Number.isFinite(parseInt(v, 10)) ? Math.max(0, parseInt(v, 10)) : undefined);
    CONFIG.delivery = Object.fromEntries(Object.entries({ inside: n(set.delivery.inside), outside: n(set.delivery.outside), freeOver: n(set.delivery.freeOver) }).filter(([, v]) => v !== undefined));
  }

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
