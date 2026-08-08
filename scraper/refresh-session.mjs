import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(DIR, '.env');
const BASE = 'https://fantasy.motogp.com';

function loadCookie() {
  if (!existsSync(ENV_PATH)) return null;
  const raw = readFileSync(ENV_PATH, 'utf-8');
  const full = raw.match(/^COOKIE_FULL=(.+)$/m);
  if (full) return full[1].trim().replace(/^["']|["']$/g, '');
  const dat = raw.match(/^DAT=(.+)$/m);
  if (dat) return `DAT=${dat[1].trim().replace(/^["']|["']$/g, '')}; auth.strategy=local`;
  return null;
}

async function main() {
  const cookie = loadCookie();

  if (!cookie) {
    console.error('DAT o COOKIE_FULL assente in .env');
    process.exit(1);
  }

  const res = await fetch(`${BASE}/api/en/fantasy/league/5287/leaderboard?limit=1&page=1`, {
    headers: {
      'Cookie': cookie,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
    redirect: 'manual',
  });

  if (res.status === 401 || res.status === 403) {
    console.error(`DAT scaduto (HTTP ${res.status})`);
    process.exit(1);
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') || '';
    if (location.includes('login') || location.includes('account')) {
      console.error(`DAT scaduto (redirect ${res.status} -> ${location})`);
      process.exit(1);
    }
  }

  if (!res.ok) {
    console.error(`API non raggiungibile (HTTP ${res.status})`);
    process.exit(2);
  }

  const body = await res.json();
  const players = body.success?.leaderboard?.length || 0;

  console.log(`DAT valido (${players} giocatori, HTTP ${res.status})`);
  process.exit(0);
}

main().catch(e => {
  console.error(`Errore rete: ${e.message}`);
  process.exit(2);
});
