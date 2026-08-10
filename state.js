export const DATA = {};

/* Navigazione principale persistita: un refresh (o riapertura della PWA) resta
   sulla tab/GP/modalita' dove si era, invece di ripartire sempre da Home. */
export let currentTab = localStorage.getItem('bbTab') || 'home';
export let currentGp = localStorage.getItem('bbGp') || 'season';
export let viewMode = localStorage.getItem('bbViewMode') || 'campionato';

export function setCurrentTab(v) { currentTab = v; localStorage.setItem('bbTab', v); }
export function setCurrentGp(v) { currentGp = v; localStorage.setItem('bbGp', v); }
export function setViewMode(v) { viewMode = v; localStorage.setItem('bbViewMode', v); }
