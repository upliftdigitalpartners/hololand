import { boot, $, $$, webgl, reduced, animateCards } from '../core.js';
import { img, cardHTML } from '../shop.js';

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

  // Featured: a mix of both collections
  const men = products.filter((p) => p.cat === 'men'), women = products.filter((p) => p.cat === 'women');
  const featured = [];
  for (let i = 0; featured.length < 8 && (i < men.length || i < women.length); i++) {
    if (men[i]) featured.push(men[i]);
    if (i % 2 === 0 && women[i / 2]) featured.push(women[i / 2]);
  }
  $('[data-featured]').innerHTML = featured.slice(0, 8).map(cardHTML).join('');
  animateCards($('[data-featured]'));

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
  gsap.ticker.add((t, dt) => {
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

  let hero = null;
  const loadHero = async () => {
    if (!webgl) { progress(1); heroCaption.textContent = caption(0); return; }
    try {
      const { Hero } = await import('../gl/hero.js');
      hero = new Hero($('[data-hero-canvas]'), HERO_SLIDES, { onSlide });
      await hero.load((p) => progress(p * 0.9));
    } catch (err) {
      console.error(err);
      document.documentElement.classList.add('no-webgl');
    }
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
      if (hero) hero.autoplay(gsap, reduced ? 8 : 5.5);
      else onSlide(0, 5.5);
      gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=100%', pin: true, scrub: true, onUpdate: (st) => hero?.setScroll(st.progress) } })
        .to('.hero__content', { yPercent: -30, opacity: 0, ease: 'none' }, 0)
        .to('.hero__meta, .hero__scroll', { opacity: 0, ease: 'none', duration: 0.4 }, 0);
      new IntersectionObserver(([e]) => hero?.setRunning(e.isIntersecting)).observe($('[data-hero-canvas]'));
    },
  };
});
