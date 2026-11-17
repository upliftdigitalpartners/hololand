// Meta (Facebook / Instagram) Conversions API: purchases reported from the server as well as by the
// Pixel in the browser, so ads still learn from orders when a browser blocks the Pixel. Both send the
// same event_id (purchase-<order id>), and Meta counts each order once.
//
//   META_CAPI_TOKEN   secret  access token from Events Manager → the pixel → Settings → Conversions API
//   META_TEST_CODE    text    optional: a test event code, to see events under Events Manager → Test events
//   META_API_VERSION  text    optional, default v23.0
// The Pixel ID itself is set in the admin (Texts & settings → Facebook & Instagram ads).

const enc = new TextEncoder();
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Same item ids as the product feed (feed.xml): one per product size. */
export const variantId = (id, size) => `${id}-${size}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');

export const capiReady = (env, pixelId) => !!(env.META_CAPI_TOKEN && pixelId);

/** What the browser adds to an order for matching: Meta's own cookies, plus where the order came from. */
export function browserInfo(request, b) {
  const cookie = (v) => (/^fb\.\d\.\d{10,13}\.[\w.-]{1,200}$/.test(String(v || '')) ? String(v) : undefined);
  const url = /^https:\/\/[\w.-]+\/[\w./?=&%-]{0,200}$/.test(String(b.page || '')) ? String(b.page) : undefined;
  return {
    ip: request.headers.get('CF-Connecting-IP') || undefined,
    ua: (request.headers.get('User-Agent') || '').slice(0, 400) || undefined,
    fbp: cookie(b.fbp), fbc: cookie(b.fbc), url,
  };
}

/** Sends one Purchase event. Name and phone are hashed as Meta requires; never throws. */
export async function capiPurchase(env, pixelId, order, info = {}) {
  if (!capiReady(env, pixelId)) return;
  try {
    const phone = `88${order.phone}`; // 8801XXXXXXXXX: country code, no plus
    const [first, ...rest] = String(order.name || '').trim().toLowerCase().split(/\s+/);
    const user_data = {
      ph: [await sha256(phone)],
      external_id: [await sha256(phone)],
      country: [await sha256('bd')],
      ...(first ? { fn: [await sha256(first)] } : {}),
      ...(rest.length ? { ln: [await sha256(rest.at(-1))] } : {}),
      ...(order.area === 'inside' ? { ct: [await sha256('chittagong')] } : {}),
      ...(info.ip ? { client_ip_address: info.ip } : {}),
      ...(info.ua ? { client_user_agent: info.ua } : {}),
      ...(info.fbp ? { fbp: info.fbp } : {}),
      ...(info.fbc ? { fbc: info.fbc } : {}),
    };
    const items = order.items || [];
    const body = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `purchase-${order.id}`,
        action_source: 'website',
        ...(info.url ? { event_source_url: info.url } : {}),
        user_data,
        custom_data: {
          currency: 'BDT', value: order.total, order_id: order.id, content_type: 'product',
          content_ids: items.map((l) => variantId(l.id, l.size)),
          contents: items.map((l) => ({ id: variantId(l.id, l.size), quantity: l.qty, item_price: l.price })),
          num_items: items.reduce((n, l) => n + l.qty, 0),
        },
      }],
      ...(env.META_TEST_CODE ? { test_event_code: env.META_TEST_CODE } : {}),
    };
    const base = (env.META_GRAPH || 'https://graph.facebook.com').replace(/\/$/, '');
    const res = await fetch(`${base}/${env.META_API_VERSION || 'v23.0'}/${pixelId}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) console.error('meta capi', order.id, res.status, (await res.text()).slice(0, 300));
  } catch (err) {
    console.error('meta capi', order.id, err.message);
  }
}
