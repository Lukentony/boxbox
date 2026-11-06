export const DATA = {};

/* La navigazione vive nell'hash (ui.js): bbTab e' solo il seme letto quando
   l'hash manca (avvio della PWA: start_url "/"). Il valore viene aggiornato a
   ogni rotta per non farlo invecchiare, ma nessuno lo rilegge durante la
   sessione: la rotta dell'hash vince sempre. */
export let currentTab = localStorage.getItem('bbTab') || 'home';
export let currentGp = localStorage.getItem('bbGp') || 'season';
export let viewMode = localStorage.getItem('bbViewMode') || 'campionato';

export function setCurrentTab(v) { currentTab = v; localStorage.setItem('bbTab', v); }
export function setCurrentGp(v) { currentGp = v; localStorage.setItem('bbGp', v); }
export function setViewMode(v) { viewMode = v; localStorage.setItem('bbViewMode', v); }
