import { boot, $ } from '../core.js';
import { CONFIG } from '../config.js';
import { money, esc, normalizePhone } from '../shop.js';

// What the courier's status means for the customer.
const COURIER = {
  in_review: 'Booked with the courier',
  pending: 'With the courier, on the way',
  hold: 'On hold at the courier. We’ll be in touch',
  delivered_approval_pending: 'Delivered',
  partial_delivered_approval_pending: 'Delivered',
  delivered: 'Delivered',
  partial_delivered: 'Partly delivered',
  cancelled_approval_pending: 'Delivery was cancelled. We’ll be in touch',
  cancelled: 'Delivery was cancelled. We’ll be in touch',
};
const STEPS = [['new', 'Order placed'], ['confirmed', 'Confirmed'], ['shipped', 'On the way'], ['delivered', 'Delivered']];
const HEADLINE = {
  new: ['We’ve got your order', 'We’ll call or message you soon to confirm it.'],
  confirmed: ['Confirmed', 'We’re packing your order.'],
  shipped: ['On the way', 'Your parcel is with the courier.'],
  delivered: ['Delivered', 'Thank you for shopping with Hololand!'],
  cancelled: ['Cancelled', 'This order was cancelled. Contact us if that’s unexpected.'],
};
const fmtDate = (ts) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

boot('track', async () => {
  const form = $('[data-track-form]');
  const err = $('[data-track-err]');
  const q = new URLSearchParams(location.search);
  if (q.get('id')) form.elements.id.value = q.get('id').toUpperCase().slice(0, 20);
  try {
    const last = JSON.parse(sessionStorage.getItem('hl.lastOrder') || 'null');
    const saved = JSON.parse(localStorage.getItem('hl.customer') || 'null');
    if (last?.id === form.elements.id.value && last.phone) form.elements.phone.value = last.phone;
    else if (saved?.phone) form.elements.phone.value = saved.phone;
  } catch { /* ignore */ }

  const show = (o) => {
    const [h, sub] = HEADLINE[o.status] || HEADLINE.new;
    $('[data-t-id]').textContent = `${o.id} · placed ${fmtDate(o.placed)}`;
    $('[data-t-headline]').textContent = h;
    $('[data-t-sub]').textContent = sub;
    const at = STEPS.findIndex(([k]) => k === o.status);
    $('[data-t-steps]').innerHTML = o.status === 'cancelled'
      ? '<li class="is-cancelled"><i></i><span>Cancelled</span></li>'
      : STEPS.map(([k, label], i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-now' : ''}"><i></i><span>${label}</span></li>`).join('');
    const c = $('[data-t-courier]');
    c.hidden = !o.courier;
    if (o.courier) {
      const note = COURIER[o.courier_status] || 'With the courier';
      const link = o.tracking_code && o.courier === 'Steadfast' ? `https://steadfast.com.bd/t/${encodeURIComponent(o.tracking_code)}` : '';
      c.innerHTML = `<strong>${esc(o.courier)}</strong><span>${esc(note)}</span>${o.tracking_code ? `<span class="mono">Tracking: ${esc(o.tracking_code)}</span>` : ''}${link ? `<a class="link-btn" href="${link}" target="_blank" rel="noopener">Track on ${esc(o.courier)} ↗</a>` : ''}`;
    }
    $('[data-t-items]').innerHTML = o.items.map((l) => `<span>${esc(l.name)} · ${esc(l.size)} × ${l.qty}</span><span>${money(l.price * l.qty)}</span>`).join('')
      + (o.discount ? `<span>Discount</span><span>−${money(o.discount)}</span>` : '')
      + `<span>Delivery</span><span>${o.delivery ? money(o.delivery) : 'Free'}</span><strong>Total</strong><strong>${money(o.total)}</strong>`;
    $('[data-track-result]').hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = form.elements.id.value.trim().toUpperCase();
    const phone = normalizePhone(form.elements.phone.value);
    err.hidden = true;
    if (!/^HL-\d{6}-\d{3,}$/.test(id)) { err.textContent = 'Order numbers look like HL-250925-001.'; err.hidden = false; return; }
    if (!phone) { err.textContent = 'Enter the mobile number you ordered with, like 01712345678.'; err.hidden = false; return; }
    const btn = $('[data-track-go]');
    btn.disabled = true;
    try {
      const res = await fetch(`${CONFIG.stylistEndpoint.replace(/\/$/, '')}/order-status`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', body: JSON.stringify({ id, phone }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Please try again in a minute.');
      show(d);
      $('[data-track-result]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      $('[data-track-result]').hidden = true;
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; }
  });
  if (form.elements.id.value && form.elements.phone.value) form.requestSubmit();
});
