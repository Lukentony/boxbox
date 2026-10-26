// test-boosters.mjs — la regola dei booster sta in un posto solo.
// Uso: node test-boosters.mjs    (oppure: npm test)
// Nessuna chiamata di rete: fixture costruite sulle forme dei dati veri.
//
// Perche' esiste. In tab-fantasy.js il 2X era controllato a mano due volte e
// accettava solo boosterType 'rider'; compute.mjs trattava 'rider' e 'golden'.
// Il booster 'super' — tutto il GP doppio — non produceva ne' tag ne' punti.
// La regola ora vive in ../boosters.js, importata dal disegno ('./boosters.js')
// e dal calcolo ('../boosters.js'). Questi controlli caricano il modulo vero e
// verificano i tre casi, poi eseguono compute.mjs su fixture per accertare che
// il moltiplicatore finisca davvero nei punti.

import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url)); // scraper/
const ROOT = resolve(DIR, '..');

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

/* Il modulo condiviso e' la cosa che si sta verificando: senza di lui ogni
   controllo fallisce con la sua etichetta, invece di esplodere con uno stack
   trace prima del primo test. */
let mod = null;
try {
  mod = await import('../boosters.js');
} catch (e) {
  mod = null;
}
if (!mod) {
  assert(false, 'il modulo condiviso boosters.js nella radice esiste ed e\' importabile');
}
const M = mod || {};

function ok(controllo, label) {
  if (!mod) return assert(false, label);
  try {
    return assert(Boolean(controllo()), label);
  } catch (e) {
    return assert(false, `${label} (eccezione: ${e.message})`);
  }
}

// ═══ [1] Etichette: i tre tipi si vedono ═══

function testEtichette() {
  console.log('\n[1] Tag mostrati — rider, golden e super riconoscibili');
  ok(() => M.boosterLabel({ boosterType: 'rider', details: { riderId: 3 } }) === 'RIDER 2X', 'rider → RIDER 2X');
  ok(() => M.boosterLabel({ boosterType: 'golden', details: { riderId: 3 } }) === 'GOLDEN', 'golden → GOLDEN');
  ok(() => M.boosterLabel({ boosterType: 'super', details: null }) === 'SUPER 2X',
    'super → SUPER 2X (il 2X e\' il punto: senza sembra un booster di sola immagine)');
  ok(() => M.boosterLabel({ boosterType: 'transfers' }) === 'TRANSFERS', 'transfers (alias storico) → TRANSFERS');
  ok(() => M.boosterLabel({ boosterType: '  RIDER ' }) === 'RIDER 2X', 'maiuscole e spazi non cambiano il tipo');
  ok(() => M.boosterLabel({ boosterType: 'mystery' }) === 'MYSTERY', 'un tipo sconosciuto resta leggibile');
  ok(() => M.boosterLabel({}) === 'BOOSTER', 'un booster senza tipo non sparisce dal tag');
}

// ═══ [2] Rider: 2X sul solo pilota indicato ═══

function testRider() {
  console.log('\n[2] Rider — raddoppia quel pilota, non la squadra');
  const conRider = { riders: [1, 2], ridersSilver: [3], boosters: [{ boosterType: 'rider', details: { riderId: 2 } }] };
  ok(() => M.riderDoubled(conRider, 2) === true, 'il pilota indicato da details.riderId raddoppia');
  ok(() => M.riderDoubled(conRider, 1) === false, 'gli altri piloti oro non raddoppiano');
  ok(() => M.riderDoubled(conRider, 3) === false, 'l\'argento non raddoppia se il booster e\' su un altro');
  ok(() => M.teamDoubled(conRider) === false, 'rider non raddoppia il GP intero');
  ok(() => JSON.stringify(M.goldenRiderIds(conRider)) === JSON.stringify([]), 'rider non aggiunge piloti extra');
  ok(() => M.riderDoubled({ riders: [1] }, 1) === false, 'squadra senza booster → nessun raddoppio');
  ok(() => M.riderDoubled(conRider, null) === false, 'senza id pilota non si raddoppia nessuno');
}

// ═══ [3] Golden: un pilota extra a punteggio pieno ═══

function testGolden() {
  console.log('\n[3] Golden — pilota extra, una volta sola, fuori rosa');
  const squadra = {
    riders: [1, 2],
    ridersSilver: [3],
    boosters: [
      { boosterType: 'golden', details: { riderId: 9 } },
      { boosterType: 'golden', details: { riderId: 9 } },
      { boosterType: 'golden', details: { riderId: 1 } },
      { boosterType: 'golden', details: null },
    ],
  };
  ok(() => JSON.stringify(M.goldenRiderIds(squadra)) === JSON.stringify([9]),
    'un id solo, mai un pilota gia\' in rosa, mai un golden senza riderId');
  ok(() => M.riderDoubled(squadra, 9) === false, 'golden non e\' un raddoppio: e\' un pilota in piu\'');
  ok(() => M.teamDoubled(squadra) === false, 'golden non raddoppia il GP');
  ok(() => JSON.stringify(M.goldenRiderIds({ riders: [1], ridersSilver: [2] })) === JSON.stringify([]),
    'squadra senza golden → nessun pilota extra');
}

// ═══ [4] Super: tutto il GP raddoppia ═══

function testSuper() {
  console.log('\n[4] Super — qualifiche, sprint, gara, costruttore e squadra');
  const conSuper = { riders: [1, 2], ridersSilver: [3], boosters: [{ boosterType: 'super', details: null }] };
  ok(() => M.teamDoubled(conSuper) === true, 'un solo super raddoppia la squadra intera');
  ok(() => M.riderDoubled(conSuper, 1) && M.riderDoubled(conSuper, 2),
    'con super ogni pilota oro risulta raddoppiato');
  ok(() => M.riderDoubled(conSuper, 3) === true, 'con super raddoppia anche l\'argento');
  ok(() => M.riderDoubled(conSuper, null) === false, 'senza id pilota non si raddoppia nessuno');
  ok(() => JSON.stringify(M.goldenRiderIds(conSuper)) === JSON.stringify([]),
    'super non aggiunge un pilota extra: raddoppia quello che c\'e\'');
}

// ═══ [5] Il conto: compute.mjs applica la stessa regola ═══

function testCompute() {
  console.log('\n[5] compute.mjs — il moltiplicatore arriva nei punti');

  const tmp = mkdtempSync(resolve(tmpdir(), 'boxbox-boosters-'));
  const writeJson = (name, value) => writeFileSync(resolve(tmp, name), JSON.stringify(value));
  try {
    // Due GP identici nella rosa, diversi solo per il booster: il booster e' per
    // evento, non per stagione.
    writeJson('events.json', [
      { id: 1, order: 1, status: 'complete', displayedName: 'GP Booster', shortName: 'BST' },
      { id: 2, order: 2, status: 'complete', displayedName: 'GP Normale', shortName: 'NRM' },
    ]);
    writeJson('riders.json', [
      { id: 1, stats: { events: { '1': { points: 100, q2Points: 30, sprintPoints: 20, finalPoints: 50 }, '2': { points: 10, q2Points: 5, sprintPoints: 0, finalPoints: 5 } } } },
      { id: 2, stats: { events: { '1': { points: 40, q2Points: 10, sprintPoints: 10, finalPoints: 20 }, '2': { points: 0, q2Points: 0, sprintPoints: 0, finalPoints: 0 } } } },
      { id: 3, stats: { events: { '1': { points: 60, q2Points: 20, sprintPoints: 10, finalPoints: 30 }, '2': { points: 0, q2Points: 0, sprintPoints: 0, finalPoints: 0 } } } },
    ]);
    writeJson('constructors.json', [{ id: 1, name: 'Costruttore', stats: { events: { '1': { points: 10 }, '2': { points: 0 } } } }]);
    writeJson('squads.json', [{ id: 1, name: 'Team', stats: { events: { '1': { points: 5 }, '2': { points: 0 } } } }]);

    const rosa = (boosters = []) => ({
      riders: [1], ridersSilver: [2], constructors: [1], squads: [1], value: 50000000, boosters,
    });
    const rose = (vince) => ({
      Base: rosa(),
      Raddoppio: rosa(vince ? [{ boosterType: 'rider', details: { riderId: 1 } }] : []),
      Super: rosa(vince ? [{ boosterType: 'super', details: null }] : []),
      Golden: rosa(vince ? [{ boosterType: 'golden', details: { riderId: 3 } }] : []),
      GoldenInRosa: rosa(vince ? [{ boosterType: 'golden', details: { riderId: 1 } }] : []),
    });
    writeJson('all-teams.json', {
      leaderboard: ['Base', 'Raddoppio', 'Super', 'Golden', 'GoldenInRosa']
        .map((displayName, i) => ({ displayName, profileId: i + 1, overallPoints: 0, teamValue: 50000000 })),
      teams: { '1': rose(true), '2': rose(false) },
    });

    const result = spawnSync(process.execPath, [resolve(DIR, 'compute.mjs')], { cwd: tmp, encoding: 'utf8' });
    assert(result.status === 0, `compute.mjs termina con exit 0 (${(result.stderr || '').trim() || 'nessun errore'})`);
    if (result.status !== 0) return;

    const out = JSON.parse(readFileSync(resolve(tmp, 'breakdown.json'), 'utf-8'));
    const gp1 = (nome) => out.players[nome].events['1'];
    const gp2 = (nome) => out.players[nome].events['2'];

    assert(gp1('Base').total === 135, `senza booster: ${gp1('Base').total} (atteso 135)`);
    assert(gp1('Raddoppio').total === 235, `rider 2x su un pilota: ${gp1('Raddoppio').total} (atteso 235)`);
    assert(gp1('Super').total === 270, `super: ${gp1('Super').total} (atteso 270, il GP intero raddoppia)`);
    assert(gp1('Super').q === 70 && gp1('Super').sprint === 50 && gp1('Super').race === 120 && gp1('Super').extra === 30,
      'super raddoppia le componenti: Q, Sprint, Gara e Bonus costruttore/squadra');
    assert(gp1('Golden').total === 195, `golden: ${gp1('Golden').total} (atteso 195, pilota extra a punteggio pieno)`);
    assert(gp1('GoldenInRosa').total === 135,
      `golden su un pilota gia' in rosa: ${gp1('GoldenInRosa').total} (atteso 135, nessun doppio conteggio)`);
    assert(gp2('Raddoppio').total === 10 && gp2('Super').total === 10 && gp2('Golden').total === 10,
      'il booster vale solo per il suo GP: il secondo GP resta a 10 punti');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ═══ [6] Una sola copia della regola ═══

function testRegolaUnica() {
  console.log('\n[6] Regola unica — disegno e calcolo importano lo stesso modulo');
  const disegno = readFileSync(resolve(ROOT, 'tab-fantasy.js'), 'utf-8');
  const calcolo = readFileSync(resolve(DIR, 'compute.mjs'), 'utf-8');
  const regola = readFileSync(resolve(ROOT, 'boosters.js'), 'utf-8');

  assert((disegno.match(/from '\.\/boosters\.js'/) || []).length === 1,
    'tab-fantasy.js importa la regola condivisa (./boosters.js)');
  assert((calcolo.match(/from '\.\.\/boosters\.js'/) || []).length === 1,
    'compute.mjs importa la regola condivisa (../boosters.js)');
  assert(!/boosterType\s*===/.test(disegno), 'tab-fantasy.js non confronta piu\' boosterType a mano');
  assert(!/boosterType\s*===/.test(calcolo), 'compute.mjs non confronta piu\' boosterType a mano');
  assert(!/const\s+(boosterLabel|goldenRiderIds|riderDoubled|teamDoubled)\s*=/.test(disegno),
    'tab-fantasy.js non tiene copie locali della regola');
  assert(!/const\s+(boosterLabel|goldenRiderIds|riderDoubled|teamDoubled)\s*=/.test(calcolo),
    'compute.mjs non tiene copie locali della regola');
  assert(!/^\s*import\s/m.test(regola), 'boosters.js non dipende da nulla: la stessa regola vale per browser e Node');
  assert(!/\b(document|window|localStorage)\b/.test(regola), 'boosters.js non tocca il DOM: e\' caricabile anche da Node');

  const usi = (disegno.match(/isBoosted = riderDoubled\(/g) || []).length;
  const assegnazioni = (disegno.match(/isBoosted =/g) || []).length;
  assert(usi > 0 && usi === assegnazioni,
    `ogni punto in cui si decide il 2X usa la regola condivisa (${usi}/${assegnazioni})`);
}

// ═══ [7] Sintassi del disegno ═══

function testSintassi() {
  console.log('\n[7] Sintassi — tab-fantasy.js resta un modulo ES valido');
  /* tab-fantasy.js e' un modulo browser senza package.json nella radice: lo si
     fa leggere a Node come ESM da stdin, senza eseguirlo (import di moduli DOM
     altrimenti fallirebbero). --check su stdin ha exit 1 in caso di errore. */
  const esito = spawnSync(process.execPath, ['--input-type=module', '--check', '-'], {
    input: readFileSync(resolve(ROOT, 'tab-fantasy.js'), 'utf-8'),
    encoding: 'utf8',
  });
  assert(esito.status === 0,
    `tab-fantasy.js e' sintatticamente valido (${(esito.stderr || '').trim().split('\n')[0] || 'nessun errore'})`);
}

// ═══ Esecuzione ═══

console.log('========================================');
console.log('  Booster Fantasy — Test Suite (mirror)');
console.log('========================================');

testEtichette();
testRider();
testGolden();
testSuper();
testCompute();
testRegolaUnica();
testSintassi();

console.log('\n========================================');
console.log(`  Risultato: ${passed} PASS, ${failed} FAIL`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
