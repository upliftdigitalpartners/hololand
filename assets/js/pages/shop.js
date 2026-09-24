import { boot, $, $$, animateCards } from '../core.js';
import { cardHTML, reviewsReady } from '../shop.js';

const CATS = {
  all: { title: 'The full <em>edit</em>', lede: 'Festive panjabis and soft winter knits, designed in Chittagong.', crumb: 'Shop', doc: 'Shop' },
  men: { title: 'Men’s <em>Panjabi</em>', lede: 'Banded collars, woven yokes and quiet embroidery. Made for Eid, weddings and every Jummah in between.', crumb: 'Men', doc: 'Men’s Panjabi' },
  women: { title: 'Women’s <em>Knitwear</em>', lede: 'Mock-necks and crews in soft, fine-gauge knits and colours that warm up a Bangladeshi winter.', crumb: 'Women', doc: 'Women’s Knitwear' },
};
const OCCASIONS = { eid: 'Eid', wedding: 'Wedding', festive: 'Festive', evening: 'Evening', office: 'Office', casual: 'Casual', winter: 'Winter', gift: 'Gift' };
const PRICES = { u2500: ['Under ৳2,500', 0, 2500], m3500: ['৳2,500 – ৳3,500', 2500, 3500], o3500: ['৳3,500+', 3500, 1e9] };
const FAMILIES = { neutral: ['Neutrals', '#e9e4da'], dark: ['Black & charcoal', '#222'], red: ['Red & pink', '#b8344f'], warm: ['Mustard & sand', '#c8861f'], green: ['Green', '#2f5a3c'], blue: ['Blue', '#1f5a8a'], purple: ['Purple & lilac', '#8f6aa6'] };

function family(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (l < 0.22 && s < 0.35) return 'dark';
  if (s < 0.22 || l > 0.86) return 'neutral';
  if (h < 20 || h >= 330) return 'red';
  if (h < 65) return l > 0.7 ? 'neutral' : 'warm';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  return 'purple';
}

boot('shop', async ({ products, lenis }) => {
  const params = new URLSearchParams(location.search);
  const state = {
    cat: CATS[params.get('cat')] ? params.get('cat') : 'all',
    occ: new Set((params.get('occ') || '').split(',').filter((x) => OCCASIONS[x])),
    col: new Set((params.get('col') || '').split(',').filter((x) => FAMILIES[x])),
    price: PRICES[params.get('price')] ? params.get('price') : '',
    sort: params.get('sort') || 'featured',
  };
  const fam = new Map(products.map((p) => [p.id, family(p.hex)]));
  const grid = $('[data-grid]');

  // Filter controls (only options that exist in the catalogue)
  const tagsInUse = new Set(products.flatMap((p) => p.tags));
  $('[data-f-occasion]').innerHTML = Object.entries(OCCASIONS).filter(([k]) => tagsInUse.has(k)).map(([k, v]) => `<button data-occ="${k}">${v}</button>`).join('');
  const famsInUse = new Set(fam.values());
  $('[data-f-colour]').innerHTML = Object.entries(FAMILIES).filter(([k]) => famsInUse.has(k)).map(([k, [label, c]]) => `<button data-col="${k}" title="${label}" aria-label="${label}"><i style="background:${c}"></i><span>${label}</span></button>`).join('');
  $('[data-f-price]').innerHTML = Object.entries(PRICES).map(([k, [label]]) => `<button data-price="${k}">${label}</button>`).join('');
  $('[data-sort]').value = state.sort;

  function sync() {
    const q = new URLSearchParams();
    if (state.cat !== 'all') q.set('cat', state.cat);
    if (state.occ.size) q.set('occ', [...state.occ].join(','));
    if (state.col.size) q.set('col', [...state.col].join(','));
    if (state.price) q.set('price', state.price);
    if (state.sort !== 'featured') q.set('sort', state.sort);
    history.replaceState(null, '', `shop.html${q.toString() ? `?${q}` : ''}`);
    // Keep the header's Men/Women highlight in step with the tab
    $$('.nav__links a, .mobile-menu__links a').forEach((a) => {
      const u = new URL(a.href);
      const key = u.pathname.endsWith('shop.html') ? (u.searchParams.get('cat') || 'all') : null;
      a.classList.toggle('is-active', key === state.cat);
    });
  }

  function render(animate = true) {
    const c = CATS[state.cat];
    $('[data-shop-title]').innerHTML = c.title;
    $('[data-shop-lede]').textContent = c.lede;
    $('[data-crumb]').textContent = c.crumb;
    document.title = `${c.doc} — Hololand`;
    $$('[data-tabs] button').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === state.cat));
    $$('[data-occ]').forEach((b) => b.classList.toggle('is-active', state.occ.has(b.dataset.occ)));
    $$('[data-col]').forEach((b) => b.classList.toggle('is-active', state.col.has(b.dataset.col)));
    $$('[data-price]').forEach((b) => b.classList.toggle('is-active', state.price === b.dataset.price));

    let list = products.filter((p) => state.cat === 'all' || p.cat === state.cat);
    if (state.occ.size) list = list.filter((p) => p.tags.some((t) => state.occ.has(t)));
    if (state.col.size) list = list.filter((p) => state.col.has(fam.get(p.id)));
    if (state.price) { const [, lo, hi] = PRICES[state.price]; list = list.filter((p) => p.price >= lo && p.price < hi); }
    if (state.sort === 'low') list.sort((a, b) => a.price - b.price);
    if (state.sort === 'high') list.sort((a, b) => b.price - a.price);
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

    grid.innerHTML = list.map(cardHTML).join('');
    $('[data-empty]').hidden = list.length > 0;
    $('[data-count]').textContent = `${list.length} piece${list.length === 1 ? '' : 's'}`;
    const active = state.occ.size + state.col.size + (state.price ? 1 : 0);
    $('[data-filters-badge]').textContent = active || '';
    if (animate) animateCards(grid);
    sync();
  }

  $('[data-tabs]').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { state.cat = b.dataset.cat; render(); } });
  $('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('[data-filters]').addEventListener('click', (e) => {
    const o = e.target.closest('[data-occ]'), c = e.target.closest('[data-col]'), p = e.target.closest('[data-price]');
    if (o) { state.occ.has(o.dataset.occ) ? state.occ.delete(o.dataset.occ) : state.occ.add(o.dataset.occ); render(); }
    if (c) { state.col.has(c.dataset.col) ? state.col.delete(c.dataset.col) : state.col.add(c.dataset.col); render(); }
    if (p) { state.price = state.price === p.dataset.price ? '' : p.dataset.price; render(); }
  });
  $$('[data-f-clear]').forEach((b) => b.addEventListener('click', () => { state.occ.clear(); state.col.clear(); state.price = ''; render(); }));

  // Filters drawer on phones
  const panel = $('[data-filters]');
  $('[data-filters-open]').addEventListener('click', () => { panel.classList.add('is-open'); document.body.classList.add('filters-open'); lenis?.stop(); });
  $$('[data-filters-close]').forEach((b) => b.addEventListener('click', () => { panel.classList.remove('is-open'); document.body.classList.remove('filters-open'); lenis?.start(); }));

  render(false);
  reviewsReady.then(() => render(false));
  animateCards(grid);
});
