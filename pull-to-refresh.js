import { refreshData } from './data.js';

let ptrStartY = 0;
let ptrActive = false;
const PTR_THRESHOLD = 80;

document.addEventListener('touchstart', e => {
  if (window.scrollY === 0 && e.touches.length === 1) {
    ptrStartY = e.touches[0].clientY;
    ptrActive = true;
  }
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!ptrActive) return;
  const dy = e.touches[0].clientY - ptrStartY;
  if (dy > 0 && dy < 140 && window.scrollY === 0) {
    const ptr = document.getElementById('ptr');
    ptr.style.height = Math.min(dy * 0.6, 56) + 'px';
    document.getElementById('ptr-text').textContent = dy > PTR_THRESHOLD ? 'Rilascia' : 'Aggiorna';
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  if (!ptrActive) return;
  ptrActive = false;
  const ptr = document.getElementById('ptr');
  const h = parseInt(ptr.style.height) || 0;
  if (h > PTR_THRESHOLD * 0.6) {
    ptr.style.height = '44px';
    document.getElementById('ptr-spinner').classList.add('is-spinning');
    document.getElementById('ptr-text').textContent = 'Caricamento...';
    refreshData().finally(() => {
      document.getElementById('ptr-spinner').classList.remove('is-spinning');
      ptr.style.height = '0';
    });
  } else {
    ptr.style.height = '0';
  }
});

