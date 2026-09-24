import { boot, $, $$, reduced, lite, animateCards } from '../core.js';
import { img, cardHTML, esc, money, productUrl } from '../shop.js';
import { categories, catTitle, catUrl } from '../categories.js';

// Old one-page links (hololandbd.com/#shop …) go to the new pages.
const LEGACY = { '#shop': 'shop.html', '#lookbook': 'lookbook.html', '#stylist': 'stylist.html', '#story': 'story.html', '#faq': 'help.html' };
if (LEGACY[location.hash]) location.replace(LEGACY[location.hash]);

const HERO_SLIDES = [
  { id: 'mp-223', src: img('mp-223', 'lg') },
  { id: 'wk-rose', src: img('wk-rose-1', 'lg') },
  { id: 'mp-225', src: img('mp-225', 'lg') },
  { id: 'wk-cobalt', src: img('wk-cobalt-1', 'lg') },
  { id: 'mp-187', src: img('mp-187', 'lg') },
];

/* Shrinks the hero title until its longest line fits (texts are editable in admin). */
function fitHeroTitle() {
  const t = $('[data-hero-title]');
  const lines = $$('.line', t);
  lines.forEach((l) => (l.style.whiteSpace = 'nowrap'));
  const max = t.clientWidth;
  let size = parseFloat(getComputedStyle(t).fontSize);
  while (size > 36 && lines.some((l) => l.scrollWidth > max)) { size -= 4; t.style.fontSize = `${size}px`; }
}

boot('home', async ({ products, gsap, SplitText, lenis }) => {
  const byId = new Map(products.map((p) => [p.id, p]));

  // Featured: a mix across the collections, taking turns
  const cats = categories().filter((c) => products.some((p) => p.cat === c.id));
  const pools = cats.map((c) => products.filter((p) => p.cat === c.id));
  const featured = [];
  for (let i = 0; featured.length < 8 && pools.some((pl) => pl[i]); i++) pools.forEach((pl) => pl[i] && featured.push(pl[i]));
  $('[data-featured]').innerHTML = featured.slice(0, 8).map(cardHTML).join('');
  animateCards($('[data-featured]'));

  // One card per collection that has products
  const COVER = { men: 'mp-187', women: 'wk-rose-1' };
  const italicLast = (t) => { const w = esc(t).split(' '); return w.length > 1 ? `${w.slice(0, -1).join(' ')} <em>${w.at(-1)}</em>` : `<em>${w[0]}</em>`; };
  $('[data-collections]').innerHTML = cats.map((c, i) => {
    const list = products.filter((p) => p.cat === c.id);
    const cover = list.find((p) => p.images.includes(COVER[c.id]))?.images.find((b) => b === COVER[c.id]) || list[0].images[0];
    return `<a href="${catUrl(c.id)}" class="coll-card ${i % 2 ? 'coll-card--offset' : ''}" data-cursor="Explore">
      <div class="coll-card__media arch"><img src="${img(cover, 'lg')}" alt="${esc(c.name)}" loading="lazy" data-parallax /></div>
      <div class="coll-card__body">
        <span class="mono">${list.length} style${list.length === 1 ? '' : 's'}</span>
        <h3>${italicLast(catTitle(c))}</h3>
        ${c.lede ? `<p>${esc(c.lede)}</p>` : ''}
        <span class="link-arrow">Shop ${esc((c.type || c.name).toLowerCase())} <i>→</i></span>
      </div>
    </a>`;
  }).join('');
  if (cats.length !== 2) $('[data-collections-title]').innerHTML = cats.length === 1 ? 'The <em>collection.</em>' : 'Every story, <em>one thread.</em>';

  // Collection cards + teaser fan
  $$('.coll-card').forEach((card) => {
    gsap.from($('.coll-card__media', card), { clipPath: 'inset(100% 0 0 0 round 999px 999px 18px 18px)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: card, start: 'top 80%' } });
    gsap.from($$('.coll-card__body > *', card), { y: 24, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 60%' } });
  });
  gsap.from('.teaser__fan img', { y: 80, opacity: 0, rotate: 0, stagger: 0.12, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.teaser__fan', start: 'top 80%' } });
  gsap.from('.teaser__chat > *', { y: 30, opacity: 0, stagger: 0.25, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.teaser__chat', start: 'top 80%' } });

  // Marquee driven by time + scroll velocity
  const track = $('[data-marquee]');
  let x = 0, dir = -1;
  if (lite) track.classList.add('is-css'); // phones: a plain CSS loop, no per-frame work
  else gsap.ticker.add((t, dt) => {
    const v = lenis ? lenis.velocity : 0;
    if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
    x += dir * (0.04 + Math.min(Math.abs(v) * 0.02, 0.6)) * dt;
    const h = track.scrollWidth / 2;
    if (x <= -h) x += h;
    if (x > 0) x -= h;
    track.style.transform = `translate3d(${x}px,0,0) skewX(${gsap.utils.clamp(-8, 8, -v * 0.3)}deg)`;
  });

  // Hero
  const heroIndex = $('[data-hero-index]'), heroCaption = $('[data-hero-caption]'), heroBar = $('[data-hero-progress]');
  const caption = (i) => { const p = byId.get(HERO_SLIDES[i].id); return p ? `${p.code} — ${p.name}` : ''; };
  const onSlide = (i, interval) => {
    heroIndex.textContent = `${String(i + 1).padStart(2, '0')} / ${String(HERO_SLIDES.length).padStart(2, '0')}`;
    gsap.to(heroCaption, { opacity: 0, y: -8, duration: 0.3, onComplete: () => { heroCaption.textContent = caption(i); gsap.to(heroCaption, { opacity: 1, y: 0, duration: 0.5 }); } });
    gsap.fromTo(heroBar, { width: '0%' }, { width: '100%', duration: interval, ease: 'none' });
  };

  // Loader progress
  const count = $('[data-count]'), bar = $('.loader__bar i');
  const shown = { v: 0 };
  let target = 0;
  const progress = (p) => { target = Math.max(target, p); };
  const counter = () => { shown.v += (target * 100 - shown.v) * 0.12; count.textContent = Math.round(shown.v); bar.style.width = `${shown.v}%`; };
  gsap.ticker.add(counter);
  gsap.from('.loader__mark .m-a', { x: -40, opacity: 0, duration: 1, ease: 'expo.out' });
  gsap.from('.loader__mark .m-c', { x: 40, opacity: 0, duration: 1, ease: 'expo.out', delay: 0.08 });
  gsap.from('.loader__mark .m-b', { scale: 0.4, opacity: 0, transformOrigin: '50% 60%', duration: 1.1, ease: 'expo.out', delay: 0.2 });
  gsap.from('.loader__word', { letterSpacing: '1.2em', opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.3 });

  // Hero: a product photo slideshow (swipe on phones, tap to shop).
  const slides = HERO_SLIDES.filter((s) => byId.has(s.id));
  if (!slides.length) products.slice(0, 5).forEach((p) => slides.push({ id: p.id, src: img(p.images[0], 'lg') }));
  const slidesEl = $('[data-hero-slides]');
  slidesEl.innerHTML = slides.map((s, i) => {
    const p = byId.get(s.id);
    return `<a class="hero__slide ${i ? '' : 'is-active'}" href="${productUrl(s.id)}" ${i ? 'tabindex="-1" aria-hidden="true"' : ''} aria-label="${esc(p ? `${p.name}, ${money(p.price)}` : 'Shop')}">
      <img src="${s.src}" alt="" decoding="async" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} /></a>`;
  }).join('');
  HERO_SLIDES.length = 0; HERO_SLIDES.push(...slides);
  const INTERVAL = reduced ? 8 : 5;
  let current = 0, timer = null, running = true;
  const go = (i) => {
    const els = $$('.hero__slide', slidesEl);
    current = (i + els.length) % els.length;
    els.forEach((el, k) => {
      el.classList.toggle('is-active', k === current);
      el.setAttribute('aria-hidden', k === current ? 'false' : 'true');
      el.tabIndex = k === current ? 0 : -1;
    });
    const next = els[(current + 1) % els.length]?.querySelector('img');
    if (next) next.loading = 'eager'; // warm the next photo
    onSlide(current, INTERVAL);
    schedule();
  };
  const schedule = () => { clearTimeout(timer); if (running && slides.length > 1) timer = setTimeout(() => go(current + 1), INTERVAL * 1000); };
  const setRunning = (on) => { running = on; if (on) schedule(); else clearTimeout(timer); };
  // Swipe left/right on phones
  let sx = null, sy = 0;
  slidesEl.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; }, { passive: true });
  slidesEl.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) { go(current + (dx < 0 ? 1 : -1)); slidesEl.dataset.swiped = '1'; }
  });
  slidesEl.addEventListener('click', (e) => { if (slidesEl.dataset.swiped) { e.preventDefault(); delete slidesEl.dataset.swiped; } });
  const loadHero = async () => {
    const first = slidesEl.querySelector('img');
    await (first.complete ? Promise.resolve() : new Promise((r) => { first.onload = first.onerror = r; }));
    await first.decode?.().catch(() => {});
    progress(1);
  };
  // Returning visitors in the same session get a shorter loader.
  let seen = false;
  try { seen = sessionStorage.getItem('hl.seen') === '1'; sessionStorage.setItem('hl.seen', '1'); } catch { /* ignore */ }
  await Promise.all([loadHero(), document.fonts?.ready.catch(() => {}), new Promise((r) => setTimeout(r, seen ? 200 : 900))]);
  progress(1);

  return {
    intro: async () => {
      await new Promise((r) => setTimeout(r, seen ? 150 : 450));
      gsap.ticker.remove(counter);
      count.textContent = 100;
      fitHeroTitle();
      const titleSplit = SplitText.create('[data-hero-title] .line', { type: 'words,chars', mask: 'words' });
      const tl = gsap.timeline();
      tl.to('.loader__mark, .loader__word, .loader__count', { y: -30, opacity: 0, duration: 0.5, ease: 'power3.in', stagger: 0.05 })
        .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.1')
        .set('.loader', { display: 'none' })
        .from(titleSplit.chars, { yPercent: 110, duration: 1.3, stagger: 0.025, ease: 'expo.out' }, '-=0.55')
        .from('[data-hero-reveal]', { y: 26, opacity: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' }, '-=1.0')
        .from('.nav > *', { y: -30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }, '-=1.1');
      go(0);
      // Gentle fade as you scroll past (no pinning: keeps phone scrolling smooth).
      if (!lite) gsap.to('.hero__content, .hero__meta, .hero__scroll', { y: -60, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 30%', scrub: true } });
      new IntersectionObserver(([e]) => setRunning(e.isIntersecting && !document.hidden)).observe(slidesEl);
      document.addEventListener('visibilitychange', () => setRunning(!document.hidden));
    },
  };
});
