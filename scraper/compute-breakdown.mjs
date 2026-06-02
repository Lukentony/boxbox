// compute-breakdown.mjs — v2: Q/Sprint/Gara/Totale completo con bonus

import { readFileSync, writeFileSync } from 'fs';

const riders = JSON.parse(readFileSync('riders.json'));
const events = JSON.parse(readFileSync('events.json'));
const constructs = JSON.parse(readFileSync('constructors.json'));
const squadsJSON = JSON.parse(readFileSync('squads.json'));
const league = JSON.parse(readFileSync('league-snapshot.json')).success?.leaderboard || [];
const teams = JSON.parse(readFileSync('teams.json'));

const riderById = Object.fromEntries(riders.map(r => [r.id, r]));
const eventById = Object.fromEntries(events.map(e => [e.id, e]));
const constrById = Object.fromEntries(constructs.map(c => [c.id, c]));
const squadById = Object.fromEntries(squadsJSON.map(s => [s.id, s]));

const completeEvents = events.filter(e => e.status === 'complete').sort((a, b) => a.order - b.order);

// ═══ Calcola breakdown per giocatore ═══
const breakdown = {};

for (const [name, team] of Object.entries(teams)) {
  if (!team.riders || team.riders.length === 0) continue;

  const member = league.find(m => m.displayName === name);
  const byEvent = {};
  let seasonQ = 0, seasonSp = 0, seasonRa = 0, seasonEx = 0;

  for (const ev of completeEvents) {
    const eid = String(ev.id);
    let q = 0, sp = 0, ra = 0, extra = 0;

    // Funzione helper: aggiunge punti di un pilota
    const addRider = (rid, factor) => {
      const r = riderById[rid];
      const e = r?.stats?.events?.[eid];
      if (!e) return;
      q += (e.q2Points || e.q1Points || 0) * factor;
      sp += (e.sprintPoints || 0) * factor;
      ra += (e.finalPoints || 0) * factor;
      // Bonus/penalità vari
      extra += (e.fastestLapPoints || 0) * factor;
      extra += (e.riderOfTheRacePoints || 0) * factor;
      extra += (e.topSpeedPoints || 0) * factor;
      extra += (e.circuitRecordPoints || 0) * factor;
      extra += (e.dnfPenaltyPoints || 0) * factor;
      extra += (e.qualifyingVsFinalPositionPoints || 0) * factor;
      extra += (e.gridVsFinalPositionPoints || 0) * factor;
      extra += (e.standingsVsFinalPositionPoints || 0) * factor;
    };

    (team.riders || []).forEach(rid => addRider(rid, 1));
    (team.ridersSilver || []).forEach(rid => addRider(rid, 0.5));

    // Constructor points intere (non si possono splittare per fase)
    (team.constructors || []).forEach(cid => {
      extra += constrById[cid]?.stats?.events?.[eid]?.points || 0;
    });
    // Squad points
    (team.squads || []).forEach(sid => {
      extra += squadById[sid]?.stats?.events?.[eid]?.points || 0;
    });

    const total = Math.round((q + sp + ra + extra) * 10) / 10;

    byEvent[ev.id] = {
      q: Math.round(q * 10) / 10,
      sprint: Math.round(sp * 10) / 10,
      race: Math.round(ra * 10) / 10,
      extra: Math.round(extra * 10) / 10,
      total,
    };
    seasonQ += q; seasonSp += sp; seasonRa += ra; seasonEx += extra;
  }

  breakdown[name] = {
    displayName: name,
    profileId: member?.profileId || '?',
    overallPoints: member?.overallPoints || 0,
    teamValue: team.value || 0,
    season: {
      q: Math.round(seasonQ * 10) / 10,
      sprint: Math.round(seasonSp * 10) / 10,
      race: Math.round(seasonRa * 10) / 10,
      extra: Math.round(seasonEx * 10) / 10,
    },
    events: byEvent,
  };
}

// ═══ Per-evento: classifica ordinata ═══
const byEvent = {};
for (const ev of completeEvents) {
  const standings = Object.values(breakdown)
    .filter(p => p.events[ev.id])
    .map(p => ({
      displayName: p.displayName,
      ...p.events[ev.id],
    }))
    .sort((a, b) => b.total - a.total);
  byEvent[ev.id] = { eventId: ev.id, eventName: ev.displayedName, standings };
}

// ═══ Flag mapping ═══
const flags = {
  THA: '🇹🇭', BRA: '🇧🇷', USA: '🇺🇸', QAT: '🇶🇦', SPA: '🇪🇸',
  FRA: '🇫🇷', GBR: '🇬🇧', ITA: '🇮🇹', NED: '🇳🇱', GER: '🇩🇪',
  CZE: '🇨🇿', AUT: '🇦🇹', HUN: '🇭🇺', CAT: '🇪🇸', RSM: '🇸🇲',
  JPN: '🇯🇵', INA: '🇮🇩', AUS: '🇦🇺', MAL: '🇲🇾', POR: '🇵🇹',
  VAL: '🇪🇸', ARA: '🇪🇸',
};
const eventFlags = {};
for (const e of events) {
  for (const [code, flag] of Object.entries(flags)) {
    if (e.shortName?.toUpperCase() === code || e.displayedName?.toUpperCase().startsWith(code)) {
      eventFlags[e.id] = flag;
      break;
    }
  }
  if (!eventFlags[e.id]) eventFlags[e.id] = '🏁';
}

// ═══ Output ═══
const output = {
  computedAt: new Date().toISOString(),
  events: Object.fromEntries(completeEvents.map(e => [e.id, {
    id: e.id, name: e.displayedName, circuit: e.circuit,
    shortName: e.shortName, flag: eventFlags[e.id], order: e.order,
  }])),
  players: Object.fromEntries(Object.entries(breakdown).map(([n, d]) => [n, d])),
  byEvent,
};

writeFileSync('breakdown.json', JSON.stringify(output, null, 2));

// ═══ Report ═══
console.log(`\n========== SCENARIO ${completeEvents.length} GP ==========`);
const sorted = Object.values(breakdown).sort((a, b) => b.overallPoints - a.overallPoints);
for (const p of sorted) {
  const totCalc = Math.round((p.season.q + p.season.sprint + p.season.race + p.season.extra) * 10) / 10;
  const diff = Math.round((p.overallPoints - totCalc) * 10) / 10;
  console.log(`\n${p.displayName.padEnd(12)} TotAPI=${p.overallPoints}  TotCalc=${totCalc}  Diff=${diff > 0 ? '+'+diff : diff}`);
  console.log(`  Stag: Q=${p.season.q} | Sprint=${p.season.sprint} | Gara=${p.season.race} | Extra=${p.season.extra}`);
  for (const ev of completeEvents) {
    const e = p.events[ev.id];
    if (!e) continue;
    console.log(`  ${ev.displayedName.padEnd(15)} Q=${String(e.q).padStart(6)} | Spr=${String(e.sprint).padStart(6)} | Gar=${String(e.race).padStart(6)} | Bonus=${String(e.extra).padStart(6)} | TOT=${String(e.total).padStart(6)}`);
  }
}

console.log(`\n✅ Salvato breakdown.json (${JSON.stringify(output).length} byte)`);
