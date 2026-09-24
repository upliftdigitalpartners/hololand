import { boot, $, $$, animateCards } from '../core.js';
import { catOf, catUrl, GROUPS } from '../categories.js';
import { soldOut } from '../stock.js';
import { img, money, esc, safeHex, cardHTML, getProduct, addToBag, openBag, toast, askLink, renderReviews, ratingOf, stars, reviewsReady } from '../shop.js';
import { sizerHTML } from '../layout.js';
import { createSizer } from '../size.js';
import { loadData } from '../ai.js';

function setMeta(p) {
  const title = `${p.name} (${p.code}) — Hololand`;
  const desc = `${p.desc} ${money(p.price)}. Cash on delivery across Bangladesh.`;
  const url = `https://hololandbd.com/product.html?id=${encodeURIComponent(p.id)}`;
  const image = `https://hololandbd.com/${img(p.images[0], 'lg')}`;
  document.title = title;
  const set = (sel, attr, val) => { const el = $(sel); if (el) el.setAttribute(attr, val); };
  set('meta[name="description"]', 'content', desc);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', desc);
  set('meta[property="og:url"]', 'content', url);
  set('meta[property="og:image"]', 'content', image);
  set('link[rel="canonical"]', 'href', url);
  const r = ratingOf(p.id);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.code, image, description: p.desc, color: p.color,
    brand: { '@type': 'Brand', name: 'Hololand' },
    offers: { '@type': 'Offer', priceCurrency: 'BDT', price: p.price, availability: 'https://schema.org/InStock', url },
    ...(r ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: r.avg.toFixed(1), reviewCount: r.count } } : {}),
  };
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(ld);
  document.head.append(s);
}

boot('product', async ({ products, gsap }) => {
  const id = new URLSearchParams(location.search).get('id');
  const p = getProduct(id);
  if (!p) {
    $('[data-pdp]').hidden = true;
    $('.related').hidden = true;
    $('.pdp-crumbs').hidden = true;
    $('[data-pdp-bar]').hidden = true;
    $('[data-notfound]').hidden = false;
    document.title = 'Not found — Hololand';
    return;
  }
  await reviewsReady;
  setMeta(p);

  const cat = catOf(p.cat);
  $('[data-crumb-cat]').textContent = cat.name;
  $('[data-crumb-cat]').href = catUrl(p.cat);
  $('[data-crumb-name]').textContent = p.name;
  // Header: highlight this product's section (Men / Women / …)
  $$('.nav__links a, .mobile-menu__links a').forEach((a) => a.classList.toggle('is-active', new URL(a.href).searchParams.get('group') === cat.group));

  // Gallery
  const main = $('[data-pdp-img]');
  const show = (base) => { main.src = img(base, 'lg'); $$('[data-pdp-thumbs] button').forEach((b) => b.classList.toggle('is-active', b.dataset.img === base)); };
  main.alt = `${p.name}, ${p.color} ${p.type}`;
  $('[data-pdp-thumbs]').innerHTML = p.images.length > 1 ? p.images.map((b) => `<button data-img="${esc(b)}" aria-label="Show photo"><img src="${img(b)}" alt="" /></button>`).join('') : '';
  $('[data-pdp-thumbs]').addEventListener('click', (e) => { const b = e.target.closest('[data-img]'); if (b) show(b.dataset.img); });
  show(p.images[0]);
  const zoom = $('[data-zoom]');
  if (matchMedia('(hover: hover)').matches) {
    zoom.addEventListener('pointermove', (e) => {
      const r = zoom.getBoundingClientRect();
      main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
      zoom.classList.add('is-zoomed');
    });
    zoom.addEventListener('pointerleave', () => zoom.classList.remove('is-zoomed'));
  }

  // Info
  $('[data-pdp-code]').textContent = `${p.code} · ${p.type}`;
  $('[data-pdp-name]').textContent = p.name;
  $('[data-pdp-price]').textContent = money(p.price);
  const r = ratingOf(p.id);
  $('[data-pdp-rating]').innerHTML = r ? `${stars(r.avg)} <small>${r.avg.toFixed(1)} (${r.count})</small>` : '';
  $('[data-pdp-desc]').textContent = p.desc;
  $('[data-pdp-lang]').hidden = !p.desc_bn;
  $('[data-pdp-lang]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-plang]');
    if (!b) return;
    $('[data-pdp-desc]').textContent = b.dataset.plang === 'bn' ? p.desc_bn : p.desc;
    $$('[data-plang]').forEach((x) => x.classList.toggle('is-active', x === b));
  });
  $('[data-pdp-swatch]').style.background = safeHex(p.hex);
  $('[data-pdp-colour]').textContent = p.color;
  $('[data-pdp-fabric]').textContent = p.fabric;
  $('[data-pdp-type]').textContent = `${GROUPS[cat.group] && cat.group !== 'all' ? `${GROUPS[cat.group]} · ` : ''}${p.type || cat.type}`;
  $('[data-pdp-ask]').href = askLink(p);

  // Sizes
  $('[data-pdp-sizer]').innerHTML = sizerHTML();
  const sizer = createSizer($('.pdp__info'));
  sizer.setProduct(p);
  const add = () => {
    if (!sizer.size) {
      toast('Please pick a size');
      sizer.shake();
      $('[data-pdp-sizer]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (addToBag(p.id, sizer.size)) setTimeout(openBag, 300);
  };
  if (soldOut(p)) {
    for (const b of [$('[data-pdp-add]'), $('[data-bar-add]')]) { b.disabled = true; b.querySelector('span').textContent = 'Sold out'; }
  }
  $('[data-pdp-add]').addEventListener('click', add);
  $('[data-bar-add]').addEventListener('click', add);
  $('[data-bar-name]').textContent = p.name;
  $('[data-bar-price]').textContent = money(p.price);
  new IntersectionObserver(([e]) => $('[data-pdp-bar]').classList.toggle('is-visible', !e.isIntersecting && e.boundingClientRect.top < 0))
    .observe($('[data-pdp-add]'));

  // Delivery / exchange / care from the FAQ (editable in admin)
  const { faq = [] } = await loadData('faq');
  const ans = (...ids) => ids.map((i) => faq.find((f) => f.id === i)?.a).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('') || '<p>Message us on WhatsApp and we’ll help.</p>';
  $('[data-pdp-delivery]').innerHTML = ans('delivery-time', 'delivery-charge', 'cod');
  $('[data-pdp-exchange]').innerHTML = ans('exchange');
  $('[data-pdp-care]').innerHTML = ans('care');

  renderReviews($('[data-pdp-reviews]'), p, { max: 6 });

  // You may also like
  const related = products
    .filter((x) => x.id !== p.id && x.cat === p.cat)
    .map((x) => ({ x, s: x.tags.filter((t) => p.tags.includes(t)).length + Math.random() * 0.5 }))
    .sort((a, b) => b.s - a.s).slice(0, 4).map((o) => o.x);
  $('[data-related]').innerHTML = related.map(cardHTML).join('');
  animateCards($('[data-related]'));
  gsap.from('.pdp__sticky > *', { y: 24, opacity: 0, duration: 1, stagger: 0.05, ease: 'expo.out', delay: 0.4 });
});
