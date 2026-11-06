import { DATA } from './state.js';
import { orderEvents } from './event-order.js';

export function gpSig(gp) {
  const e = (DATA.events || []).find(x => String(x.id) === String(gp));
  return e ? (e.shortName || (e.displayedName ? e.displayedName.trim().slice(0, 3).toUpperCase() : 'R' + gp)) : 'R' + gp;
}
/* trend prezzo dagli ultimi 2 GP con dato in costHistory (priceDiff API è sempre 0) */
export function riderPriceTrend(r) {
  const ch = r.costHistory || {};
  const prices = orderEvents((DATA.events || []).filter(event => Number.isFinite(ch[event.id]?.cost)))
    .map(event => ch[event.id].cost);
  if (prices.length < 2) {
    const value = (Number.isFinite(r.cost) ? r.cost : 0) / 1e6;
    return { lastM: value, prevM: value, deltaM: 0, dir: 0 };
  }
  const last = prices.at(-1), prev = prices.at(-2);
  const deltaM = (last - prev) / 1e6;
  return { lastM: last / 1e6, prevM: prev / 1e6, deltaM, dir: deltaM > 0 ? 1 : deltaM < 0 ? -1 : 0 };
}
/* value: punti per Milione (stagione e recente L3) */
export function riderValue(r) {
  const costM = ((r.cost || 0) / 1e6) || 1;
  return { perM: (r.stats?.totalPoints || 0) / costM, recentPerM: (r.stats?.last3Events || 0) / costM };
}
/* forma: L3/L5 sono SOMME (es. L3 = punti negli ultimi 3 GP); trend = L3/3 vs media a GP.
   lastEvent aggiunge evidenza recente solo se lo scarto e' materiale: un picco
   isolato debole non ribalta la forma. */
export function riderForm(r) {
  const l3 = r.stats?.last3Events ?? null, l5 = r.stats?.last5Events ?? null, avg = r.stats?.avgPoints ?? null;
  const lastEvent = r.stats?.lastEvent ?? null;
  const l3avg = Number.isFinite(l3) ? l3 / 3 : null;
  const hasAvg = Number.isFinite(avg) && avg > 0;
  const l3Up = hasAvg && l3avg != null && l3avg > avg * 1.1;
  const l3Down = hasAvg && l3avg != null && l3avg < avg * 0.75;
  const lastUp = hasAvg && Number.isFinite(lastEvent) && lastEvent >= avg * 1.15 && lastEvent >= avg + 3;
  const lastDown = hasAvg && Number.isFinite(lastEvent) && lastEvent <= avg * 0.75 && lastEvent <= avg - 3;
  const trend = l3Up || lastUp ? 1 : l3Down || lastDown ? -1 : 0;
  return { l3, l5, avg, lastEvent, l3avg, trend };
}
