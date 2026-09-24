import { boot, $, $$, WICON } from '../core.js';
import { CONFIG } from '../config.js';
import { initStylist, showPane } from '../stylist.js';
import { initPhotoMatch } from '../photo-match.js';
import { initGift } from '../gift.js';

boot('stylist', async ({ products, getWeather }) => {
  const badge = $('[data-stylist-weather]');
  const showWeather = (w) => {
    if (!w) { badge.textContent = `${CONFIG.city.name}, Bangladesh`; return; }
    const tip = w.temp < 22 ? 'knitwear weather' : w.temp < 28 ? 'perfect panjabi weather' : 'go light & breathable';
    badge.textContent = `${WICON(w.code)} ${Math.round(w.temp)}°C, ${w.desc}. ${tip}`;
  };
  if (getWeather()) showWeather(getWeather());
  document.addEventListener('weather', (e) => showWeather(e.detail));

  await initStylist(products, getWeather);
  initPhotoMatch(products);
  initGift(products);

  const setPane = (name) => {
    showPane(name);
    $$('[data-pane-link]').forEach((b) => b.classList.toggle('is-active', b.dataset.paneLink === name));
    const q = new URLSearchParams(location.search);
    if (name === 'chat') q.delete('tab'); else q.set('tab', name);
    history.replaceState(null, '', `stylist.html${q.toString() ? `?${q}` : ''}`);
  };
  $$('[data-pane-link]').forEach((b) => b.addEventListener('click', () => {
    setPane(b.dataset.paneLink);
    if (innerWidth < 900) $('.studio__panel').scrollIntoView({ behavior: 'smooth' });
  }));
  $('[data-studio-tabs]').addEventListener('click', (e) => { const t = e.target.closest('[data-pane]'); if (t) setPane(t.dataset.pane); });
  const tab = new URLSearchParams(location.search).get('tab');
  setPane(['photo', 'gift'].includes(tab) ? tab : 'chat');
});
