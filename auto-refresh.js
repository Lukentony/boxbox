import { refreshData } from './data.js';
import { DATA } from './state.js';

let autoRefreshTimer = null;

export function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);

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
    : 'Ultimo aggiornamento: ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  scheduleAutoRefresh();
}
