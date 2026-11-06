import { gpSig, riderForm, riderPriceTrend, riderValue } from './analysis.js';
import { frammento, nodo } from './dom.js';
import { orderEvents } from './event-order.js';
import { flagOf, fmtDate, posLabel, sessionLabel, traQuanto } from './format.js';
import { champPoints, effectiveStatus } from './selectors.js';
import { DATA } from './state.js';
import { PERCORSI, animateChildren, setTopbar, vaiA } from './ui.js';

let standingsView = 'riders';
let selectedSerie = null;    /* serie del segmento "Altre serie" (moto2|moto3|wsbk) */
let selectedResultGp = null; /* GP selezionato per la vista risultati nel segmento Calendario */
let selectedRiderId = null;  /* pilota selezionato per la vista dettaglio (segmento Piloti) */
let selectedProgramGp = null;      /* GP di cui si vede il programma del weekend (GP futuri) */
let selectedProgramSession = null; /* sessione del programma di cui si vede la classifica */

/* ─── Sotto-viste della scheda Campionato ───
   Quale vista mostrare lo decide la rotta hash (ui.js): il router la imposta
   qui con impostaVistaStandings() e poi renderizza. Questo modulo non naviga
   e non tiene piu' uno stato di navigazione parallelo all'URL. */
export function impostaVistaStandings(vista) {
  standingsView = vista?.standingsView || 'riders';
  selectedSerie = vista?.selectedSerie ?? null;
  selectedResultGp = vista?.selectedResultGp ?? null;
  selectedRiderId = vista?.selectedRiderId ?? null;
  selectedProgramGp = vista?.selectedProgramGp ?? null;
  selectedProgramSession = vista?.selectedProgramSession ?? null;
}

/* Segmento → percorso hash. La mappa si costruisce al click, non al
   caricamento del modulo: tab-standings.js e' dentro il ciclo di import con
   ui.js, e una const che legge PERCORSI in cima al file lo troverebbe ancora
   nella zona morta (ReferenceError all'avvio dell'app, non individuabile con
   node --check). */
function percorsoSegmento(sv) {
  return {
    riders: PERCORSI.classifiche,
    constructors: PERCORSI.classificheCostruttori,
    squads: PERCORSI.classificheTeam,
    calendar: PERCORSI.classificheCalendario,
    altre: PERCORSI.classificheAltre,
  }[sv] || PERCORSI.classifiche;
}

/* ═══ ANALYSIS HELPERS (data layer, funzioni pure — usate da Dettaglio/Prezzi/Motore) ═══ */
/* sigla GP da DATA.events (no hardcoding) */
export function renderStandings() {
  const root = document.getElementById('s-standings');
  const segmento = nodo('div', { class: 'seg seg--scroll' },
    nodo('button', { class: 'seg-btn' + (standingsView === 'riders' ? ' is-active' : ''), 'data-sv': 'riders' }, 'Piloti'),
    nodo('button', { class: 'seg-btn' + (standingsView === 'constructors' ? ' is-active' : ''), 'data-sv': 'constructors' }, 'Costruttori'),
    nodo('button', { class: 'seg-btn' + (standingsView === 'squads' ? ' is-active' : ''), 'data-sv': 'squads' }, 'Team'),
    nodo('button', { class: 'seg-btn' + (standingsView === 'calendar' && !selectedResultGp && !selectedProgramGp ? ' is-active' : ''), 'data-sv': 'calendar' }, 'Calendario'),
    nodo('button', { class: 'seg-btn' + (standingsView === 'altre' ? ' is-active' : ''), 'data-sv': 'altre' }, 'Altre serie'));

  let corpo;
  if (standingsView === 'riders') {
    if (selectedRiderId) {
      corpo = riderDetailNodo(selectedRiderId);
    } else {
      const list = DATA.riders
        .filter(r => r.status !== 'disqualified')
        .sort((a,b) => champPoints(b) - champPoints(a));
      const leaderPts = champPoints(list[0]) || 0;
      const righe = list.map((r, i) => {
        const team = DATA.constById[r.constructorId]?.name || '';
        const pts = champPoints(r);
        const gap = i === 0 ? 'P1' : '-' + (leaderPts - pts);
        const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : i === 2 ? 'plate plate--bronze' : 'plate';
        const ferito = r.status === 'injured' ? nodo('span', { class: 'injured', title: 'infortunato' }, '●') : null;
        return nodo('div', { class: 'row' + (i === 0 ? ' is-leader' : ''), 'data-rid': r.id, style: 'cursor:pointer' },
          nodo('div', { class: plateCls },
            nodo('span', { class: 'plate-pos' }, String(i + 1)),
            nodo('span', null, r.number || r.id)),
          nodo('div', { class: 'row-m' },
            nodo('div', { class: 'row-name' }, r.firstName + ' ' + r.lastName + (ferito ? ' ' : ''), ferito),
            nodo('div', { class: 'row-sub' }, team)),
          nodo('div', { class: 'row-pts' }, pts, nodo('div', { class: 'pts-sub' }, gap)));
      });
      corpo = frammento(
        nodo('div', { style: 'font-size:11px;color:var(--text-dim);margin-bottom:8px' },
          '👇 Tocca un pilota per il dettaglio (andamento, prezzo, forma).'),
        nodo('div', { class: 'card', style: 'padding:8px 14px' }, righe));
    }
  } else if (standingsView === 'constructors') {
    const list = (DATA.constructors||[])
      .map(c => ({...c, total: Object.values(c.stats?.events||{}).reduce((s,e)=>s+(e.points||0),0)}))
      .sort((a,b)=> b.total - a.total);
    const leaderPts = list[0]?.total || 0;
    const righe = list.map((c, i) => {
      const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : i === 2 ? 'plate plate--bronze' : 'plate';
      return nodo('div', { class: 'row' + (i === 0 ? ' is-leader' : '') },
        nodo('div', { class: plateCls }, nodo('span', null, String(i + 1))),
        nodo('div', { class: 'row-m' },
          nodo('div', { class: 'row-name' }, c.name),
          nodo('div', { class: 'row-sub' }, (c.stats?.events?.length || Object.keys(c.stats?.events || {}).length) + ' GP')),
        nodo('div', { class: 'row-pts' }, c.total,
          nodo('div', { class: 'pts-sub' }, i === 0 ? 'P1' : '-' + (leaderPts - c.total))));
    });
    corpo = nodo('div', { class: 'card', style: 'padding:8px 14px' }, righe);
  } else if (standingsView === 'squads') {
    const list = (DATA.squads||[])
      .map(s => ({...s, total: Object.values(s.stats?.events||{}).reduce((sum,e)=>sum+(e.points||0),0)}))
      .filter(s => s.total > 0)
      .sort((a,b)=> b.total - a.total);
    const leaderPts = list[0]?.total || 0;
    const righe = list.map((s, i) => {
      const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : i === 2 ? 'plate plate--bronze' : 'plate';
      return nodo('div', { class: 'row' + (i === 0 ? ' is-leader' : '') },
        nodo('div', { class: plateCls }, nodo('span', null, String(i + 1))),
        nodo('div', { class: 'row-m' },
          nodo('div', { class: 'row-name' }, s.name),
          nodo('div', { class: 'row-sub' }, 'Valore €' + (s.cost/1e6).toFixed(1) + 'M')),
        nodo('div', { class: 'row-pts' }, s.total,
          nodo('div', { class: 'pts-sub' }, i === 0 ? 'P1' : '-' + (leaderPts - s.total))));
    });
    corpo = nodo('div', { class: 'card', style: 'padding:8px 14px' }, righe);
  } else if (standingsView === 'calendar') {
    corpo = selectedProgramGp ? programGpNodo(selectedProgramGp)
         : selectedResultGp ? resultsNodo(selectedResultGp)
         : calendarNodo();
  } else if (standingsView === 'altre') {
    corpo = selectedSerie ? serieNodo(selectedSerie) : altreMenuNodo();
  }

  root.replaceChildren(segmento, corpo, nodo('div', { class: 'fade-pad' }));
  animateChildren(root);
  root.querySelectorAll('.seg-btn[data-sv]').forEach(b => {
    b.addEventListener('click', () => {
      vaiA(percorsoSegmento(b.dataset.sv));
    });
  });
  /* Calendario: GP concluso → risultati; GP futuro → programma del weekend */
  root.querySelectorAll('[data-resgp]').forEach(el => {
    el.addEventListener('click', () => { vaiA(PERCORSI.gp(el.dataset.resgp)); });
  });
  root.querySelectorAll('[data-gpprog]').forEach(el => {
    el.addEventListener('click', () => { vaiA(PERCORSI.gp(el.dataset.gpprog)); });
  });
  root.querySelectorAll('[data-sess]').forEach(el => {
    el.addEventListener('click', () => { vaiA(PERCORSI.sessione(selectedProgramGp, el.dataset.sess)); });
  });
  /* Altre serie: card della serie → classifica della serie (#/serie/:id) */
  root.querySelectorAll('[data-serie]').forEach(el => {
    el.addEventListener('click', () => { vaiA(PERCORSI.serie(el.dataset.serie)); });
  });
  /* I "←" interni vanno alla rotta padre scrivendo l'hash: non consumano una
     history che da un hash diretto potrebbe non esserci. */
  const backCal = root.querySelector('#back-cal');
  if (backCal) backCal.addEventListener('click', () => vaiA(PERCORSI.classificheCalendario));
  const backSess = root.querySelector('#back-sess');
  if (backSess) backSess.addEventListener('click', () => vaiA(selectedProgramGp ? PERCORSI.programma(selectedProgramGp) : PERCORSI.classificheCalendario));
  const backSerie = root.querySelector('#back-serie');
  if (backSerie) backSerie.addEventListener('click', () => vaiA(PERCORSI.classificheAltre));
  /* Piloti: tap su un pilota → dettaglio */
  root.querySelectorAll('[data-rid]').forEach(el => {
    el.addEventListener('click', () => { vaiA(PERCORSI.pilota(el.dataset.rid)); });
  });
  const backRider = root.querySelector('#back-rider');
  if (backRider) backRider.addEventListener('click', () => vaiA(PERCORSI.classifiche));
}

/* ═════════════════════════════════════════════════════════
   CALENDARIO + RISULTATI (segmenti dentro la scheda "Campionato")
   ═════════════════════════════════════════════════════════ */
/* Calendario come nodi; i GP conclusi sono tappabili → risultati */
export function calendarNodo() {
  const completedCount = DATA.events.filter(e => effectiveStatus(e) === 'complete').length;
  const righe = DATA.events.map((e, i) => {
    const es = effectiveStatus(e);
    const done = es === 'complete' || es === 'active';
    const cls = es === 'complete' ? 'cal-row--done'
              : es === 'active'  ? 'cal-row--active'
              : i === completedCount ? 'cal-row--next'
              : '';
    const tag = es === 'active' ? nodo('span', { class: 'tag tag--live' }, 'Live')
              : es === 'complete' ? nodo('span', { class: 'tag tag--done' }, '✓')
              : null;
    /* Countdown compatto per i GP non ancora disputati: stessa nozione di "al
       via" dell'hero, ma in forma statica (si ricalcola a ogni render, non
       ticka: nel calendario ci sono fino a otto GP futuri). */
    const attesa = done ? '' : ` · ${traQuanto(e.dateStart)}`;
    return nodo('div', {
      class: 'cal-row' + (cls ? ' ' + cls : ''),
      'data-resgp': done ? e.id : null,
      'data-gpprog': done ? null : e.id,
    },
      nodo('div', { class: 'cal-rail' },
        nodo('div', { class: 'cal-dot' }),
        nodo('div', { class: 'cal-line' })),
      nodo('div', { class: 'cal-body' },
        nodo('div', { class: 'cal-meta' }, flagOf(e) + ' R' + (e.order || e.id) + ' · ' + fmtDate(e.dateStart) + attesa),
        nodo('div', { class: 'cal-name' }, e.displayedName.trim(), tag),
        nodo('div', { class: 'cal-circuit' }, e.circuit)),
      nodo('div', { class: 'cal-go' }, done ? 'Risultati ›' : 'Programma ›'));
  });
  return frammento(
    nodo('div', { class: 'card-h', style: 'margin-bottom:4px' },
      nodo('span', { class: 'card-t' }, completedCount + '/' + DATA.events.length + ' disputati')),
    nodo('div', { style: 'font-size:11px;color:var(--text-dim);margin-bottom:12px' },
      '👇 Tocca un GP: quelli conclusi aprono la ',
      nodo('b', { style: 'color:var(--text)' }, 'classifica di gara'),
      ', quelli futuri il ',
      nodo('b', { style: 'color:var(--text)' }, 'programma del weekend'),
      '.'),
    righe);
}

/* ═════════════════════════════════════════════════════════
   ALTRE SERIE (Moto2/Moto3/WorldSBK) — ex menu della stanza "Altre"
   ═════════════════════════════════════════════════════════ */
function altreMenuNodo() {
  const categorie = [
    { id: 'moto2', name: 'Moto2', icon: '🏍️', desc: 'Campionato 2026' },
    { id: 'moto3', name: 'Moto3', icon: '🏍️', desc: 'Campionato 2026' },
    { id: 'wsbk', name: 'WorldSBK', icon: '🌍', desc: 'Superbike 2026' },
  ];
  return frammento(
    nodo('div', { class: 'f-subtitle' }, nodo('span', null, 'Altre serie')),
    nodo('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px' },
      categorie.map(cat => nodo('div', {
        class: 'news-card',
        'data-serie': cat.id,
        style: 'cursor:pointer;padding:16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px',
      },
        nodo('div', { style: 'font-size:28px' }, cat.icon),
        nodo('div', { class: 'news-title', style: 'font-size:15px' }, cat.name),
        nodo('div', { class: 'news-meta' }, cat.desc)))));
}

/* Classifica di una serie minore (dati Wikipedia via other-categories.json). */
function serieNodo(catId) {
  const names = { moto2: 'Moto2', moto3: 'Moto3', wsbk: 'WorldSBK' };
  const catName = names[catId] || catId;

  /* Id inesistente (#/serie/pippo): stato vuoto, non un errore. La topbar resta
     quella della stanza. */
  if (!names[catId]) {
    return frammento(
      nodo('div', { class: 'seg', style: 'margin-bottom:12px' },
        nodo('button', { class: 'seg-btn is-active', id: 'back-serie', style: 'margin-right:0' }, '← Altre serie')),
      nodo('div', { class: 'card', style: 'padding:24px;text-align:center;color:var(--text-dim)' }, 'Serie non trovata.'));
  }

  setTopbar(`${catName} 2026`, catName, '');

  const contenuto = [];
  contenuto.push(nodo('div', { class: 'seg', style: 'margin-bottom:12px' },
    nodo('button', { class: 'seg-btn is-active', id: 'back-serie', style: 'margin-right:0' }, '← Altre serie')));

  const catData = DATA.otherCategories?.categories?.[catId];
  const riders = catData?.riders || [];
  const fetchedAt = DATA.otherCategories?.fetchedAt || null;

  if (riders.length > 0) {
    const righe = riders.map((r, i) => {
      const medal = r.pos === 1 ? '🥇' : r.pos === 2 ? '🥈' : r.pos === 3 ? '🥉' : '';
      return nodo('tr', { class: i === 0 ? 'is-leader' : '' },
        nodo('td', { class: 'user' }, nodo('span', { class: 'pos' }, r.pos), medal),
        nodo('td', null, r.rider),
        nodo('td', { style: 'color:var(--text-dim);font-size:12px' }, r.bike),
        nodo('td', { style: 'color:var(--text-faint);font-size:11px' }, r.team),
        nodo('td', { class: 'tot' }, r.totalPoints));
    });
    contenuto.push(nodo('div', { class: 'card', style: 'padding:0;overflow:hidden' },
      nodo('table', { class: 'f-tbl' },
        nodo('thead', null,
          nodo('tr', null,
            nodo('th', null, 'Pos'), nodo('th', null, 'Pilota'), nodo('th', null, 'Moto'), nodo('th', null, 'Team'), nodo('th', null, 'Pts'))),
        nodo('tbody', null, righe))));
    if (fetchedAt) {
      const d = new Date(fetchedAt);
      contenuto.push(nodo('div', { style: 'font-size:10px;color:var(--text-faint);margin-top:6px;text-align:center' },
        'Fonte: Wikipedia · aggiornato ' + d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})));
    }
  } else {
    contenuto.push(nodo('div', { class: 'card' },
      nodo('div', { class: 'card-h' }, nodo('span', { class: 'card-t' }, 'Classifica ' + catName)),
      nodo('div', { class: 'empty', style: 'padding:24px' },
        nodo('div', { style: 'font-size:24px;margin-bottom:8px' }, '🔌'),
        nodo('div', null, 'Dati ' + catName + ' non disponibili.'),
        nodo('div', { style: 'font-size:12px;color:var(--text-faint);margin-top:6px' },
          'I dati vengono da Wikipedia. Se il campionato 2026 non è ancora iniziato, la pagina potrebbe non esistere.'))));
  }
  return frammento(contenuto);
}

/* Risultati di un GP: ordine d'arrivo gara + posizione di partenza (Part.) + Δ + sprint */
export function resultsNodo(gpId) {
  const ev = DATA.events.find(e => String(e.id) === String(gpId));
  const evName = ev ? ev.displayedName.trim() : 'GP';
  /* Un GP "active" puo' avere solo prove/qualifiche gia' disputate: senza questo,
     ogni pilota che non ha ancora corso la gara vera e propria veniva etichettato
     "DNF" come chi si e' davvero ritirato. */
  const raceDone = ev ? effectiveStatus(ev) === 'complete' : true;
  const rows = (DATA.riders || []).map(r => {
    const ed = r.stats?.events?.[gpId];
    if (!ed) return null;
    return {
      name: `${r.firstName} ${r.lastName}`,
      grid: ed.gridPosition,
      sprint: ed.sprintPosition,
      finish: ed.finalPosition,
      fl: ed.fastestLap,
      pts: ed.points,
      team: DATA.constById?.[r.constructorId]?.name || ''
    };
  }).filter(Boolean);
  const rank = v => (v && v > 0) ? v : 999;
  rows.sort((a, b) => rank(a.finish) - rank(b.finish));

  const contenuto = [];
  contenuto.push(nodo('div', { class: 'seg', style: 'margin-bottom:12px' },
    nodo('button', { class: 'seg-btn is-active', id: 'back-cal', style: 'margin-right:0' }, '← Calendario')));
  /* GP inesistente (hash scritto a mano o id vecchio): stato vuoto, non
     un'eccezione. flagOf(ev) dereferenzia l'evento, quindi la guardia va prima. */
  if (!ev) {
    contenuto.push(nodo('div', { class: 'card', style: 'padding:24px;text-align:center;color:var(--text-dim)' }, 'GP non trovato.'));
    return frammento(contenuto);
  }
  /* Il segmento "Calendario" non resta evidenziato mentre guardi i risultati:
     il breadcrumb dice dove sei. */
  contenuto.push(nodo('div', { style: 'font-size:11px;color:var(--text-dim);margin-bottom:10px' },
    '📅 Calendario › ',
    nodo('b', { style: 'color:var(--text)' }, 'Risultati · ' + flagOf(ev) + ' ' + evName)));
  if (!rows.length) {
    contenuto.push(nodo('div', { class: 'card', style: 'padding:24px;text-align:center;color:var(--text-dim)' },
      'Risultati non ancora disponibili per ' + evName + '.'));
    return frammento(contenuto);
  }
  const righe = rows.map(r => {
    const finOk = r.finish && r.finish > 0;
    const gridOk = r.grid && r.grid > 0;
    const arr = finOk ? `${r.finish}°` : (raceDone ? 'DNF' : '–');
    const grid = gridOk ? `${r.grid}°` : '–';
    const delta = (finOk && gridOk) ? (r.grid - r.finish) : null;
    const dStr = delta === null ? '' : delta > 0
      ? nodo('span', { style: 'color:var(--gold)' }, `▲${delta}`)
      : delta < 0 ? nodo('span', { style: 'color:var(--accent)' }, `▼${-delta}`) : '=';
    const sp = (r.sprint && r.sprint > 0) ? `${r.sprint}°` : '–';
    return nodo('tr', null,
      nodo('td', { style: 'font-weight:700;color:' + (finOk ? 'var(--text)' : 'var(--text-faint)') }, arr),
      nodo('td', { style: 'text-align:left' },
        nodo('b', null, r.name),
        r.fl ? ' ' : null,
        r.fl ? nodo('span', { title: 'giro veloce' }, '⚡') : null,
        nodo('div', { style: 'font-size:10px;color:var(--text-dim)' }, r.team)),
      nodo('td', null, grid), nodo('td', null, dStr), nodo('td', null, sp),
      nodo('td', { style: 'font-weight:700' }, r.pts ?? '–'));
  });
  contenuto.push(nodo('div', { class: 'card' },
    nodo('div', { class: 'card-h' }, nodo('span', { class: 'card-t' }, flagOf(ev) + ' ' + evName + ' — Risultati')),
    nodo('div', { style: 'overflow-x:auto' },
      nodo('table', { class: 'p-tbl', style: 'width:100%;font-size:12px' },
        nodo('tbody', null,
          nodo('tr', null,
            nodo('th', null, 'Arr.'), nodo('th', { style: 'text-align:left' }, 'Pilota'), nodo('th', null, 'Part.'),
            nodo('th', null, 'Δ'), nodo('th', null, 'Sprint'), nodo('th', null, 'Pt')),
          righe)))));
  return frammento(contenuto);
}

/* Sessioni del GP: dal weekend live (tutte le 8, con classifiche) quando il file
   c'e'; per il GP successivo dalle sessioni che il server ne ha gia' scaricato
   (weekend.next, senza classifiche); altrimenti dai soli orari di events.json
   (q1/q2/sprint/final). */
export function eventSessions(ev) {
  const wk = DATA.weekend;
  const sameEvent = wk && wk.event && ev &&
    (String(wk.event.fantasyId) === String(ev.id) || (wk.event.shortName && wk.event.shortName === ev.shortName));
  if (sameEvent && Array.isArray(wk.sessions) && wk.sessions.length) {
    return wk.sessions.map(s => ({
      id: s.id, type: s.type, number: s.number, date: s.date, status: s.status,
      classification: Array.isArray(s.classification) ? s.classification : [],
    }));
  }
  const next = wk?.next;
  const sameNext = next && next.event && ev &&
    (String(next.event.fantasyId) === String(ev.id) || (next.event.shortName && next.event.shortName === ev.shortName));
  if (sameNext && Array.isArray(next.sessions) && next.sessions.length) {
    return next.sessions.map(s => ({
      id: s.id, type: s.type, number: s.number, date: s.date, status: s.status,
      classification: [],
    }));
  }
  return (ev?.races || []).map(r => ({
    id: 'race-' + r.id, type: r.type, number: null, date: r.dateStart, status: r.status, classification: [],
  }));
}

function fmtOra(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* Programma del weekend di un GP non ancora concluso (blocco B, fix 1). */
export function programGpNodo(gpId) {
  const ev = DATA.events.find(e => String(e.id) === String(gpId));
  if (!ev) return nodo('div', { class: 'card', style: 'padding:24px;text-align:center;color:var(--text-dim)' }, 'GP non trovato.');
  const evName = ev.displayedName.trim();
  const sessions = eventSessions(ev);
  const contenuto = [];
  contenuto.push(nodo('div', { class: 'seg', style: 'margin-bottom:12px' },
    nodo('button', { class: 'seg-btn is-active', id: 'back-cal', style: 'margin-right:0' }, '← Calendario')));
  contenuto.push(nodo('div', { style: 'font-size:11px;color:var(--text-dim);margin-bottom:10px' },
    '📅 Calendario › ',
    nodo('b', { style: 'color:var(--text)' }, 'Programma · ' + flagOf(ev) + ' ' + evName)));
  const card = nodo('div', { class: 'card' },
    nodo('div', { class: 'card-h' },
      nodo('span', { class: 'card-t' }, 'Programma weekend'),
      nodo('span', { class: 'card-meta' }, fmtDate(ev.dateStart) + (ev.dateEnd ? ' – ' + fmtDate(ev.dateEnd) : ''))));
  if (!sessions.length) {
    card.append(nodo('div', { class: 'empty', style: 'padding:16px' }, 'Orari non ancora disponibili.'));
    contenuto.push(card);
    return frammento(contenuto);
  }
  const righe = sessions.map(s => {
    const st = String(s.status || '').toUpperCase();
    const isDone = st === 'FINISHED' || st === 'COMPLETE';
    const isLive = st === 'STARTED' || st === 'LIVE';
    const tag = isLive ? nodo('span', { class: 'tag tag--live' }, 'Live')
              : isDone ? nodo('span', { class: 'tag tag--done' }, '✓')
              : null;
    const hasCls = s.classification.length > 0;
    return nodo('div', { class: 'cal-row', 'data-sess': hasCls ? s.id : null, style: 'padding:10px 0;gap:10px;align-items:center' },
      nodo('div', { class: 'cal-body', style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0' },
        nodo('div', null,
          nodo('div', { class: 'cal-name', style: 'font-size:15px' }, sessionLabel(s)),
          nodo('div', { class: 'cal-meta', style: 'margin:2px 0 0' }, fmtDate(s.date) + ' · ' + fmtOra(s.date))),
        nodo('div', { style: 'display:flex;align-items:center;gap:8px;flex-shrink:0' },
          tag,
          hasCls ? nodo('span', { class: 'cal-go' }, 'Classifica ›') : null)));
  });
  card.append(nodo('div', { style: 'padding:2px' }, righe));
  contenuto.push(card);
  const sel = sessions.find(s => String(s.id) === String(selectedProgramSession));
  if (sel && sel.classification.length) contenuto.push(classificationNodo(sel));
  return frammento(contenuto);
}

/* Classifica di una sessione del weekend (dati live, nessuna credenziale). */
export function classificationNodo(s) {
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
  return frammento(
    nodo('div', { class: 'seg', style: 'margin:14px 0 12px' },
      nodo('button', { class: 'seg-btn is-active', id: 'back-sess', style: 'margin-right:0' }, '← Sessioni')),
    nodo('div', { class: 'card' },
      nodo('div', { class: 'card-h' },
        nodo('span', { class: 'card-t' }, sessionLabel(s) + ' — Classifica'),
        nodo('span', { class: 'card-meta' }, st === 'FINISHED' || st === 'COMPLETE' ? 'conclusa' : 'in corso')),
      nodo('div', { style: 'overflow-x:auto' },
        nodo('table', { class: 'p-tbl', style: 'width:100%;font-size:12px' },
          nodo('tbody', null,
            nodo('tr', null,
              nodo('th', null, 'Pos'), nodo('th', { style: 'text-align:left' }, 'Pilota'),
              nodo('th', null, 'Gap'), nodo('th', null, 'Giro veloce'), nodo('th', null, 'Giri')),
            righe)))));
}

/* Dettaglio pilota (PUBBLICO): andamento per GP + storico prezzo + forma/value */
export function riderDetailNodo(id) {
  const r = (DATA.riders || []).find(x => String(x.id) === String(id));
  if (!r) return nodo('div', { class: 'card', style: 'padding:24px;text-align:center;color:var(--text-dim)' }, 'Pilota non trovato.');
  const team = DATA.constById?.[r.constructorId]?.name || '';
  const v = riderValue(r), f = riderForm(r), pt = riderPriceTrend(r);
  const trendTxt = f.trend > 0 ? nodo('span', { style: 'color:var(--gold)' }, 'in salita ↑')
    : f.trend < 0 ? nodo('span', { style: 'color:var(--accent)' }, 'in calo ↓')
    : 'stabile';
  const priceArrow = pt.dir > 0 ? nodo('span', { style: 'color:var(--gold)' }, '▲' + pt.deltaM.toFixed(1) + 'M')
    : pt.dir < 0 ? nodo('span', { style: 'color:var(--accent)' }, '▼' + Math.abs(pt.deltaM).toFixed(1) + 'M')
    : null;
  const contenuto = [];
  contenuto.push(nodo('div', { class: 'seg', style: 'margin-bottom:12px' },
    nodo('button', { class: 'seg-btn is-active', id: 'back-rider', style: 'margin-right:0' }, '← Piloti')));
  contenuto.push(nodo('div', { class: 'card' },
    nodo('div', { class: 'card-h' },
      nodo('span', { class: 'card-t' }, r.firstName + ' ' + r.lastName),
      nodo('span', { class: 'card-meta' }, team)),
    nodo('div', { style: 'display:flex;gap:14px 18px;flex-wrap:wrap;font-size:12px;color:var(--text-dim);padding:2px' },
      nodo('div', null, 'Costo ', nodo('b', { style: 'color:var(--text)' }, (r.cost / 1e6).toFixed(1) + 'M'), ' ', priceArrow),
      nodo('div', null, 'Punti ', nodo('b', { style: 'color:var(--text)' }, r.stats?.totalPoints ?? '–')),
      nodo('div', null, 'Media ', nodo('b', { style: 'color:var(--text)' }, r.stats?.avgPoints ?? '–')),
      nodo('div', null, 'Value ', nodo('b', { style: 'color:var(--text)' }, v.perM.toFixed(1)), ' pt/M'),
      nodo('div', null, 'Forma ', trendTxt, ' (L3 ', f.l3 ?? '–', ' · L5 ', f.l5 ?? '–', ')'))));
  const evs = r.stats?.events || {};
  const gpIds = orderEvents(DATA.events.filter(event => Object.hasOwn(evs, event.id))).map(event => event.id);
  if (gpIds.length) {
    const righe = gpIds.map(gp => {
      const e = evs[gp];
      const grid = (e.gridPosition && e.gridPosition > 0) ? e.gridPosition + '°' : '–';
      const sp = (e.sprintPosition && e.sprintPosition > 0) ? e.sprintPosition + '°' : '–';
      const ga = (e.finalPosition && e.finalPosition > 0) ? e.finalPosition + '°' : 'DNF';
      return nodo('tr', null,
        nodo('td', null, gpSig(gp)), nodo('td', null, grid), nodo('td', null, sp), nodo('td', null, ga),
        nodo('td', { style: 'font-weight:700' }, e.points ?? '–'));
    });
    contenuto.push(nodo('div', { class: 'card' },
      nodo('div', { class: 'card-h' }, nodo('span', { class: 'card-t' }, 'Andamento per GP')),
      nodo('div', { style: 'overflow-x:auto' },
        nodo('table', { class: 'p-tbl', style: 'width:100%;font-size:11px' },
          nodo('tbody', null,
            nodo('tr', null,
              nodo('th', null, 'GP'), nodo('th', null, 'Grid'), nodo('th', null, 'Sprint'), nodo('th', null, 'Gara'), nodo('th', null, 'Pt')),
            righe)))));
  }
  const ch = r.costHistory || {};
  const chGps = orderEvents(DATA.events.filter(event => Number.isFinite(ch[event.id]?.cost))).map(event => event.id);
  if (chGps.length) {
    let prevC = null;
    const voci = chGps.map(gp => {
      const c = ch[gp]?.cost;
      const arr = prevC === null ? null : c > prevC ? nodo('span', { style: 'color:var(--gold)' }, '▲')
        : c < prevC ? nodo('span', { style: 'color:var(--accent)' }, '▼') : null;
      prevC = c;
      return nodo('div', null,
        nodo('span', { style: 'font-family:var(--f-mono);font-size:9px;color:var(--text-faint)' }, gpSig(gp)),
        ' ' + (c / 1e6).toFixed(1) + 'M',
        arr);
    });
    contenuto.push(nodo('div', { class: 'card' },
      nodo('div', { class: 'card-h' }, nodo('span', { class: 'card-t' }, 'Storico prezzo')),
      nodo('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--text-dim);padding:2px' }, voci)));
  }
  return frammento(contenuto);
}

/* Card Prezzi & valore (PUBBLICO) — chi sale/scende + miglior punti/M */
