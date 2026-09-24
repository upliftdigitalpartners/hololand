import { recHTML } from './shop.js';
import { aiEnabled, callAI, esc } from './ai.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let products = [];
let palette = [];
let mode = 'match';
let lastImage = null;

/* ---------- colour maths (sRGB → CIE Lab) ---------- */
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function rgbToLab([r, g, b]) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = g3(x); y = g3(y); z = g3(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const chroma = (lab) => Math.hypot(lab[1], lab[2]);
const rotateHue = (lab, deg) => {
  const h = Math.atan2(lab[2], lab[1]) + (deg * Math.PI) / 180, c = chroma(lab);
  return [lab[0], c * Math.cos(h), c * Math.sin(h)];
};

/** k-means over a downsampled image → [{hex, lab, weight}] */
function extractPalette(imgEl, k = 6) {
  const size = 80;
  const scale = Math.min(1, size / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const w = Math.max(1, Math.round(imgEl.naturalWidth * scale)), h = Math.max(1, Math.round(imgEl.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(imgEl, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];

  let centers = Array.from({ length: k }, (_, i) => px[Math.floor(((i + 0.5) / k) * px.length)].slice());
  const assign = new Array(px.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < k; j++) {
        const dd = (px[i][0] - centers[j][0]) ** 2 + (px[i][1] - centers[j][1]) ** 2 + (px[i][2] - centers[j][2]) ** 2;
        if (dd < bd) { bd = dd; best = j; }
      }
      assign[i] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) { const s = sums[assign[i]]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++; }
    centers = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[j]));
  }
  const counts = new Array(k).fill(0);
  assign.forEach((a) => counts[a]++);
  return centers
    .map((cRgb, j) => ({ hex: rgbToHex(...cRgb), lab: rgbToLab(cRgb), weight: counts[j] / px.length }))
    .filter((p) => p.weight > 0.04)
    .sort((a, b) => b.weight - a.weight);
}

function rank(pal, how) {
  return products
    .map((p) => {
      const lab = rgbToLab(hexToRgb(p.hex));
      let score = 0;
      for (const c of pal) {
        const target = how === 'complement' && chroma(c.lab) > 15 ? rotateHue(c.lab, 180) : c.lab;
        score += c.weight * Math.exp(-dE(target, lab) / 22);
      }
      if (how === 'complement' && chroma(lab) < 12) score += 0.12; // neutrals go with everything
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.p);
}

function describe(pal) {
  const names = pal.slice(0, 3).map((c) => {
    const [L, a, b] = c.lab, C = Math.hypot(a, b);
    if (C < 10) return L > 80 ? 'white' : L < 25 ? 'black' : 'grey';
    const hue = (Math.atan2(b, a) * 180) / Math.PI;
    const h = (hue + 360) % 360;
    const base = h < 30 ? 'pink-red' : h < 60 ? 'orange' : h < 100 ? 'gold' : h < 150 ? 'olive-green' : h < 220 ? 'teal' : h < 290 ? 'blue' : 'purple';
    return (L < 40 ? 'deep ' : L > 75 ? 'light ' : '') + base;
  });
  return [...new Set(names)].join(', ');
}

function render() {
  const recs = $('[data-photo-recs]');
  if (!palette.length) return;
  const picks = rank(palette, mode);
  recs.innerHTML = picks.map(recHTML).join('');
  if (!recs.dataset.ai) {
    $('[data-photo-note]').textContent = mode === 'match'
      ? `We see ${describe(palette)}. These pieces share those tones.`
      : `We see ${describe(palette)}. These pieces contrast nicely or keep it neutral.`;
  }
}

function dataUrl(imgEl, max = 512) {
  const s = Math.min(1, max / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(imgEl.naturalWidth * s); c.height = Math.round(imgEl.naturalHeight * s);
  c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const imgEl = $('[data-photo-preview]');
  imgEl.onload = async () => {
    lastImage = imgEl;
    palette = extractPalette(imgEl);
    $('[data-photo-hint]').hidden = true;
    imgEl.hidden = false;
    const pal = $('[data-palette]');
    pal.hidden = false;
    pal.innerHTML = palette.map((c) => `<span style="--c:${c.hex};flex:${c.weight}" title="${c.hex} · ${Math.round(c.weight * 100)}%"></span>`).join('');
    $('[data-match-mode]').hidden = false;
    delete $('[data-photo-recs]').dataset.ai;
    render();
    if (aiEnabled) askAI();
  };
  imgEl.src = url;
}

async function askAI() {
  const note = $('[data-photo-note]');
  const recs = $('[data-photo-recs]');
  note.textContent = '✦ Asking the stylist…';
  try {
    const res = await callAI('/match', { image: dataUrl(lastImage), palette: palette.map((c) => c.hex), mode }, { timeout: 40000 });
    const ids = (res?.products || []).filter((id) => products.some((p) => p.id === id));
    if (res?.reply) {
      recs.dataset.ai = '1';
      note.innerHTML = `${esc(res.reply)} <em class="ai-tag">✦ AI</em>`;
    }
    if (ids.length) {
      const local = rank(palette, mode).filter((p) => !ids.includes(p.id));
      recs.innerHTML = [...ids.map((id) => products.find((p) => p.id === id)), ...local].slice(0, 4).map(recHTML).join('');
    }
  } catch (err) {
    console.warn('photo AI failed', err);
    render();
  }
}

export function initPhotoMatch(list) {
  products = list;
  if (aiEnabled) $('[data-photo-ai-note]').hidden = false;
  const input = $('[data-photo-input]');
  const drop = $('[data-drop]');
  input.addEventListener('change', () => handleFile(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
  $('[data-match-mode]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    $$('[data-mode]').forEach((x) => x.classList.toggle('is-active', x === b));
    delete $('[data-photo-recs]').dataset.ai;
    render();
    if (aiEnabled && lastImage) askAI();
  });
}
