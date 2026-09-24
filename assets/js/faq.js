import { loadData, esc } from './ai.js';

/** Renders the FAQ accordion and adds FAQPage structured data for Google. */
export async function initFaq() {
  const { faq = [] } = await loadData('faq');
  const list = document.querySelector('[data-faq]');
  list.innerHTML = faq.map((f, i) => `
    <details class="faq__item" ${i === 0 ? 'open' : ''}>
      <summary><span>${esc(f.q)}</span><small class="bn">${esc(f.q_bn || '')}</small><i aria-hidden="true"></i></summary>
      <div class="faq__a"><p>${esc(f.a)}</p>${f.a_bn ? `<p class="bn">${esc(f.a_bn)}</p>` : ''}</div>
    </details>`).join('');
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  });
  document.head.append(ld);
}
