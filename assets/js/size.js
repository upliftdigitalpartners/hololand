import { aiEnabled, callAI, loadData, esc } from './ai.js';
import { catOf } from './categories.js';
let charts = null;
const chartsReady = loadData('sizes').then((d) => { charts = d; });

/** Rule-based suggestion from the size chart. Always available, and used to sanity-check the AI. */
export function localSize(chart, { heightCm, weightKg, fit }) {
  const rows = chart.sizes;
  let i = rows.findIndex((r) => weightKg >= r.weight_kg[0] && weightKg < r.weight_kg[1]);
  if (i < 0) i = weightKg < rows[0].weight_kg[1] ? 0 : rows.length - 1;
  const [lo, hi] = rows[i].weight_kg;
  const pos = hi > 150 ? 0.5 : (weightKg - lo) / (hi - lo);
  const notes = [];
  if (fit === 'slim' && pos < 0.35 && i > 0) { i -= 1; notes.push('you like a closer fit, so we went one size down'); }
  if (fit === 'relaxed' && pos > 0.4 && i < rows.length - 1) { i += 1; notes.push('you like room to move, so we went one size up'); }
  if (heightCm && heightCm >= 183 && i < rows.length - 1 && fit !== 'slim') { i += 1; notes.push('you’re tall, so the extra length helps'); }
  const r = rows[i];
  const reason = `Chest ${r.chest}″, length ${r.length}″${notes.length ? `. ${notes.join('; ')}` : ''}.`;
  return { size: r.size, reason: reason.charAt(0).toUpperCase() + reason.slice(1) };
}

/**
 * A size picker + "Find my size" helper bound to one container (quick view or product page).
 * Returns { setProduct(p), get size() }.
 */
export function createSizer(root) {
  const q = (s) => root.querySelector(s);
  const form = q('[data-sizer]');
  const out = q('[data-sizer-out]');
  let product = null;
  let size = null;
  let fit = 'regular';

  function select(s) {
    size = s;
    root.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('is-active', b.dataset.size === s));
  }

  q('[data-sizes]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (b) select(b.dataset.size);
  });
  q('[data-size-toggle]').addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input[name="ft"]').focus();
  });
  q('[data-fit]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fitv]');
    if (!b) return;
    fit = b.dataset.fitv;
    root.querySelectorAll('[data-fitv]').forEach((x) => x.classList.toggle('is-active', x === b));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await chartsReady;
    if (!product || !charts) return;
    const f = new FormData(form);
    const ft = +f.get('ft') || 0, inch = +f.get('in') || 0;
    const heightCm = ft ? Math.round((ft * 12 + inch) * 2.54) : null;
    const weightKg = +f.get('kg');
    if (!weightKg) return;
    const chart = charts[product.cat];
    if (!chart?.sizes?.length) return;
    let result = localSize(chart, { heightCm, weightKg, fit });
    if (aiEnabled) {
      out.textContent = 'Checking…';
      try {
        const ai = await callAI('/size', { product_id: product.id, category: product.cat, height_cm: heightCm, weight_kg: weightKg, fit, chart: chart.sizes });
        if (ai && chart.sizes.some((r) => r.size === String(ai.size))) result = { size: String(ai.size), reason: ai.reason || result.reason };
      } catch (err) { console.warn('size helper failed', err); }
    }
    select(result.size);
    out.innerHTML = `<strong>We suggest ${esc(result.size)}</strong> ${esc(result.reason)}`;
  });

  return {
    setProduct(p) {
      product = p;
      size = null;
      form.hidden = true;
      out.textContent = '';
      const sizes = catOf(p.cat).sizes;
      q('[data-sizes]').innerHTML = sizes.map((s) => `<button type="button" data-size="${esc(s)}">${esc(s)}</button>`).join('');
      if (sizes.length === 1) select(sizes[0]); // e.g. "Free size"
      // "Find my size" needs a measurement chart (assets/data/sizes.json); new categories may not have one.
      const toggle = q('[data-size-toggle]');
      toggle.hidden = true;
      chartsReady.then(() => { if (product === p) toggle.hidden = !charts?.[p.cat]?.sizes?.length; });
    },
    get size() { return size; },
    shake() {
      q('[data-sizes]').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    },
  };
}
