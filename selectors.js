import { DATA, viewMode } from './state.js';
import { orderEvents } from './event-order.js';

export function champPoints(r) {
  /* Campionato = real sum of finalPoints; FantasyGP = totalPoints from stats */
  if (viewMode === 'campionato') {
    return DATA.realPts?.[r.id] ?? 0;
  }
  return r.stats?.totalPoints || 0;
}
export function activePlayers() {
  /* Solo giocatori con breakdown reale (escludo placeholder vuoti) */
  return Object.values(DATA.breakdown.players || {})
    .filter(p => p.overallPoints != null && p.overallPoints > 0)
    .sort((a,b) => b.overallPoints - a.overallPoints);
}
export function lastCompletedEvent() {
  const byEvent = DATA.breakdown?.byEvent || {};
  return orderEvents((DATA.events || []).filter(event => {
    const entry = byEvent[event.id];
    return entry && !entry.upcoming && effectiveStatus(event) === 'complete';
  })).at(-1) || null;
}
export function nextScheduledEvent() {
  return DATA.events
    .filter(e => effectiveStatus(e) !== 'complete' && effectiveStatus(e) !== 'active')
    .sort((a,b) => new Date(a.dateStart) - new Date(b.dateStart))[0];
}
export function effectiveStatus(e) {
  if (e.status === 'active' && e.dateEnd) {
    const endPlus6h = new Date(e.dateEnd).getTime() + 6 * 3600000;
    if (Date.now() > endPlus6h) return 'complete';
  }
  return e.status;
}

export function activeEvent() {
  return DATA.events.find(e => effectiveStatus(e) === 'active');
}

/* ─ Countdown ticker ─ */
