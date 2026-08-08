import { DATA } from './state.js';

export function gpSig(gp) {
  const e = (DATA.events || []).find(x => String(x.id) === String(gp));
  return e ? (e.shortName || (e.displayedName ? e.displayedName.trim().slice(0, 3).toUpperCase() : 'R' + gp)) : 'R' + gp;
}
/* trend prezzo dagli ultimi 2 GP con dato in costHistory (priceDiff API è sempre 0) */
export function riderPriceTrend(r) {
  const ch = r.costHistory || {};
  const gps = Object.keys(ch).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const last = gps.length ? (ch[gps[gps.length - 1]]?.cost ?? r.cost) : (r.cost || 0);
  const prev = gps.length >= 2 ? (ch[gps[gps.length - 2]]?.cost ?? last) : last;
  const deltaM = (last - prev) / 1e6;
  return { lastM: last / 1e6, prevM: prev / 1e6, deltaM, dir: deltaM > 0 ? 1 : deltaM < 0 ? -1 : 0 };
}
/* value: punti per Milione (stagione e recente L3) */
export function riderValue(r) {
  const costM = ((r.cost || 0) / 1e6) || 1;
  return { perM: (r.stats?.totalPoints || 0) / costM, recentPerM: (r.stats?.last3Events || 0) / costM };
}
/* forma: L3/L5 sono SOMME (es. L3 = punti negli ultimi 3 GP); trend = L3/3 vs media a GP */
export function riderForm(r) {
  const l3 = r.stats?.last3Events ?? null, l5 = r.stats?.last5Events ?? null, avg = r.stats?.avgPoints ?? null;
  const l3avg = (l3 != null) ? l3 / 3 : null;
  const trend = (l3avg != null && avg) ? (l3avg > avg * 1.1 ? 1 : l3avg < avg * 0.75 ? -1 : 0) : 0;
  return { l3, l5, avg, l3avg, trend };
}
