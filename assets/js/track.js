// Anonymous visit counting for the admin's Stats tab. No cookies, nothing stored
// in the browser; the Worker keeps only counts (see worker/src/stats.js).
import { CONFIG } from './config.js';

const off = !CONFIG.stylistEndpoint || /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)
  || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;

export function track(type, extra = {}) {
  if (off) return;
  const body = { type, path: location.pathname, ...extra };
  if (type === 'view') {
    const utm = new URLSearchParams(location.search).get('utm_source');
    if (utm) body.utm = utm;
    try { if (document.referrer && new URL(document.referrer).host !== location.host) body.ref = document.referrer; } catch { /* ignore */ }
  }
  try {
    fetch(`${CONFIG.stylistEndpoint}/track`, {
      method: 'POST', keepalive: true, credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' }, // simple request: no CORS preflight
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* ignore */ }
}
