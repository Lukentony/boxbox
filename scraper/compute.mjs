import { readFileSync, writeFileSync } from 'fs';

const riders     = JSON.parse(readFileSync('riders.json'));
const events     = JSON.parse(readFileSync('events.json'));
const constructs = JSON.parse(readFileSync('constructors.json'));
const squadsJSON = JSON.parse(readFileSync('squads.json'));
const allData    = JSON.parse(readFileSync('all-teams.json'));
const league     = allData.leaderboard || [];
const teamsByEvent = allData.teams || {};

const riderById  = Object.fromEntries(riders.map(r => [r.id, r]));
const constrById = Object.fromEntries(constructs.map(c => [c.id, c]));
const squadById  = Object.fromEntries(squadsJSON.map(s => [s.id, s]));

const isEventStarted = (ev) => {
  if (ev.status === 'complete') return true;
  if (ev.status === 'active' && ev.races?.length > 0) {
    return true; // include active anche parziali
  }
  return false;
};

const completed = events.filter(isEventStarted).sort((a, b) => a.order - b.order);

// Pre-show prossimo GP (stesso threshold di fetch-data.mjs)
const PRE_SHOW_H = 48;
const _nowMs = Date.now();
const _nextSched = events
  .filter(e => !isEventStarted(e) && e.status !== 'complete' && e.dateStart)
  .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart))[0];
const upcomingEv = (() => {
  if (!_nextSched) return null;
  const ms = new Date(_nextSched.dateStart) - _nowMs;
  return (ms > 0 && ms < PRE_SHOW_H * 3_600_000) ? _nextSched : null;
})();
if (upcomingEv && !completed.find(e => e.id === upcomingEv.id)) completed.push(upcomingEv);

const players = league.filter(p => p.overallPoints != null);

const flags = {
  THA:'🇹🇭',BRA:'🇧🇷',USA:'🇺🇸',QAT:'🇶🇦',SPA:'🇪🇸',FRA:'🇫🇷',GBR:'🇬🇧',
  ITA:'🇮🇹',NED:'🇳🇱',GER:'🇩🇪',CZE:'🇨🇿',AUT:'🇦🇹',HUN:'🇭🇺',CAT:'🇪🇸',
  RSM:'🇸🇲',JPN:'🇯🇵',INA:'🇮🇩',AUS:'🇦🇺',MAL:'🇲🇾',POR:'🇵🇹',VAL:'🇪🇸',ARA:'🇪🇸'
};

const flagOf = (e) => {
  for (const [c, f] of Object.entries(flags)) {
    if ((e.shortName || '').toUpperCase() === c || (e.displayedName || '').toUpperCase().startsWith(c)) return f;
  }
  return '🏁';
};

const breakdown = {};

for (const p of players) {
  const name = p.displayName;
  const byEvent = {};
  let sumQ = 0, sumSp = 0, sumRa = 0, sumEx = 0;

  for (const ev of completed) {
    const eid = ev.id;
    const team = teamsByEvent[String(eid)]?.[name] || teamsByEvent[eid]?.[name];
    if (!team || !team.riders) continue;

    let q = 0, sp = 0, ra = 0, ex = 0;

    const add = (rid, factor) => {
      const r = riderById[rid];
      const e = r?.stats?.events?.[String(eid)];
      if (!e) return;
      q  += (e.q2Points || e.q1Points || 0) * factor;
      sp += (e.sprintPoints || 0) * factor;
      ra += (e.finalPoints || 0) * factor;
      ex += (e.fastestLapPoints || 0) * factor;
      ex += (e.riderOfTheRacePoints || 0) * factor;
      ex += (e.perfectGPPoints || 0) * factor;
      ex += (e.topSpeedPoints || 0) * factor;
      ex += (e.circuitRecordPoints || 0) * factor;
      ex += (e.dnfPenaltyPoints || 0) * factor;
      ex += (e.gridVsFinalPositionPoints || 0) * factor;
      ex += (e.standingsVsFinalPositionPoints || 0) * factor;
      ex += (e.qualifyingVsFinalPositionPoints || 0) * factor;
    };

    (team.riders || []).forEach(rid => add(rid, 1));
    (team.ridersSilver || []).forEach(rid => add(rid, 0.5));
    // Boosters: rider booster aggiunge ancora una volta i punti del pilota (2x totale)
    (team.boosters || []).forEach(b => {
      if (b.boosterType === 'rider' && b.details?.riderId) {
        add(b.details.riderId, 1); // aggiunge 1x extra (il primo 1x è già contato sopra)
      }
    });
    (team.constructors || []).forEach(cid => { ex += constrById[cid]?.stats?.events?.[String(eid)]?.points || 0; });
    (team.squads || []).forEach(sid => { ex += squadById[sid]?.stats?.events?.[String(eid)]?.points || 0; });

    const tot = Math.round((q + sp + ra + ex) * 10) / 10;
    byEvent[eid] = {
      q: Math.round(q * 10) / 10,
      sprint: Math.round(sp * 10) / 10,
      race: Math.round(ra * 10) / 10,
      extra: Math.round(ex * 10) / 10,
      total: tot,
    };
    sumQ += q; sumSp += sp; sumRa += ra; sumEx += ex;
  }

  breakdown[name] = {
    displayName: name,
    profileId: p.profileId,
    overallPoints: p.overallPoints,
    teamValue: league.find(m => m.displayName === name)?.teamValue || 0,
    season: {
      q: Math.round(sumQ * 10) / 10,
      sprint: Math.round(sumSp * 10) / 10,
      race: Math.round(sumRa * 10) / 10,
      extra: Math.round(sumEx * 10) / 10
    },
    events: byEvent,
  };
}

const byEvent = {};
for (const ev of completed) {
  const st = Object.values(breakdown)
    .filter(p => p.events[ev.id])
    .map(p => ({ displayName: p.displayName, ...p.events[ev.id] }))
    .sort((a, b) => b.total - a.total);
  byEvent[ev.id] = {
    eventId: ev.id, eventName: ev.displayedName, flag: flagOf(ev),
    ...(upcomingEv && ev.id === upcomingEv.id ? { upcoming: true, dateStart: ev.dateStart } : {}),
    standings: st,
  };
}

const output = {
  computedAt: new Date().toISOString(),
  events: Object.fromEntries(completed.map(e => [e.id, { id: e.id, name: e.displayedName, flag: flagOf(e), order: e.order }])),
  players: breakdown,
  byEvent
};

writeFileSync('breakdown.json', JSON.stringify(output, null, 2));

console.log(`\n========== ${completed.length} GP ==========\n`);
const sorted = Object.values(breakdown).sort((a, b) => b.overallPoints - a.overallPoints);
for (const p of sorted) {
  const calcTotal = Math.round((p.season.q + p.season.sprint + p.season.race + p.season.extra) * 10) / 10;
  const diff = Math.round((p.overallPoints - calcTotal) * 10) / 10;
  console.log(`${p.displayName.padEnd(12)} API=${p.overallPoints}  Calc=${calcTotal}  D=${diff > 0 ? '+' + diff : diff}`);

  for (const ev of completed) {
    const e = p.events[ev.id];
    if (!e) continue;
    console.log(`  ${ev.displayedName.padEnd(12)} Q=${String(e.q).padStart(6)} | Spr=${String(e.sprint).padStart(6)} | Gar=${String(e.race).padStart(6)} | Bonus=${String(e.extra).padStart(6)} | TOT=${String(e.total).padStart(6)}`);
  }
  console.log('');
}
