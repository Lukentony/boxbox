import { gpSig, riderForm, riderPriceTrend, riderValue } from './analysis.js';
import { flagOf, fmtDate } from './format.js';
import { champPoints, effectiveStatus } from './selectors.js';
import { DATA } from './state.js';
import { animateChildren } from './ui.js';

let standingsView = 'riders';
let selectedResultGp = null; /* GP selezionato per la vista risultati nel segmento Calendario */
let selectedRiderId = null;  /* pilota selezionato per la vista dettaglio (segmento Piloti) */

/* ═══ ANALYSIS HELPERS (data layer, funzioni pure — usate da Dettaglio/Prezzi/Motore) ═══ */
/* sigla GP da DATA.events (no hardcoding) */
export function renderStandings() {
  const root = document.getElementById('s-standings');
  const segHtml = `
    <div class="seg">
      <button class="seg-btn ${standingsView==='riders'?'is-active':''}" data-sv="riders">Piloti</button>
      <button class="seg-btn ${standingsView==='constructors'?'is-active':''}" data-sv="constructors">Costruttori</button>
      <button class="seg-btn ${standingsView==='squads'?'is-active':''}" data-sv="squads">Team</button>
      <button class="seg-btn ${standingsView==='calendar'?'is-active':''}" data-sv="calendar">Calendario</button>
    </div>
  `;
  let body = '';
  if (standingsView === 'riders') {
    if (selectedRiderId) {
      body = riderDetailHtml(selectedRiderId);
    } else {
    const list = DATA.riders
      .filter(r => r.status !== 'disqualified')
      .sort((a,b) => champPoints(b) - champPoints(a));
    const leaderPts = champPoints(list[0]) || 0;
    body = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">👇 Tocca un pilota per il dettaglio (andamento, prezzo, forma).</div><div class="card" style="padding:8px 14px">`;
    list.forEach((r, i) => {
      const team = DATA.constById[r.constructorId]?.name || '';
      const pts = champPoints(r);
      const gap = i === 0 ? 'P1' : '-' + (leaderPts - pts);
      const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : i === 2 ? 'plate plate--bronze' : 'plate';
      const injured = r.status === 'injured' ? ' <span class="injured" title="infortunato">●</span>' : '';
      body += `
        <div class="row ${i===0?'is-leader':''}" data-rid="${r.id}" style="cursor:pointer">
          <div class="${plateCls}">
            <span class="plate-pos">${i+1}</span>
            <span>${r.number || r.id}</span>
          </div>
          <div class="row-m">
            <div class="row-name">${r.firstName} ${r.lastName}${injured}</div>
            <div class="row-sub">${team}</div>
          </div>
          <div class="row-pts">${pts}<div class="pts-sub">${gap}</div></div>
        </div>
      `;
    });
    body += `</div>`;
    }
  } else if (standingsView === 'constructors') {
    const list = (DATA.constructors||[])
      .map(c => ({...c, total: Object.values(c.stats?.events||{}).reduce((s,e)=>s+(e.points||0),0)}))
      .sort((a,b)=> b.total - a.total);
    const leaderPts = list[0]?.total || 0;
    body = `<div class="card" style="padding:8px 14px">`;
    list.forEach((c, i) => {
      const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : i === 2 ? 'plate plate--bronze' : 'plate';
      body += `
        <div class="row ${i===0?'is-leader':''}">
          <div class="${plateCls}"><span>${i+1}</span></div>
          <div class="row-m">
            <div class="row-name">${c.name}</div>
            <div class="row-sub">${(c.stats?.events?.length||Object.keys(c.stats?.events||{}).length)} GP</div>
          </div>
          <div class="row-pts">${c.total}<div class="pts-sub">${i===0?'P1':'-' + (leaderPts - c.total)}</div></div>
        </div>
      `;
    });
    body += `</div>`;
  } else if (standingsView === 'squads') {
    const list = (DATA.squads||[])
      .map(s => ({...s, total: Object.values(s.stats?.events||{}).reduce((sum,e)=>sum+(e.points||0),0)}))
      .filter(s => s.total > 0)
      .sort((a,b)=> b.total - a.total);
    const leaderPts = list[0]?.total || 0;
    body = `<div class="card" style="padding:8px 14px">`;
    list.forEach((s, i) => {
      const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : i === 2 ? 'plate plate--bronze' : 'plate';
      body += `
        <div class="row ${i===0?'is-leader':''}">
          <div class="${plateCls}"><span>${i+1}</span></div>
          <div class="row-m">
            <div class="row-name">${s.name}</div>
            <div class="row-sub">Valore €${(s.cost/1e6).toFixed(1)}M</div>
          </div>
          <div class="row-pts">${s.total}<div class="pts-sub">${i===0?'P1':'-' + (leaderPts - s.total)}</div></div>
        </div>
      `;
    });
    body += `</div>`;
  } else if (standingsView === 'calendar') {
    body = selectedResultGp ? resultsHtml(selectedResultGp) : calendarHtml();
  }

  root.innerHTML = segHtml + body + `<div class="fade-pad"></div>`;
  animateChildren(root);
  root.querySelectorAll('.seg-btn[data-sv]').forEach(b => {
    b.addEventListener('click', () => {
      standingsView = b.dataset.sv;
      selectedResultGp = null;
      selectedRiderId = null;
      renderStandings();
    });
  });
  /* Calendario: tap su un GP concluso → risultati */
  root.querySelectorAll('[data-resgp]').forEach(el => {
    el.addEventListener('click', () => { selectedResultGp = el.dataset.resgp; renderStandings(); });
  });
  const backCal = root.querySelector('#back-cal');
  if (backCal) backCal.addEventListener('click', () => { selectedResultGp = null; renderStandings(); });
  /* Piloti: tap su un pilota → dettaglio */
  root.querySelectorAll('[data-rid]').forEach(el => {
    el.addEventListener('click', () => { selectedRiderId = el.dataset.rid; renderStandings(); });
  });
  const backRider = root.querySelector('#back-rider');
  if (backRider) backRider.addEventListener('click', () => { selectedRiderId = null; renderStandings(); });
}

/* ═════════════════════════════════════════════════════════
   CALENDARIO + RISULTATI (segmenti dentro la scheda "Campionato")
   ═════════════════════════════════════════════════════════ */
/* Calendario come stringa HTML; i GP conclusi sono tappabili → risultati */
export function calendarHtml() {
  let h = '';
  const completedCount = DATA.events.filter(e => effectiveStatus(e) === 'complete').length;
  h += `<div class="card-h" style="margin-bottom:4px">
    <span class="card-t">${completedCount}/${DATA.events.length} disputati</span>
  </div>
  <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">👇 Tocca un GP concluso per vedere la <b style="color:var(--text)">classifica di gara</b> (arrivo, partenza, sprint).</div>`;

  DATA.events.forEach((e, i) => {
    const es = effectiveStatus(e);
    const done = es === 'complete' || es === 'active';
    const cls = es === 'complete' ? 'cal-row--done'
              : es === 'active'  ? 'cal-row--active'
              : i === completedCount ? 'cal-row--next'
              : '';
    const tag = es === 'active' ? '<span class="tag tag--live">Live</span>'
              : es === 'complete' ? '<span class="tag tag--done">✓</span>'
              : '';
    h += `
      <div class="cal-row ${cls}" ${done ? `data-resgp="${e.id}"` : ''}>
        <div class="cal-rail">
          <div class="cal-dot"></div>
          <div class="cal-line"></div>
        </div>
        <div class="cal-body">
          <div class="cal-meta">${flagOf(e)} R${e.order||e.id} · ${fmtDate(e.dateStart)}</div>
          <div class="cal-name">${e.displayedName.trim()}${tag}</div>
          <div class="cal-circuit">${e.circuit}</div>
        </div>
        ${done ? '<div class="cal-go">Risultati ›</div>' : ''}
      </div>
    `;
  });
  return h;
}

/* Risultati di un GP: ordine d'arrivo gara + posizione di partenza (Part.) + Δ + sprint */
export function resultsHtml(gpId) {
  const ev = DATA.events.find(e => String(e.id) === String(gpId));
  const evName = ev ? ev.displayedName.trim() : 'GP';
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

  let h = '';
  h += `<div class="seg" style="margin-bottom:12px"><button class="seg-btn is-active" id="back-cal" style="margin-right:0">← Calendario</button></div>`;
  if (!rows.length) {
    return h + `<div class="card" style="padding:24px;text-align:center;color:var(--text-dim)">Risultati non ancora disponibili per ${evName}.</div>`;
  }
  h += `<div class="card"><div class="card-h"><span class="card-t">${flagOf(ev)} ${evName} — Risultati</span></div>`;
  h += `<div style="overflow-x:auto"><table class="p-tbl" style="width:100%;font-size:12px"><tr><th>Arr.</th><th style="text-align:left">Pilota</th><th>Part.</th><th>Δ</th><th>Sprint</th><th>Pt</th></tr>`;
  rows.forEach(r => {
    const finOk = r.finish && r.finish > 0;
    const gridOk = r.grid && r.grid > 0;
    const arr = finOk ? `${r.finish}°` : 'DNF';
    const grid = gridOk ? `${r.grid}°` : '–';
    const delta = (finOk && gridOk) ? (r.grid - r.finish) : null;
    const dStr = delta === null ? '' : delta > 0 ? `<span style="color:var(--gold)">▲${delta}</span>` : delta < 0 ? `<span style="color:var(--accent)">▼${-delta}</span>` : '=';
    const sp = (r.sprint && r.sprint > 0) ? `${r.sprint}°` : '–';
    const fl = r.fl ? ' <span title="giro veloce">⚡</span>' : '';
    h += `<tr><td style="font-weight:700;color:${finOk ? 'var(--text)' : 'var(--text-faint)'}">${arr}</td><td style="text-align:left"><b>${r.name}</b>${fl}<div style="font-size:10px;color:var(--text-dim)">${r.team}</div></td><td>${grid}</td><td>${dStr}</td><td>${sp}</td><td style="font-weight:700">${r.pts ?? '–'}</td></tr>`;
  });
  h += `</table></div></div>`;
  return h;
}

/* Dettaglio pilota (PUBBLICO): andamento per GP + storico prezzo + forma/value */
export function riderDetailHtml(id) {
  const r = (DATA.riders || []).find(x => String(x.id) === String(id));
  if (!r) return '<div class="card" style="padding:24px;text-align:center;color:var(--text-dim)">Pilota non trovato.</div>';
  const team = DATA.constById?.[r.constructorId]?.name || '';
  const v = riderValue(r), f = riderForm(r), pt = riderPriceTrend(r);
  const trendTxt = f.trend > 0 ? '<span style="color:var(--gold)">in salita ↑</span>' : f.trend < 0 ? '<span style="color:var(--accent)">in calo ↓</span>' : 'stabile';
  const priceArrow = pt.dir > 0 ? '<span style="color:var(--gold)">▲' + pt.deltaM.toFixed(1) + 'M</span>' : pt.dir < 0 ? '<span style="color:var(--accent)">▼' + Math.abs(pt.deltaM).toFixed(1) + 'M</span>' : '';
  let h = '';
  h += '<div class="seg" style="margin-bottom:12px"><button class="seg-btn is-active" id="back-rider" style="margin-right:0">← Piloti</button></div>';
  h += '<div class="card"><div class="card-h"><span class="card-t">' + r.firstName + ' ' + r.lastName + '</span><span class="card-meta">' + team + '</span></div>';
  h += '<div style="display:flex;gap:14px 18px;flex-wrap:wrap;font-size:12px;color:var(--text-dim);padding:2px">';
  h += '<div>Costo <b style="color:var(--text)">' + (r.cost / 1e6).toFixed(1) + 'M</b> ' + priceArrow + '</div>';
  h += '<div>Punti <b style="color:var(--text)">' + (r.stats?.totalPoints ?? '–') + '</b></div>';
  h += '<div>Media <b style="color:var(--text)">' + (r.stats?.avgPoints ?? '–') + '</b></div>';
  h += '<div>Value <b style="color:var(--text)">' + v.perM.toFixed(1) + '</b> pt/M</div>';
  h += '<div>Forma ' + trendTxt + ' (L3 ' + (f.l3 ?? '–') + ' · L5 ' + (f.l5 ?? '–') + ')</div>';
  h += '</div></div>';
  const evs = r.stats?.events || {};
  const gpIds = Object.keys(evs).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (gpIds.length) {
    h += '<div class="card"><div class="card-h"><span class="card-t">Andamento per GP</span></div>';
    h += '<div style="overflow-x:auto"><table class="p-tbl" style="width:100%;font-size:11px"><tr><th>GP</th><th>Grid</th><th>Sprint</th><th>Gara</th><th>Pt</th></tr>';
    gpIds.forEach(gp => {
      const e = evs[gp];
      const grid = (e.gridPosition && e.gridPosition > 0) ? e.gridPosition + '°' : '–';
      const sp = (e.sprintPosition && e.sprintPosition > 0) ? e.sprintPosition + '°' : '–';
      const ga = (e.finalPosition && e.finalPosition > 0) ? e.finalPosition + '°' : 'DNF';
      h += '<tr><td>' + gpSig(gp) + '</td><td>' + grid + '</td><td>' + sp + '</td><td>' + ga + '</td><td style="font-weight:700">' + (e.points ?? '–') + '</td></tr>';
    });
    h += '</table></div></div>';
  }
  const ch = r.costHistory || {};
  const chGps = Object.keys(ch).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (chGps.length) {
    h += '<div class="card"><div class="card-h"><span class="card-t">Storico prezzo</span></div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--text-dim);padding:2px">';
    let prevC = null;
    chGps.forEach(gp => {
      const c = ch[gp]?.cost;
      const arr = prevC === null ? '' : c > prevC ? '<span style="color:var(--gold)">▲</span>' : c < prevC ? '<span style="color:var(--accent)">▼</span>' : '';
      h += '<div><span style="font-family:var(--f-mono);font-size:9px;color:var(--text-faint)">' + gpSig(gp) + '</span> ' + (c / 1e6).toFixed(1) + 'M' + arr + '</div>';
      prevC = c;
    });
    h += '</div></div>';
  }
  return h;
}

/* Card Prezzi & valore (PUBBLICO) — chi sale/scende + miglior punti/M */
