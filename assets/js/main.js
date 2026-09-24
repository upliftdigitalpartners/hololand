import { CONFIG } from './config.js';
import { initShop, setFilter, openQuickView, money, img } from './shop.js';
import { initStylist } from './stylist.js';
import { initPhotoMatch } from './photo-match.js';
import { initGift } from './gift.js';
import { initFaq } from './faq.js';
import { applyContent } from './content.js';

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
const webgl = hasWebGL();
if (!webgl) document.documentElement.classList.add('no-webgl');

const HERO_SLIDES = [
  { id: 'mp-223', src: img('mp-223', 'lg') },
  { id: 'wk-rose', src: img('wk-rose-1', 'lg') },
  { id: 'mp-225', src: img('mp-225', 'lg') },
  { id: 'wk-cobalt', src: img('wk-cobalt-1', 'lg') },
  { id: 'mp-187', src: img('mp-187', 'lg') },
];

/* ---------------- Smooth scroll ---------------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, touchMultiplier: 1.4 });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
function scrollToEl(target) {
  if (!target) return;
  if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
  else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

/* ---------------- Data ---------------- */
const productsReq = fetch('assets/data/products.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => d.products.filter((p) => !p.hidden));

/* ---------------- Weather (Open-Meteo, no key) ---------------- */
let weather = null;
const WMO = (c) => (c === 0 ? 'clear skies' : c <= 3 ? 'partly cloudy' : c <= 48 ? 'hazy' : c <= 57 ? 'drizzle' : c <= 67 ? 'rain' : c <= 77 ? 'cold' : c <= 82 ? 'showers' : 'thunderstorms');
const WICON = (c) => (c === 0 ? '☀' : c <= 3 ? '⛅' : c <= 48 ? '🌫' : c <= 82 ? '🌧' : '⛈');
fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.city.lat}&longitude=${CONFIG.city.lon}&current=temperature_2m,weather_code&timezone=auto`)
  .then((r) => r.json())
  .then((d) => {
    const c = d.current;
    weather = { temp: c.temperature_2m, code: c.weather_code, desc: WMO(c.weather_code) };
    const chip = $('[data-weather]');
    chip.textContent = `${WICON(weather.code)} ${CONFIG.city.name} ${Math.round(weather.temp)}°`;
    chip.hidden = false;
    const tip = weather.temp < 22 ? 'knitwear weather' : weather.temp < 28 ? 'perfect panjabi weather' : 'go light & breathable';
    $('[data-stylist-weather]').textContent = `${WICON(weather.code)} ${Math.round(weather.temp)}°C, ${weather.desc}. ${tip}`;
  })
  .catch(() => { $('[data-stylist-weather]').textContent = `${CONFIG.city.name}, Bangladesh`; });

/* ---------------- Static bits (after content.json is applied) ---------------- */
function applyStatic() {
  $$('[data-year]').forEach((e) => (e.textContent = new Date().getFullYear()));
  $$('[data-delivery-note]').forEach((e) => (e.textContent = CONFIG.deliveryNote));
  $$('[data-city]').forEach((e) => (e.textContent = CONFIG.city.name));
  $$('[data-social]').forEach((a) => (a.href = CONFIG.socials[a.dataset.social] || '#'));
  $$('[data-whatsapp]').forEach((a) => { a.href = `https://wa.me/${CONFIG.whatsappNumber}`; a.target = '_blank'; a.rel = 'noopener'; });
}
$('[data-newsletter]').addEventListener('submit', (e) => {
  e.preventDefault();
  $('[data-newsletter-note]').textContent = 'Thank you! You’re on the list ✦';
  e.target.reset();
});

/* ---------------- Nav ---------------- */
const nav = $('.nav');
let lastY = 0;
const fab = $('[data-fab]');
function onScrollNav(y) {
  const st = $('#stylist');
  const r = st.getBoundingClientRect();
  fab.classList.toggle('is-visible', y > innerHeight * 1.5 && (r.bottom < 0 || r.top > innerHeight));
  nav.classList.toggle('is-scrolled', y > 40);
  nav.classList.toggle('is-hidden', y > lastY && y > 400 && !document.body.classList.contains('menu-open'));
  lastY = y;
}
if (lenis) lenis.on('scroll', ({ scroll }) => onScrollNav(scroll));
else addEventListener('scroll', () => onScrollNav(scrollY), { passive: true });

const menuBtn = $('[data-menu]');
const menu = $('[data-mobile-menu]');
menuBtn.addEventListener('click', () => {
  const open = !menu.classList.contains('is-open');
  menu.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', open);
  if (open) { lenis?.stop(); gsap.fromTo($$('a', menu), { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.06, duration: 0.8, ease: 'expo.out', delay: 0.15 }); }
  else lenis?.start();
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  if (id.length < 2) { e.preventDefault(); return; }
  const target = $(id);
  if (!target) return;
  e.preventDefault();
  if (a.dataset.filterLink) setFilter(a.dataset.filterLink);
  if (menu.classList.contains('is-open')) menuBtn.click();
  scrollToEl(target);
});

/* ---------------- Cursor + magnetic ---------------- */
if (finePointer && !reduced) {
  const cur = $('.cursor');
  const dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
  const xd = gsap.quickTo(dot, 'x', { duration: 0.1 }), yd = gsap.quickTo(dot, 'y', { duration: 0.1 });
  const xr = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' }), yr = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
  addEventListener('pointermove', (e) => { cur.classList.add('is-active'); xd(e.clientX); yd(e.clientY); xr(e.clientX); yr(e.clientY); }, { passive: true });
  const setLabel = (text) => { label.textContent = text || ''; cur.classList.toggle('has-label', !!text); };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor], a, button, input, select');
    cur.classList.toggle('is-hover', !!t);
    setLabel(t?.dataset.cursor);
  });
  window.__setCursorLabel = setLabel;

  $$('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.3);
      y((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}

/* ---------------- Hero ---------------- */
let hero = null;
const heroIndex = $('[data-hero-index]'), heroCaption = $('[data-hero-caption]'), heroBar = $('[data-hero-progress]');
async function setupHero(products, onProgress) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const caption = (i) => { const p = byId.get(HERO_SLIDES[i].id); return p ? `${p.code} — ${p.name}` : ''; };
  const onSlide = (i, interval) => {
    heroIndex.textContent = `${String(i + 1).padStart(2, '0')} / ${String(HERO_SLIDES.length).padStart(2, '0')}`;
    gsap.to(heroCaption, { opacity: 0, y: -8, duration: 0.3, onComplete: () => { heroCaption.textContent = caption(i); gsap.to(heroCaption, { opacity: 1, y: 0, duration: 0.5 }); } });
    gsap.fromTo(heroBar, { width: '0%' }, { width: '100%', duration: interval, ease: 'none' });
  };
  if (!webgl) { onProgress(1); heroCaption.textContent = caption(0); return; }
  try {
    const { Hero } = await import('./gl/hero.js');
    hero = new Hero($('[data-hero-canvas]'), HERO_SLIDES, { onSlide });
    await hero.load(onProgress);
    hero.onSlideInit = () => hero.autoplay(gsap, reduced ? 8 : 5.5);
  } catch (err) {
    console.error(err);
    document.documentElement.classList.add('no-webgl');
    onProgress(1);
  }
}

function heroScroll() {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '.hero', start: 'top top', end: '+=100%', pin: true, scrub: true,
      onUpdate: (st) => hero?.setScroll(st.progress),
    },
  });
  tl.to('.hero__content', { yPercent: -30, opacity: 0, ease: 'none' }, 0)
    .to('.hero__meta, .hero__scroll', { opacity: 0, ease: 'none', duration: 0.4 }, 0);
  // Pause the hero shader while it is off-screen.
  new IntersectionObserver(([e]) => hero?.setRunning(e.isIntersecting)).observe($('[data-hero-canvas]'));
}

/* ---------------- Scroll animations ---------------- */
function animations() {
  // Heading reveals
  $$('[data-split]').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines,words', mask: 'lines' });
    gsap.from(split.words, { yPercent: 110, duration: 1.2, stagger: 0.04, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
  });
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });
  // Collection images: clip reveal + parallax
  $$('.coll-card').forEach((card) => {
    const media = $('.coll-card__media', card);
    gsap.from(media, { clipPath: 'inset(100% 0 0 0 round 999px 999px 18px 18px)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: card, start: 'top 80%' } });
    gsap.from($$('.coll-card__body > *', card), { y: 24, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 60%' } });
  });
  $$('[data-parallax]').forEach((im) => {
    gsap.fromTo(im, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: im.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Marquee driven by time + scroll velocity
  const track = $('[data-marquee]');
  let x = 0, dir = -1;
  const half = () => track.scrollWidth / 2;
  gsap.ticker.add((t, dt) => {
    const v = lenis ? lenis.velocity : 0;
    if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
    x += dir * (0.04 + Math.min(Math.abs(v) * 0.02, 0.6)) * dt;
    const h = half();
    if (x <= -h) x += h;
    if (x > 0) x -= h;
    track.style.transform = `translate3d(${x}px,0,0) skewX(${gsap.utils.clamp(-8, 8, -v * 0.3)}deg)`;
  });

  // Story: words light up with scroll
  const story = $('[data-words]');
  story.innerHTML = story.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
  gsap.to($$('.w', story), { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: story, start: 'top 75%', end: 'bottom 45%', scrub: true } });
  $$('[data-counter]').forEach((el) => {
    const o = { v: 0 };
    gsap.to(o, { v: +el.dataset.counter, duration: 2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => (el.textContent = Math.round(o.v)) });
  });
  gsap.from('.story__strip img', { y: 80, opacity: 0, stagger: 0.08, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.story__strip', start: 'top 90%' } });
}

function animateGrid(grid) {
  const cards = $$('.card', grid);
  gsap.fromTo(cards, { y: 60, opacity: 0 }, {
    y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: { each: 0.06, grid: 'auto' },
    scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
  });
  ScrollTrigger.refresh();
}

/* ---------------- Lookbook & footer (lazy) ---------------- */
function setupLookbook(products) {
  const code = $('[data-lb-code]'), name = $('[data-lb-name]'), price = $('[data-lb-price]');
  const items = products.flatMap((p) => p.images.slice(0, p.cat === 'women' ? 2 : 1).map((b) => ({ id: p.id, src: img(b, 'sm'), p })));
  const setCaption = (item) => {
    gsap.to([code, name, price], {
      opacity: 0, y: -6, duration: 0.2, stagger: 0.03, onComplete: () => {
        code.textContent = item.p.code; name.textContent = item.p.name; price.textContent = money(item.p.price);
        gsap.to([code, name, price], { opacity: 1, y: 0, duration: 0.45, stagger: 0.05 });
      },
    });
  };
  if (!webgl) { $('.lookbook').style.display = 'none'; return; }
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const { Lookbook } = await import('./gl/lookbook.js');
    const lb = new Lookbook($('[data-lookbook-canvas]'), items, {
      onFront: setCaption,
      onOpen: (item) => openQuickView(item.id),
      onHover: (on) => window.__setCursorLabel?.(on ? 'View' : 'Drag'),
    });
    ScrollTrigger.create({ trigger: '.lookbook', start: 'top top', end: 'bottom bottom', onUpdate: (st) => lb.setProgress(st.progress) });
    $('[data-lookbook-canvas]').dataset.cursor = 'Drag';
  }, { rootMargin: '600px' });
  io.observe($('.lookbook'));
}

function setupFooter() {
  if (!webgl) return;
  const canvas = $('[data-logo-canvas]');
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const { LogoParticles } = await import('./gl/logo-particles.js');
    const lp = new LogoParticles(canvas);
    gsap.to(lp.uniforms.uIntro, { value: 1, duration: 3, ease: 'power2.out' });
  }, { rootMargin: '200px' });
  io.observe(canvas);
}

/* Shrinks the hero title until its longest line fits (texts are editable in admin). */
function fitHeroTitle() {
  const t = $('[data-hero-title]');
  const lines = $$('.line', t);
  lines.forEach((l) => (l.style.whiteSpace = 'nowrap'));
  const max = t.clientWidth;
  let size = parseFloat(getComputedStyle(t).fontSize);
  while (size > 36 && lines.some((l) => l.scrollWidth > max)) {
    size -= 4;
    t.style.fontSize = `${size}px`;
  }
}

/* ---------------- Loader → intro ---------------- */
async function boot() {
  const count = $('[data-count]'), bar = $('.loader__bar i');
  const shown = { v: 0 };
  let target = 0;
  const progress = (p) => { target = Math.max(target, p); };
  const counterTween = gsap.ticker.add(() => {
    shown.v += (target * 100 - shown.v) * 0.12;
    count.textContent = Math.round(shown.v);
    bar.style.width = `${shown.v}%`;
  });

  gsap.from('.loader__mark .m-a', { x: -40, opacity: 0, duration: 1, ease: 'expo.out' });
  gsap.from('.loader__mark .m-c', { x: 40, opacity: 0, duration: 1, ease: 'expo.out', delay: 0.08 });
  gsap.from('.loader__mark .m-b', { scale: 0.4, opacity: 0, transformOrigin: '50% 60%', duration: 1.1, ease: 'expo.out', delay: 0.2 });
  gsap.from('.loader__word', { letterSpacing: '1.2em', opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.3 });

  const products = await productsReq;
  await applyContent(products).catch((err) => console.warn('content.json', err));
  applyStatic();
  initShop(products, { onRender: animateGrid });
  initStylist(products, () => weather);
  initPhotoMatch(products);
  initGift(products);
  initFaq().then(() => ScrollTrigger.refresh());

  await Promise.all([
    setupHero(products, (p) => progress(p * 0.9)),
    document.fonts?.ready.catch(() => {}),
    new Promise((r) => setTimeout(r, 900)),
  ]);
  progress(1);
  await new Promise((r) => setTimeout(r, 450));
  gsap.ticker.remove(counterTween);
  count.textContent = 100;

  // Intro
  fitHeroTitle();
  const titleSplit = SplitText.create('[data-hero-title] .line', { type: 'words,chars', mask: 'words' });
  const tl = gsap.timeline({ onComplete: () => { lenis?.start(); document.body.classList.remove('is-loading'); } });
  tl.to('.loader__mark, .loader__word, .loader__count', { y: -30, opacity: 0, duration: 0.6, ease: 'power3.in', stagger: 0.05 })
    .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.1')
    .set('.loader', { display: 'none' })
    .from(titleSplit.chars, { yPercent: 110, duration: 1.3, stagger: 0.025, ease: 'expo.out' }, '-=0.55')
    .from('[data-hero-reveal]', { y: 26, opacity: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' }, '-=1.0')
    .from('.nav > *', { y: -30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }, '-=1.1');
  hero?.onSlideInit?.();
  if (!hero) onSlideFallback(products);

  heroScroll();
  animations();
  setupLookbook(products);
  setupFooter();
  addEventListener('load', () => ScrollTrigger.refresh());
}

function onSlideFallback(products) {
  const p = products.find((x) => x.id === HERO_SLIDES[0].id);
  heroIndex.textContent = '01 / 01';
  if (p) heroCaption.textContent = `${p.code} — ${p.name}`;
}

boot().catch((err) => {
  console.error(err);
  gsap.set('.loader', { display: 'none' });
  document.body.classList.remove('is-loading');
  lenis?.start();
});
