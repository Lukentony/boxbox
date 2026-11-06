import { refreshData } from './data.js';
import { DATA } from './state.js';

let autoRefreshTimer = null;

export function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);

  /* Il toggle "Auto-aggiornamento dati" in Impostazioni scriveva/leggeva questa chiave
     solo per mostrarsi nell'interfaccia: qui non veniva mai controllata, quindi
     disattivarlo non fermava davvero l'auto-refresh durante i weekend attivi. */
  if (localStorage.getItem('bbAutoRefresh') === 'false') return;

  const active = DATA.events?.find(e => e.status === 'active');
  const now = new Date();

  let shouldRefresh = false;

  if (active) {
    shouldRefresh = true;
  } else {
    const upcoming = DATA.events
      ?.filter(e => e.status !== 'complete')
      .sort((a,b) => new Date(a.dateStart) - new Date(b.dateStart))[0];
    if (upcoming) {
      const start = new Date(upcoming.dateStart);
      const msUntil = start.getTime() - now.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (msUntil <= oneDayMs && msUntil > 0) shouldRefresh = true;
    }
  }

  if (shouldRefresh) {
    autoRefreshTimer = setInterval(() => refreshData(), 5 * 60 * 1000);
  }
}

export function updateFreshness() {
  let el = document.getElementById('freshness');
  if (!el) {
    el = document.createElement('div');
    el.id = 'freshness';
    el.className = 'freshness';
    document.querySelector('.app').prepend(el);
  }
  const active = DATA.events?.find(e => e.status === 'active');
  const autoOn = !!autoRefreshTimer;
  el.textContent = active
    ? (autoOn ? 'LIVE · auto-refresh 5min' : 'LIVE')
    : testoFreschezza();
  scheduleAutoRefresh();
}

/* Ora della FONTE, non del browser: prima l'indicatore scriveva l'ora del
   refresh locale, che dice quando l'app ha chiesto i dati, non quanto sono
   freschi. Si prende il timestamp piu' recente fra i dataset caricati. */
function testoFreschezza() {
  const cand = [
    DATA.breakdown?.computedAt,
    DATA.allTeams?.fetchedAt,
    DATA.news?.fetchedAt,
    DATA.newsSignals?.fetchedAt,
    DATA.otherCategories?.fetchedAt,
    DATA.riderHistory?.generatedAt,
    DATA.weekend?.generatedAt,
  ].filter(Boolean).map(x => new Date(x)).filter(d => !isNaN(d));
  if (!cand.length) return 'Freschezza dati non disponibile';
  const src = new Date(Math.max(...cand.map(d => d.getTime())));
  return 'Dati aggiornati: ' + src.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
