import { CONFIG } from './config.js';
import { recHTML, money, setGiftNote, openBag, toast } from './shop.js';
import { aiEnabled, callAI, esc } from './ai.js';

const $ = (s, r = document) => r.querySelector(s);

const STEPS = [
  { key: 'who', q: 'Who is it for?', opts: [
    ['husband', 'Husband', 'men'], ['father', 'Father', 'men'], ['brother', 'Brother', 'men'], ['son', 'Son', 'men'],
    ['wife', 'Wife', 'women'], ['mother', 'Mother', 'women'], ['sister', 'Sister', 'women'], ['friend', 'Friend', null]] },
  { key: 'occasion', q: 'What’s the occasion?', opts: [
    ['eid', 'Eid'], ['wedding', 'Wedding'], ['birthday', 'Birthday'], ['anniversary', 'Anniversary'], ['winter', 'Winter warmth'], ['just', 'Just because']] },
  { key: 'budget', q: 'Your budget?', opts: [
    ['2500', `Under ${CONFIG.currency}2,500`], ['3500', `Under ${CONFIG.currency}3,500`], ['99999', 'No limit']] },
  { key: 'style', q: 'Their style?', opts: [
    ['classic', 'Classic'], ['bold', 'Bold & bright'], ['pastel', 'Soft & pastel'], ['premium', 'Something special']] },
];

const OCC_TAGS = { eid: ['eid', 'festive'], wedding: ['wedding', 'premium', 'evening'], birthday: ['bold', 'gift', 'party'], anniversary: ['premium', 'evening', 'classic'], winter: ['winter'], just: ['casual', 'gift'] };

const MESSAGES = {
  en: {
    eid: (w) => `Eid Mubarak, dear ${w}! May this Eid bring you as much joy as you bring to all of us.`,
    wedding: (w) => `For the big day, dear ${w}. Wishing you a lifetime of love and laughter.`,
    birthday: (w) => `Happy birthday, dear ${w}! Here’s to another year of you, wear it well.`,
    anniversary: (w) => `Happy anniversary, my ${w}. Every year with you is my favourite.`,
    winter: (w) => `Something warm for you, dear ${w}, to keep you cosy all winter.`,
    just: (w) => `No reason at all, dear ${w}. Just because you deserve something lovely.`,
  },
  bn: {
    eid: () => 'ঈদ মোবারক! এই ঈদ তোমার জীবনে অনেক আনন্দ নিয়ে আসুক।',
    wedding: () => 'শুভ বিবাহ! ভালোবাসা আর হাসিতে ভরে উঠুক তোমাদের নতুন জীবন।',
    birthday: () => 'শুভ জন্মদিন! তোমার জন্য অনেক ভালোবাসা আর শুভকামনা।',
    anniversary: () => 'শুভ বিবাহবার্ষিকী! তোমার সাথে প্রতিটা বছরই আমার প্রিয়।',
    winter: () => 'শীতের উষ্ণতা তোমার জন্য। ভালো থেকো, উষ্ণ থেকো।',
    just: () => 'কোনো কারণ ছাড়াই, শুধু তোমার জন্য একটু ভালোবাসা।',
  },
};

let products = [];
let answers = {};
let step = 0;
let result = null;

function pick() {
  const who = STEPS[0].opts.find((o) => o[0] === answers.who);
  const cat = who?.[2];
  const tags = [...(OCC_TAGS[answers.occasion] || []), answers.style];
  return products
    .filter((p) => (!cat || p.cat === cat) && p.price <= +answers.budget)
    .map((p) => ({ p, s: tags.reduce((s, t) => s + (p.tags.includes(t) ? 1 : 0), 0) + Math.random() * 0.3 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.p);
}

function localResult() {
  const whoLabel = STEPS[0].opts.find((o) => o[0] === answers.who)?.[1].toLowerCase() || 'friend';
  return {
    products: pick().map((p) => p.id),
    message_en: MESSAGES.en[answers.occasion](whoLabel),
    message_bn: MESSAGES.bn[answers.occasion](),
  };
}

function renderStep() {
  const el = $('[data-gift]');
  const s = STEPS[step];
  el.innerHTML = `
    <div class="gift__progress">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    <p class="mono">Step ${step + 1} of ${STEPS.length}</p>
    <h3 class="gift__q">${s.q}</h3>
    <div class="gift__opts">${s.opts.map((o) => `<button data-gift-opt="${o[0]}" class="${answers[s.key] === o[0] ? 'is-active' : ''}">${o[1]}</button>`).join('')}</div>
    ${step ? '<button class="link-btn" data-gift-back>← Back</button>' : ''}`;
}

async function finish() {
  const el = $('[data-gift]');
  el.innerHTML = '<div class="gift__loading"><div class="msg msg--typing"><i></i><i></i><i></i></div><p>Picking the perfect gift…</p></div>';
  result = localResult();
  let byAI = false;
  if (aiEnabled) {
    try {
      const ai = await callAI('/gift', answers);
      const ids = (ai?.products || []).filter((id) => products.some((p) => p.id === id));
      if (ai?.message_en) { result = { products: ids.length ? ids : result.products, message_en: ai.message_en, message_bn: ai.message_bn || result.message_bn, reason: ai.reason }; byAI = true; }
    } catch (err) { console.warn('gift AI failed', err); }
  } else {
    await new Promise((r) => setTimeout(r, 600));
  }
  const picks = result.products.map((id) => products.find((p) => p.id === id)).filter(Boolean);
  el.innerHTML = `
    <p class="mono">Our picks ${byAI ? '<em class="ai-tag">✦ AI</em>' : ''}</p>
    ${result.reason ? `<p class="pane__note">${esc(result.reason)}</p>` : ''}
    <div class="recs recs--grid">${picks.length ? picks.map(recHTML).join('') : '<p class="pane__note">Nothing in that budget yet. Try a higher one.</p>'}</div>
    <div class="giftcard">
      <div class="giftcard__head"><span class="mono">🎁 Gift card message</span>
        <div class="seg seg--sm" data-gift-lang><button class="is-active" data-gl="en">EN</button><button data-gl="bn">বাংলা</button></div></div>
      <textarea data-gift-msg rows="3" maxlength="300">${esc(result.message_en)}</textarea>
      <div class="giftcard__actions">
        <button class="btn btn--solid btn--sm" data-gift-use><span>Add card to my order</span></button>
        <button class="btn btn--ghost btn--sm" data-gift-copy><span>Copy</span></button>
      </div>
    </div>
    <button class="link-btn" data-gift-restart>↺ Start again</button>`;
  if (picks.length) $('[data-gift] .recs').insertAdjacentHTML('afterend', `<p class="pane__hint">From ${money(Math.min(...picks.map((p) => p.price)))}. Tap a piece to choose a size.</p>`);
}

export function initGift(list) {
  products = list;
  renderStep();
  $('[data-gift]').addEventListener('click', async (e) => {
    const opt = e.target.closest('[data-gift-opt]');
    if (opt) {
      answers[STEPS[step].key] = opt.dataset.giftOpt;
      if (step < STEPS.length - 1) { step++; renderStep(); } else finish();
      return;
    }
    if (e.target.closest('[data-gift-back]')) { step--; renderStep(); }
    if (e.target.closest('[data-gift-restart]')) { step = 0; answers = {}; renderStep(); }
    const gl = e.target.closest('[data-gl]');
    if (gl) {
      $('[data-gift-msg]').value = gl.dataset.gl === 'bn' ? result.message_bn : result.message_en;
      e.currentTarget.querySelectorAll('[data-gl]').forEach((b) => b.classList.toggle('is-active', b === gl));
    }
    if (e.target.closest('[data-gift-copy]')) {
      try { await navigator.clipboard.writeText($('[data-gift-msg]').value); toast('Message copied'); } catch { toast('Couldn’t copy. Select the text instead.'); }
    }
    if (e.target.closest('[data-gift-use]')) {
      setGiftNote($('[data-gift-msg]').value);
      toast('Gift message saved to your bag 🎁');
      openBag();
    }
  });
}
