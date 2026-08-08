import { riderPriceTrend, riderValue } from './analysis.js';
import { startCountdown } from './countdown.js';
import { flagOf, fmtDate } from './format.js';
import { activePlayers, effectiveStatus } from './selectors.js';
import { DATA, currentGp, setCurrentGp } from './state.js';
import { animateChildren } from './ui.js';

const fmt = (n) => {
  if (n == null) return '—';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/* ═════════════════════════════════════════════════════════
   NAVIGAZIONE TAB
   ═════════════════════════════════════════════════════════ */
export function pricesCardHtml() {
  const nm = r => (r.firstName ? r.firstName[0] + '. ' : '') + (r.lastName || '');
  const rs = (DATA.riders || []).filter(r => r.status !== 'disqualified' && r.stats?.starts > 0)
    .map(r => ({ r, pt: riderPriceTrend(r), v: riderValue(r) }));
  const up = rs.filter(x => x.pt.dir > 0).sort((a, b) => b.pt.deltaM - a.pt.deltaM).slice(0, 5);
  const down = rs.filter(x => x.pt.dir < 0).sort((a, b) => a.pt.deltaM - b.pt.deltaM).slice(0, 5);
  const value = rs.slice().sort((a, b) => b.v.perM - a.v.perM).slice(0, 5);
  const line = (left, right) => '<div style="display:flex;justify-content:space-between"><span>' + left + '</span><span>' + right + '</span></div>';
  let h = '';
  h += '<div class="f-subtitle" style="margin-top:16px"><span>Prezzi & valore</span></div>';
  h += '<div class="card"><div style="font-size:12px;line-height:1.85;padding:2px">';
  h += '<div style="color:var(--gold);font-weight:700;margin-bottom:2px">▲ In salita</div>';
  up.forEach(x => h += line(nm(x.r), '<span style="color:var(--gold)">+' + x.pt.deltaM.toFixed(1) + 'M</span> <span style="color:var(--text-dim)">→ ' + x.pt.lastM.toFixed(1) + 'M</span>'));
  h += '<div style="color:var(--accent);font-weight:700;margin:8px 0 2px">▼ In calo</div>';
  down.forEach(x => h += line(nm(x.r), '<span style="color:var(--accent)">' + x.pt.deltaM.toFixed(1) + 'M</span> <span style="color:var(--text-dim)">→ ' + x.pt.lastM.toFixed(1) + 'M</span>'));
  h += '<div style="color:var(--text);font-weight:700;margin:8px 0 2px">★ Miglior valore (punti/M)</div>';
  value.forEach(x => h += line(nm(x.r), '<b>' + x.v.perM.toFixed(1) + '</b> pt/M <span style="color:var(--text-dim)">· ' + (x.r.cost / 1e6).toFixed(1) + 'M</span>'));
  h += '</div></div>';
  return h;
}

/* ═════════════════════════════════════════════════════════
   FANTASY
   ═════════════════════════════════════════════════════════ */
export function renderFantasy() {
  const root = document.getElementById('s-fantasy');
  const players = activePlayers();
  const completed = DATA.events
    .filter(e => DATA.breakdown.byEvent && DATA.breakdown.byEvent[e.id]);

  let h = '';
  /* GP selector */
  h += `<div class="gp-rail">
    <div class="gp-chip gp-chip--season ${currentGp==='season'?'is-active':''}" data-gp="season">
      <div class="gp-chip-flag">🏆</div>
      <div class="gp-chip-r">TUTTI</div>
      <div class="gp-chip-name">STAG</div>
    </div>`;
  completed.forEach(e => {
    const isLive = effectiveStatus(e) === 'active';
    const liveR = '<span class="chip-dot"></span>LIVE';
    const isUpcoming = DATA.breakdown.byEvent?.[e.id]?.upcoming;
    h += `<div class="gp-chip ${isLive?'gp-chip--live':''} ${isUpcoming?'gp-chip--upcoming':''} ${String(currentGp)===String(e.id)?'is-active':''}" data-gp="${e.id}">
      <div class="gp-chip-flag">${flagOf(e)}</div>
      <div class="gp-chip-r">${isLive?liveR:'R'+(e.order||e.id)}</div>
      <div class="gp-chip-name">${e.shortName||e.displayedName.slice(0,3).toUpperCase()}</div>
    </div>`;
  });
  h += `</div>`;

  if (currentGp === 'season') {
    h += renderSeasonView(players);
  } else {
    h += renderEventView(Number(currentGp), players);
  }
  h += `<div class="fade-pad"></div>`;
  root.innerHTML = h;
  animateChildren(root);

  root.querySelectorAll('.gp-chip').forEach(c => {
    c.addEventListener('click', () => {
      setCurrentGp(c.dataset.gp === 'season' ? 'season' : c.dataset.gp);
      renderFantasy();
    });
  });
}

export function renderSeasonView(players) {
  const leader = players[0];
  if (!leader) return '<div class="empty">Nessun dato fantasy disponibile.</div>';

  let h = '';

  const completedGPs = DATA.events.filter(e => DATA.breakdown.byEvent && DATA.breakdown.byEvent[e.id]);

  h += `<div class="f-subtitle">
    <span>Andamento per GP</span>
    <span class="f-stake">${players.length} giocatori</span>
  </div>`;
  players.forEach((p, i) => {
    const barMax = leader.overallPoints || 1;
    const pct = Math.round((p.overallPoints / barMax) * 100);
    const gap = i === 0 ? '' : ` <span style="color:var(--text-faint);font-size:11px">(-${(leader.overallPoints - p.overallPoints).toFixed(1)})</span>`;

    h += `<div class="card" style="padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:var(--f-mono);font-size:12px;color:${i===0?'var(--gold)':'var(--text-faint)'};font-weight:700;width:18px">${i+1}</span>
          <span style="font-family:var(--f-display);font-weight:800;font-style:italic;font-size:15px;${i===0?'color:var(--gold)':''}">@${p.displayName}</span>
        </div>
        <span style="font-family:var(--f-mono);font-weight:700;font-size:16px;${i===0?'color:var(--gold)':''}">${p.overallPoints}${gap}</span>
      </div>
      <div style="display:flex;gap:2px;height:20px;margin-bottom:4px">`;

    completedGPs.forEach(ev => {
      const evData = p.events?.[ev.id];
      const evPts = evData?.total || 0;
      const maxEvPts = Math.max(...players.map(pl => pl.events?.[ev.id]?.total || 0), 1);
      const barH = Math.max(4, Math.round((evPts / maxEvPts) * 20));
      /* Colore basato sulla posizione in quel GP */
      const gpStandings = (DATA.breakdown.byEvent?.[ev.id]?.standings) || [];
      const gpPos = gpStandings.findIndex(s => s.displayName === p.displayName);
      const color = gpPos === 0 ? 'var(--gold)' : gpPos === 1 ? 'var(--silver)' : gpPos === 2 ? 'var(--bronze)' : 'var(--surface-3)';
      const medals = ['🥇','🥈','🥉',''];
      h += `<div style="flex:1;display:flex;align-items:flex-end" title="${ev.displayedName}: ${gpPos >= 0 ? (gpPos+1)+'° posto' : '—'} (${evPts}pt)">
        <div style="width:100%;height:${barH}px;background:${color};border-radius:2px"></div>
      </div>`;
    });

    h += `</div>
      <div style="display:flex;justify-content:space-between;font-family:var(--f-mono);font-size:9px;color:var(--text-faint);letter-spacing:.06em">
        <span>Q: ${p.season?.q ?? 0}</span>
        <span>Sprint: ${p.season?.sprint ?? 0}</span>
        <span>Gara: ${p.season?.race ?? 0}</span>
        <span>Bonus: ${p.season?.extra ?? 0}</span>
        <span>Team: €${(p.teamValue/1e6).toFixed(1)}M</span>
      </div>
    </div>`;
  });

  h += pricesCardHtml();
  return h;
}

// Recuperata 2026-08-08 (Claude): persa nella riscrittura dell'8/08 (commit 8f1f6f0), il backend
// (compute.mjs) continuava a produrre il flag `upcoming` senza che nessuna UI lo consumasse.
// Codice del 7/06 (commit 12ad823), invariato salvo dove annotato sotto.
export function renderUpcomingEventView(evMeta, ev) {
  const teams = DATA.allTeams?.teams?.[String(evMeta.id)] || {};
  let h = '';
  h += `<div class="f-subtitle">
    <span>${flagOf(evMeta)} ${evMeta.displayedName.trim()}</span>
    <span class="f-stake">R${evMeta.order || evMeta.id}</span>
  </div>`;
  h += `<div class="card" style="margin-bottom:12px">
    <div class="card-h"><span class="card-t">🗓 Prossimo GP</span></div>
    <div style="padding:0 16px 16px">
      <div class="cd" id="cd"></div>
      <div style="font-family:var(--f-mono);font-size:11px;color:var(--text-faint);margin-top:6px">
        ${evMeta.circuit} · Prima sessione ${fmtDate(evMeta.dateStart)}
      </div>
    </div>
  </div>`;
  const playerNames = Object.keys(teams);
  if (playerNames.length) {
    playerNames.forEach(name => {
      const t = teams[name];
      if (!t) return;
      h += `<div class="p-card"><div class="p-head"><div class="p-id"><div style="min-width:0">
        <div class="p-name">@${name}</div>
        <div class="p-value">Valore squad €${((t.value||0)/1e6).toFixed(1)}M</div>
      </div></div></div><div class="p-body"><div style="padding:0 0 8px">`;
      (t.riders||[]).forEach(rid => {
        const r = DATA.riderById[rid]; if (!r) return;
        const isBoosted = (t.boosters||[]).some(b=>b.boosterType==='rider'&&b.details?.riderId===rid);
        const pts = r.stats?.totalPoints||0;
        h += `<div class="row"><div class="plate plate--gold"><span>${r.number||'?'}</span></div>
          <div class="row-m"><div class="row-name">${r.firstName} ${r.lastName}${isBoosted?'<span class="boost-tag">2X</span>':''}</div>
          <div class="row-sub">${DATA.constById[r.constructorId]?.name||''}</div></div>
          <div class="row-pts" style="font-size:12px">${pts}<div class="pts-sub">stagione</div></div></div>`;
      });
      (t.ridersSilver||[]).forEach(rid => {
        const r = DATA.riderById[rid]; if (!r) return;
        const pts = r.stats?.totalPoints||0;
        h += `<div class="row silver"><div class="plate plate--silver"><span>${r.number||'?'}</span></div>
          <div class="row-m"><div class="row-name">${r.firstName} ${r.lastName}</div>
          <div class="row-sub">${DATA.constById[r.constructorId]?.name||''} · 50%</div></div>
          <div class="row-pts" style="font-size:12px">${pts}<div class="pts-sub">stagione</div></div></div>`;
      });
      (t.constructors||[]).forEach(cid => {
        const c = DATA.constById[cid]; if (!c) return;
        h += `<div class="row"><div class="plate" style="background:var(--surface-3)"><span style="font-size:14px">🔧</span></div>
          <div class="row-m"><div class="row-name">${c.name}</div><div class="row-sub">Costruttore</div></div></div>`;
      });
      (t.squads||[]).forEach(sid => {
        const s = DATA.squadById[sid]; if (!s) return;
        h += `<div class="row"><div class="plate" style="background:var(--surface-3)"><span style="font-size:14px">🏔</span></div>
          <div class="row-m"><div class="row-name">${s.name}</div><div class="row-sub">Team</div></div></div>`;
      });
      h += `</div></div></div>`;
    });
  } else {
    h += `<div class="empty">Dati squadra non ancora disponibili.</div>`;
  }
  setTimeout(() => startCountdown(evMeta.dateStart), 50);
  return h;
}

export function renderEventView(evId, players) {
  const ev = DATA.breakdown.byEvent[evId];
  const evMeta = DATA.events.find(e => e.id === evId);
  // Bugfix 2026-08-08 (Claude): guardia evMeta ripristinata (mancava, evMeta.circuit sotto
  // esploderebbe) e dispatch upcoming spostato PRIMA della guardia su standings vuote -- un GP
  // upcoming ha standings vuote per definizione, cadeva nel ramo "Nessun dato per questo GP".
  // In 12ad823 la guardia evMeta faceva `root.innerHTML = ...; return;` ma `root` non e' definito
  // in questo scope (bug latente mai emerso): qui si ritorna la stringa vuota come le altre guardie.
  if (!evMeta) {
    return '<div class="empty">Dati evento non disponibili</div>';
  }
  if (ev?.upcoming) return renderUpcomingEventView(evMeta, ev);
  if (!ev || !ev.standings?.length) {
    return '<div class="empty">Nessun dato per questo GP.</div>';
  }
  const teams = DATA.allTeams?.teams?.[String(evId)] || {};

  let h = '';
  /* Header GP */
  h += `<div class="f-subtitle">
    <span>${flagOf(evMeta)} ${evMeta.displayedName.trim()} · ${fmtDate(evMeta.dateStart)}</span>
    <span class="f-stake">R${evMeta.order||evMeta.id}</span>
  </div>`;

  /* Card per giocatore */
  ev.standings.forEach((p, i) => {
    const t = teams[p.displayName];
    h += `<div class="p-card ${i===0?'is-leader':''}">
      <div class="p-head">
        <div class="p-id">
          <div class="p-rank">${i+1}</div>
          <div style="min-width:0">
            <div class="p-name">@${p.displayName}</div>
            ${t?`<div class="p-value">Valore squad €${(t.value/1e6).toFixed(1)}M</div>`:''}
          </div>
        </div>
        <div class="p-total">
          <div class="p-total-num">${p.total}</div>
          <div class="p-total-lbl">PUNTI</div>
        </div>
      </div>`;

    if (t) {
      h += `<div class="p-body"><table class="p-tbl">
        <thead><tr>
          <th>Selezione</th>
          <th>Q</th><th>Sprint</th><th>Gara</th><th>Tot</th>
        </tr></thead>
        <tbody>`;

      let sumQ=0, sumS=0, sumR=0, sumT=0;

      /* Gold riders */
      (t.riders || []).forEach(rid => {
        const r = DATA.riderById[rid];
        const e = r?.stats?.events?.[evId];
        if (!r) return;
        const isBoosted = (t.boosters||[]).some(b => b.boosterType==='rider' && b.details?.riderId===rid);
        if (!e) {
          h += `<tr>
            <td><span class="star-g">★</span>${r.firstName} ${r.lastName}${isBoosted?'<span class="boost-tag">2X</span>':''}</td>
            <td>—</td><td>—</td><td>—</td><td>—</td>
          </tr>`;
          return;
        }
        const q = (e.q2Points || e.q1Points || 0);
        const sp = e.sprintPoints || 0;
        const ra = e.finalPoints || 0;
        const tot = e.points || 0;
        sumQ += q; sumS += sp; sumR += ra; sumT += tot;
        h += `<tr>
          <td><span class="star-g">★</span>${r.firstName} ${r.lastName}${isBoosted?'<span class="boost-tag">2X</span>':''}</td>
          <td>${q}</td><td>${sp}</td><td>${ra}</td><td>${tot}</td>
        </tr>`;
      });

      /* Silver riders (50%) */
      (t.ridersSilver || []).forEach(rid => {
        const r = DATA.riderById[rid];
        const e = r?.stats?.events?.[evId];
        if (!r) return;
        if (!e) {
          h += `<tr class="silver">
            <td><span class="star-s">☆</span>${r.firstName} ${r.lastName}</td>
            <td>—</td><td>—</td><td>—</td><td>—</td>
          </tr>`;
          return;
        }
        const q = (e.q2Points || e.q1Points || 0) / 2;
        const sp = (e.sprintPoints || 0) / 2;
        const ra = (e.finalPoints || 0) / 2;
        const tot = (e.points || 0) / 2;
        sumQ += q; sumS += sp; sumR += ra; sumT += tot;
        h += `<tr class="silver">
          <td><span class="star-s">☆</span>${r.firstName} ${r.lastName}</td>
          <td>${fmt(q)}</td><td>${fmt(sp)}</td><td>${fmt(ra)}</td><td>${fmt(tot)}</td>
        </tr>`;
      });

      /* Constructor */
      (t.constructors || []).forEach(cid => {
        const c = DATA.constById[cid];
        const pts = c?.stats?.events?.[evId]?.points || 0;
        sumT += pts;
        h += `<tr class="const">
          <td><span class="ico">🏭</span>${c?.name || 'Costruttore'}</td>
          <td>—</td><td>—</td><td>—</td><td>${fmt(pts)}</td>
        </tr>`;
      });

      /* Squad */
      (t.squads || []).forEach(sid => {
        const s = DATA.squadById[sid];
        const pts = s?.stats?.events?.[evId]?.points || 0;
        sumT += pts;
        h += `<tr class="squad">
          <td><span class="ico">🏁</span>${s?.name || 'Team'}</td>
          <td>—</td><td>—</td><td>—</td><td>${fmt(pts)}</td>
        </tr>`;
      });

      /* Totale */
      h += `<tr class="total">
        <td>Totale</td>
        <td>${fmt(sumQ)}</td><td>${fmt(sumS)}</td><td>${fmt(sumR)}</td><td>${fmt(sumT)}</td>
      </tr>`;

      h += `</tbody></table></div>`;
    } else {
      h += `<div class="empty" style="padding:20px">Squad non disponibile.</div>`;
    }

    h += `</div>`;
  });

  return h;
}

