import { stopCountdown } from './countdown.js';
import { activeEvent } from './selectors.js';
import { currentTab, setCurrentTab } from './state.js';
import { renderHome } from './tab-home.js';
import { renderOther, resetOtherView } from './tab-other.js';
import { renderStandings } from './tab-standings.js';

export function setTopbar(eyebrow, title, right) {
  document.getElementById('topbar-eyebrow').textContent = eyebrow;
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-r').innerHTML = right || '';
}

/* ═════════════════════════════════════════════════════════
   HOME
   ═════════════════════════════════════════════════════════ */
export function switchTab(tab, force = false) {
  if (tab === currentTab && !force) return;
  setCurrentTab(tab);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('is-active'));
  const scr = document.getElementById('s-' + tab);
  scr.classList.add('is-active');
  document.querySelector('.bnav-btn[data-tab="'+tab+'"]').classList.add('is-active');

  /* Topbar contestuale */
  const titles = {
    home: ['STAGIONE 2026', 'Box Box'],
    standings: ['Campionato 2026', 'Campionato'],
    fantasy: ['Lega privata', 'Fantasy'],
    other: ['Motorsport', 'Altre categorie']
  };
  setTopbar(titles[tab][0], titles[tab][1], '');
  if (activeEvent()) {
    document.getElementById('topbar-r').innerHTML = '<span class="live-dot">Live</span>';
  }

  /* Home: refresh countdown + content */
  if (tab === 'home') renderHome();
  else stopCountdown('cd');

  /* Re-render standings on viewMode change */
  if (tab === 'standings') renderStandings();

  /* Altre: si torna sempre al menu principale, mai alla sotto-vista dove si era
     rimasti (Moto2/Moto3/WSBK/Analisi) — prima restava "intrappolata" finché non
     si usava il pulsante "indietro" interno. */
  if (tab === 'other') { resetOtherView(); renderOther(); }

  /* Show mode-toggle only on standings */
  const modeToggle = document.getElementById('mode-toggle');
  if (modeToggle) modeToggle.classList.toggle('is-visible', tab === 'standings');

  /* (re-)triggera lo stagger sui figli del tab attivo */
  animateChildren(scr);
}

/* Aggiunge la classe .anim-in ai figli per far ripartire l'animazione di entrata.
   Necessario perché animation: ... both su display:none non si avvia in Chrome
   finché il display non torna visibile, e re-toggling della classe genitore non
   re-triggera l'animazione. */
export function animateChildren(scr) {
  const kids = [...scr.children];
  kids.forEach(c => c.classList.remove('anim-in'));
  /* force reflow per resettare lo stato dell'animazione */
  void scr.offsetWidth;
  kids.forEach(c => c.classList.add('anim-in'));
}

export function setupNav() {
  document.getElementById('bnav').addEventListener('click', e => {
    const btn = e.target.closest('.bnav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });
}

export function renderAll() {
  renderHome();
  renderStandings();
  renderOther();
  /* fantasy renderizzata dopo aver settato currentGp in load() */
  if (activeEvent()) {
    document.getElementById('topbar-r').innerHTML = '<span class="live-dot">Live</span>';
  }
}

/* ═════════════════════════════════════════════════════════
   PULL TO REFRESH
   ═════════════════════════════════════════════════════════ */
