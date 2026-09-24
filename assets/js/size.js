import { aiEnabled, callAI, loadData, esc } from './ai.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let product = null;
let fit = 'regular';
let charts = null;

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

export function resetSizer(p) {
  product = p;
  const form = $('[data-sizer]');
  form.hidden = true;
  $('[data-sizer-out]').textContent = '';
}

export function initSizer(onSelect) {
  const form = $('[data-sizer]');
  const out = $('[data-sizer-out]');
  loadData('sizes').then((d) => { charts = d; });

  $('[data-size-toggle]').addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) $('input[name="ft"]', form).focus();
  });
  $('[data-fit]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fitv]');
    if (!b) return;
    fit = b.dataset.fitv;
    $$('[data-fitv]').forEach((x) => x.classList.toggle('is-active', x === b));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!product || !charts) return;
    const f = new FormData(form);
    const ft = +f.get('ft') || 0, inch = +f.get('in') || 0;
    const heightCm = ft ? Math.round((ft * 12 + inch) * 2.54) : null;
    const weightKg = +f.get('kg');
    if (!weightKg) return;
    const chart = charts[product.cat];
    const input = { heightCm, weightKg, fit };
    let result = localSize(chart, input);
    let byAI = false;

    if (aiEnabled) {
      out.textContent = 'Thinking…';
      try {
        const ai = await callAI('/size', { product_id: product.id, category: product.cat, height_cm: heightCm, weight_kg: weightKg, fit, chart: chart.sizes });
        if (ai && chart.sizes.some((r) => r.size === String(ai.size))) { result = { size: String(ai.size), reason: ai.reason || result.reason }; byAI = true; }
      } catch (err) { console.warn('size AI failed', err); }
    }
    onSelect(result.size);
    out.innerHTML = `<strong>We suggest ${esc(result.size)}</strong> ${esc(result.reason)}`;
  });
}
