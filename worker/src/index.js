/**
 * Hololand AI stylist: a tiny Cloudflare Worker that keeps your Groq API key
 * secret. GitHub Pages is static, so the key can never live in the website.
 *
 *   POST /chat        { messages: [{role, content}], context: { weather, date } }
 *                     -> { reply, products: [ids] }
 *   POST /transcribe  multipart form with "file" (audio) -> { text }
 *
 * Secrets / vars (see README):
 *   GROQ_API_KEY     (secret)  your Groq key
 *   ALLOWED_ORIGINS  (var)     comma-separated, e.g. https://you.github.io
 *   CATALOG_URL      (var)     https://you.github.io/hololand/assets/data/products.json
 *   CHAT_MODEL       (var)     optional, default openai/gpt-oss-120b
 */

const GROQ = 'https://api.groq.com/openai/v1';
let catalogCache = { at: 0, text: '', ids: new Set() };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!okOrigin) return json({ error: 'origin not allowed' }, 403, cors);
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    const { pathname } = new URL(request.url);
    try {
      if (pathname.endsWith('/chat')) return json(await chat(request, env), 200, cors);
      if (pathname.endsWith('/transcribe')) return json(await transcribe(request, env), 200, cors);
      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'stylist unavailable' }, 502, cors);
    }
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function loadCatalog(env) {
  if (Date.now() - catalogCache.at < 10 * 60 * 1000 && catalogCache.text) return catalogCache;
  const res = await fetch(env.CATALOG_URL, { cf: { cacheTtl: 600 } });
  const { products } = await res.json();
  const text = products.map((p) =>
    `${p.id} | ${p.code} | ${p.name} | ${p.cat === 'men' ? "Men's panjabi" : "Women's knitwear"} | ${p.color} | ৳${p.price} | ${p.fabric} | tags: ${p.tags.join(', ')}`
  ).join('\n');
  catalogCache = { at: Date.now(), text, ids: new Set(products.map((p) => p.id)) };
  return catalogCache;
}

async function chat(request, env) {
  const body = await request.json();
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
  if (!messages.length) return { reply: 'Tell me what you are shopping for!', products: [] };

  const catalog = await loadCatalog(env);
  const ctx = body.context || {};
  const system = `You are the in-store stylist for Hololand, a Bangladeshi clothing brand selling men's panjabis and women's winter knitwear.
Be warm, concise (max 90 words) and specific. Reply in the customer's language: English, Bangla (বাংলা script) or Banglish, matching how they write.
Only recommend products from this catalogue (id | code | name | category | colour | price | fabric | tags):
${catalog.text}

Context: today is ${String(ctx.date || '').slice(0, 40)}. Weather: ${String(ctx.weather || 'unknown').slice(0, 80)}.
Consider occasion (Eid, wedding, gaye holud, Jummah, office, winter travel), who it is for, colour preferences and budget.
If asked about anything unrelated to Hololand clothing, styling, sizing or delivery, politely steer back to fashion.
Delivery: cash on delivery and bKash across Bangladesh; orders are placed via WhatsApp from the bag.
Respond ONLY with JSON: {"reply": "<your message>", "products": ["<id>", ...up to 4 ids from the catalogue]}`;

  const res = await fetch(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.CHAT_MODEL || 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.6,
      max_completion_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let out;
  try { out = JSON.parse(data.choices[0].message.content); } catch { out = { reply: data.choices?.[0]?.message?.content || '', products: [] }; }
  return {
    reply: String(out.reply || '').slice(0, 1200),
    products: (Array.isArray(out.products) ? out.products : []).filter((id) => catalog.ids.has(id)).slice(0, 4),
  };
}

async function transcribe(request, env) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return { text: '' };
  if (file.size > 5 * 1024 * 1024) return { text: '' };
  const fd = new FormData();
  fd.append('file', file, 'voice.webm');
  fd.append('model', env.STT_MODEL || 'whisper-large-v3');
  fd.append('response_format', 'json');
  fd.append('prompt', 'Hololand, panjabi, Eid, sweater, বিয়ে, শীত');
  const res = await fetch(`${GROQ}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`groq stt ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: String(data.text || '').trim().slice(0, 600) };
}
