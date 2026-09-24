import { boot, $ } from '../core.js';
import { CONFIG } from '../config.js';
import { initFaq } from '../faq.js';

boot('help', async ({ ScrollTrigger }) => {
  const s = CONFIG.store || {};
  if (s.address) $('[data-help-address]').textContent = s.address;
  $('[data-help-hours]').textContent = s.hours || '';
  if (/^https:\/\//.test(s.mapUrl || '')) { $('[data-help-map]').href = s.mapUrl; $('[data-help-map]').hidden = false; }
  await initFaq();
  ScrollTrigger.refresh();
});
