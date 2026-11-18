// Product search: the search button in the header opens it on every page. Results show as you type,
// by name, code (MP-223, mp223 or just 223), colour, fabric, type, occasion or category.
// Enter (or "See all") opens the shop grid filtered by the same words: shop.html?q=…
import { img, money, esc, productUrl, priceOf, onSale } from './shop.js';
import { catOf, categories, catUrl } from './categories.js';
import { family, FAMILY_WORDS } from './colours.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ঀ-৿]+/g, ' ').trim();
const compact = (s) => norm(s).replace(/\s+/g, '');

/** Products matching every word of the query, best first. */
export function matchProducts(products, query) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const whole = compact(query);
  const scored = [];
  for (const p of products) {
    const code = compact(p.code);
    const hay = norm([p.name, p.code, code, p.color, /^#[0-9a-f]{6}$/i.test(p.hex || '') ? FAMILY_WORDS[family(p.hex)] : '', p.type, p.fabric, (p.tags || []).join(' '), catOf(p.cat).name].join(' '));
    if (!words.every((w) => hay.includes(w) || code.includes(w))) continue;
    const name = norm(p.name);
    const score = (code === whole ? 100 : code.includes(whole) ? 60 : 0) + (name.startsWith(words[0]) ? 30 : 0)
      + words.filter((w) => name.includes(w)).length * 10;
    scored.push([score, p]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, p]) => p);
}

export function initSearch(products) {
  const box = document.querySelector('[data-search]');
  const openBtn = document.querySelector('[data-search-open]');
  if (!box || !openBtn) return;
  const input = box.querySelector('[data-search-input]');
  const out = box.querySelector('[data-search-results]');
  const visible = products.filter((p) => !p.hidden);

  const suggestions = () => {
    const chips = categories().filter((c) => visible.some((p) => p.cat === c.id))
      .map((c) => `<a class="search__chip" href="${catUrl(c.id)}">${esc(c.name)}</a>`);
    if (visible.some(onSale)) chips.push('<a class="search__chip" href="shop.html?price=sale">On sale</a>');
    return `<p class="search__hint">Try a name, a code like <b>MP-223</b>, or a colour like <b>maroon</b>.</p><div class="search__chips">${chips.join('')}</div>`;
  };
  const row = (p) => `
    <a class="search__item" href="${productUrl(p.id)}">
      <img src="${img(p.images[0])}" alt="" loading="lazy" />
      <span><strong>${esc(p.name)}</strong><small>${esc(p.code)} · ${esc(p.color)}</small></span>
      <b>${money(priceOf(p))}</b>
    </a>`;
  const show = () => {
    const q = input.value.trim();
    if (!q) { out.innerHTML = suggestions(); return; }
    const found = matchProducts(visible, q);
    out.innerHTML = found.length
      ? `${found.slice(0, 8).map(row).join('')}<a class="search__all" href="shop.html?q=${encodeURIComponent(q)}">See all ${found.length} result${found.length === 1 ? '' : 's'} →</a>`
      : `<p class="search__hint">Nothing matches “${esc(q)}”. Check the spelling, try a code like MP-223, or <a href="stylist.html">ask our stylist</a>.</p>${suggestions().replace(/<p class="search__hint">.*?<\/p>/, '')}`;
  };

  const open = () => {
    box.hidden = false;
    document.body.classList.add('search-open');
    window.lenis?.stop();
    show();
    requestAnimationFrame(() => { box.classList.add('is-open'); input.focus(); input.select(); });
  };
  const close = () => {
    box.classList.remove('is-open');
    document.body.classList.remove('search-open');
    window.lenis?.start();
    setTimeout(() => { box.hidden = true; }, 250);
    openBtn.focus({ preventScroll: true });
  };
  openBtn.addEventListener('click', open);
  box.querySelector('[data-search-close]').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) close();
    // "/" opens search on a computer, like many shops
    if (e.key === '/' && box.hidden && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); open(); }
  });
  input.addEventListener('input', show);
  box.querySelector('[data-search-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) location.href = `shop.html?q=${encodeURIComponent(q)}`;
  });
}
