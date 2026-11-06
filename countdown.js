/* Timer indipendenti per elementId: prima un solo timer globale colpiva sempre
   l'elemento con id="cd", ma Home (hero) e Fantasy (renderUpcomingEventView)
   usavano ENTRAMBI id="cd" — con due elementi identici sempre nel DOM (le
   sezioni non attive restano nel DOM, solo nascoste via CSS), getElementById
   prendeva sempre il primo (quello di Home), lasciando l'altro fermo. */
import { nodo } from './dom.js';

const timers = new Map(); /* elementId -> intervalId */
/* Struttura gia' costruita di ogni countdown: si costruisce una volta e poi si
   aggiornano i soli numeri, invece di rifare i nodi a ogni secondo. */
const strutture = new WeakMap(); /* elemento countdown -> nodi dei numeri */

function strutturaCountdown(cd) {
  const numero = () => nodo('div', { class: 'cd-n' });
  const unita = (n, etichetta) => nodo('div', { class: 'cd-u' }, n, nodo('div', { class: 'cd-l' }, etichetta));
  const separatore = () => nodo('div', { class: 'cd-s' }, ':');
  const giorni = numero(), ore = numero(), minuti = numero(), secondi = numero();
  cd.replaceChildren(
    unita(giorni, 'Giorni'), separatore(),
    unita(ore, 'Ore'), separatore(),
    unita(minuti, 'Min'), separatore(),
    unita(secondi, 'Sec'));
  const struttura = { giorni, ore, minuti, secondi };
  strutture.set(cd, struttura);
  return struttura;
}

export function startCountdown(targetIso, elementId = 'cd') {
  stopCountdown(elementId);
  const tick = () => {
    const cd = document.getElementById(elementId);
    if (!cd) { stopCountdown(elementId); return; }
    const ms = new Date(targetIso).getTime() - Date.now();
    /* A zero il countdown non resta congelato sull'ultimo secondo: dice che il
       via e' stato dato (vale sia per il GP sia per la sessione). */
    if (ms < 0) {
      stopCountdown(elementId);
      cd.replaceChildren(nodo('div', { class: 'cd-u' },
        nodo('div', { class: 'cd-n cd-n--stato' }, 'AL VIA')));
      return;
    }
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const struttura = strutture.get(cd) || strutturaCountdown(cd);
    struttura.giorni.textContent = String(d).padStart(2, '0');
    struttura.ore.textContent = String(h).padStart(2, '0');
    struttura.minuti.textContent = String(m).padStart(2, '0');
    struttura.secondi.textContent = String(s).padStart(2, '0');
  };
  tick();
  timers.set(elementId, setInterval(tick, 1000));
}

export function stopCountdown(elementId = 'cd') {
  const id = timers.get(elementId);
  if (id) { clearInterval(id); timers.delete(elementId); }
}

/* ─ Topbar dynamics ─ */
