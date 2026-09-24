import { boot } from '../core.js';

boot('story', async ({ gsap }) => {
  gsap.from('.story__strip img', { y: 80, opacity: 0, stagger: 0.08, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.story__strip', start: 'top 90%' } });
});
