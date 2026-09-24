import { CONFIG } from './config.js';
import { money, openQuickView, recHTML } from './shop.js';
import { endpoint, callAI, loadData, hasBangla, bnDigits } from './ai.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let products = [];
let byId = new Map();
let faqs = [];
let getWeather = () => null;
const history = [];

/* ---------------- Support answers (FAQ) ---------------- */
function faqAnswer(text) {
  const q = ` ${text.toLowerCase()} `;
  let best = null, bestScore = 0;
  for (const f of faqs) {
    const score = f.keywords.reduce((s, k) => s + (q.includes(k) ? k.length : 0), 0);
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return best;
}

/* ---------------- Offline matcher ----------------
   Used when no Groq endpoint is configured, or if the call fails.
   Understands English, Bangla and common Banglish words. */
const LEX = {
  men: ['husband', 'father', 'dad', 'abbu', 'abba', 'brother', 'bhai', 'boyfriend', ' him', ' his ', ' men', ' man ', ' male', 'groom', 'jamai', 'panjabi', 'punjabi', 'kurta', 'স্বামী', 'বাবা', 'আব্বু', 'ভাই', 'ছেলে', 'বরের', 'পাঞ্জাবি', 'পাঞ্জাবী'],
  women: ['wife', 'sister', 'apu', 'mother', 'mom', 'ammu', 'girlfriend', ' her ', 'women', 'woman', 'female', 'girl', 'lady', 'sweater', 'knit', 'jumper', 'স্ত্রী', 'বোন', 'আপু', 'মায়ের', ' মা ', 'আম্মু', 'মেয়ে', 'সোয়েটার', 'সুয়েটার'],
  eid: ['eid', 'ঈদ', 'festival', 'utsab', 'উৎসব'],
  wedding: ['wedding', 'biye', 'biya', 'nikah', 'reception', 'walima', 'বিয়ে', 'বিয়ে', 'বৌভাত', 'engagement'],
  haldi: ['holud', 'haldi', 'হলুদ'],
  winter: ['winter', 'cold', 'sheet', 'thanda', 'sylhet', 'srimangal', 'শীত', 'ঠান্ডা', 'ঠাণ্ডা', 'warm', 'cozy', 'cosy'],
  office: ['office', 'work', 'meeting', 'অফিস', 'interview'],
  jummah: ['jummah', 'jumma', 'friday', 'prayer', 'namaz', 'mosque', 'জুম্মা', 'নামাজ'],
  evening: ['evening', 'night', 'dinner', 'party', 'রাত', 'পার্টি', 'দাওয়াত'],
  casual: ['casual', 'everyday', 'daily', 'hangout', 'adda', 'আড্ডা', 'travel', 'trip'],
  gift: ['gift', 'present', 'উপহার', 'গিফট'],
  premium: ['premium', 'luxury', 'best', 'special', 'embroider', 'কাজ করা'],
  pastel: ['pastel', 'light colour', 'light color', 'soft'],
  bold: ['bold', 'bright', 'stand out', 'colorful', 'colourful'],
};
const COLORS = {
  maroon: ['maroon', 'red', 'wine', 'লাল', 'মেরুন'], black: ['black', 'কালো'], white: ['white', 'ivory', 'off-white', 'সাদা'],
  blue: ['blue', 'navy', 'teal', 'cobalt', 'নীল'], green: ['green', 'olive', 'sage', 'সবুজ'], pink: ['pink', 'rose', 'blush', 'fuchsia', 'lilac', 'গোলাপি'],
  yellow: ['yellow', 'mustard', 'saffron', 'হলুদ রঙ'], grey: ['grey', 'gray', 'charcoal', 'ছাই'], beige: ['beige', 'sand', 'cream'],
};
const COLOR_MATCH = {
  maroon: ['Maroon', 'Mauve'], black: ['Black', 'Charcoal'], white: ['White', 'Ivory'], blue: ['Navy', 'Teal', 'Teal Blue', 'Cobalt', 'Sky Blue'],
  green: ['Bottle Green', 'Green', 'Olive', 'Sage'], pink: ['Blush', 'Dusty Rose', 'Fuchsia', 'Lilac', 'Mauve'], yellow: ['Mustard'],
  grey: ['Ice Grey', 'Charcoal'], beige: ['Beige', 'Blush', 'Ivory'],
};

function localStylist(text) {
  const q = ` ${bnDigits(text.toLowerCase())} `;
  const has = (words) => words.some((w) => q.includes(w));
  const intents = Object.keys(LEX).filter((k) => has(LEX[k]));
  const colors = Object.keys(COLORS).filter((k) => has(COLORS[k]));
  const budget = (q.match(/(?:under|below|within|budget|max|er moddhe|এর মধ্যে|নিচে)?\s*(?:৳|tk|taka|bdt)?\s*(\d{4,5})/) || [])[1];
  const weather = getWeather();
  const cold = weather && weather.temp < 22;

  let cat = intents.includes('men') && !intents.includes('women') ? 'men' : intents.includes('women') && !intents.includes('men') ? 'women' : null;
  if (!cat && intents.includes('winter')) cat = 'women';

  const scored = products
    .filter((p) => !cat || p.cat === cat)
    .filter((p) => !budget || p.price <= +budget)
    .map((p) => {
      let s = Math.random() * 0.4;
      for (const i of intents) if (p.tags.includes(i)) s += 2;
      for (const c of colors) if (COLOR_MATCH[c].includes(p.color)) s += 3;
      if (cold && p.tags.includes('winter')) s += 0.8;
      if (!cold && p.tags.includes('summer')) s += 0.4;
      return { p, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.p);

  const bn = hasBangla(text);
  const faq = faqAnswer(text);
  const shopping = intents.some((i) => i !== 'gift') || colors.length || budget;
  if (faq && !shopping) return { reply: bn ? faq.a_bn : faq.a, products: [] };
  const occasion = intents.find((i) => ['eid', 'wedding', 'haldi', 'winter', 'office', 'jummah', 'evening', 'casual', 'gift'].includes(i));
  const names = { eid: ['Eid', 'ঈদের'], wedding: ['a wedding', 'বিয়ের'], haldi: ['a holud', 'গায়ে হলুদের'], winter: ['winter', 'শীতের'], office: ['the office', 'অফিসের'], jummah: ['Jummah', 'জুম্মার'], evening: ['an evening out', 'সন্ধ্যার দাওয়াতের'], casual: ['everyday wear', 'প্রতিদিনের'], gift: ['a gift', 'উপহারের'] };

  if (!scored.length) {
    return { reply: bn ? 'দুঃখিত, এই বাজেটে কিছু পেলাম না। বাজেট একটু বাড়িয়ে আবার চেষ্টা করবেন?' : 'Nothing fits that budget yet. Try a slightly higher budget?', products: [] };
  }
  const lead = scored[0];
  let reply;
  if (bn) {
    reply = `${occasion ? names[occasion][1] + ' জন্য ' : ''}আমার পছন্দ ${lead.name} (${lead.code}), ${money(lead.price)}।`;
    if (weather) reply += ` আজ ${CONFIG.city.name}-তে ${Math.round(weather.temp)}°C, ${cold ? 'একটু ঠান্ডা, তাই গরম কিছু ভালো লাগবে।' : 'তাই আরামদায়ক কাপড় বেছে নিয়েছি।'}`;
    reply += ' নিচে আরও কয়েকটি অপশন দিলাম। দেখতে চাইলে ট্যাপ করুন।';
  } else {
    reply = `For ${occasion ? names[occasion][0] : 'you'}, I’d start with the ${lead.name} (${lead.code}, ${money(lead.price)}). ${lead.desc}`;
    if (weather) reply += ` It’s ${Math.round(weather.temp)}°C in ${CONFIG.city.name} right now, ${cold ? 'so a warm layer makes sense.' : 'so I’ve kept things breathable.'}`;
    if (scored.length > 1) reply += ` A few more picks are below. Tap one for sizes.`;
  }
  return { reply, products: scored.map((p) => p.id) };
}

/* ---------------- Groq (through the Worker) ---------------- */
async function remoteStylist() {
  const w = getWeather();
  const data = await callAI('/chat', {
    messages: history.slice(-10),
    context: { weather: w ? `${CONFIG.city.name}: ${Math.round(w.temp)}°C, ${w.desc}` : null, date: new Date().toDateString() },
  });
  return { reply: data.reply || '', products: (data.products || []).filter((id) => byId.has(id)).slice(0, 4) };
}

/* ---------------- UI ---------------- */
function scrollLog() { const log = $('[data-chat-log]'); log.scrollTop = log.scrollHeight; }

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = `msg msg--${role}`;
  el.textContent = text;
  $('[data-chat-log]').append(el);
  scrollLog();
  return el;
}

function addRecs(ids) {
  if (!ids.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'recs';
  wrap.innerHTML = ids.map((id) => recHTML(byId.get(id))).join('');
  $('[data-chat-log]').append(wrap);
  scrollLog();
}

async function ask(text) {
  text = text.trim();
  if (!text) return;
  addMsg('user', text);
  history.push({ role: 'user', content: text.slice(0, 600) });
  const typing = addMsg('bot', '');
  typing.classList.add('msg--typing');
  typing.innerHTML = '<i></i><i></i><i></i>';

  let result;
  try {
    result = endpoint ? await remoteStylist() : await new Promise((r) => setTimeout(() => r(localStylist(text)), 700));
  } catch (err) {
    console.warn('Stylist endpoint failed, using offline matcher', err);
    result = localStylist(text);
  }
  typing.remove();
  addMsg('bot', result.reply);
  addRecs(result.products);
  history.push({ role: 'assistant', content: result.reply });
}

/* ---------------- Voice ----------------
   With the Worker: record → Groq Whisper (understands Bangla).
   Without: fall back to the browser's own speech recognition if present. */
function initMic(input) {
  const btn = $('[data-mic]');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRecord = endpoint && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;
  if (!canRecord && !SR) return;
  btn.hidden = false;

  if (canRecord) {
    let rec = null, chunks = [];
    btn.addEventListener('click', async () => {
      if (rec && rec.state === 'recording') { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream);
        chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          btn.classList.remove('is-recording');
          input.placeholder = 'Transcribing…';
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const fd = new FormData();
          fd.append('file', blob, 'voice.webm');
          try {
            const res = await fetch(`${endpoint}/transcribe`, { method: 'POST', body: fd });
            const { text } = await res.json();
            if (text) ask(text);
          } catch { /* ignore */ }
          input.placeholder = 'Ask the stylist…';
        };
        rec.start();
        btn.classList.add('is-recording');
        input.placeholder = 'Listening… tap again to stop';
        setTimeout(() => rec?.state === 'recording' && rec.stop(), 15000);
      } catch { input.placeholder = 'Microphone permission was denied'; }
    });
  } else {
    const r = new SR();
    r.lang = navigator.language?.startsWith('bn') ? 'bn-BD' : 'en-IN';
    r.interimResults = false;
    r.onresult = (e) => ask(e.results[0][0].transcript);
    r.onend = () => btn.classList.remove('is-recording');
    btn.addEventListener('click', () => { btn.classList.add('is-recording'); r.start(); });
  }
}

/* ---------------- Studio tabs ---------------- */
export function showPane(name) {
  $$('[data-studio-tabs] button').forEach((b) => b.classList.toggle('is-active', b.dataset.pane === name));
  $$('[data-pane-id]').forEach((p) => p.classList.toggle('is-active', p.dataset.paneId === name));
}

export async function initStylist(list, weatherGetter) {
  products = list;
  byId = new Map(list.map((p) => [p.id, p]));
  getWeather = weatherGetter;
  faqs = (await loadData('faq')).faq || [];

  const modeEl = $('[data-stylist-mode]');
  if (endpoint) { modeEl.textContent = 'Live · Groq'; $('.stylist .pulse').classList.add('is-live'); }

  addMsg('bot', 'Assalamu alaikum! I’m the Hololand assistant ✦ Ask me for outfit ideas (who it’s for, the occasion, a budget) or about delivery, payment, sizes and exchanges.');

  const input = $('[data-chat-input]');
  $('[data-chat-form]').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; ask(v); });
  $('[data-chat-chips]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-rec]');
    if (r) { openQuickView(r.dataset.rec); return; }
    const tab = e.target.closest('[data-studio-tabs] button');
    if (tab) showPane(tab.dataset.pane);
    if (e.target.closest('[data-fab], [data-ask-bot]')) {
      showPane('chat');
      setTimeout(() => input.focus({ preventScroll: true }), 1400);
    }
  });
  initMic(input);
}
