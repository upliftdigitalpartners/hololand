// Shared boot for every page: layout, smooth scroll, cursor, bag, content,
// weather, scroll animations and branded page transitions.
import { CONFIG } from './config.js';
import { track } from './track.js';
import { renderLayout } from './layout.js';
import { initStore } from './shop.js';
import { applyContent } from './content.js';

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
export const webgl = (() => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
})();
if (!webgl) document.documentElement.classList.add('no-webgl');

export const productsReq = fetch('assets/data/products.json', { cache: 'no-cache' })
  .then((r) => r.json()).then((d) => d.products.filter((p) => !p.hidden));

/* ---------------- Weather (Open-Meteo, no key) ---------------- */
let weather = null;
export const getWeather = () => weather;
const WMO = (c) => (c === 0 ? 'clear skies' : c <= 3 ? 'partly cloudy' : c <= 48 ? 'hazy' : c <= 57 ? 'drizzle' : c <= 67 ? 'rain' : c <= 77 ? 'cold' : c <= 82 ? 'showers' : 'thunderstorms');
export const WICON = (c) => (c === 0 ? '☀' : c <= 3 ? '⛅' : c <= 48 ? '🌫' : c <= 82 ? '🌧' : '⛈');
function loadWeather() {
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.city.lat}&longitude=${CONFIG.city.lon}&current=temperature_2m,weather_code&timezone=auto`)
    .then((r) => r.json())
    .then((d) => {
      const c = d.current;
      weather = { temp: c.temperature_2m, code: c.weather_code, desc: WMO(c.weather_code) };
      const chip = $('[data-weather]');
      chip.textContent = `${WICON(weather.code)} ${CONFIG.city.name} ${Math.round(weather.temp)}°`;
      chip.hidden = false;
      document.dispatchEvent(new CustomEvent('weather', { detail: weather }));
    })
    .catch(() => document.dispatchEvent(new CustomEvent('weather', { detail: null })));
}

/* ---------------- Smooth scroll ---------------- */
let lenis = null;
function setupScroll() {
  if (reduced) return;
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, touchMultiplier: 1.4 });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

/* ---------------- Nav, menu, FAB ---------------- */
function setupNav() {
  const nav = $('.nav');
  const fab = $('[data-fab]');
  let lastY = 0;
  const onScroll = (y) => {
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > lastY && y > 400 && !document.body.classList.contains('menu-open'));
    fab?.classList.toggle('is-visible', y > innerHeight * 0.8);
    lastY = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else addEventListener('scroll', () => onScroll(scrollY), { passive: true });
  onScroll(scrollY);

  const menuBtn = $('[data-menu]');
  const menu = $('[data-mobile-menu]');
  menuBtn.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    if (open) {
      lenis?.stop();
      gsap.fromTo($$('.mobile-menu__links a', menu), { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.05, duration: 0.8, ease: 'expo.out', delay: 0.15 });
    } else lenis?.start();
  });
}

/* ---------------- Page transitions ---------------- */
function curtain() {
  let c = $('.curtain');
  if (!c) {
    document.body.insertAdjacentHTML('beforeend', '<div class="curtain" aria-hidden="true"><svg class="curtain__mark"><use href="#mark" /></svg></div>');
    c = $('.curtain');
    gsap.set(c, { clipPath: 'inset(100% 0 0 0)' });
  }
  return c;
}
function revealCurtain() {
  const c = $('.curtain');
  if (!c) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: resolve })
      .to('.curtain__mark', { opacity: 0, y: -20, duration: 0.35, ease: 'power2.in' })
      .to(c, { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'expo.inOut' }, '-=0.1');
  });
}
function setupTransitions() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.whatsapp !== undefined) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) return;           // same-page anchor
      e.preventDefault(); return;     // already here
    }
    if (!/(\.html|\/)$/.test(url.pathname)) return;
    e.preventDefault();
    if (reduced) { location.href = url.href; return; }
    const c = curtain();
    gsap.set('.curtain__mark', { opacity: 0, y: 20 });
    gsap.timeline({ onComplete: () => { location.href = url.href; } })
      .fromTo(c, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.7, ease: 'expo.inOut' })
      .to('.curtain__mark', { opacity: 1, y: 0, duration: 0.3 }, '-=0.25');
  });
  // Back/forward from the browser cache: make sure the curtain is lifted.
  addEventListener('pageshow', (e) => { if (e.persisted && $('.curtain')) gsap.set('.curtain', { clipPath: 'inset(0 0 100% 0)' }); });
}

/* ---------------- Cursor + magnetic ---------------- */
function setupCursor() {
  if (!finePointer || reduced) return;
  const cur = $('.cursor');
  const dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
  const xd = gsap.quickTo(dot, 'x', { duration: 0.1 }), yd = gsap.quickTo(dot, 'y', { duration: 0.1 });
  const xr = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' }), yr = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
  addEventListener('pointermove', (e) => { cur.classList.add('is-active'); xd(e.clientX); yd(e.clientY); xr(e.clientX); yr(e.clientY); }, { passive: true });
  const setLabel = (text) => { label.textContent = text || ''; cur.classList.toggle('has-label', !!text); };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor], a, button, input, select, textarea, label');
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

/* ---------------- Static bits ---------------- */
function applyStatic() {
  $$('[data-year]').forEach((e) => (e.textContent = new Date().getFullYear()));
  $$('[data-delivery-note]').forEach((e) => (e.textContent = CONFIG.deliveryNote));
  $$('[data-city]').forEach((e) => (e.textContent = CONFIG.city.name));
  $$('[data-social]').forEach((a) => (a.href = CONFIG.socials[a.dataset.social] || '#'));
  $$('[data-whatsapp]').forEach((a) => { a.href = `https://wa.me/${CONFIG.whatsappNumber}`; a.target = '_blank'; a.rel = 'noopener'; });
}

/* ---------------- Scroll animations ---------------- */
export function animateCards(container) {
  const cards = $$('.card', container);
  if (!cards.length) return;
  gsap.fromTo(cards, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: { each: 0.05, grid: 'auto' }, scrollTrigger: { trigger: container, start: 'top 90%', once: true } });
}
function animations() {
  $$('[data-split]').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines,words', mask: 'lines' });
    gsap.from(split.words, { yPercent: 110, duration: 1.2, stagger: 0.04, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%' } });
  });
  $$('[data-parallax]').forEach((im) => {
    gsap.fromTo(im, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: im.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  $$('[data-clip]').forEach((el) => {
    gsap.from(el, { clipPath: 'inset(100% 0 0 0 round 999px 999px 18px 18px)', duration: 1.5, ease: 'expo.inOut', scrollTrigger: { trigger: el, start: 'top 85%' } });
  });
  $$('[data-words]').forEach((story) => {
    const escW = (w) => w.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    story.innerHTML = story.textContent.trim().split(/\s+/).map((w) => `<span class="w">${escW(w)}</span>`).join(' ');
    gsap.to($$('.w', story), { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: story, start: 'top 80%', end: 'bottom 50%', scrub: true } });
  });
  $$('[data-counter]').forEach((el) => {
    const o = { v: 0 };
    gsap.to(o, { v: +el.dataset.counter, duration: 2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%' }, onUpdate: () => (el.textContent = Math.round(o.v)) });
  });
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

/**
 * Boots a page. `init(ctx)` sets up the page's own content and may return
 * `{ intro }`, a function that plays the page's own entrance (the home loader).
 */
export async function boot(page, init) {
  renderLayout(page);
  setupScroll();
  setupNav();
  setupTransitions();
  loadWeather();
  try {
    const products = await productsReq;
    await applyContent(products).catch((err) => console.warn('content.json', err));
    applyStatic();
    initStore(products);
    track('view', page === 'product' ? { product: new URLSearchParams(location.search).get('id') || undefined } : {});
    const ctx = { products, gsap, ScrollTrigger, SplitText, lenis, getWeather };
    const result = (await init?.(ctx)) || {};
    setupCursor();
    animations();
    setupFooter();
    if (result.intro) await result.intro();
    else {
      gsap.from('.page-hero [data-hero-in]', { y: 40, opacity: 0, duration: 1.2, stagger: 0.08, ease: 'expo.out', delay: 0.35 });
      await revealCurtain();
    }
  } catch (err) {
    console.error(err);
    gsap.set('.curtain, .loader', { display: 'none' });
  }
  document.body.classList.remove('is-loading');
  lenis?.start();
  addEventListener('load', () => ScrollTrigger.refresh());
  setTimeout(() => ScrollTrigger.refresh(), 600);
}
