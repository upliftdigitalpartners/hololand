import { CONFIG } from './config.js';

export const endpoint = CONFIG.stylistEndpoint.replace(/\/$/, '');
export const aiEnabled = !!endpoint;

/** POSTs JSON to the Groq Worker. Returns null when no Worker is configured. */
export async function callAI(path, body, { headers = {}, timeout = 25000 } = {}) {
  if (!endpoint) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

let dataCache = {};
export function loadData(name) {
  dataCache[name] ||= fetch(`assets/data/${name}.json`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}));
  return dataCache[name];
}

export const hasBangla = (s) => /[ঀ-৿]/.test(s);
export const bnDigits = (s) => String(s).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
export const toBnDigits = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
