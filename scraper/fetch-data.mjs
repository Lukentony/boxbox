import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(DIR, '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([^#\s=]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv();

const DAT = process.env.DAT;
const COOKIE_FULL = process.env.COOKIE_FULL;
const LEAGUE_ID = process.env.LEAGUE_ID;

if (!DAT && !COOKIE_FULL) {
  console.error('Manca DAT o COOKIE_FULL nel file .env');
  process.exit(1);
}

const COOKIE = COOKIE_FULL || `DAT=${DAT}; auth.strategy=local`;
const BASE = 'https://fantasy.motogp.com';
const HEADERS = {
  'Cookie': COOKIE,
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
};

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) {
    if (res.status === 401) throw new Error('COOKIE_EXPIRED');
    throw new Error(`HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`);
  }
  return res.json();
}

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`Fetch dati Fantasy — ${timestamp}`);

  let lb;
  try {
    lb = await fetchJSON(`/api/en/fantasy/league/${LEAGUE_ID}/leaderboard?limit=20&page=1`);
  } catch (e) {
    if (e.message === 'COOKIE_EXPIRED') {
      console.error('Cookie scaduto. Rinnovare DAT in .env');
      process.exit(2);
    }
    throw e;
  }
  const players = (lb.success?.leaderboard || []).filter(p => p.overallPoints != null);
  console.log(`${players.length} giocatori attivi`);
  // Guardia: leaderboard vuota = sessione/Incapsula in errore. NON sovrascrivere
  // all-teams.json con dati vuoti (visto 2026-08-08 13:00: 0 giocatori -> file 1.9KB,
  // roster di tutti i GP persi).
  //
  // Bugfix 2026-08-08 (Claude): la guardia faceva `return` qui, saltando anche
  // events.json e i dati pubblici sotto (riders/constructors/squads) — non
  // intenzionale, loro non dipendono dalla sessione autenticata rotta. Ora la
  // guardia si applica solo alla sezione roster piu' sotto; qui si prosegue e si
  // segnala solo con un flag + exit code dedicato (3), cosi' il chiamante
  // (boxbox-cron.sh) puo' avvisare su Discord invece di restare silenzioso come
  // prima (impatto ridotto: boxbox-cron.sh rifetcha gia' riders/constructors/
  // squads/events all'inizio della pipeline in modo indipendente, quindi la
  // regressione toccava solo chi invoca fetch-data.mjs da solo).
  const leaderboardEmpty = !players.length;
  if (leaderboardEmpty) {
    console.error('Leaderboard vuota — roster (all-teams.json) NON aggiornato, dati pubblici proseguono comunque');
  }

  const eventsRes = await fetch(`${BASE}/json/fantasy/events.json`, { headers: HEADERS });
  const events = await eventsRes.json();
  const isEventStarted = (ev) => {
    if (ev.status === 'complete') return true;
    if (ev.status === 'active' && ev.races?.length > 0) {
      return true; // include active anche parziali
    }
    return false;
  };

  const completedEvIds = events.filter(isEventStarted).map(e => e.id);

  // Pre-show prossimo GP nelle 24h precedenti alla prima sessione.
  // Bugfix 2026-08-08 (Claude): era 48h, disallineato da compute.mjs (gia' a 24h dal fix del
  // 7/08) -- finestra 24-48h dove questo file marcava il GP "pre-show" ma compute.mjs no.
  {
    const PRE_SHOW_H = 24;
    const nowMs = Date.now();
    const nextEv = events
      .filter(e => !isEventStarted(e) && e.status !== 'complete' && e.dateStart)
      .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart))[0];
    if (nextEv) {
      const msUntil = new Date(nextEv.dateStart) - nowMs;
      if (msUntil > 0 && msUntil < PRE_SHOW_H * 3_600_000) {
        completedEvIds.push(nextEv.id);
        console.log(`Pre-show: ${nextEv.displayedName?.trim()} tra ${Math.round(msUntil/3_600_000)}h`);
      }
    }
  }

  writeFileSync(resolve(DIR, 'events.json'), JSON.stringify(events, null, 2));
  console.log(`${completedEvIds.length} GP completati: ${completedEvIds.join(', ')}`);

  if (!leaderboardEmpty) {
    const allData = { leaderboard: lb.success?.leaderboard, teams: {}, fetchedAt: timestamp };

    for (const evId of completedEvIds) {
      allData.teams[evId] = {};
      for (const p of players) {
        try {
          const t = await fetchJSON(`/api/en/fantasy/team/show-user-team?profileId=${p.profileId}&eventId=${evId}`);
          allData.teams[evId][p.displayName] = t.success;
        } catch (e) {
          console.warn(`${p.displayName} GP${evId}: ${e.message}`);
        }
      }
      console.log(`GP ${evId} — ${Object.keys(allData.teams[evId]).length} team`);
    }

    // Scrittura atomica (tmp + rename): se il processo muore a meta' non lascia un file troncato
    const tmpAll = resolve(DIR, 'all-teams.json.tmp');
    writeFileSync(tmpAll, JSON.stringify(allData, null, 2));
    renameSync(tmpAll, resolve(DIR, 'all-teams.json'));
  }

  console.log('Dati pubblici...');
  const publicFiles = [
    ['riders.json',        '/json/fantasy/riders.json'],
    ['constructors.json',  '/json/fantasy/constructors.json'],
    ['squads.json',        '/json/fantasy/squads.json'],
  ];
  for (const [file, path] of publicFiles) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'Accept': 'application/json' } });
    writeFileSync(resolve(DIR, file), JSON.stringify(await res.json(), null, 2));
    console.log(`${file}`);
  }

  console.log(`DONE — ${leaderboardEmpty ? 'solo dati pubblici (leaderboard vuota)' : 'all-teams.json + dati pubblici'} salvati`);

  // Exit code dedicato (3): "riuscito ma degradato", distinto da 0 (tutto ok) e da
  // un errore fatale (1/2) — il chiamante decide se avvisare senza dover fare grep
  // sui log per riconoscere il caso.
  if (leaderboardEmpty) process.exitCode = 3;
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
