import { startCountdown, stopCountdown } from './countdown.js';
import { frammento, nodo } from './dom.js';
import { flagOf, fmtDate, posLabel, sessionLabel } from './format.js';
import { activeEvent, lastCompletedEvent, nextScheduledEvent, avvioGp } from './selectors.js';
import { DATA } from './state.js';
import { heroNodo } from './tab-home.js';
import { PERCORSI, animateChildren, vaiA } from './ui.js';

let liveSessionId = null; /* sessione scelta nel programma (#/live/sessione/:id) */

/* Imposta la sotto-vista della stanza Live. La rotta arriva dal router (ui.js),
   che la applica e poi fa renderizzare la stanza: qui non si naviga. */
export function impostaLiveVista(sid) { liveSessionId = sid ?? null; }

function ora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* Intestazione del weekend in corso: stesso blocco .hero di Home, senza countdown
   (qui conta la sessione, non il GP). */
function intestazioneWeekendNodo(wk) {
  const e = wk.event || {};
  return nodo('div', { class: 'hero' },
    nodo('div', { class: 'hero-r' },
      nodo('span', { class: 'hero-round' }, 'Weekend'),
      nodo('span', { class: 'hero-flag' }, flagOf({ shortName: e.shortName })),
      nodo('span', { class: 'tag tag--live' }, 'IN CORSO')),
    nodo('div', { class: 'hero-name' }, e.name ? e.name.trim() : (e.shortName || 'GP')),
    nodo('div', { class: 'hero-circuit' }, e.circuit || ''),
    nodo('div', { class: 'cd' },
      nodo('div', { class: 'cd-u' },
        nodo('div', { class: 'cd-n', style: 'font-size:20px' },
          fmtDate(e.dateStart) + (e.dateEnd ? ' – ' + fmtDate(e.dateEnd) : '')),
        nodo('div', { class: 'cd-l' }, 'date del weekend'))));
}

/* Tabellone della diretta: arriva da weekend.json (normalizzato lato server da
   livetiming-lite). Il browser non chiama nessuna API MotoGP.
   Il feed del live timing puo' essere di un'altra classe mentre la stanza Live
   racconta il weekend MotoGP: la categoria va scritta nell'intestazione, altrimenti
   "Diretta · Q2" sembra la Q2 della MotoGP. */
function tabelloneNodo(live) {
  const quando = live.fetchedAt ? ora(live.fetchedAt) : null;
  const nome = live.sessionShortName || live.sessionName || 'Sessione';
  const titolo = ['Diretta', live.category, nome].filter(Boolean).join(' · ');
  const righe = live.board.map(r => {
    const gap = r.gapFirst ? (r.gapFirst === '0.000' ? '—' : '+' + r.gapFirst) : '–';
    return nodo('tr', null,
      nodo('td', { style: 'font-weight:700' }, posLabel(r.pos)),
      nodo('td', { style: 'text-align:left' },
        nodo('b', null, r.name),
        nodo('div', { style: 'font-size:10px;color:var(--text-dim)' }, r.team || r.bike || '')),
      nodo('td', { style: 'font-family:var(--f-mono)' }, gap),
      nodo('td', { style: 'font-family:var(--f-mono)' }, r.lastLap || '–'),
      nodo('td', null, (r.laps ?? '–') + (r.onPit ? ' ' : ''),
        r.onPit ? nodo('span', { style: 'color:var(--text-faint);font-size:10px' }, 'box') : null));
  });
  return nodo('div', { class: 'card' },
    nodo('div', { class: 'card-h' },
      nodo('span', { class: 'card-t' }, '🔴 ' + titolo),
      nodo('span', { class: 'card-meta nowrap' }, quando ? 'agg. ' + quando : '')),
    nodo('div', { style: 'overflow-x:auto' },
      nodo('table', { class: 'p-tbl', style: 'width:100%;font-size:12px' },
        nodo('tbody', null,
          nodo('tr', null,
            nodo('th', null, 'Pos'),
            nodo('th', { style: 'text-align:left' }, 'Pilota'),
            nodo('th', null, 'Gap'),
            nodo('th', null, 'Ultimo giro'),
            nodo('th', null, 'Giri')),
          righe))));
}

/* Classifica di una sessione (dal file, non dal feed): tabella come in
   Classifiche, ma senza i pulsanti di quella stanza. */
function classificazioneNodo(s) {
  const st = String(s.status || '').toUpperCase();
  const righe = s.classification.map(e => {
    const gap = (e.gapFirst && e.gapFirst !== '0.000') ? '+' + e.gapFirst : (String(e.position) === '1' ? '—' : (e.gapFirst || ''));
    return nodo('tr', null,
      nodo('td', { style: 'font-weight:700' }, posLabel(e.position)),
      nodo('td', { style: 'text-align:left' },
        nodo('b', null, e.name),
        nodo('div', { style: 'font-size:10px;color:var(--text-dim)' }, e.team || '')),
      nodo('td', { style: 'font-family:var(--f-mono)' }, gap),
      nodo('td', { style: 'font-family:var(--f-mono)' }, e.bestLap || '–'),
      nodo('td', null, e.totalLaps ?? '–'));
  });
  return nodo('div', { class: 'card' },
    nodo('div', { class: 'card-h' },
      nodo('span', { class: 'card-t' }, sessionLabel(s) + ' — Classifica'),
      nodo('span', { class: 'card-meta' }, st === 'FINISHED' || st === 'COMPLETE' ? 'conclusa' : 'in corso')),
    nodo('div', { style: 'overflow-x:auto' },
      nodo('table', { class: 'p-tbl', style: 'width:100%;font-size:12px' },
        nodo('tbody', null,
          nodo('tr', null,
            nodo('th', null, 'Pos'),
            nodo('th', { style: 'text-align:left' }, 'Pilota'),
            nodo('th', null, 'Gap'),
            nodo('th', null, 'Giro veloce'),
            nodo('th', null, 'Giri')),
          righe))));
}

function programmaNodo(wk, selId) {
  const sessions = wk.sessions || [];
  const righe = sessions.map(s => {
    const st = String(s.status || '').toUpperCase();
    const isDone = st === 'FINISHED' || st === 'COMPLETE';
    const isLive = st === 'STARTED' || st === 'LIVE';
    const tag = isLive ? nodo('span', { class: 'tag tag--live' }, 'Live')
      : isDone ? nodo('span', { class: 'tag tag--done' }, '✓') : null;
    const hasCls = Array.isArray(s.classification) && s.classification.length > 0;
    const sel = String(s.id) === String(selId);
    return nodo('div', {
      class: 'cal-row',
      'data-sess': hasCls ? s.id : null,
      style: 'padding:10px 0;gap:10px;align-items:center' + (hasCls ? ';cursor:pointer' : ''),
    },
      nodo('div', { class: 'cal-body', style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0' },
        nodo('div', null,
          nodo('div', { class: 'cal-name', style: 'font-size:15px' + (sel ? ';color:var(--accent)' : '') }, sessionLabel(s)),
          nodo('div', { class: 'cal-meta', style: 'margin:2px 0 0' }, fmtDate(s.date) + ' · ' + ora(s.date))),
        nodo('div', { style: 'display:flex;align-items:center;gap:8px;flex-shrink:0' },
          tag,
          hasCls ? nodo('span', { class: 'cal-go' }, 'Classifica ›') : null)));
  });
  return frammento(
    nodo('div', { class: 'f-subtitle', style: 'margin-top:16px' }, nodo('span', null, 'Programma del weekend')),
    nodo('div', { class: 'card' },
      nodo('div', { class: 'card-h' },
        nodo('span', { class: 'card-t' }, 'Sessioni'),
        nodo('span', { class: 'card-meta' },
          fmtDate(wk.event?.dateStart) + (wk.event?.dateEnd ? ' – ' + fmtDate(wk.event.dateEnd) : ''))),
      nodo('div', { style: 'padding:2px' }, righe)));
}

/* Podio dell'ultimo GP concluso: vive qui (prima stava in Home). La card porta
   al permalink del GP (#/gp/:id), dove si aprono i risultati. */
function ultimoGpNodo(last) {
  if (!last) {
    return nodo('div', { class: 'card' },
      nodo('div', { class: 'card-h' }, nodo('span', { class: 'card-t' }, 'Ultimo GP')),
      nodo('div', { class: 'empty', style: 'padding:16px' }, 'Nessun GP completato.'));
  }
  const lastResults = DATA.riders
    .filter(r => r.stats?.events?.[last.id])
    .map(r => ({ r, e: r.stats.events[last.id] }))
    .sort((a, b) => (b.e.finalPoints || 0) - (a.e.finalPoints || 0))
    .slice(0, 3);
  const righe = lastResults.map((x, i) => {
    const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : 'plate plate--bronze';
    return nodo('div', { class: 'row' },
      nodo('div', { class: plateCls }, nodo('span', null, x.r.number || x.r.id)),
      nodo('div', { class: 'row-m' },
        nodo('div', { class: 'row-name' }, x.r.firstName + ' ' + x.r.lastName),
        nodo('div', { class: 'row-sub' }, DATA.constById[x.r.constructorId]?.name || '')),
      nodo('div', { class: 'row-pts' }, x.e.finalPoints || 0,
        nodo('div', { class: 'pts-sub' }, 'pt gara')));
  });
  return nodo('div', { class: 'card', 'data-gp': last.id, style: 'cursor:pointer' },
    nodo('div', { class: 'card-h' },
      nodo('span', { class: 'card-t' }, flagOf(last) + ' · Gara'),
      nodo('span', { class: 'card-meta' }, last.displayedName.trim() + ' ›')),
    righe);
}

/* ═════════════════════════════════════════════════════════
   LIVE — weekend in corso (programma + sessione + tabellone) oppure, fuori
   weekend, countdown al prossimo GP e podio dell'ultimo.
   ═════════════════════════════════════════════════════════ */
export function renderLive() {
  const root = document.getElementById('s-live');
  stopCountdown('cd-live');

  const wk = DATA.weekend;
  const sessions = (wk && Array.isArray(wk.sessions)) ? wk.sessions : [];
  const tutteConcluse = sessions.length > 0 && sessions.every(s => ['FINISHED', 'CANCELLED'].includes(String(s.status || '').toUpperCase()));
  const eventoScaduto = !!(wk && wk.event && wk.event.dateEnd && (new Date(wk.event.dateEnd + 'T23:59:59Z').getTime() < Date.now()));
  const weekendInCorso = !!(wk && wk.event && String(wk.event.status || '').toUpperCase() === 'CURRENT') && !tutteConcluse && !eventoScaduto;
  const live = (wk && wk.live && Array.isArray(wk.live.board) && wk.live.board.length) ? wk.live : null;
  const sel = liveSessionId ? sessions.find(s => String(s.id) === String(liveSessionId)) : null;
  const corrente = sessions.find(s => String(s.id) === String(wk.currentSessionId))
    || sessions.find(s => String(s.status || '').toUpperCase() === 'STARTED') || null;
  const prossima = sessions.find(s => String(s.id) === String(wk.nextSessionId)) || null;
  let countdownA = null; /* ISO da cui far partire il countdown della stanza */

  const contenuto = [];
  if (weekendInCorso && sel) {
    /* Sotto-vista: una sessione scelta dal programma. */
    contenuto.push(intestazioneWeekendNodo(wk));
    contenuto.push(nodo('div', { class: 'seg', style: 'margin-top:12px' },
      nodo('button', { class: 'seg-btn is-active', id: 'back-live', style: 'margin-right:0' }, '← Programma')));
    contenuto.push((Array.isArray(sel.classification) && sel.classification.length)
      ? classificazioneNodo(sel)
      : nodo('div', { class: 'card', style: 'padding:24px;text-align:center;color:var(--text-dim)' },
        sessionLabel(sel) + ' non ha ancora una classifica.'));
    contenuto.push(programmaNodo(wk, sel.id));
  } else if (weekendInCorso) {
    /* Weekend in corso: tabellone se c'e', altrimenti sessione corrente o
       prossima, poi il programma e (se manca tutto) l'ultima classifica. */
    contenuto.push(intestazioneWeekendNodo(wk));

    if (live) {
      contenuto.push(tabelloneNodo(live));
    } else if (corrente && corrente.classification && corrente.classification.length) {
      contenuto.push(classificazioneNodo(corrente));
    } else if (prossima) {
      contenuto.push(nodo('div', { class: 'card' },
        nodo('div', { class: 'card-h' },
          nodo('span', { class: 'card-t' }, 'Prossima sessione'),
          nodo('span', { class: 'card-meta' }, fmtDate(prossima.date) + ' · ' + ora(prossima.date))),
        nodo('div', { style: 'font-size:15px;font-weight:700' }, sessionLabel(prossima)),
        nodo('div', { class: 'cd', id: 'cd-live', style: 'justify-content:flex-start' })));
      if (new Date(prossima.date).getTime() > Date.now()) countdownA = prossima.date;
    }

    contenuto.push(programmaNodo(wk, null));

    if (!live && !corrente) {
      const conClassifica = sessions.filter(s => Array.isArray(s.classification) && s.classification.length);
      const ultima = conClassifica[conClassifica.length - 1];
      if (ultima) contenuto.push(classificazioneNodo(ultima));
    }
  } else {
    const hero = activeEvent() || nextScheduledEvent();
    contenuto.push(nodo('div', { class: 'f-subtitle' }, nodo('span', null, 'Prossimo GP')));
    if (hero) {
      contenuto.push(heroNodo(hero, 'cd-live'));
      if (hero.status !== 'active') countdownA = avvioGp(hero).iso;
    } else {
      contenuto.push(nodo('div', { class: 'card' },
        nodo('div', { class: 'empty', style: 'padding:16px' }, 'Nessun GP in calendario.')));
    }
    contenuto.push(ultimoGpNodo(lastCompletedEvent()));
  }

  contenuto.push(nodo('div', { class: 'fade-pad' }));
  root.replaceChildren(frammento(contenuto));
  animateChildren(root);

  if (countdownA) setTimeout(() => startCountdown(countdownA, 'cd-live'), 50);

  root.querySelectorAll('[data-sess]').forEach(el => {
    el.addEventListener('click', () => vaiA(PERCORSI.liveSessione(el.dataset.sess)));
  });
  root.querySelectorAll('[data-gp]').forEach(el => {
    el.addEventListener('click', () => vaiA(PERCORSI.gp(el.dataset.gp)));
  });
  const back = root.querySelector('#back-live');
  if (back) back.addEventListener('click', () => vaiA(PERCORSI.live));
}
