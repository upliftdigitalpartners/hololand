// Online payment through SSLCommerz: one checkout page for bKash, Nagad, Rocket and cards.
//
//   SSLCZ_STORE_ID        secret  store id from SSLCommerz
//   SSLCZ_STORE_PASSWORD  secret  store password from SSLCommerz
//   SSLCZ_LIVE            text    "true" for real payments; anything else uses the sandbox (test cards, no money moves)
//
// Every payment is confirmed with SSLCommerz's validation API before an order is marked paid;
// what the browser or the IPN posts is never trusted on its own.

export const payReady = (env) => !!(env.SSLCZ_STORE_ID && env.SSLCZ_STORE_PASSWORD);
export const payMode = (env) => (!payReady(env) ? false : env.SSLCZ_LIVE === 'true' ? 'live' : 'sandbox');

const base = (env) => (env.SSLCZ_API || `https://${env.SSLCZ_LIVE === 'true' ? 'securepay' : 'sandbox'}.sslcommerz.com`).replace(/\/$/, '');
const creds = (env) => `store_id=${encodeURIComponent(env.SSLCZ_STORE_ID)}&store_passwd=${encodeURIComponent(env.SSLCZ_STORE_PASSWORD)}&v=1&format=json`;

/** Opens a payment session for an order; returns the SSLCommerz page to send the customer to. */
export async function startSession(env, { order, tran, callbackOrigin, email }) {
  const parts = order.address.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const city = order.area === 'inside' ? 'Chittagong' : (parts.length > 1 ? parts.at(-1) : 'Bangladesh').slice(0, 50);
  const postcode = order.area === 'inside' ? '4000' : '1000';
  const back = (r) => `${callbackOrigin}/pay-return?o=${encodeURIComponent(order.id)}${r ? `&r=${r}` : ''}`;
  const fields = {
    store_id: env.SSLCZ_STORE_ID,
    store_passwd: env.SSLCZ_STORE_PASSWORD,
    total_amount: order.total.toFixed(2),
    currency: 'BDT',
    tran_id: tran,
    success_url: back(''),
    fail_url: back('fail'),
    cancel_url: back('cancel'),
    ipn_url: `${callbackOrigin}/pay-ipn`,
    cus_name: order.name,
    cus_email: email || env.PAY_RECEIPT_EMAIL || 'orders@hololandbd.com',
    cus_add1: order.address.slice(0, 50),
    cus_add2: order.address.slice(50, 100),
    cus_city: city,
    cus_postcode: postcode,
    cus_country: 'Bangladesh',
    cus_phone: order.phone,
    shipping_method: 'Courier',
    num_of_item: String(order.items.reduce((n, l) => n + l.qty, 0)),
    ship_name: order.name,
    ship_add1: order.address.slice(0, 50),
    ship_add2: order.address.slice(50, 100),
    ship_city: city,
    ship_postcode: postcode,
    ship_country: 'Bangladesh',
    product_name: order.items.map((l) => `${l.name} (${l.size}) x${l.qty}`).join(', ').slice(0, 250),
    product_category: 'Clothing',
    product_profile: 'general',
    value_a: order.id,
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v ?? '');
  const res = await fetch(`${base(env)}/gwprocess/v4/api.php`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) throw new Error(`SSLCommerz: ${data.failedreason || data.status || res.status}`);
  return data.GatewayPageURL;
}

/** The gateway's own record of a payment (looked up by val_id). */
export async function validate(env, valId) {
  const res = await fetch(`${base(env)}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&${creds(env)}`);
  return res.json().catch(() => ({}));
}

/** All attempts SSLCommerz has for a transaction id (used to catch payments whose notice never arrived). */
export async function queryTran(env, tran) {
  const res = await fetch(`${base(env)}/validator/api/merchantTransIDvalidationAPI.php?tran_id=${encodeURIComponent(tran)}&${creds(env)}`);
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.element) ? data.element : [];
}

/** True when a validated payment really is for this order, in full, in taka. */
export function paysFor(v, order) {
  const amount = Number(v.currency_amount || v.amount);
  const currency = v.currency_type || v.currency || 'BDT';
  return ['VALID', 'VALIDATED'].includes(v.status) && String(v.tran_id || '').startsWith(`${order.id}-`)
    && Math.abs(amount - order.total) < 0.01 && currency === 'BDT';
}

/** What the admin sees about a payment. */
export const payInfo = (v) => ({
  method: String(v.card_type || v.card_brand || 'Online').slice(0, 40),
  amount: Number(v.currency_amount || v.amount),
  tran_id: String(v.tran_id || '').slice(0, 40),
  val_id: String(v.val_id || '').slice(0, 60),
  bank_tran_id: String(v.bank_tran_id || '').slice(0, 60),
  risk: v.risk_level === '1' || v.risk_level === 1 ? String(v.risk_title || 'Flagged by the bank').slice(0, 80) : null,
});
