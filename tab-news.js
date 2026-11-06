import { frammento, nodo } from './dom.js';
import { safeHttpUrl, timeAgo } from './format.js';
import { DATA } from './state.js';
import { animateChildren } from './ui.js';

/* Card condivisa da Home e Notizie. I titoli rimangono nodi di testo; gli URL
   hanno anche una policy di protocollo: un attributo DOM non rende sicuro javascript:. */
export function newsCard(n) {
  const ago = timeAgo(n.pubDate);
  const cats = (n.categories || []).filter(c => c !== 'MotoGP').slice(0, 1).join('');
  const image = safeHttpUrl(n.image);
  const link = safeHttpUrl(n.link);
  return nodo(link ? 'a' : 'div', {
    class: 'news-card' + (n.gpRelated ? ' news-card--gp' : ''),
    href: link || null,
    target: link ? '_blank' : null,
    rel: link ? 'noopener' : null,
  },
    image ? nodo('img', { class: 'news-img', src: image, alt: '', loading: 'lazy' }) : null,
    nodo('div', { class: 'news-body' },
      nodo('div', { class: 'news-title' }, n.title),
      nodo('div', { class: 'news-meta' }, ago + (cats ? ' · ' + cats : ''))));
}

/* ═════════════════════════════════════════════════════════
   NOTIZIE — feed completo (in Home ne restano tre)
   ═════════════════════════════════════════════════════════ */
export function renderNews() {
  const root = document.getElementById('s-news');
  const items = DATA.news?.items || [];

  if (!items.length) {
    root.replaceChildren(
      nodo('div', { class: 'card' }, nodo('div', { class: 'empty', style: 'padding:24px' }, 'Notizie non disponibili.')),
      nodo('div', { class: 'fade-pad' }));
    animateChildren(root);
    return;
  }

  const upGP = DATA.news.upcomingGP;
  const gpNews = upGP ? items.filter(n => n.gpRelated) : [];
  const restNews = upGP ? items.filter(n => !n.gpRelated) : items;

  const contenuto = [];
  if (gpNews.length) {
    contenuto.push(nodo('div', { class: 'news-h' },
      nodo('span', { class: 'news-h-t' }, '🏁 ' + upGP.name),
      nodo('span', { class: 'news-h-src' }, String(upGP.hoursUntil) + 'h al via')));
    gpNews.forEach(n => { contenuto.push(newsCard(n)); });
  }
  contenuto.push(nodo('div', { class: 'news-h' },
    nodo('span', { class: 'news-h-t' }, 'Ultime notizie'),
    nodo('span', { class: 'news-h-src' }, DATA.news.source || 'motorsport.com')));
  restNews.forEach(n => { contenuto.push(newsCard(n)); });
  contenuto.push(nodo('div', { class: 'fade-pad' }));

  root.replaceChildren(frammento(contenuto));
  animateChildren(root);
}
