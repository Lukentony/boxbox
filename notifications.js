import { effectiveStatus } from './selectors.js';
import { DATA } from './state.js';

export function checkAndNotify(oldBd, newBd) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('bbNotifications') !== 'true') return;
  if (!oldBd || !newBd) return;

  /* Trova l'evento attivo */
  const ev = DATA.events?.find(e => effectiveStatus(e) === 'active');
  if (!ev) return;
  const evId = String(ev.id);

  const oldStandings = oldBd?.byEvent?.[evId]?.standings || [];
  const newStandings = newBd?.byEvent?.[evId]?.standings || [];
  if (!newStandings.length) return;

  /* Confronta totali — notifica solo se cambiati */
  const oldTotals = Object.fromEntries(oldStandings.map(p => [p.displayName, p.total ?? 0]));
  const changed = newStandings.some(p => (oldTotals[p.displayName] ?? -1) !== (p.total ?? 0));
  if (!changed) return;

  const evName = newBd.byEvent?.[evId]?.eventName || ev.name || 'GP';
  const body = newStandings.map((p, i) => `${i+1}. ${p.displayName}: ${p.total ?? 0}pt`).join('\n');

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(`🏁 ${evName} — punti aggiornati`, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'boxbox-update',
        renotify: true,
      });
    }).catch(() => {});
  } else {
    try { new Notification(`🏁 ${evName} — punti aggiornati`, { body, icon: '/icon-192.png' }); } catch(e) {}
  }
}

/* ═════════════════════════════════════════════════════════
   AUTO-REFRESH (dati pubblici durante weekend attivo)
   ═════════════════════════════════════════════════════════ */
