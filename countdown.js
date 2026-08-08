let cdTimer = null;
export function startCountdown(targetIso) {
  stopCountdown();
  const tick = () => {
    const ms = new Date(targetIso).getTime() - Date.now();
    if (ms < 0) { stopCountdown(); return; }
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cd = document.getElementById('cd');
    if (!cd) { stopCountdown(); return; }
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
  cdTimer = setInterval(tick, 1000);
}
export function stopCountdown() {
  if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
}

/* ─ Topbar dynamics ─ */
