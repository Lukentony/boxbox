import { readFileSync, writeFileSync } from 'fs';
import { rosaInvariataConBooster, teamEventScoring } from '../boosters.js';

/* Lettura degli input: un JSON rotto deve dire quale file e perche', invece di
   uno stack trace di JSON.parse nel log del cron. L'errore resta fatale
   (compute e' gia' non bloccante nella pipeline). */
const leggiJson = (nome) => {
  let testo;
  try {
    testo = readFileSync(nome, 'utf-8');
  } catch (e) {
    throw new Error(`${nome} non leggibile: ${e.message}`);
  }
  try {
    return JSON.parse(testo);
  } catch (e) {
    throw new Error(`${nome} malformato: ${e.message}`);
  }
};

const riders     = leggiJson('riders.json');
const events     = leggiJson('events.json');
const constructs = leggiJson('constructors.json');
const squadsJSON = leggiJson('squads.json');
const allData    = leggiJson('all-teams.json');
const league     = allData.leaderboard || [];
const teamsByEvent = allData.teams || {};

const riderById  = Object.fromEntries(riders.map(r => [r.id, r]));
const constrById = Object.fromEntries(constructs.map(c => [c.id, c]));
const squadById  = Object.fromEntries(squadsJSON.map(s => [s.id, s]));

/* Un GP conta come corso solo quando almeno un pilota ha dati per quell'evento.
   Lo stato da solo non basta: un weekend annullato o rinviato per maltempo
   resta 'active' (o viene chiuso 'complete') senza che nessuna gara si sia
   corsa, e finiva nel breakdown come GP da zero punti. La sola Q corso invece
   lascia dati veri e il GP resta.
   Vedi anche cron/race-phase.py: e' il watcher che, dall'altra parte, smette di
   aspettare un 'complete' che non arrivera' mai. */
const isEventStarted = (ev) => {
  if (ev.status !== 'complete' && !(ev.status === 'active' && ev.races?.length > 0)) return false;
  return riders.some(r => r.stats?.events?.[String(ev.id)]);
};

const completed = events.filter(isEventStarted).sort((a, b) => a.order - b.order);

// Pre-show prossimo GP (stesso threshold di fetch-data.mjs)
const PRE_SHOW_H = 24;
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
  /* Squadra del GP precedente dello stesso giocatore: serve al solo controllo
     "rosa invariata con booster attivo", che i dati ufficiali permettono di
     calcolare senza inventare niente. */
  let teamPrecedente = null;
  let eidPrecedente = null;

  for (const ev of completed) {
    const eid = ev.id;
    const team = teamsByEvent[String(eid)]?.[name] || teamsByEvent[eid]?.[name];
    if (!team || !team.riders) continue;

    /* Voci e totali di un GP si calcolano in un posto solo (dist/boosters.js):
       la tabella Fantasy mostra le stesse voci, quindi non puo' sommare un
       numero diverso da questo. */
    const punti = teamEventScoring(team, eid, { riderById, constrById, squadById });
    for (const linea of punti.lines) {
      if (linea.senzaDati) {
        console.warn(`[compute] ${name}: pilota ${linea.id} senza stats.events[${eid}] (GP ${eid}) -- trattato come 0, controllare riders.json`);
      }
    }

    /* Avvisi: quello che il motore non sa spiegare finisce nel breakdown e
       quindi nella card del GP. I punti restano quelli calcolati dal dato
       ufficiale: un avviso dichiara il dubbio, non lo corregge. */
    const avvisi = [...(punti.avvisi || [])];
    if (rosaInvariataConBooster(teamPrecedente, team)) {
      avvisi.push({ codice: 'rosa-invariata-con-booster', eventoPrecedente: eidPrecedente });
    }
    avvisi.forEach(avviso => {
      console.warn(`[compute] ${name} GP ${eid}: ${avviso.codice}`
        + (avviso.riderId != null ? ` (pilota ${avviso.riderId})` : '')
        + (avviso.boosterType ? ` [${avviso.boosterType}]` : '')
        + (avviso.eventoPrecedente != null ? ` (come il GP ${avviso.eventoPrecedente})` : ''));
    });

    const { q, sprint, race, extra } = punti;
    byEvent[eid] = {
      q: Math.round(q * 10) / 10,
      sprint: Math.round(sprint * 10) / 10,
      race: Math.round(race * 10) / 10,
      extra: Math.round(extra * 10) / 10,
      total: Math.round(punti.total * 10) / 10,
      ...(avvisi.length ? { avvisi } : {}),
    };
    teamPrecedente = team;
    eidPrecedente = eid;
    sumQ += q; sumSp += sprint; sumRa += race; sumEx += extra;
  }

  const calculatedTotal = Math.round((sumQ + sumSp + sumRa + sumEx) * 10) / 10;
  // L'API espone solo il totale stagionale: e' la sorgente di verita' quando
  // una regola non ricostruibile lascia un delta nel dettaglio calcolato.
  const apiAdjustment = Math.round((p.overallPoints - calculatedTotal) * 10) / 10;

  breakdown[name] = {
    displayName: name,
    profileId: p.profileId,
    overallPoints: p.overallPoints,
    teamValue: league.find(m => m.displayName === name)?.teamValue || 0,
    season: {
      q: Math.round(sumQ * 10) / 10,
      sprint: Math.round(sumSp * 10) / 10,
      race: Math.round(sumRa * 10) / 10,
      extra: Math.round(sumEx * 10) / 10,
      apiAdjustment,
      total: p.overallPoints
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
  const adjustment = p.season.apiAdjustment;
  console.log(`${p.displayName.padEnd(12)} API=${p.overallPoints}  Calc=${calcTotal}  Rettifica API=${adjustment > 0 ? '+' + adjustment : adjustment}`);

  for (const ev of completed) {
    const e = p.events[ev.id];
    if (!e) continue;
    console.log(`  ${ev.displayedName.padEnd(12)} Q=${String(e.q).padStart(6)} | Spr=${String(e.sprint).padStart(6)} | Gar=${String(e.race).padStart(6)} | Bonus=${String(e.extra).padStart(6)} | TOT=${String(e.total).padStart(6)}`);
  }
  console.log('');
}
