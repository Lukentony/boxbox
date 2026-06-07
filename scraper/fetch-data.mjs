import { readFileSync, writeFileSync, existsSync } from 'fs';
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

  // Pre-show prossimo GP nelle 48h precedenti alla prima sessione
  {
    const PRE_SHOW_H = 48;
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

  writeFileSync(resolve(DIR, 'all-teams.json'), JSON.stringify(allData, null, 2));

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

  console.log(`DONE — all-teams.json + dati pubblici salvati`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
