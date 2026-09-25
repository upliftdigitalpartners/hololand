import { boot, $, $$, animateCards } from '../core.js';
import { cardHTML, reviewsReady, esc, priceOf, onSale } from '../shop.js';
import { categories, catOf, catTitle, GROUPS } from '../categories.js';

const ALL = { title: 'The full <em>edit</em>', lede: 'Festive panjabis, soft winter knits and more, designed in Chittagong.', crumb: 'Shop', doc: 'Shop' };
const italicLast = (t) => { const w = esc(t).split(' '); return w.length > 1 ? `${w.slice(0, -1).join(' ')} <em>${w.at(-1)}</em>` : `<em>${w[0]}</em>`; };
const groupHead = (g) => ({
  title: `${GROUPS[g]}${g === 'kids' ? '’' : '’s'} <em>collection</em>`,
  lede: `Everything in our ${GROUPS[g].toLowerCase()}${g === 'kids' ? '’' : '’s'} collection.`,
  crumb: GROUPS[g], doc: `${GROUPS[g]}${g === 'kids' ? '’' : '’s'} collection`,
});
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
  const cats = categories().filter((c) => products.some((p) => p.cat === c.id));
  const catIds = new Set(cats.map((c) => c.id));
  const state = {
    cat: catIds.has(params.get('cat')) ? params.get('cat') : 'all',
    group: GROUPS[params.get('group')] && cats.some((c) => c.group === params.get('group')) ? params.get('group') : '',
    occ: new Set((params.get('occ') || '').split(',').filter((x) => OCCASIONS[x])),
    col: new Set((params.get('col') || '').split(',').filter((x) => FAMILIES[x])),
    price: PRICES[params.get('price')] || params.get('price') === 'sale' ? params.get('price') : '',
    sort: params.get('sort') || 'featured',
  };
  // A section with a single category just shows that category.
  const inGroup = (g) => cats.filter((c) => c.group === g);
  if (state.group && inGroup(state.group).length === 1) { state.cat = inGroup(state.group)[0].id; state.group = ''; }
  if (state.cat !== 'all') state.group = '';
  const fam = new Map(products.map((p) => [p.id, family(p.hex)]));
  const renderTabs = () => {
    const list = state.group ? inGroup(state.group) : cats;
    $('[data-tabs]').innerHTML = `<button role="tab" data-cat="all">${state.group ? `All ${esc(GROUPS[state.group].toLowerCase())}` : 'All'}</button>`
      + list.map((c) => `<button role="tab" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('');
  };
  renderTabs();
  const grid = $('[data-grid]');

  // Filter controls (only options that exist in the catalogue)
  const tagsInUse = new Set(products.flatMap((p) => p.tags));
  $('[data-f-occasion]').innerHTML = Object.entries(OCCASIONS).filter(([k]) => tagsInUse.has(k)).map(([k, v]) => `<button data-occ="${k}">${v}</button>`).join('');
  const famsInUse = new Set(fam.values());
  $('[data-f-colour]').innerHTML = Object.entries(FAMILIES).filter(([k]) => famsInUse.has(k)).map(([k, [label, c]]) => `<button data-col="${k}" title="${label}" aria-label="${label}"><i style="background:${c}"></i><span>${label}</span></button>`).join('');
  // "On sale" appears only while something is on sale.
  if (products.some(onSale)) PRICES.sale = ['On sale', 0, 1e9];
  $('[data-f-price]').innerHTML = Object.entries(PRICES).map(([k, [label]]) => `<button data-price="${k}">${label}</button>`).join('');
  $('[data-sort]').value = state.sort;

  function sync() {
    const q = new URLSearchParams();
    if (state.cat !== 'all') q.set('cat', state.cat);
    else if (state.group) q.set('group', state.group);
    if (state.occ.size) q.set('occ', [...state.occ].join(','));
    if (state.col.size) q.set('col', [...state.col].join(','));
    if (state.price) q.set('price', state.price);
    if (state.sort !== 'featured') q.set('sort', state.sort);
    history.replaceState(null, '', `shop.html${q.toString() ? `?${q}` : ''}`);
    // Keep the header's Men/Women/… highlight in step with the tab
    const active = state.cat !== 'all' ? catOf(state.cat).group : state.group || 'shop';
    $$('.nav__links a, .mobile-menu__links a').forEach((a) => {
      const u = new URL(a.href);
      const key = u.pathname.endsWith('shop.html') ? (u.searchParams.get('group') || 'shop') : null;
      a.classList.toggle('is-active', key === active);
    });
  }

  function render(animate = true) {
    const cc = state.cat !== 'all' ? catOf(state.cat) : null;
    const c = cc ? { title: italicLast(catTitle(cc)), lede: cc.lede, crumb: cc.name, doc: catTitle(cc) } : state.group ? groupHead(state.group) : ALL;
    $('[data-shop-title]').innerHTML = c.title;
    $('[data-shop-lede]').textContent = c.lede;
    $('[data-crumb]').textContent = c.crumb;
    document.title = `${c.doc} — Hololand`;
    $$('[data-tabs] button').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === state.cat));
    $$('[data-occ]').forEach((b) => b.classList.toggle('is-active', state.occ.has(b.dataset.occ)));
    $$('[data-col]').forEach((b) => b.classList.toggle('is-active', state.col.has(b.dataset.col)));
    $$('[data-price]').forEach((b) => b.classList.toggle('is-active', state.price === b.dataset.price));

    let list = products.filter((p) => (state.cat === 'all' ? !state.group || catOf(p.cat).group === state.group : p.cat === state.cat));
    if (state.occ.size) list = list.filter((p) => p.tags.some((t) => state.occ.has(t)));
    if (state.col.size) list = list.filter((p) => state.col.has(fam.get(p.id)));
    if (state.price && PRICES[state.price]) { const [, lo, hi] = PRICES[state.price]; list = state.price === 'sale' ? list.filter(onSale) : list.filter((p) => priceOf(p) >= lo && priceOf(p) < hi); }
    if (state.sort === 'low') list.sort((a, b) => priceOf(a) - priceOf(b));
    if (state.sort === 'high') list.sort((a, b) => priceOf(b) - priceOf(a));
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
