import { boot, $, webgl } from '../core.js';
import { img, money, esc, productUrl } from '../shop.js';

boot('lookbook', async ({ products, gsap, ScrollTrigger }) => {
  const items = products.flatMap((p) => p.images.slice(0, p.cat === 'women' ? 2 : 1).map((b) => ({ id: p.id, base: b, src: img(b, 'sm'), p })));

  // Every look, as a grid (also the fallback without WebGL)
  $('[data-lb-grid]').innerHTML = items.map((it, i) => `
    <a class="lb-tile ${i % 5 === 0 ? 'lb-tile--tall' : ''}" href="${productUrl(it.id)}" data-cursor="Shop">
      <img src="${img(it.base, i % 5 === 0 ? 'lg' : 'sm')}" alt="${esc(it.p.name)}" loading="lazy" />
      <span><strong>${esc(it.p.name)}</strong> ${money(it.p.price)}</span>
    </a>`).join('');
  gsap.from('.lb-tile', { y: 60, opacity: 0, duration: 1, stagger: 0.04, ease: 'expo.out', scrollTrigger: { trigger: '.lb-masonry', start: 'top 85%' } });

  if (!webgl) { $('.lookbook').hidden = true; return; }
  const code = $('[data-lb-code]'), name = $('[data-lb-name]'), price = $('[data-lb-price]'), link = $('[data-lb-link]');
  const setCaption = (item) => {
    link.href = productUrl(item.id);
    gsap.to([code, name, price], {
      opacity: 0, y: -6, duration: 0.2, stagger: 0.03, onComplete: () => {
        code.textContent = item.p.code; name.textContent = item.p.name; price.textContent = money(item.p.price);
        gsap.to([code, name, price], { opacity: 1, y: 0, duration: 0.45, stagger: 0.05 });
      },
    });
  };
  const { Lookbook } = await import('../gl/lookbook.js');
  const lb = new Lookbook($('[data-lookbook-canvas]'), items, {
    onFront: setCaption,
    onOpen: (item) => { link.href = productUrl(item.id); link.click(); },
    onHover: (on) => window.__setCursorLabel?.(on ? 'View' : 'Drag'),
  });
  ScrollTrigger.create({ trigger: '.lookbook', start: 'top top', end: 'bottom bottom', onUpdate: (st) => lb.setProgress(st.progress) });
  $('[data-lookbook-canvas]').dataset.cursor = 'Drag';
});
