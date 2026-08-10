/* Timer indipendenti per elementId: prima un solo timer globale colpiva sempre
   l'elemento con id="cd", ma Home (hero) e Fantasy (renderUpcomingEventView)
   usavano ENTRAMBI id="cd" — con due elementi identici sempre nel DOM (le
   sezioni non attive restano nel DOM, solo nascoste via CSS), getElementById
   prendeva sempre il primo (quello di Home), lasciando l'altro fermo. */
const timers = new Map(); /* elementId -> intervalId */

export function startCountdown(targetIso, elementId = 'cd') {
  stopCountdown(elementId);
  const tick = () => {
    const ms = new Date(targetIso).getTime() - Date.now();
    if (ms < 0) { stopCountdown(elementId); return; }
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cd = document.getElementById(elementId);
    if (!cd) { stopCountdown(elementId); return; }
    cd.innerHTML =
      `<div class="cd-u"><div class="cd-n">${String(d).padStart(2,'0')}</div><div class="cd-l">Giorni</div></div>` +
      `<div class="cd-s">:</div>` +
      `<div class="cd-u"><div class="cd-n">${String(h).padStart(2,'0')}</div><div class="cd-l">Ore</div></div>` +
      `<div class="cd-s">:</div>` +
      `<div class="cd-u"><div class="cd-n">${String(m).padStart(2,'0')}</div><div class="cd-l">Min</div></div>` +
      `<div class="cd-s">:</div>` +
      `<div class="cd-u"><div class="cd-n">${String(s).padStart(2,'0')}</div><div class="cd-l">Sec</div></div>`;
  };
  tick();
  timers.set(elementId, setInterval(tick, 1000));
}

export function stopCountdown(elementId = 'cd') {
  const id = timers.get(elementId);
  if (id) { clearInterval(id); timers.delete(elementId); }
}

/* ─ Topbar dynamics ─ */
