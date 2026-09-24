/**
 * Hololand AI: a small Cloudflare Worker that keeps your Groq API key secret.
 * GitHub Pages is static and public, so the key can never live in the website.
 *
 * Public endpoints (called by the website):
 *   POST /chat        stylist + support bot     { messages, context }          -> { reply, products }
 *   POST /transcribe  voice → text (Whisper)    multipart "file"               -> { text }
 *   POST /size        size advisor              { product_id, height_cm, ... } -> { size, reason }
 *   POST /match       photo colour matcher      { image (data URL), palette }  -> { reply, products }
 *   POST /gift        gift finder               { who, occasion, budget, style } -> { products, message_en, message_bn, reason }
 * Owner-only endpoints (admin.html, need header X-Admin-Token):
 *   POST /copy        product copy generator    { product_id, tone }           -> { desc_en, desc_bn, seo_title, ... }
 *   POST /summarize   review summarizer         { product_id, reviews }        -> { summary_en, summary_bn, pros, cons, fit }
 *
 * Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   GROQ_API_KEY     secret   your Groq key (required)
 *   ADMIN_TOKEN      secret   any long password, used by admin.html (optional; admin tools are off without it)
 *   SITE_URL         text     e.g. https://upliftdigitalpartners.github.io/hololand  (no trailing slash)
 *   ALLOWED_ORIGINS  text     optional; defaults to the origin of SITE_URL. Comma-separate extras.
 *   CHAT_MODEL       text     optional, default openai/gpt-oss-120b
 *   VISION_MODEL     text     optional, default qwen/qwen3.6-27b (check Groq's model list for the current vision model)
 *   STT_MODEL        text     optional, default whisper-large-v3
 */

const GROQ = 'https://api.groq.com/openai/v1';
const cache = { at: 0, products: [], faq: [], text: '', faqText: '', ids: new Set() };
const hits = new Map(); // best-effort per-IP rate limit (per Worker instance)

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const { pathname } = new URL(request.url);
    if (request.method === 'GET') {
      // Handy check after setup: open the Worker URL in a browser.
      return json({ ok: true, groqKey: !!env.GROQ_API_KEY, siteUrl: env.SITE_URL || null, adminTools: !!env.ADMIN_TOKEN }, 200, cors);
    }
    if (!okOrigin) return json({ error: 'origin not allowed' }, 403, cors);
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!env.GROQ_API_KEY) return json({ error: 'GROQ_API_KEY is not set' }, 500, cors);
    if (limited(request)) return json({ error: 'slow down' }, 429, cors);

    const route = pathname.replace(/\/+$/, '').split('/').pop();
    const admin = route === 'copy' || route === 'summarize';
    if (admin && (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN)) {
      return json({ error: 'admin token required' }, 401, cors);
    }
    const handlers = { chat, transcribe, size, match, gift, copy, summarize };
    if (!handlers[route]) return json({ error: 'not found' }, 404, cors);
    try {
      return json(await handlers[route](request, env), 200, cors);
    } catch (err) {
      console.error(route, err);
      return json({ error: 'ai unavailable' }, 502, cors);
    }
  },
};

/* ---------------- helpers ---------------- */
function allowedOrigins(env) {
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (env.SITE_URL) { try { list.push(new URL(env.SITE_URL).origin); } catch { /* ignore */ } }
  return list;
}

function limited(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 30;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

const clip = (v, n) => String(v ?? '').slice(0, n);

async function loadData(env) {
  if (Date.now() - cache.at < 10 * 60 * 1000 && cache.text) return cache;
  const base = (env.SITE_URL || '').replace(/\/$/, '');
  const [p, f] = await Promise.all([
    fetch(`${base}/assets/data/products.json`, { cf: { cacheTtl: 600 } }).then((r) => r.json()),
    fetch(`${base}/assets/data/faq.json`, { cf: { cacheTtl: 600 } }).then((r) => r.json()).catch(() => ({ faq: [] })),
  ]);
  cache.products = p.products;
  cache.faq = f.faq || [];
  cache.ids = new Set(p.products.map((x) => x.id));
  cache.text = p.products.map((x) =>
    `${x.id} | ${x.code} | ${x.name} | ${x.cat === 'men' ? "Men's panjabi" : "Women's knitwear"} | ${x.color} (${x.hex}) | ৳${x.price} | ${x.fabric} | tags: ${x.tags.join(', ')}`
  ).join('\n');
  cache.faqText = cache.faq.map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  cache.at = Date.now();
  return cache;
}

const onlyIds = (ids, n = 4) => (Array.isArray(ids) ? ids : []).filter((id) => cache.ids.has(id)).slice(0, n);

/** Calls Groq chat completions in JSON mode and returns the parsed object. */
async function groqJSON(env, { system, messages, model, maxTokens = 700, temperature = 0.6 }) {
  const res = await fetch(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || env.CHAT_MODEL || 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: system }, ...messages],
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(content); } catch { return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)); }
}

const BRAND = `You work for Hololand, a Bangladeshi clothing brand selling men's panjabis and women's winter knitwear. Warm, concise, specific. Never invent products, prices or policies.`;

/* ---------------- public: stylist + support ---------------- */
async function chat(request, env) {
  const body = await request.json();
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: clip(m.content, 800) }));
  if (!messages.length) return { reply: 'Tell me what you are shopping for!', products: [] };
  const d = await loadData(env);
  const ctx = body.context || {};
  const out = await groqJSON(env, {
    system: `${BRAND}
You are both the stylist and customer support. Max 90 words. Reply in the customer's language: English, Bangla (বাংলা script) or Banglish, matching how they write.
Catalogue (id | code | name | category | colour | price | fabric | tags):
${d.text}

Store policies. Answer support questions ONLY from these; if the answer isn't here, say the team will confirm on WhatsApp:
${d.faqText}

Context: today is ${clip(ctx.date, 40)}. Weather: ${clip(ctx.weather || 'unknown', 80)}.
For outfit requests consider occasion (Eid, wedding, gaye holud, Jummah, office, winter), who it is for, colours and budget, and recommend up to 4 catalogue ids. For pure support questions return an empty products list.
Politely steer unrelated topics back to Hololand.
Respond ONLY with JSON: {"reply": "...", "products": ["id", ...]}`,
    messages,
  });
  return { reply: clip(out.reply, 1200), products: onlyIds(out.products) };
}

async function transcribe(request, env) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string' || file.size > 5 * 1024 * 1024) return { text: '' };
  const fd = new FormData();
  fd.append('file', file, 'voice.webm');
  fd.append('model', env.STT_MODEL || 'whisper-large-v3');
  fd.append('response_format', 'json');
  fd.append('prompt', 'Hololand, panjabi, Eid, sweater, delivery, bKash, বিয়ে, শীত, পাঞ্জাবি');
  const res = await fetch(`${GROQ}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: fd });
  if (!res.ok) throw new Error(`groq stt ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: clip(data.text, 600).trim() };
}

/* ---------------- public: size advisor ---------------- */
async function size(request, env) {
  const b = await request.json();
  const chart = (Array.isArray(b.chart) ? b.chart : []).slice(0, 8);
  const sizes = chart.map((r) => String(r.size));
  const out = await groqJSON(env, {
    system: `${BRAND}
You are a fit expert. Pick ONE size from this chart for the customer. Chart (garment chest & length in inches, typical body weight range kg):
${JSON.stringify(chart)}
Fit preference: slim = closer to body, regular, relaxed = roomier. Very tall customers (over ~183 cm) may need the longer length.
Respond ONLY with JSON: {"size": "<one of ${sizes.join(', ')}>", "reason": "<one friendly sentence, max 30 words>"}`,
    messages: [{ role: 'user', content: `Category: ${clip(b.category, 10)}. Height: ${+b.height_cm || 'unknown'} cm. Weight: ${+b.weight_kg} kg. Fit: ${clip(b.fit, 10)}.` }],
    maxTokens: 300,
    temperature: 0.2,
  });
  return sizes.includes(String(out.size)) ? { size: String(out.size), reason: clip(out.reason, 240) } : {};
}

/* ---------------- public: photo colour match (vision) ---------------- */
async function match(request, env) {
  const b = await request.json();
  const image = String(b.image || '');
  if (!image.startsWith('data:image/') || image.length > 1_500_000) return { reply: '', products: [] };
  const d = await loadData(env);
  const palette = (Array.isArray(b.palette) ? b.palette : []).slice(0, 8).map((h) => clip(h, 7)).join(', ');
  const out = await groqJSON(env, {
    model: env.VISION_MODEL || 'qwen/qwen3.6-27b',
    system: `${BRAND}
The customer uploaded a photo to find Hololand pieces that go with it. Mode: ${b.mode === 'complement' ? 'complementary / contrasting colours' : 'matching / similar colours'}.
Extracted palette: ${palette}.
Catalogue (id | code | name | category | colour (hex) | price | fabric | tags):
${d.text}
Look at the photo (outfit, occasion, mood) and pick up to 4 ids. Do not comment on the person's body, face or skin.
Respond ONLY with JSON: {"reply": "<max 45 words: what you see + why these picks>", "products": ["id", ...]}`,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Find Hololand pieces for this photo.' }, { type: 'image_url', image_url: { url: image } }] }],
    maxTokens: 500,
  });
  return { reply: clip(out.reply, 500), products: onlyIds(out.products) };
}

/* ---------------- public: gift finder ---------------- */
async function gift(request, env) {
  const b = await request.json();
  const d = await loadData(env);
  const out = await groqJSON(env, {
    system: `${BRAND}
Gift finder. Pick 3 catalogue ids within budget that suit the recipient, occasion and style (men's panjabi for male recipients, women's knitwear for female; either for "friend").
Then write a short, heartfelt gift card message (max 30 words) in English AND in natural Bangla (বাংলা script). No names; use the relationship.
Catalogue:
${d.text}
Respond ONLY with JSON: {"products": ["id","id","id"], "message_en": "...", "message_bn": "...", "reason": "<max 25 words on why these>"}`,
    messages: [{ role: 'user', content: `Recipient: ${clip(b.who, 20)}. Occasion: ${clip(b.occasion, 20)}. Budget: under ৳${+b.budget || 99999}. Style: ${clip(b.style, 20)}.` }],
    maxTokens: 600,
    temperature: 0.8,
  });
  const products = onlyIds(out.products, 3).filter((id) => d.products.find((p) => p.id === id).price <= (+b.budget || 99999));
  return { products, message_en: clip(out.message_en, 300), message_bn: clip(out.message_bn, 400), reason: clip(out.reason, 200) };
}

/* ---------------- admin: product copy ---------------- */
async function copy(request, env) {
  const b = await request.json();
  const d = await loadData(env);
  const p = d.products.find((x) => x.id === b.product_id);
  if (!p) return { error: 'unknown product' };
  return groqJSON(env, {
    system: `${BRAND}
You are the brand copywriter. Tone: ${clip(b.tone || 'elegant, modern, warm', 60)}. Bangladeshi audience; mention Eid/weddings/winter only where the tags fit. Do not invent fabric facts beyond what's given.
Respond ONLY with JSON:
{"desc_en": "<2 sentences, max 40 words>", "desc_bn": "<same in natural Bangla>", "seo_title": "<max 60 chars>", "seo_description": "<max 155 chars>", "facebook": "<post, 2-3 short lines + call to action, may mix Bangla/English>", "instagram": "<caption, max 2 lines>", "hashtags": ["#...", "... 8-12 tags"]}`,
    messages: [{ role: 'user', content: `Product: ${JSON.stringify({ code: p.code, name: p.name, type: p.type, category: p.cat, color: p.color, fabric: p.fabric, price: p.price, tags: p.tags, current: p.desc })}` }],
    maxTokens: 1200,
    temperature: 0.8,
  });
}

/* ---------------- admin: review summary ---------------- */
async function summarize(request, env) {
  const b = await request.json();
  const reviews = (Array.isArray(b.reviews) ? b.reviews : []).slice(0, 80)
    .map((r) => `${+r.rating || '?'}/5: ${clip(r.text, 400)}`).join('\n');
  if (!reviews) return { error: 'no reviews' };
  return groqJSON(env, {
    system: `${BRAND}
Summarise these genuine customer reviews honestly. Include negatives if present. Don't invent anything not in the reviews.
Respond ONLY with JSON: {"summary_en": "<max 35 words>", "summary_bn": "<same in Bangla>", "pros": ["<2-4 words>", "... max 3"], "cons": ["... max 2, empty if none"], "fit": "<e.g. 'true to size', 'runs large' or '' if unknown>"}`,
    messages: [{ role: 'user', content: reviews }],
    maxTokens: 600,
    temperature: 0.3,
  });
}
