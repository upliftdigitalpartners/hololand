import { CONFIG } from './config.js';
import { loadData } from './ai.js';
import { cleanCategories } from './categories.js';
import { eidBanner } from './delivery.js';

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
  const theme = set.theme === 'dark' ? 'dark' : 'light';
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0a09' : '#ffffff');
  try { localStorage.setItem('hl.theme', theme); } catch { /* ignore */ }
  CONFIG.categories = cleanCategories(set.categories);
  if (set.delivery) {
    const n = (v) => (Number.isFinite(parseInt(v, 10)) ? Math.max(0, parseInt(v, 10)) : undefined);
    CONFIG.delivery = Object.fromEntries(Object.entries({ inside: n(set.delivery.inside), outside: n(set.delivery.outside), freeOver: n(set.delivery.freeOver) }).filter(([, v]) => v !== undefined));
    CONFIG.deliveryTimes = { insideDays: set.delivery.insideDays, outsideDays: set.delivery.outsideDays, cutoff: set.delivery.cutoff, skipFriday: set.delivery.skipFriday };
  }
  CONFIG.eid = set.eid || {};

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

  // Announcement bar: the admin's text and/or the Eid order-by reminder (hides itself after the last day).
  const bar = [eidBanner(), (set.announcement || '').trim()].filter(Boolean).join('  ·  ');
  if (bar) {
    $('[data-announce-text]').textContent = bar;
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
