/* setAttribute evita il breakout HTML, non i protocolli eseguibili: i link del
   feed devono passare da questa policy prima di entrare nel DOM. */
export function safeHttpUrl(value, fallback = '') {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : fallback;
  } catch { return fallback; }
}

export const FLAGS = {
  THA:'🇹🇭', BRA:'🇧🇷', USA:'🇺🇸', QAT:'🇶🇦', SPA:'🇪🇸', FRA:'🇫🇷',
  GBR:'🇬🇧', ITA:'🇮🇹', NED:'🇳🇱', GER:'🇩🇪', CZE:'🇨🇿', AUT:'🇦🇹',
  HUN:'🇭🇺', CAT:'🇪🇸', RSM:'🇸🇲', JPN:'🇯🇵', INA:'🇮🇩', AUS:'🇦🇺',
  MAL:'🇲🇾', POR:'🇵🇹', VAL:'🇪🇸', ARA:'🇪🇸'
};
export const flagOf = (e) => FLAGS[(e.shortName||'').toUpperCase()] || '🏁';
export const monthsIT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
export const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.getDate() + ' ' + monthsIT[d.getMonth()];
};
export const fmtOra = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
export function sessionLabel(s) {
  const t = String(s?.type || '').toUpperCase();
  const n = s?.number;
  if (t === 'FP') return 'FP' + (n ?? '');
  if (t === 'PR') return 'Practice';
  if (t === 'Q') return 'Q' + (n ?? '');
  if (t === 'Q1') return 'Q1';
  if (t === 'Q2') return 'Q2';
  if (t === 'SPR' || t === 'SPRINT') return 'Sprint';
  if (t === 'WUP') return 'Warm-up';
  if (t === 'RAC' || t === 'FINAL') return 'Gara';
  return t || 'Sessione';
}
/* Etichetta della posizione: un numero positivo e' una posizione vera, tutto il
   resto (null, 0, -1: ritirato o non classificato) si mostra DNF. Il tabellone
   live del feed usa -1 per i ritirati: senza questa guardia finivano in testa. */
export const posLabel = (p) => {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n + '\u00b0' : 'DNF';
};
/* Countdown compatto per le liste (calendario): "tra 13 g 4 h", "tra 4 h 20 min",
   "tra 12 min". Non ticka: si ricalcola a ogni render, come le date accanto. */
export function traQuanto(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'in corso';
  const g = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (g > 0) return `tra ${g} g ${h} h`;
  if (h > 0) return `tra ${h} h ${m} min`;
  return `tra ${m} min`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0) return 'ora';
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + ' min fa';
  const h = Math.floor(min / 60);
  if (h < 24) return h + 'h fa';
  const d = Math.floor(h / 24);
  return d + 'g fa';
}

