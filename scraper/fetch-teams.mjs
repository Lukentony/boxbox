// fetch-teams.mjs — Aggiorna SOLO il GP in pre-show (prossimo GP entro 48h dalla prima sessione)
// Leggero: 1 leaderboard + N team, merge nel all-teams.json esistente senza toccare gli altri GP.
// Serve a boxbox-news-signal-watch.sh per tenere fresca la composizione squadre dei rivali
// nella finestra pre-lock, senza ripetere il fetch completo di fetch-data.mjs (52 richieste).
// Uso: node fetch-teams.mjs  (esce 2 se cookie scaduto, 0 se niente da fare o fatto)
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
  // Eventi dal file locale (aggiornato ogni ora dal cron orario)
  const eventsPath = resolve(DIR, 'events.json');
  if (!existsSync(eventsPath)) {
    console.log('events.json assente — salto (il cron orario lo crea)');
    return;
  }
  const events = JSON.parse(readFileSync(eventsPath, 'utf-8'));
  const nowMs = Date.now();

  // Prossimo GP non iniziato con prima sessione entro 24h (stesso criterio pre-show di
  // fetch-data.mjs/compute.mjs -- bugfix 2026-08-08 Claude, era 48h e disallineato).
  const PRE_SHOW_H = 24;
  const nextEv = events
    .filter(e => e.status !== 'complete' && e.dateStart)
    .map(e => ({ ...e, msUntil: new Date(e.dateStart) - nowMs }))
    .filter(e => e.msUntil > 0 && e.msUntil < PRE_SHOW_H * 3_600_000)
    .sort((a, b) => a.msUntil - b.msUntil)[0];

  if (!nextEv) {
    console.log('Nessun GP in pre-show — salto');
    return;
  }
  const evId = nextEv.id;
  console.log(`Pre-show: ${(nextEv.displayedName || nextEv.name || '').trim()} (GP ${evId}) tra ${Math.round(nextEv.msUntil / 3_600_000)}h`);

  // Leaderboard per i profileId
  const lb = await fetchJSON(`/api/en/fantasy/league/${LEAGUE_ID}/leaderboard?limit=20&page=1`);
  const players = (lb.success?.leaderboard || []).filter(p => p.overallPoints != null);

  // Merge nel file esistente (se c'è), altrimenti struttura vuota
  const allPath = resolve(DIR, 'all-teams.json');
  let allData = { leaderboard: lb.success?.leaderboard, teams: {}, fetchedAt: new Date().toISOString() };
  if (existsSync(allPath)) {
    try {
      const prev = JSON.parse(readFileSync(allPath, 'utf-8'));
      allData = { ...prev, teams: { ...(prev.teams || {}) } };
      allData.leaderboard = lb.success?.leaderboard;
      allData.fetchedAt = new Date().toISOString();
    } catch (e) {
      console.warn(`all-teams.json illeggibile, riparto da zero: ${e.message}`);
    }
  }

  allData.teams[String(evId)] = {};
  for (const p of players) {
    try {
      const t = await fetchJSON(`/api/en/fantasy/team/show-user-team?profileId=${p.profileId}&eventId=${evId}`);
      allData.teams[String(evId)][p.displayName] = t.success;
    } catch (e) {
      if (e.message === 'COOKIE_EXPIRED') throw e;
      console.warn(`${p.displayName} GP${evId}: ${e.message}`);
    }
  }
  console.log(`GP ${evId} — ${Object.keys(allData.teams[String(evId)]).length} team aggiornati`);

  // Scrittura atomica (evita di lasciare un file troncato se il processo muore a metà)
  const tmpPath = allPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(allData, null, 2));
  renameSync(tmpPath, allPath);
  console.log('DONE — all-teams.json aggiornato (solo pre-show)');
}

main().catch(e => {
  if (e.message === 'COOKIE_EXPIRED') {
    console.error('Cookie scaduto. Rinnovare DAT in .env');
    process.exit(2);
  }
  console.error(e.message);
  process.exit(1);
});
