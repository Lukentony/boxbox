import { DATA, viewMode } from './state.js';
import { sessionLabel } from './format.js';
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

/* Quando parte un GP, in chiaro: { iso, etichetta }.
   Se il server ha gia' scaricato le sessioni del prossimo weekend
   (weekend.next), l'avvio vero e' la prima sessione (FP1) e non la prima gara
   del calendario fantasy (Q1): il countdown e il suo sottotitolo usano questa
   sola fonte, cosi' i due non possono divergere. */
export function avvioGp(ev) {
  const next = DATA.weekend?.next;
  const stessoGp = next?.event && ev && (
    (next.event.fantasyId != null && String(next.event.fantasyId) === String(ev.id)) ||
    (next.event.shortName && next.event.shortName === ev.shortName)
  );
  if (stessoGp && next.sessions?.length) {
    const prima = next.sessions[0];
    return { iso: prima.date, etichetta: sessionLabel(prima) };
  }
  const gara = (ev?.races || [])[0];
  if (gara?.dateStart) return { iso: gara.dateStart, etichetta: sessionLabel(gara) };
  return { iso: ev?.dateStart || null, etichetta: null };
}

/* ─ Countdown ticker ─ */
