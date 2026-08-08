// team-diff.mjs — Confronta la composizione squadre dei rivali tra GP precedente e GP corrente.
// Output su stdout SOLO quando ci sono cambi non ancora notificati (anti-spam via stato in /tmp).
// Formato leggibile: "giocatore — N/2 cambi: slot: tolto X, messo Y"
// Uso: node team-diff.mjs                 (esce sempre 0; il wrapper decide se notificare)
//      node team-diff.mjs --commit-state  (promuove lo stato "pending" a confermato —
//                                           SOLO dopo che il wrapper ha confermato l'invio)
//
// Lo stato anti-spam si scrive in due tempi apposta: il diff nuovo va prima in un file
// "pending" separato, e solo --commit-state (chiamato dal wrapper dopo un invio confermato)
// lo promuove a stato confermato. Se l'invio fallisce, lo stato confermato resta quello
// vecchio e il prossimo giro ri-genera e ri-tenta lo stesso messaggio — un invio fallito
// non deve mai far perdere per sempre un cambio roster reale.
//
// RIVALS: nomi dei giocatori della lega da monitorare, da variabile d'ambiente (vedi
// .env.example) — lista fissa e non derivata dalla leaderboard di proposito: una lega
// fantasy può avere account inattivi/di test tra gli iscritti, che non sono giocatori
// reali da tracciare.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const DIR = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = '/tmp/boxbox-team-diff-state.json';
const STATE_PENDING = '/tmp/boxbox-team-diff-state.pending.json';

const RIVALS = (process.env.RIVALS || 'Rivale1,Rivale2,Rivale3').split(',').map(s => s.trim()).filter(Boolean);
const SLOT = { riders: 'gold', ridersSilver: 'silver' };

function readJSON(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function nameMap(riders) {
  const m = {};
  (riders || []).forEach(r => {
    m[r.id] = (r.firstName ? r.firstName[0] + '. ' : '') + (r.lastName || r.firstName || '#' + r.id);
  });
  return m;
}

// Coppie "tolto/messo" per slot: accoppia le uscite con le entrate per indice (sostituzioni 1:1).
function paired(prevArr, curArr, nameMapOrFn) {
  const nameOf = typeof nameMapOrFn === 'function' ? nameMapOrFn : (x => nameMapOrFn?.[x] ?? x);
  const prev = prevArr || [], cur = curArr || [];
  const out = prev.filter(x => !cur.includes(x));
  const inn = cur.filter(x => !prev.includes(x));
  const n = Math.max(out.length, inn.length);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    pairs.push({
      out: out[i] != null ? nameOf(out[i]) : null,
      inn: inn[i] != null ? nameOf(inn[i]) : null,
    });
  }
  return pairs;
}

function fmtPairs(pairs) {
  return pairs.map(p => {
    const bits = [];
    if (p.out != null) bits.push('tolto ' + p.out);
    if (p.inn != null) bits.push('messo ' + p.inn);
    return bits.join(', ');
  }).join('; ');
}

async function main() {
  if (process.argv.includes('--commit-state')) {
    if (existsSync(STATE_PENDING)) {
      renameSync(STATE_PENDING, STATE_FILE);
      console.error('Stato anti-spam promosso a confermato');
    } else {
      console.error('Nessuno stato pending da promuovere (invio non confermato o gia\' promosso)');
    }
    return;
  }

  const all = readJSON(resolve(DIR, 'all-teams.json'));
  if (!all?.teams) { console.error('all-teams.json assente — salto'); return; }

  const riders = readJSON(resolve(DIR, 'riders.json'));
  const constructors = readJSON(resolve(DIR, 'constructors.json'));
  const squads = readJSON(resolve(DIR, 'squads.json'));
  const events = readJSON(resolve(DIR, 'events.json'));
  const rName = nameMap(riders);
  const cName = {}; (constructors || []).forEach(c => { cName[c.id] = c.name; });
  const sName = {}; (squads || []).forEach(s => { sName[s.id] = s.name; });
  const evName = {}; (events || []).forEach(e => { evName[e.id] = (e.displayedName || e.name || '').trim(); });

  const gps = Object.keys(all.teams).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const hasRoster = (gp) => RIVALS.some(p => {
    const t = all.teams[String(gp)]?.[p];
    return t && ((t.riders || []).length || (t.ridersSilver || []).length);
  });
  const curEv = [...gps].reverse().find(hasRoster);
  const prevEv = gps.filter(g => g < curEv).reverse().find(hasRoster);
  if (curEv == null || prevEv == null) { console.error('Mancano GP da confrontare — salto'); return; }

  const cur = all.teams[String(curEv)];
  const prev = all.teams[String(prevEv)];
  const lines = [];
  for (const p of RIVALS) {
    const ct = cur[p] || {}, pt = prev[p] || {};
    const parts = [];
    let changes = 0;
    for (const [field, label] of Object.entries(SLOT)) {
      const pairs = paired(pt[field], ct[field], rName);
      if (pairs.length) {
        parts.push(`${label}: ${fmtPairs(pairs)}`);
        changes += pairs.length;
      }
    }
    const cons = paired(pt.constructors, ct.constructors, cName);
    if (cons.length) { parts.push(`costruttore: ${fmtPairs(cons)}`); changes += cons.length; }
    const sq = paired(pt.squads, ct.squads, sName);
    if (sq.length) { parts.push(`squadra: ${fmtPairs(sq)}`); changes += sq.length; }
    if (parts.length) {
      const limit = changes > 2 ? ` ⚠️ ${changes} cambi (oltre il limite: booster o penalità)` : ` (${changes}/2 cambi)`;
      lines.push(`${p} — ${parts.join(' · ')}${limit}`);
    }
  }
  if (!lines.length) { console.error('Nessun cambio roster rilevato — salto'); return; }

  const gpLabel = evName[curEv] || `GP${curEv}`;
  const msg = `🔄 BoxBox — Cambi squadra rivali (GP${prevEv} → ${gpLabel})\n` + lines.join('\n');

  // Anti-spam: notifica solo se il diff è diverso dall'ultimo stato già inviato
  const hash = createHash('sha256').update(JSON.stringify(lines)).digest('hex').slice(0, 16);
  const state = readJSON(STATE_FILE) || {};
  if (state.evId === curEv && state.hash === hash) {
    console.error('Diff già notificato — salto');
    return;
  }
  writeFileSync(STATE_PENDING, JSON.stringify({ evId: curEv, hash, at: new Date().toISOString() }, null, 2));
  console.log(msg);
}

main().catch(e => { console.error(`team-diff: ${e.message}`); });
