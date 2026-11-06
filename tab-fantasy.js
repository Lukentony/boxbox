import { riderPriceTrend, riderValue } from './analysis.js';
import { boosterLabel, goldenRiderIds, riderDoubled, teamDoubled, teamEventScoring } from './boosters.js';
import { startCountdown } from './countdown.js';
import { frammento, nodo } from './dom.js';
import { flagOf, fmtDate } from './format.js';
import { activePlayers, avvioGp, effectiveStatus } from './selectors.js';
import { DATA, currentGp, setCurrentGp } from './state.js';
import { animateChildren } from './ui.js';

const fmt = (n) => {
  if (n == null) return '—';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/* Cella "—" delle tabelle: un nodo nuovo ogni volta (un nodo non puo' stare in
   due posti). */
const cellaVuota = () => nodo('td', null, '—');

/* I tag dei booster e la regola di chi raddoppia vivono in boosters.js: le
   stesse funzioni calcolano i punti in compute.mjs. */
const boosterTags = (team) => (team.boosters || []).map((booster, index) =>
  nodo('span', { class: 'boost-tag', style: 'margin-left:' + (index ? '4px' : '0') }, boosterLabel(booster)));

/* ═════════════════════════════════════════════════════════
   NAVIGAZIONE TAB
   ═════════════════════════════════════════════════════════ */
export function pricesCard() {
  const nm = r => (r.firstName ? r.firstName[0] + '. ' : '') + (r.lastName || '');
  const rs = (DATA.riders || []).filter(r => r.status !== 'disqualified' && r.stats?.starts > 0)
    .map(r => ({ r, pt: riderPriceTrend(r), v: riderValue(r) }));
  const up = rs.filter(x => x.pt.dir > 0).sort((a, b) => b.pt.deltaM - a.pt.deltaM).slice(0, 5);
  const down = rs.filter(x => x.pt.dir < 0).sort((a, b) => a.pt.deltaM - b.pt.deltaM).slice(0, 5);
  const value = rs.slice().sort((a, b) => b.v.perM - a.v.perM).slice(0, 5);
  const line = (sinistra, ...destra) => nodo('div', { style: 'display:flex;justify-content:space-between' },
    nodo('span', null, sinistra), nodo('span', null, destra));

  return frammento(
    nodo('div', { class: 'f-subtitle', style: 'margin-top:16px' }, nodo('span', null, 'Prezzi & valore')),
    nodo('div', { class: 'card' },
      nodo('div', { style: 'font-size:12px;line-height:1.85;padding:2px' },
        nodo('div', { style: 'color:var(--gold);font-weight:700;margin-bottom:2px' }, '▲ In salita'),
        up.map(x => line(nm(x.r),
          nodo('span', { style: 'color:var(--gold)' }, '+' + x.pt.deltaM.toFixed(1) + 'M'),
          ' ',
          nodo('span', { style: 'color:var(--text-dim)' }, '→ ' + x.pt.lastM.toFixed(1) + 'M'))),
        nodo('div', { style: 'color:var(--accent);font-weight:700;margin:8px 0 2px' }, '▼ In calo'),
        down.map(x => line(nm(x.r),
          nodo('span', { style: 'color:var(--accent)' }, x.pt.deltaM.toFixed(1) + 'M'),
          ' ',
          nodo('span', { style: 'color:var(--text-dim)' }, '→ ' + x.pt.lastM.toFixed(1) + 'M'))),
        nodo('div', { style: 'color:var(--text);font-weight:700;margin:8px 0 2px' }, '★ Miglior valore (punti/M)'),
        value.map(x => line(nm(x.r),
          nodo('b', null, x.v.perM.toFixed(1)),
          ' pt/M ',
          nodo('span', { style: 'color:var(--text-dim)' }, '· ' + (x.r.cost / 1e6).toFixed(1) + 'M'))))));
}

/* ═════════════════════════════════════════════════════════
   FANTASY
   ═════════════════════════════════════════════════════════ */
export function renderFantasy() {
  const root = document.getElementById('s-fantasy');
  const players = activePlayers();
  const completed = DATA.events
    .filter(e => DATA.breakdown.byEvent && DATA.breakdown.byEvent[e.id]);

  /* GP selector */
  const rail = nodo('div', { class: 'gp-rail' },
    nodo('div', {
      class: 'gp-chip gp-chip--season' + (currentGp === 'season' ? ' is-active' : ''),
      'data-gp': 'season',
    },
      nodo('div', { class: 'gp-chip-flag' }, '🏆'),
      nodo('div', { class: 'gp-chip-r' }, 'TUTTI'),
      nodo('div', { class: 'gp-chip-name' }, 'STAG')),
    completed.map(e => {
      const isLive = effectiveStatus(e) === 'active';
      const isUpcoming = DATA.breakdown.byEvent?.[e.id]?.upcoming;
      const classi = ['gp-chip'];
      if (isLive) classi.push('gp-chip--live');
      if (isUpcoming) classi.push('gp-chip--upcoming');
      if (String(currentGp) === String(e.id)) classi.push('is-active');
      return nodo('div', { class: classi.join(' '), 'data-gp': e.id },
        nodo('div', { class: 'gp-chip-flag' }, flagOf(e)),
        nodo('div', { class: 'gp-chip-r' },
          isLive ? [nodo('span', { class: 'chip-dot' }), 'LIVE'] : 'R' + (e.order || e.id)),
        nodo('div', { class: 'gp-chip-name' }, e.shortName || e.displayedName.slice(0, 3).toUpperCase()));
    }));

  const vista = currentGp === 'season' ? renderSeasonView(players) : renderEventView(Number(currentGp), players);
  root.replaceChildren(rail, vista, nodo('div', { class: 'fade-pad' }));
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
  if (!leader) return nodo('div', { class: 'empty' }, 'Nessun dato fantasy disponibile.');

  const completedGPs = DATA.events.filter(e => DATA.breakdown.byEvent && DATA.breakdown.byEvent[e.id]);

  const carte = players.map((p, i) => {
    const gap = i === 0 ? '' : nodo('span', { style: 'color:var(--text-faint);font-size:11px' },
      '(-' + (leader.overallPoints - p.overallPoints).toFixed(1) + ')');
    const apiAdjustment = p.season?.apiAdjustment || 0;
    const adjustment = apiAdjustment
      ? nodo('span', null, 'Rettifica API: ' + (apiAdjustment > 0 ? '+' : '') + apiAdjustment.toFixed(1))
      : null;

    const barre = completedGPs.map(ev => {
      const evData = p.events?.[ev.id];
      const evPts = evData?.total || 0;
      const maxEvPts = Math.max(...players.map(pl => pl.events?.[ev.id]?.total || 0), 1);
      const barH = Math.max(4, Math.round((evPts / maxEvPts) * 20));
      /* Colore basato sulla posizione in quel GP */
      const gpStandings = (DATA.breakdown.byEvent?.[ev.id]?.standings) || [];
      const gpPos = gpStandings.findIndex(s => s.displayName === p.displayName);
      const color = gpPos === 0 ? 'var(--gold)' : gpPos === 1 ? 'var(--silver)' : gpPos === 2 ? 'var(--bronze)' : 'var(--surface-3)';
      return nodo('div', {
        style: 'flex:1;display:flex;align-items:flex-end',
        title: ev.displayedName + ': ' + (gpPos >= 0 ? (gpPos + 1) + '° posto' : '—') + ' (' + evPts + 'pt)',
      },
        nodo('div', { style: 'width:100%;height:' + barH + 'px;background:' + color + ';border-radius:2px' }));
    });

    return nodo('div', { class: 'card', style: 'padding:12px 14px;margin-bottom:8px' },
      nodo('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
        nodo('div', { style: 'display:flex;align-items:center;gap:8px' },
          nodo('span', {
            style: 'font-family:var(--f-mono);font-size:12px;color:' + (i === 0 ? 'var(--gold)' : 'var(--text-faint)') + ';font-weight:700;width:18px',
          }, String(i + 1)),
          nodo('span', {
            style: 'font-family:var(--f-display);font-weight:800;font-style:italic;font-size:15px;' + (i === 0 ? 'color:var(--gold)' : ''),
          }, '@' + p.displayName)),
        nodo('span', {
          style: 'font-family:var(--f-mono);font-weight:700;font-size:16px;' + (i === 0 ? 'color:var(--gold)' : ''),
        }, String(p.overallPoints) + (gap ? ' ' : ''), gap)),
      nodo('div', { style: 'display:flex;gap:2px;height:20px;margin-bottom:4px' }, barre),
      nodo('div', {
        style: 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px;font-family:var(--f-mono);font-size:9px;color:var(--text-faint);letter-spacing:.06em',
      },
        nodo('span', null, 'Q: ' + (p.season?.q ?? 0)),
        nodo('span', null, 'Sprint: ' + (p.season?.sprint ?? 0)),
        nodo('span', null, 'Gara: ' + (p.season?.race ?? 0)),
        nodo('span', null, 'Bonus: ' + (p.season?.extra ?? 0)),
        adjustment,
        nodo('span', null, 'Team: €' + (p.teamValue / 1e6).toFixed(1) + 'M')));
  });

  return frammento(
    nodo('div', { class: 'f-subtitle' },
      nodo('span', null, 'Andamento per GP'),
      nodo('span', { class: 'f-stake' }, players.length + ' giocatori')),
    carte,
    pricesCard());
}

// Recuperata 2026-08-08 (Claude): persa nella riscrittura dell'8/08 (commit 8f1f6f0), il backend
// (compute.mjs) continuava a produrre il flag `upcoming` senza che nessuna UI lo consumasse.
// Codice del 7/06 (commit 12ad823), invariato salvo dove annotato sotto.
export function renderUpcomingEventView(evMeta, _ev) {
  const teams = DATA.allTeams?.teams?.[String(evMeta.id)] || {};
  const nodi = [];
  nodi.push(nodo('div', { class: 'f-subtitle' },
    nodo('span', null, flagOf(evMeta) + ' ' + evMeta.displayedName.trim()),
    nodo('span', { class: 'f-stake' }, 'R' + (evMeta.order || evMeta.id))));
  nodi.push(nodo('div', { class: 'card', style: 'margin-bottom:12px' },
    nodo('div', { class: 'card-h' }, nodo('span', { class: 'card-t' }, '🗓 Prossimo GP')),
    nodo('div', { style: 'padding:0 16px 16px' },
      nodo('div', { class: 'cd', id: 'cd-fantasy' }),
      nodo('div', { style: 'font-family:var(--f-mono);font-size:11px;color:var(--text-faint);margin-top:6px' },
        evMeta.circuit + ' · Prima sessione ' + fmtDate(evMeta.dateStart)))));

  const playerNames = Object.keys(teams);
  if (playerNames.length) {
    playerNames.forEach(name => {
      const t = teams[name];
      if (!t) return;
      const righe = [];
      (t.riders || []).forEach(rid => {
        const r = DATA.riderById[rid]; if (!r) return;
        const isBoosted = riderDoubled(t, rid);
        const pts = r.stats?.totalPoints || 0;
        righe.push(nodo('div', { class: 'row' },
          nodo('div', { class: 'plate plate--gold' }, nodo('span', null, r.number || '?')),
          nodo('div', { class: 'row-m' },
            nodo('div', { class: 'row-name' }, r.firstName + ' ' + r.lastName,
              isBoosted ? nodo('span', { class: 'boost-tag' }, '2X') : null),
            nodo('div', { class: 'row-sub' }, DATA.constById[r.constructorId]?.name || '')),
          nodo('div', { class: 'row-pts', style: 'font-size:12px' }, pts,
            nodo('div', { class: 'pts-sub' }, 'stagione'))));
      });
      goldenRiderIds(t).forEach(rid => {
        const r = DATA.riderById[rid]; if (!r) return;
        const pts = r.stats?.totalPoints || 0;
        righe.push(nodo('div', { class: 'row' },
          nodo('div', { class: 'plate plate--gold' }, nodo('span', null, r.number || '?')),
          nodo('div', { class: 'row-m' },
            nodo('div', { class: 'row-name' }, r.firstName + ' ' + r.lastName,
              nodo('span', { class: 'boost-tag' }, 'EXTRA · GOLDEN')),
            nodo('div', { class: 'row-sub' }, (DATA.constById[r.constructorId]?.name || '') + ' · Pilota extra')),
          nodo('div', { class: 'row-pts', style: 'font-size:12px' }, pts,
            nodo('div', { class: 'pts-sub' }, 'stagione'))));
      });
      (t.ridersSilver || []).forEach(rid => {
        const r = DATA.riderById[rid]; if (!r) return;
        const pts = r.stats?.totalPoints || 0;
        righe.push(nodo('div', { class: 'row silver' },
          nodo('div', { class: 'plate plate--silver' }, nodo('span', null, r.number || '?')),
          nodo('div', { class: 'row-m' },
            nodo('div', { class: 'row-name' }, r.firstName + ' ' + r.lastName),
            nodo('div', { class: 'row-sub' }, (DATA.constById[r.constructorId]?.name || '') + ' · 50%')),
          nodo('div', { class: 'row-pts', style: 'font-size:12px' }, pts,
            nodo('div', { class: 'pts-sub' }, 'stagione'))));
      });
      (t.constructors || []).forEach(cid => {
        const c = DATA.constById[cid]; if (!c) return;
        righe.push(nodo('div', { class: 'row' },
          nodo('div', { class: 'plate', style: 'background:var(--surface-3)' }, nodo('span', { style: 'font-size:14px' }, '🔧')),
          nodo('div', { class: 'row-m' },
            nodo('div', { class: 'row-name' }, c.name),
            nodo('div', { class: 'row-sub' }, 'Costruttore'))));
      });
      (t.squads || []).forEach(sid => {
        const s = DATA.squadById[sid]; if (!s) return;
        righe.push(nodo('div', { class: 'row' },
          nodo('div', { class: 'plate', style: 'background:var(--surface-3)' }, nodo('span', { style: 'font-size:14px' }, '🏔')),
          nodo('div', { class: 'row-m' },
            nodo('div', { class: 'row-name' }, s.name),
            nodo('div', { class: 'row-sub' }, 'Team'))));
      });
      nodi.push(nodo('div', { class: 'p-card' },
        nodo('div', { class: 'p-head' },
          nodo('div', { class: 'p-id' },
            nodo('div', { style: 'min-width:0' },
              nodo('div', { class: 'p-name' }, '@' + name),
              nodo('div', { class: 'p-value' }, 'Valore squad €' + ((t.value || 0) / 1e6).toFixed(1) + 'M',
                boosterTags(t))))),
        nodo('div', { class: 'p-body' }, nodo('div', { style: 'padding:0 0 8px' }, righe))));
    });
  } else {
    nodi.push(nodo('div', { class: 'empty' }, 'Dati squadra non ancora disponibili.'));
  }
  const inizio = avvioGp(evMeta).iso;
  if (inizio) setTimeout(() => startCountdown(inizio, 'cd-fantasy'), 50);
  return frammento(nodi);
}

/* Righe della tabella di un GP.
   Le voci e i loro punti sono quelli che la pipeline somma per il breakdown:
   stessa funzione (teamEventScoring, dist/boosters.js), stessi numeri. Qui non
   si ricalcola niente. Prima invece il disegno rifaceva il conto per conto suo
   e su un GP con il booster 'super' le righe dei piloti restavano senza il x2
   (mentre costruttore e squadra lo avevano), cosi' la riga Totale chiudeva a
   104 dove la card diceva 151 -- evento 20, MALAYSIA, squadra di Lukentony.
   L'ultima riga sono gli aggregati del GP letti dal breakdown, non una somma
   rifatta qui: la tabella non puo' piu' contraddire il totale della card. */
function righeEvento(team, evId, puntiGp) {
  const voci = teamEventScoring(team, evId, {
    riderById: DATA.riderById,
    constrById: DATA.constById,
    squadById: DATA.squadById,
  }).lines;

  /* Un pilota in rosa senza statistiche per quel GP resta in tabella con "—",
     come nel gioco: la voce esiste, i punti sono zero. */
  const cellePunti = (voce) => (voce.senzaDati
    ? [cellaVuota(), cellaVuota(), cellaVuota(), cellaVuota()]
    : [nodo('td', null, fmt(voce.q)), nodo('td', null, fmt(voce.sprint)),
       nodo('td', null, fmt(voce.race)), nodo('td', null, fmt(voce.tot))]);

  const righe = voci.map(voce => {
    if (voce.tipo === 'constructor' || voce.tipo === 'squad') {
      const costruttore = voce.tipo === 'constructor';
      const nome = costruttore ? DATA.constById[voce.id]?.name : DATA.squadById[voce.id]?.name;
      return nodo('tr', { class: costruttore ? 'const' : 'squad' },
        nodo('td', null,
          nodo('span', { class: 'ico' }, costruttore ? '🏭' : '👥'),
          nome || (costruttore ? 'Costruttore' : 'Team'),
          teamDoubled(team) ? nodo('span', { class: 'boost-tag' }, '2X') : null),
        cellaVuota(), cellaVuota(), cellaVuota(), nodo('td', null, fmt(voce.tot)));
    }

    const r = DATA.riderById[voce.id];
    const nome = r ? r.firstName + ' ' + r.lastName : '#' + voce.id;
    /* Il 2X e' l'informazione che spiega perche' la riga conta piu' dei punti
       del pilota: vale anche per l'argento, che il 'super' raddoppia. */
    const isBoosted = riderDoubled(team, voce.id);
    const tagGolden = voce.tipo === 'golden'
      ? nodo('span', { class: 'boost-tag' }, 'EXTRA · GOLDEN')
      : null;
    const tag2X = isBoosted ? nodo('span', { class: 'boost-tag' }, '2X') : null;
    const argento = voce.tipo === 'silver';
    return nodo('tr', argento ? { class: 'silver' } : null,
      nodo('td', null,
        nodo('span', { class: argento ? 'star-s' : 'star-g' }, argento ? '☆' : '★'),
        nome, tagGolden, tag2X),
      ...cellePunti(voce));
  });

  righe.push(nodo('tr', { class: 'total' },
    nodo('td', null, 'Totale'),
    nodo('td', null, fmt(puntiGp.q)), nodo('td', null, fmt(puntiGp.sprint)),
    nodo('td', null, fmt(puntiGp.race)), nodo('td', null, fmt(puntiGp.total))));
  return righe;
}

export function renderEventView(evId, _players) {
  const ev = DATA.breakdown.byEvent[evId];
  const evMeta = DATA.events.find(e => e.id === evId);
  // Bugfix 2026-08-08 (Claude): guardia evMeta ripristinata (mancava, evMeta.circuit sotto
  // esploderebbe) e dispatch upcoming spostato PRIMA della guardia su standings vuote -- un GP
  // upcoming ha standings vuote per definizione, cadeva nel ramo "Nessun dato per questo GP".
  // In 12ad823 la guardia evMeta faceva `root.innerHTML = ...; return;` ma `root` non e' definito
  // in questo scope (bug latente mai emerso): qui si ritorna lo stato vuoto come le altre guardie.
  if (!evMeta) {
    return nodo('div', { class: 'empty' }, 'Dati evento non disponibili');
  }
  if (ev?.upcoming) return renderUpcomingEventView(evMeta, ev);
  if (!ev || !ev.standings?.length) {
    return nodo('div', { class: 'empty' }, 'Nessun dato per questo GP.');
  }
  const teams = DATA.allTeams?.teams?.[String(evId)] || {};

  const carte = [];
  /* Header GP */
  carte.push(nodo('div', { class: 'f-subtitle' },
    nodo('span', null, flagOf(evMeta) + ' ' + evMeta.displayedName.trim() + ' · ' + fmtDate(evMeta.dateStart)),
    nodo('span', { class: 'f-stake' }, 'R' + (evMeta.order || evMeta.id))));

  /* Card per giocatore */
  ev.standings.forEach((p, i) => {
    const t = teams[p.displayName];
    const card = nodo('div', { class: 'p-card' + (i === 0 ? ' is-leader' : '') },
      nodo('div', { class: 'p-head' },
        nodo('div', { class: 'p-id' },
          nodo('div', { class: 'p-rank' }, String(i + 1)),
          nodo('div', { style: 'min-width:0' },
            nodo('div', { class: 'p-name' }, '@' + p.displayName),
            t ? nodo('div', { class: 'p-value' }, 'Valore squad €' + (t.value / 1e6).toFixed(1) + 'M',
              boosterTags(t)) : null)),
        nodo('div', { class: 'p-total' },
          nodo('div', { class: 'p-total-num' }, p.total),
          nodo('div', { class: 'p-total-lbl' }, 'PUNTI'))));

    if (t) {
      card.append(nodo('div', { class: 'p-body' },
        nodo('table', { class: 'p-tbl' },
          nodo('thead', null,
            nodo('tr', null,
              nodo('th', null, 'Selezione'),
              nodo('th', null, 'Q'), nodo('th', null, 'Sprint'), nodo('th', null, 'Gara'), nodo('th', null, 'Tot'))),
          nodo('tbody', null, righeEvento(t, evId, p)))));
    } else {
      card.append(nodo('div', { class: 'empty', style: 'padding:20px' }, 'Squad non disponibile.'));
    }

    carte.push(card);
  });

  return frammento(carte);
}
