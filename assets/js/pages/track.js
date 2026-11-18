import { boot, $ } from '../core.js';
import { CONFIG } from '../config.js';
import { money, esc, normalizePhone, pixelPurchase, MY_ORDERS } from '../shop.js';

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
  returned: ['Returned', 'This parcel came back to us. Contact us if you’d still like it.'],
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

  const api = async (path, body) => {
    const res = await fetch(`${CONFIG.stylistEndpoint.replace(/\/$/, '')}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Please try again in a minute.');
    return d;
  };
  const back = q.get('pay'); // paid | failed | cancelled, when SSLCommerz sends the customer back
  let current = null;

  // Online payment: paid, or not yet (with "Pay now" and "Cash on delivery instead").
  const showPay = (o) => {
    const box = $('[data-t-pay]');
    const unpaid = o.payment === 'online' && o.pay_status !== 'paid';
    box.hidden = o.payment !== 'online' || (unpaid && o.status !== 'new');
    box.className = `track__pay ${unpaid ? 'is-due' : 'is-paid'}`;
    if (box.hidden) return;
    box.innerHTML = !unpaid
      ? `<strong>💳 Paid online · ${money(o.total)}</strong><span>Thank you! Nothing to pay on delivery.</span>`
      : `<strong>${back === 'cancelled' ? 'You cancelled the payment' : back === 'failed' ? 'The payment didn’t go through' : 'Waiting for your payment'}</strong>
         <span>Your order is saved. Pay ${money(o.total)} online, or switch to cash on delivery. Unpaid online orders are cancelled after about an hour.</span>
         <div class="track__pay-btns">
           <button class="btn btn--solid btn--sm" data-pay-retry><span>Pay ${money(o.total)} now</span></button>
           <button class="btn btn--ghost btn--sm" data-pay-cod><span>Pay cash on delivery instead</span></button>
         </div>
         <p class="checkout__err" data-pay-err role="alert" hidden></p>`;
  };

  const show = (o) => {
    current = o;
    let [h, sub] = HEADLINE[o.status] || HEADLINE.new;
    if (o.payment === 'online' && o.pay_status === 'paid' && o.status === 'new') [h, sub] = ['Payment received', 'Thank you! We’ll call or message you soon to confirm delivery.'];
    if (o.payment === 'online' && o.pay_status !== 'paid' && o.status === 'new') [h, sub] = ['Almost done', 'Your order is saved but not paid yet.'];
    if (o.payment === 'online' && o.pay_status !== 'paid' && o.status === 'cancelled') sub = 'This order was cancelled because the online payment wasn’t completed. You’re welcome to order again.';
    $('[data-t-id]').textContent = `${o.id} · placed ${fmtDate(o.placed)}`;
    $('[data-t-headline]').textContent = h;
    $('[data-t-sub]').textContent = sub;
    const at = STEPS.findIndex(([k]) => k === o.status);
    $('[data-t-steps]').innerHTML = o.status === 'cancelled' || o.status === 'returned'
      ? `<li class="is-cancelled"><i></i><span>${o.status === 'returned' ? 'Returned' : 'Cancelled'}</span></li>`
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
    showPay(o);
    // Back from paying online: the Meta Pixel purchase, once per order (not for SSLCommerz test payments).
    if (back === 'paid' && o.payment === 'online' && o.pay_status === 'paid' && !o.pay_test) {
      try { if (!sessionStorage.getItem(`hl.px.${o.id}`)) { pixelPurchase(o); sessionStorage.setItem(`hl.px.${o.id}`, '1'); } } catch { /* ignore */ }
    }
    $('[data-track-result]').hidden = false;
  };

  $('[data-t-pay]').addEventListener('click', async (e) => {
    const retry = e.target.closest('[data-pay-retry]'), cod = e.target.closest('[data-pay-cod]');
    if (!(retry || cod) || !current) return;
    const btn = retry || cod;
    const perr = $('[data-pay-err]');
    btn.disabled = true; perr.hidden = true;
    const body = { id: current.id, phone: normalizePhone(form.elements.phone.value) };
    try {
      if (retry) {
        const d = await api('pay-retry', body);
        btn.innerHTML = '<span>Opening secure payment…</span>';
        location.href = d.payUrl;
        return;
      }
      await api('pay-cod', body);
      show(await api('order-status', body));
      $('[data-t-sub]').textContent = 'Switched to cash on delivery. We’ll call or message you soon to confirm.';
    } catch (ex) { perr.textContent = ex.message; perr.hidden = false; }
    btn.disabled = false;
  });

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
      show(await api('order-status', { id, phone }));
      $('[data-track-result]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      $('[data-track-result]').hidden = true;
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; }
  });
  // Orders placed on this phone: one tap to see each, no typing.
  const mine = $('[data-track-mine]');
  const readMine = () => { try { return JSON.parse(localStorage.getItem(MY_ORDERS) || '[]').filter((o) => /^HL-\d{6}-\d{3,}$/.test(o.id) && o.phone); } catch { return []; } };
  const renderMine = () => {
    const list = readMine();
    mine.hidden = !list.length;
    mine.innerHTML = `<div class="track__mine-head"><strong>Your orders on this phone</strong><button type="button" class="link-btn" data-mine-forget>Forget these</button></div>`
      + list.map((o) => `<button type="button" class="track__mine-item" data-mine="${esc(o.id)}"><span><b>${esc(o.id)}</b><small>${new Date(o.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${o.n} item${o.n === 1 ? '' : 's'}</small></span><span>${money(o.total || 0)} →</span></button>`).join('');
  };
  renderMine();
  mine.addEventListener('click', (e) => {
    if (e.target.closest('[data-mine-forget]')) { try { localStorage.removeItem(MY_ORDERS); } catch { /* ignore */ } renderMine(); return; }
    const b = e.target.closest('[data-mine]');
    const o = b && readMine().find((x) => x.id === b.dataset.mine);
    if (!o) return;
    form.elements.id.value = o.id; form.elements.phone.value = o.phone;
    form.requestSubmit();
  });

  if (form.elements.id.value && form.elements.phone.value) form.requestSubmit();
  else if (back && form.elements.id.value) { err.textContent = 'Enter the mobile number you ordered with to see your payment.'; err.hidden = false; form.elements.phone.focus(); }
});
