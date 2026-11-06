import { scheduleAutoRefresh } from './auto-refresh.js';
import { frammento, nodo } from './dom.js';
import { animateChildren, setTopbar } from './ui.js';

/* ═════════════════════════════════════════════════════════
   IMPOSTAZIONI (icona in topbar) — ex sezione del menu "Altre"

   IMPOSTAZIONI (icona in topbar) — ex sezione del menu "Altre"
   ═════════════════════════════════════════════════════════ */
export function renderSettings() {
  const root = document.getElementById('s-settings');

  const links = [
    { icon: '📊', name: 'Classifica MotoGP Live', url: 'https://www.motogp.com/en/world-standing/2026/motogp/championship-standings' },
    { icon: '📅', name: 'Calendario MotoGP', url: 'https://www.motogp.com/en/calendar/2026' },
    { icon: '📰', name: 'News Motorsport.com', url: 'https://www.motorsport.com/motogp/news/' },
    { icon: '⚡', name: 'Fantasy MotoGP', url: 'https://fantasy.motogp.com/' },
    { icon: '🏠', name: 'Box Box (GitHub)', url: 'https://github.com/Lukentony/boxbox' },
    { icon: '🌐', name: 'lukentony.it', url: 'https://lukentony.it' },
  ];

  const autoRefOn = localStorage.getItem('bbAutoRefresh') !== 'false';
  const notifSupported = 'Notification' in window;
  const notifPerm = notifSupported ? Notification.permission : 'unsupported';
  const notifOn = notifPerm === 'granted' && localStorage.getItem('bbNotifications') === 'true';
  const notifDesc = notifPerm === 'denied'
    ? 'Bloccate dal browser — riabilitale nelle impostazioni del sito'
    : notifPerm === 'unsupported'
    ? 'Non supportate da questo browser'
    : 'Avviso quando i punti vengono aggiornati durante il GP';
  const notifDisabled = notifPerm === 'denied' || notifPerm === 'unsupported';

  const interruttore = (attivo) => nodo('div', { class: 'sett-toggle' + (attivo ? ' is-on' : '') },
    nodo('div', { class: 'sett-thumb' }));
  const riga = (chiave, nome, descrizione, attivo, disabilitata) => nodo('div', {
    class: 'sett-row' + (disabilitata ? ' sett-row--disabled' : ''),
    'data-sett': chiave,
  },
    nodo('div', { class: 'sett-label' },
      nodo('div', { class: 'sett-name' }, nome),
      nodo('div', { class: 'sett-desc' }, descrizione)),
    interruttore(attivo));

  const contenuto = [];
  contenuto.push(nodo('div', { class: 'f-subtitle' }, nodo('span', null, 'Impostazioni')));
  contenuto.push(nodo('div', { class: 'card sett-card' },
    riga('autoRefresh', 'Auto-aggiornamento dati', 'Ricarica i dati ogni 5 minuti durante i weekend GP', autoRefOn, false),
    riga('notifications', 'Notifiche aggiornamenti', notifDesc, notifOn, notifDisabled)));

  contenuto.push(nodo('div', { class: 'f-subtitle', style: 'margin-top:20px' }, nodo('span', null, 'Link utili')));
  links.forEach(lnk => {
    contenuto.push(nodo('a', {
      href: lnk.url,
      target: '_blank',
      rel: 'noopener',
      class: 'news-card',
      style: 'margin-bottom:6px;padding:10px 14px',
    },
      nodo('div', { style: 'font-size:18px;flex-shrink:0' }, lnk.icon),
      nodo('div', { class: 'news-body', style: 'gap:0' },
        nodo('div', { class: 'news-title', style: 'font-size:13px' }, lnk.name)),
      nodo('div', { style: 'font-size:14px;color:var(--text-faint)' }, '→')));
  });

  contenuto.push(nodo('div', { class: 'fade-pad' }));
  root.replaceChildren(frammento(contenuto));
  animateChildren(root);

  root.querySelectorAll('.sett-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.sett;
      if (key === 'autoRefresh') {
        const current = localStorage.getItem('bbAutoRefresh') !== 'false';
        localStorage.setItem('bbAutoRefresh', current ? 'false' : 'true');
        scheduleAutoRefresh();
        renderSettings();
      } else if (key === 'notifications') {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'denied') return;
        if (Notification.permission === 'default') {
          Notification.requestPermission().then(() => {
            if (Notification.permission === 'granted') {
              localStorage.setItem('bbNotifications', 'true');
            }
            renderSettings();
          });
        } else {
          const cur = localStorage.getItem('bbNotifications') === 'true';
          localStorage.setItem('bbNotifications', cur ? 'false' : 'true');
          renderSettings();
        }
      }
    });
  });
}
