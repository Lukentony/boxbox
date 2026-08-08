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

