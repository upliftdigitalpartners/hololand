// Product categories. The list is edited in admin.html (Categories tab) and saved
// in assets/data/content.json → settings.categories; these are the defaults.
import { CONFIG } from './config.js';

export const GROUPS = { men: 'Men', women: 'Women', kids: 'Kids', all: 'Everyone' };

export const DEFAULT_CATEGORIES = [
  {
    id: 'men', name: 'Men · Panjabi', group: 'men', type: 'Panjabi', sizes: ['38', '40', '42', '44', '46'],
    title: 'Men’s Panjabi', lede: 'Banded collars, woven yokes and quiet embroidery. Made for Eid, weddings and every Jummah in between.',
  },
  {
    id: 'women', name: 'Women · Knitwear', group: 'women', type: 'Knitwear', sizes: ['S', 'M', 'L', 'XL'],
    title: 'Women’s Knitwear', lede: 'Mock-necks and crews in soft, fine-gauge knits and colours that warm up a Bangladeshi winter.',
  },
];

const SIZE_RE = /^[\w .+/-]{1,12}$/;

/** Cleans a category list from content.json. Returns null if it isn't usable. */
export function cleanCategories(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const c of list.slice(0, 30)) {
    if (!c || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(c.id || '') || seen.has(c.id)) continue;
    seen.add(c.id);
    const sizes = (Array.isArray(c.sizes) ? c.sizes : String(c.sizes || '').split(','))
      .map((s) => String(s).trim()).filter((s) => SIZE_RE.test(s)).slice(0, 20);
    out.push({
      id: c.id,
      name: String(c.name || c.id).slice(0, 60),
      group: GROUPS[c.group] ? c.group : 'all',
      type: String(c.type || '').slice(0, 40),
      sizes: sizes.length ? sizes : ['Free size'],
      title: String(c.title || '').slice(0, 80),
      lede: String(c.lede || '').slice(0, 300),
    });
  }
  return out.length ? out : null;
}

export const categories = () => CONFIG.categories || DEFAULT_CATEGORIES;

/** The category for an id; unknown ids still get something sensible. */
export function catOf(id) {
  return categories().find((c) => c.id === id)
    || DEFAULT_CATEGORIES.find((c) => c.id === id)
    || { id, name: id, group: 'all', type: '', sizes: ['Free size'], title: '', lede: '' };
}

/** Heading for a category: its own title, or "Men · Shirt" → "Men’s Shirt", "Kids · Panjabi" → "Kids’ Panjabi". */
export function catTitle(c) {
  if (c.title) return c.title;
  const m = c.name.match(/^(.+?)\s*[·•|]\s*(.+)$/);
  if (!m) return c.name;
  return `${m[1]}${/s$/i.test(m[1]) ? '’' : '’s'} ${m[2]}`;
}

/** Groups (Men, Women, Kids, Everyone) that have at least one category, in a fixed order. */
export function groupsInUse(list = categories()) {
  return Object.keys(GROUPS).filter((g) => list.some((c) => c.group === g));
}

/** Link to the shop for one category. */
export const catUrl = (id) => `shop.html?cat=${encodeURIComponent(id)}`;
export const groupUrl = (g) => `shop.html?group=${encodeURIComponent(g)}`;
