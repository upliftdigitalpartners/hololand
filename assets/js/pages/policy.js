// Terms, Privacy and Returns & Refunds pages: fill in the live delivery charges, times and WhatsApp link
// from the admin settings, so the policies always match the checkout.
import { boot, $$ } from '../core.js';
import { CONFIG } from '../config.js';
import { times } from '../delivery.js';

const days = ([a, b]) => (a === b ? `${a} working day${a === 1 ? '' : 's'}` : `${a}–${b} working days`);

boot('policy', async () => {
  const d = { inside: 70, outside: 130, freeOver: 5000, ...(CONFIG.delivery || {}) };
  const taka = (n) => `৳${Number(n).toLocaleString('en-IN')}`;
  const t = times();
  const set = (k, v) => $$(`[data-p="${k}"]`).forEach((el) => { el.textContent = v; });
  set('inside-fee', taka(d.inside));
  set('outside-fee', taka(d.outside));
  set('free-over', taka(d.freeOver));
  $$('[data-p="free-over-wrap"]').forEach((el) => { el.hidden = !d.freeOver; });
  set('inside-days', days(t.inside));
  set('outside-days', days(t.outside));
  const wa = String(CONFIG.whatsappNumber || '').replace(/\D/g, '');
  $$('a[data-p="whatsapp"]').forEach((a) => {
    if (!wa) return;
    a.href = `https://wa.me/${wa}`;
    a.target = '_blank';
    a.rel = 'noopener';
  });
});
