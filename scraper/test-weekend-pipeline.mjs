// test-weekend-pipeline.mjs — Dry-run validation della pipeline weekend BoxBox
// Uso: node test-weekend-pipeline.mjs
// Non chiama API esterne. Usa dati mock per simulare un weekend di gara.

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

// ═══ Test 1: isEventDone — la logica che ha causato il bug ═══

function isEventDone(ev) {
  if (ev.status === 'complete') return true;
  if (ev.status === 'active' && ev.races?.length > 0) {
    return ev.races.every(r => r.status === 'complete');
  }
  return false;
}

function testIsEventDone() {
  console.log('\n[1] isEventDone — logica calendario');

  assert(isEventDone({ status: 'complete', races: [] }) === true,
    'evento complete senza races → true');

  assert(isEventDone({
    status: 'active',
    races: [
      { type: 'q1', status: 'complete' },
      { type: 'q2', status: 'complete' },
      { type: 'sprint', status: 'complete' },
      { type: 'final', status: 'complete' },
    ]
  }) === true, 'evento active con tutte le sessioni complete → true (BUG FIX)');

  assert(isEventDone({
    status: 'active',
    races: [
      { type: 'q1', status: 'complete' },
      { type: 'q2', status: 'complete' },
      { type: 'sprint', status: 'scheduled' },
      { type: 'final', status: 'scheduled' },
    ]
  }) === false, 'evento active con sessioni scheduled → false');

  assert(isEventDone({ status: 'scheduled', races: [] }) === false,
    'evento scheduled → false');

  assert(isEventDone({
    status: 'active',
    races: []
  }) === false, 'evento active con 0 races → false');
}

// ═══ Test 2: filtro giocatori — il fix overallPoints ═══

function testPlayerFilter() {
  console.log('\n[2] Filtro giocatori leaderboard');

  const mockLeaderboard = [
    { profileId: 250275, displayName: '8', overallPoints: 939.5 },
    { profileId: 250259, displayName: 'GianLai', overallPoints: 857.5 },
    { profileId: 252776, displayName: 'Fulvio', overallPoints: 848.5 },
    { profileId: 250270, displayName: 'Lukentony', overallPoints: 768 },
    { profileId: 250931, displayName: 'claudioenne', overallPoints: null },
    { profileId: 412561, displayName: 'Team 8', overallPoints: null },
  ];

  const oldFilter = mockLeaderboard.filter(p => p.overallPoints);
  const newFilter = mockLeaderboard.filter(p => p.overallPoints != null);

  assert(oldFilter.length === 4, `vecchio filtro: ${oldFilter.length} giocatori (atteso 4)`);
  assert(newFilter.length === 4, `nuovo filtro: ${newFilter.length} giocatori (atteso 4)`);

  const withZero = [...mockLeaderboard, { profileId: 999, displayName: 'NuovoGiocatore', overallPoints: 0 }];
  const oldWithZero = withZero.filter(p => p.overallPoints);
  const newWithZero = withZero.filter(p => p.overallPoints != null);

  assert(oldWithZero.length === 4, `vecchio filtro con 0 punti: ${oldWithZero.length} (perde il giocatore!)`);
  assert(newWithZero.length === 5, `nuovo filtro con 0 punti: ${newWithZero.length} (lo include correttamente)`);
}

// ═══ Test 3: verifica dati reali su disco ═══

function testRealDataFiles() {
  console.log('\n[3] Verifica file dati reali');

  const requiredFiles = ['events.json', 'riders.json', 'constructors.json', 'squads.json'];
  for (const f of requiredFiles) {
    const p = resolve(DIR, f);
    assert(existsSync(p), `${f} esiste`);
  }

  if (!existsSync(resolve(DIR, 'events.json'))) return;

  const events = JSON.parse(readFileSync(resolve(DIR, 'events.json'), 'utf-8'));
  assert(Array.isArray(events) && events.length > 0, `events.json contiene ${events.length} eventi`);

  const activeWithAllRacesDone = events.filter(e =>
    e.status === 'active' && e.races?.length > 0 && e.races.every(r => r.status === 'complete')
  );
  const completeEvents = events.filter(e => e.status === 'complete');
  const allDone = events.filter(isEventDone);

  console.log(`\n  Info: ${completeEvents.length} complete, ${activeWithAllRacesDone.length} active-ma-finite, ${allDone.length} totale effettivo`);

  if (activeWithAllRacesDone.length > 0) {
    for (const e of activeWithAllRacesDone) {
      console.log(`  WARN  "${e.displayedName}" (id=${e.id}) ha status "active" ma tutte le sessioni complete`);
      console.log(`         → Senza il fix, questo GP veniva IGNORATO dal pipeline`);
    }
    assert(allDone.length > completeEvents.length, 'il fix isEventDone cattura GP che il vecchio filtro perdeva');
  } else {
    console.log('  Info: nessun evento active con tutte le sessioni complete al momento');
  }
}

// ═══ Test 4: verifica leaderboard reale ═══

function testRealLeaderboard() {
  console.log('\n[4] Verifica leaderboard reale');

  const snapshotPath = resolve(DIR, 'league-snapshot.json');
  if (!existsSync(snapshotPath)) {
    console.log('  SKIP  league-snapshot.json non trovato');
    return;
  }

  const raw = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
  const leaderboard = raw.success?.leaderboard || raw.leaderboard || [];

  assert(leaderboard.length > 0, `leaderboard ha ${leaderboard.length} entries`);

  const activePlayers = leaderboard.filter(p => p.overallPoints != null);
  assert(activePlayers.length >= 4, `${activePlayers.length} giocatori attivi (atteso >= 4)`);

  const expectedNames = ['8', 'GianLai', 'Fulvio', 'Lukentony'];
  for (const name of expectedNames) {
    const found = activePlayers.find(p => p.displayName === name);
    assert(!!found, `giocatore "${name}" presente con ${found?.overallPoints ?? '?'} pt`);
  }

  if (raw.success?.user) {
    const user = raw.success.user;
    console.log(`\n  Info: utente autenticato = "${user.displayName}" (profileId=${user.profileId})`);
    const isInLeaderboard = activePlayers.some(p => p.profileId === user.profileId);
    if (!isInLeaderboard) {
      console.log(`  Info: "${user.displayName}" NON e' tra i giocatori attivi — e' l'account di servizio (DAT cookie)`);
    }
  }
}

// ═══ Test 5: verifica all-teams.json ═══

function testAllTeams() {
  console.log('\n[5] Verifica all-teams.json (team per-evento per-giocatore)');

  const path = resolve(DIR, 'all-teams.json');
  if (!existsSync(path)) {
    console.log('  SKIP  all-teams.json non trovato');
    return;
  }

  const allData = JSON.parse(readFileSync(path, 'utf-8'));
  const leaderboard = allData.leaderboard || [];
  const teams = allData.teams || {};
  const eventIds = Object.keys(teams);

  assert(leaderboard.length >= 4, `leaderboard: ${leaderboard.length} entries`);
  assert(eventIds.length > 0, `team presenti per ${eventIds.length} eventi`);

  const activePlayers = leaderboard.filter(p => p.overallPoints != null);
  for (const evId of eventIds) {
    const playersInEvent = Object.keys(teams[evId]);
    assert(playersInEvent.length >= 4,
      `evento ${evId}: ${playersInEvent.length} giocatori (atteso >= 4)`);

    for (const name of ['8', 'GianLai', 'Fulvio', 'Lukentony']) {
      const team = teams[evId][name];
      if (!team) {
        assert(false, `evento ${evId}: team mancante per "${name}"`);
        continue;
      }
      const hasRiders = (team.riders?.length || 0) > 0;
      assert(hasRiders, `evento ${evId}: "${name}" ha ${team.riders?.length || 0} riders`);
    }
  }

  const eventsFile = resolve(DIR, 'events.json');
  if (existsSync(eventsFile)) {
    const events = JSON.parse(readFileSync(eventsFile, 'utf-8'));
    const doneEvents = events.filter(isEventDone);
    const missingEvents = doneEvents.filter(e => !teams[String(e.id)]);
    if (missingEvents.length > 0) {
      for (const e of missingEvents) {
        assert(false, `evento "${e.displayedName}" (id=${e.id}) completato ma ASSENTE da all-teams.json`);
      }
    } else {
      assert(true, `tutti i ${doneEvents.length} eventi completati presenti in all-teams.json`);
    }
  }
}

// ═══ Test 6: simulazione weekend con dati mock ═══

function testMockWeekendPipeline() {
  console.log('\n[6] Simulazione weekend di gara (mock)');

  const mockEvents = [
    {
      id: 99, displayedName: 'MOCK GP', shortName: 'MCK', status: 'active', order: 99,
      dateStart: '2026-06-01T09:00:00+00:00', dateEnd: '2026-06-01T15:00:00+00:00',
      races: [
        { id: 201, type: 'q1', status: 'complete', dateStart: '2026-05-31T09:50:00+00:00', dateEnd: '2026-05-31T10:05:00+00:00' },
        { id: 202, type: 'q2', status: 'complete', dateStart: '2026-05-31T10:15:00+00:00', dateEnd: '2026-05-31T10:30:00+00:00' },
        { id: 203, type: 'sprint', status: 'complete', dateStart: '2026-05-31T14:00:00+00:00', dateEnd: '2026-05-31T14:30:00+00:00' },
        { id: 204, type: 'final', status: 'complete', dateStart: '2026-06-01T13:00:00+00:00', dateEnd: '2026-06-01T13:45:00+00:00' },
      ]
    },
    {
      id: 100, displayedName: 'NEXT GP', shortName: 'NXT', status: 'scheduled', order: 100,
      dateStart: '2026-06-14T09:00:00+00:00', dateEnd: '2026-06-15T15:00:00+00:00',
      races: [
        { id: 205, type: 'q1', status: 'scheduled', dateStart: '2026-06-14T09:50:00+00:00', dateEnd: '2026-06-14T10:05:00+00:00' },
        { id: 206, type: 'q2', status: 'scheduled', dateStart: '2026-06-14T10:15:00+00:00', dateEnd: '2026-06-14T10:30:00+00:00' },
        { id: 207, type: 'sprint', status: 'scheduled', dateStart: '2026-06-14T14:00:00+00:00', dateEnd: '2026-06-14T14:30:00+00:00' },
        { id: 208, type: 'final', status: 'scheduled', dateStart: '2026-06-15T13:00:00+00:00', dateEnd: '2026-06-15T13:45:00+00:00' },
      ]
    }
  ];

  const mockLeaderboard = [
    { profileId: 1, displayName: 'Player1', overallPoints: 100 },
    { profileId: 2, displayName: 'Player2', overallPoints: 90 },
    { profileId: 3, displayName: 'Player3', overallPoints: 80 },
    { profileId: 4, displayName: 'Player4', overallPoints: 70 },
    { profileId: 5, displayName: 'Inattivo', overallPoints: null },
  ];

  const mockTeamsByEvent = {
    '99': {
      'Player1': { riders: [1, 2], ridersSilver: [3, 4], constructors: [1], squads: [1] },
      'Player2': { riders: [5, 6], ridersSilver: [7, 8], constructors: [2], squads: [2] },
      'Player3': { riders: [1, 5], ridersSilver: [9, 10], constructors: [1], squads: [3] },
      'Player4': { riders: [2, 6], ridersSilver: [3, 7], constructors: [2], squads: [1] },
    }
  };

  const doneEvents = mockEvents.filter(isEventDone);
  assert(doneEvents.length === 1, `1 evento mock completato (MOCK GP, status=active ma tutte le races complete)`);
  assert(doneEvents[0].id === 99, `evento completato = MOCK GP (id=99)`);

  const activePlayers = mockLeaderboard.filter(p => p.overallPoints != null);
  assert(activePlayers.length === 4, `4 giocatori attivi (escluso "Inattivo" con null)`);

  for (const ev of doneEvents) {
    const eventTeams = mockTeamsByEvent[String(ev.id)];
    assert(!!eventTeams, `teams presenti per evento ${ev.id}`);

    let processedCount = 0;
    for (const player of activePlayers) {
      const team = eventTeams?.[player.displayName];
      if (team && team.riders?.length > 0) {
        processedCount++;
      }
    }
    assert(processedCount === 4, `${processedCount}/4 giocatori processati per MOCK GP`);
  }

  const scheduledOnly = mockEvents.filter(e => e.status === 'scheduled');
  assert(!isEventDone(scheduledOnly[0]), 'NEXT GP (scheduled) correttamente escluso');
}

// ═══ Test 7: simulazione trigger polling ═══

function testPollingTrigger() {
  console.log('\n[7] Logica trigger polling weekend');

  const PRE_RACE_HORIZON = 48 * 3600 * 1000;

  function getMode(events, nowMs) {
    const activeOrScheduled = events
      .filter(e => e.status === 'active' || e.status === 'scheduled')
      .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));

    if (activeOrScheduled.length === 0) return 'IDLE';

    const nextEvent = activeOrScheduled[0];
    const pendingSessions = (nextEvent.races || [])
      .filter(r => r.status !== 'complete')
      .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));

    if (pendingSessions.length === 0) return 'IDLE';

    const sessionStart = new Date(pendingSessions[0].dateStart).getTime();
    const timeToSession = sessionStart - nowMs;

    if (timeToSession > PRE_RACE_HORIZON) return 'IDLE';
    if (timeToSession > 0) return 'PRE_RACE';
    return 'RACE_WINDOW';
  }

  const mockEvent = {
    id: 8, status: 'scheduled',
    dateStart: '2026-05-30T09:50:00+01:00',
    dateEnd: '2026-05-31T17:00:00+01:00',
    races: [
      { id: 29, type: 'q1', status: 'scheduled', dateStart: '2026-05-30T09:50:00+01:00' },
      { id: 30, type: 'q2', status: 'scheduled', dateStart: '2026-05-30T10:15:00+01:00' },
      { id: 31, type: 'sprint', status: 'scheduled', dateStart: '2026-05-30T14:00:00+01:00' },
      { id: 32, type: 'final', status: 'scheduled', dateStart: '2026-05-31T13:00:00+01:00' },
    ]
  };

  const q1Start = new Date('2026-05-30T09:50:00+01:00').getTime();

  assert(getMode([mockEvent], q1Start - 72 * 3600000) === 'IDLE',
    '72h prima della Q1 → IDLE');

  assert(getMode([mockEvent], q1Start - 24 * 3600000) === 'PRE_RACE',
    '24h prima della Q1 → PRE_RACE');

  assert(getMode([mockEvent], q1Start - 30 * 60000) === 'PRE_RACE',
    '30min prima della Q1 → PRE_RACE');

  assert(getMode([mockEvent], q1Start + 60000) === 'RACE_WINDOW',
    '1min dopo inizio Q1 → RACE_WINDOW');

  assert(getMode([mockEvent], q1Start + 3600000) === 'RACE_WINDOW',
    '1h dopo inizio Q1 (status ancora scheduled) → RACE_WINDOW');

  const allDone = {
    ...mockEvent,
    status: 'active',
    races: mockEvent.races.map(r => ({ ...r, status: 'complete' }))
  };
  assert(getMode([allDone], q1Start + 48 * 3600000) === 'IDLE',
    'tutte le sessioni complete → IDLE');
}

// ═══ Esecuzione ═══

console.log('========================================');
console.log('  BoxBox Pipeline — Test Suite (Dry-Run)');
console.log('========================================');

testIsEventDone();
testPlayerFilter();
testRealDataFiles();
testRealLeaderboard();
testAllTeams();
testMockWeekendPipeline();
testPollingTrigger();

console.log('\n========================================');
console.log(`  Risultato: ${passed} PASS, ${failed} FAIL`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
