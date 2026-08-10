import { load } from './data.js';
import { updateFreshness } from './auto-refresh.js';
import './pull-to-refresh.js';

/* ═════════════════════════════════════════════════════════
   SERVICE WORKER + PWA
   ═════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  /* Senza questo, una PWA gia' aperta non si accorgeva mai di un nuovo deploy
     finche' non veniva chiusa e riaperta a mano (serviva "chiudere/riaprire
     l'app installata"): un nuovo SW prende controllo (skipWaiting+clients.claim
     lato sw.js) ma la pagina gia' caricata restava sulla vecchia versione. */
  let refreshedAfterUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshedAfterUpdate) return;
    refreshedAfterUpdate = true;
    window.location.reload();
  });
}

/* go! */
load().then(() => {
  updateFreshness(); /* chiama gia' scheduleAutoRefresh() al suo interno */
});
