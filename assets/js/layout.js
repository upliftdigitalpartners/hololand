// Shared chrome (header, menus, footer, bag, quick view…) injected into every page,
// so it is written once. Each page's HTML only holds its own <main> content.

import { categories, catOf, groupsInUse, GROUPS, groupUrl, catUrl } from './categories.js';

/** Header links: Shop, one link per section (Men, Women, Kids…), then the other pages. */
export function navItems() {
  return [
    { key: 'shop', label: 'Shop', href: 'shop.html' },
    ...groupsInUse().filter((g) => g !== 'all').map((g) => ({ key: g, label: GROUPS[g], href: groupUrl(g) })),
    { key: 'lookbook', label: 'Lookbook', href: 'lookbook.html' },
    { key: 'stylist', label: 'Stylist', href: 'stylist.html' },
    { key: 'story', label: 'Story', href: 'story.html' },
    { key: 'help', label: 'Help', href: 'help.html' },
  ];
}

const MARK = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="mark" viewBox="0 0 345 400">
    <polygon class="m-a" points="0,0 105,0 105,140 0,212" />
    <polygon class="m-b" points="0,245 215,98 215,300 110,300 110,400 0,400" />
    <rect class="m-c" x="238" y="0" width="107" height="400" />
  </symbol></svg>`;

const BAG_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';

function activeKey(page) {
  if (page !== 'shop') return page;
  const q = new URLSearchParams(location.search);
  if (GROUPS[q.get('group')]) return q.get('group');
  return q.get('cat') ? catOf(q.get('cat')).group : 'shop';
}

const navLinks = (active) => navItems().map((n) => `<a href="${n.href}" class="${n.key === active ? 'is-active' : ''}" ${n.key === active ? 'aria-current="page"' : ''}>${n.label}</a>`).join('');
const menuLinks = (active) => navItems().map((n, i) => `<a href="${n.href}" class="${n.key === active ? 'is-active' : ''}"><small>${String(i + 1).padStart(2, '0')}</small>${n.label}</a>`).join('');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const footerShop = () => categories().map((c) => `<a href="${catUrl(c.id)}">${esc(c.name)}</a>`).join('') + '<a href="lookbook.html">Lookbook</a>';

/** Rebuilds the category links once the admin's category list has loaded. */
export function refreshCategoryLinks(page, active = activeKey(page)) {
  const nav = document.querySelector('.nav__links');
  if (nav) nav.innerHTML = navLinks(active);
  const menu = document.querySelector('.mobile-menu__links');
  if (menu) menu.innerHTML = menuLinks(active);
  const shop = document.querySelector('[data-footer-shop]');
  if (shop) shop.innerHTML = `<h4>Shop</h4>${footerShop()}`;
}

function header(page) {
  const active = activeKey(page);
  return `
  <div class="announce" data-announce hidden><span data-announce-text></span></div>
  <header class="nav">
    <a href="./" class="nav__brand" aria-label="Hololand home"><svg class="brandmark"><use href="#mark" /></svg><span>Hololand</span></a>
    <nav class="nav__links" aria-label="Primary">
      ${navLinks(active)}
    </nav>
    <div class="nav__right">
      <span class="weather-chip" data-weather hidden></span>
      <button class="bag-btn" data-open-bag data-magnetic aria-label="Open bag">${BAG_ICON}<span class="bag-btn__count" data-bag-count>0</span></button>
      <button class="menu-btn" data-menu aria-label="Menu" aria-expanded="false"><i></i><i></i></button>
    </div>
  </header>
  <div class="mobile-menu" data-mobile-menu data-lenis-prevent>
    <nav class="mobile-menu__links">
      ${menuLinks(active)}
    </nav>
    <div class="mobile-menu__foot">
      <a href="#" data-whatsapp class="btn btn--ghost btn--sm"><span>WhatsApp us</span></a>
      <span data-delivery-note></span>
    </div>
  </div>`;
}

function footer() {
  return `
  <footer class="footer">
    <canvas class="footer__gl" data-logo-canvas aria-hidden="true"></canvas>
    <div class="footer__top">
      <div>
        <h2 class="footer__big">Come say <em>hello.</em></h2>
        <p class="footer__lede">Questions, orders or a photo of what you’re looking for: message our team, or follow us for new arrivals.</p>
        <div class="footer__cta">
          <a href="#" data-whatsapp class="btn btn--solid" data-magnetic><span>WhatsApp us</span></a>
          <a data-social="instagram" target="_blank" rel="noopener" class="btn btn--ghost" data-magnetic><span>Follow on Instagram</span></a>
        </div>
      </div>
    </div>
    <div class="footer__cols">
      <div data-footer-shop><h4>Shop</h4>${footerShop()}</div>
      <div><h4>Help</h4><a href="track.html">Track your order</a><a href="help.html">FAQ &amp; delivery</a><a href="stylist.html">Personal stylist</a><a href="#" data-whatsapp>WhatsApp us</a></div>
      <div data-store-col hidden><h4>Visit us</h4><span data-store-address></span><span data-store-hours></span><a data-store-map target="_blank" rel="noopener" hidden>Open in Google Maps ↗</a></div>
      <div><h4>Follow</h4><a data-social="facebook" target="_blank" rel="noopener">Facebook</a><a data-social="instagram" target="_blank" rel="noopener">Instagram</a><a data-social="tiktok" target="_blank" rel="noopener">TikTok</a></div>
    </div>
    <div class="footer__bottom">
      <span><a href="admin.html" class="admin-link" aria-label="Admin" rel="nofollow">©</a> <span data-year></span> Hololand · Made in Bangladesh</span>
      <span class="footer__about"><a href="story.html">Our story</a> · <a href="help.html">Help</a></span>
    </div>
  </footer>`;
}

const OVERLAYS = `
  <div class="cursor" aria-hidden="true"><div class="cursor__ring"><span class="cursor__label"></span></div><div class="cursor__dot"></div></div>
  <div class="grain" aria-hidden="true"></div>

  <div class="modal" data-modal aria-hidden="true">
    <div class="modal__scrim" data-close-modal></div>
    <div class="modal__panel" data-lenis-prevent role="dialog" aria-modal="true" aria-labelledby="qv-title" data-sizer-root>
      <button class="icon-btn modal__close" data-close-modal aria-label="Close">✕</button>
      <div class="qv__media">
        <div class="qv__main arch"><img data-qv-img alt="" /></div>
        <div class="qv__thumbs" data-qv-thumbs></div>
      </div>
      <div class="qv__info">
        <span class="mono" data-qv-code></span>
        <h3 id="qv-title" data-qv-name></h3>
        <p class="qv__price" data-qv-price></p>
        <div class="qv__lang" data-qv-lang hidden><button class="is-active" data-lang="en">EN</button><button data-lang="bn">বাংলা</button></div>
        <p class="qv__desc" data-qv-desc></p>
        <p class="qv__fabric"><span class="swatch" data-qv-swatch></span><span data-qv-fabric></span></p>
        ${sizerHTML()}
        <button class="btn btn--solid btn--wide" data-qv-add><span>Add to bag</span></button>
        <a class="qv__more link-btn" data-qv-link href="#">View full details →</a>
        <p class="eta" data-qv-eta></p>
        <p class="qv__note" data-delivery-note></p>
      </div>
    </div>
  </div>

  <aside class="drawer" data-drawer aria-hidden="true">
    <div class="drawer__scrim" data-close-bag></div>
    <div class="drawer__panel" data-lenis-prevent role="dialog" aria-labelledby="drawer-title">
      <div class="drawer__head">
        <button class="icon-btn drawer__back" data-checkout-back aria-label="Back to bag" hidden>←</button>
        <h3 id="drawer-title" data-drawer-title>Your bag</h3>
        <button class="icon-btn" data-close-bag aria-label="Close">✕</button>
      </div>

      <div class="drawer__view" data-view="bag">
        <div class="drawer__items" data-bag-items></div>
        <div class="drawer__foot">
          <div class="gift-note" data-gift-note hidden>
            <div class="gift-note__head"><span class="mono">🎁 Gift message</span><button class="link-btn" data-gift-note-clear>Remove</button></div>
            <p data-gift-note-text></p>
          </div>
          <div class="drawer__total"><span>Subtotal</span><strong data-bag-total>৳0</strong></div>
          <button class="btn btn--solid btn--wide" data-checkout><span>Checkout</span></button>
          <p class="drawer__note" data-delivery-note></p>
        </div>
      </div>

      <form class="drawer__view checkout" data-view="checkout" data-checkout-form novalidate hidden>
        <div class="checkout__body">
          <label class="cf"><span>Your name</span><input name="name" autocomplete="name" maxlength="60" required /></label>
          <label class="cf"><span>Mobile number</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" maxlength="20" required /></label>
          <fieldset class="cf"><legend>Delivery area</legend>
            <div class="choice" data-area>
              <label><input type="radio" name="area" value="inside" required /><span>Inside Chittagong city<small data-fee="inside"></small></span></label>
              <label><input type="radio" name="area" value="outside" /><span>Outside Chittagong<small data-fee="outside"></small></span></label>
            </div>
            <small class="co-eta" data-co-eta></small>
          </fieldset>
          <label class="cf"><span>Full address</span><textarea name="address" rows="3" autocomplete="street-address" maxlength="300" placeholder="House, road, area, thana, district" required></textarea></label>
          <fieldset class="cf"><legend>Payment</legend>
            <div class="choice">
              <label><input type="radio" name="payment" value="cod" checked /><span>Cash on delivery<small>Pay when it arrives</small></span></label>
              <label><input type="radio" name="payment" value="bkash" /><span>bKash<small>We’ll send payment details</small></span></label>
            </div>
          </fieldset>
          <div class="cf promo"><span>Promo code <small>(optional)</small></span>
            <div class="promo__row"><input name="promo" maxlength="20" autocapitalize="characters" autocomplete="off" placeholder="e.g. EID10" /><button type="button" class="btn btn--ghost btn--sm" data-promo-apply><span>Apply</span></button></div>
            <small class="promo__msg" data-promo-msg aria-live="polite"></small>
          </div>
          <label class="cf"><span>Note <small>(optional)</small></span><input name="note" maxlength="300" placeholder="e.g. call before delivery" /></label>
          <label class="cf cf--hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off" /></label>
          <label class="check"><input type="checkbox" name="remember" /> Remember my details on this device</label>
          <p class="checkout__privacy">We use these details only to confirm and deliver your order.</p>
        </div>
        <div class="drawer__foot">
          <div class="checkout__sum">
            <span>Subtotal</span><span data-co-subtotal></span>
            <span data-co-disc-label hidden>Discount</span><span data-co-disc hidden></span>
            <span>Delivery</span><span data-co-delivery>Choose area</span>
            <strong>Total</strong><strong data-co-total></strong>
          </div>
          <p class="checkout__err" data-co-error role="alert" hidden></p>
          <button class="btn btn--solid btn--wide" data-place-order><span>Place order</span></button>
        </div>
      </form>

      <div class="drawer__view done" data-view="done" hidden>
        <div class="done__body">
          <div class="done__tick" aria-hidden="true">✓</div>
          <h4 data-done-title>Thank you!</h4>
          <p>Your order number is</p>
          <p class="done__id" data-done-id></p>
          <p data-done-text></p>
          <div class="done__items" data-done-items></div>
        </div>
        <div class="drawer__foot">
          <a class="btn btn--ghost btn--wide" data-done-track href="track.html"><span>Track your order</span></a>
          <button class="link-btn drawer__alt" data-close-bag>Continue shopping</button>
        </div>
      </div>
    </div>
  </aside>

  <div class="toast" data-toast></div>
  <a href="stylist.html" class="fab" data-fab aria-label="Chat with our stylist"><span>✦</span><b>Ask Hololand</b></a>`;

/** Size picker + "Find my size" form. Used in the quick view and on product pages. */
export function sizerHTML() {
  return `
    <div class="sizes-head"><span class="mono">Size</span><button type="button" class="link-btn" data-size-toggle>Find my size ✦</button></div>
    <div class="sizes" data-sizes></div>
    <p class="size-left" data-size-left aria-live="polite"></p>
    <form class="sizer" data-sizer hidden>
      <div class="sizer__row">
        <label>Height <span><input type="number" name="ft" min="4" max="7" placeholder="5" inputmode="numeric" /> ft <input type="number" name="in" min="0" max="11" placeholder="8" inputmode="numeric" /> in</span></label>
        <label>Weight <span><input type="number" name="kg" min="30" max="160" placeholder="68" inputmode="numeric" required /> kg</span></label>
      </div>
      <div class="seg seg--sm" data-fit>
        <button type="button" data-fitv="slim">Slim</button>
        <button type="button" class="is-active" data-fitv="regular">Regular</button>
        <button type="button" data-fitv="relaxed">Relaxed</button>
      </div>
      <button class="btn btn--ghost btn--wide btn--sm"><span>Suggest my size</span></button>
      <p class="sizer__out" data-sizer-out aria-live="polite"></p>
    </form>`;
}

export function renderLayout(page) {
  document.body.insertAdjacentHTML('afterbegin', MARK + header(page));
  document.body.insertAdjacentHTML('beforeend', footer() + OVERLAYS);
  if (page === 'stylist') document.querySelector('[data-fab]').remove();
}
