import { load } from './data.js';
import { scheduleAutoRefresh, updateFreshness } from './auto-refresh.js';
import './pull-to-refresh.js';

/* ═════════════════════════════════════════════════════════
   SERVICE WORKER + PWA
   ═════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* go! */
load().then(() => {
  updateFreshness();
  scheduleAutoRefresh();
});
