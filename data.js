import { updateFreshness } from './auto-refresh.js';
import { nodo } from './dom.js';
import { checkAndNotify } from './notifications.js';
import { DATA, currentGp, currentTab, setCurrentGp, setViewMode, viewMode } from './state.js';
import { renderFantasy } from './tab-fantasy.js';
import { renderStandings } from './tab-standings.js';
import { renderAll, rendiRottaCorrente, setupNav } from './ui.js';

/* I JSON arrivano da fuori (API MotoGP, Wikipedia, feed RSS, lega Fantasy).
   Fino al 20/09/2026 i testi venivano neutralizzati qui (escDati) perche' i
   moduli tab-* li scrivevano in innerHTML; ora le schermate costruiscono nodi
   DOM e un testo esterno resta testo, quindi non c'e' piu' niente da
   neutralizzare in ingresso. news.json era gia' fuori da quella passata. */

export async function load() {
  try {
    const [riders, events, constructors, squads, breakdown, allTeams, news, otherCats, newsSignals, riderHistory, weekend, motore] = await Promise.all([
      fetch('data/riders.json').then(r => r.json()),
      fetch('data/events.json').then(r => r.json()),
      fetch('data/constructors.json').then(r => r.json()),
      fetch('data/squads.json').then(r => r.json()),
      fetch('data/breakdown.json').then(r => r.json()),
      fetch('data/all-teams.json').then(r => r.json()).catch(() => null),
      fetch('data/news.json').then(r => r.json()).catch(() => null),
      fetch('data/other-categories.json').then(r => r.json()).catch(() => null),
      fetch('data/news-signals.json').then(r => r.json()).catch(() => null),
      fetch('data/rider-history.json').then(r => r.json()).catch(() => null),
      fetch('data/weekend.json').then(r => r.json()).catch(() => null),
      fetch('data/motore.json').then(r => r.json()).catch(() => null),
    ]);
    DATA.riders = riders;
    DATA.events = events.slice().sort((a,b) => (a.order||a.id) - (b.order||b.id));
    DATA.constructors = constructors;
    DATA.squads = squads;
    DATA.breakdown = breakdown;
    DATA.allTeams = allTeams;
    DATA.news = news;
    DATA.otherCategories = otherCats;
    DATA.newsSignals = newsSignals;
    DATA.riderHistory = riderHistory;
    DATA.weekend = weekend;
    DATA.motore = motore;
    DATA.riderById = Object.fromEntries(DATA.riders.map(r => [r.id, r]));
    DATA.constById = Object.fromEntries(DATA.constructors.map(c => [c.id, c]));
    DATA.squadById = Object.fromEntries(DATA.squads.map(s => [s.id, s]));
    /* Compute real championship points (sum of finalPoints per rider across all events) */
    DATA.realPts = {};
    for (const r of DATA.riders) {
      if (!r.stats?.events) continue;
      let sum = 0;
      for (const gpId in r.stats.events) {
        sum += r.stats.events[gpId]?.finalPoints || 0;
      }
      DATA.realPts[r.id] = sum;
    }
    /* Sincronizza il toggle Campionato/FantasyGP con viewMode ripristinato da localStorage
       (il markup statico in index.html mostra sempre "campionato" come attivo). */
    if (viewMode !== 'campionato') {
      document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === viewMode));
    }

    renderAll();

    /* ViewMode toggle */
    document.getElementById('mode-toggle').addEventListener('click', e => {
      const btn = e.target.closest('.mode-toggle-btn');
      if (!btn) return;
      if (btn.dataset.mode === viewMode) return;
      setViewMode(btn.dataset.mode);
      document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      /* Re-render current tab with new mode (only standings shows toggle) */
      if (currentTab === 'standings') renderStandings();
    });
    /* Pick last completed event for fantasy by default, ma solo la primissima volta:
       se currentGp e' gia' stato ripristinato da localStorage (bug: il refresh riportava
       sempre alla stagione/ultimo GP, ignorando dove si era), rispetta quella scelta. */
    const hadSavedGp = localStorage.getItem('bbGp') != null;
    if (!hadSavedGp) {
      const completedDescending = DATA.events
        .filter(e => DATA.breakdown.byEvent && DATA.breakdown.byEvent[e.id])
        .sort((a,b) => (b.order||b.id) - (a.order||a.id));
      if (completedDescending.length) setCurrentGp(String(completedDescending[0].id));
    }
    renderFantasy();

    /* Avvia il router: renderizza la rotta dell'hash (se l'hash manca, la stanza
       dell'ultima visita). Il markup statico mostra sempre Home attiva: e' il
       router a marcare la stanza giusta. */
    setupNav();
  } catch (err) {
    console.error(err);
    document.getElementById('s-home').replaceChildren(nodo('div', { class: 'empty' },
      'Errore di caricamento dati.', nodo('br'), 'Verifica i file in /data/.'));
  }
}

/* ─ Helpers ─ */
export async function refreshData() {
  try {
    const [riders, events, constructors, squads, news, otherCats, newsSignals, riderHistory, weekend, motore] = await Promise.all([
      fetch('data/riders.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('data/events.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('data/constructors.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('data/squads.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('data/news.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('data/other-categories.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('data/news-signals.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('data/rider-history.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('data/weekend.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('data/motore.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]);
    DATA.riders = riders;
    DATA.events = events.slice().sort((a,b) => (a.order||a.id) - (b.order||b.id));
    DATA.constructors = constructors;
    DATA.squads = squads;
    DATA.riderById = Object.fromEntries(DATA.riders.map(r => [r.id, r]));
    DATA.constById = Object.fromEntries(DATA.constructors.map(c => [c.id, c]));
    DATA.squadById = Object.fromEntries(DATA.squads.map(s => [s.id, s]));
    if (news) DATA.news = news;
    if (otherCats) DATA.otherCategories = otherCats;
    if (newsSignals) DATA.newsSignals = newsSignals;
    if (riderHistory) DATA.riderHistory = riderHistory;
    if (weekend) DATA.weekend = weekend;
    if (motore) DATA.motore = motore;

    const oldBd = DATA.breakdown;
    const bd = await fetch('data/breakdown.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (bd) DATA.breakdown = bd;
    const at = await fetch('data/all-teams.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (at) DATA.allTeams = at;

    /* Refresh sulla rotta corrente: si ridisegna la vista che si sta guardando
       (sotto-viste e mount Analisi compresi). Le altre stanze si renderizzano
       quando le apri, quindi non c'e' bisogno di un giro su tutte. */
    rendiRottaCorrente();
    updateFreshness();
    if (bd) checkAndNotify(oldBd, bd);
  } catch (err) {
    console.error('Refresh fallito:', err);
  }
}

/* ═════════════════════════════════════════════════════════
   NOTIFICHE LOCALI (Level 1 — Notification API)
   ═════════════════════════════════════════════════════════ */
