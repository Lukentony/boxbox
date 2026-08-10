import { writeFileSync, renameSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://api.motogp.pulselive.com/motogp/v1';
/* Costante dal 2010 al 2026 (verificato) — evita una chiamata /results/categories per evento */
const CAT_MOTOGP = 'e8c110ad-64aa-4e8e-8a86-f2f152f6a942';
const CAT_LEGACY = 3;
const DELAY_MS = 150;
const RETRY_MS = [500, 2000, 5000];
const SEASONS_BACK = 3;       /* ultime 3 stagioni complete: le sprint esistono solo dal 2023 */
const MIN_MATCH_FRAC = 0.6;   /* sotto questa soglia il file vecchio non viene sovrascritto */

const DRY_RUN = process.argv.includes('--dry-run');
const CURRENT_YEAR = new Date().getFullYear();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function J(url) {
  let ultimo;
  for (let i = 0; i <= RETRY_MS.length; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'BoxBox/2.0 (MotoGP Dashboard)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      ultimo = e;
      if (i < RETRY_MS.length) await sleep(RETRY_MS[i]);
    }
  }
  throw new Error(`${url} — ${ultimo.message}`);
}

function normCognome(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
}

/* Bucket vuoto per l'aggregazione bagnato/asciutto di un pilota */
function nuovoBucket() { return { gara: { n: 0, sommaPos: 0 }, competitive: { n: 0, sommaPos: 0 }, tutte: { n: 0, sommaPos: 0 } }; }

function aggiungiAlBucket(bucket, tipoSessione, posizione) {
  if (posizione == null) return; /* DNF: nessuna posizione media significativa */
  bucket.tutte.n++; bucket.tutte.sommaPos += posizione;
  if (tipoSessione === 'RAC' || tipoSessione === 'SPR' || tipoSessione === 'Q') {
    bucket.competitive.n++; bucket.competitive.sommaPos += posizione;
  }
  if (tipoSessione === 'RAC') {
    bucket.gara.n++; bucket.gara.sommaPos += posizione;
  }
}

function chiudiBucket(bucket) {
  const out = {};
  for (const k of ['gara', 'competitive', 'tutte']) {
    const b = bucket[k];
    out[k] = { n: b.n, posMedia: b.n ? Math.round((b.sommaPos / b.n) * 10) / 10 : null };
  }
  return out;
}

async function main() {
  console.log(`fetch-rider-history: avvio${DRY_RUN ? ' (--dry-run, una sola stagione, nessuna scrittura)' : ''}`);

  const fantasyRiders = JSON.parse(readFileSync(resolve(DIR, 'riders.json'), 'utf8'));
  const fantasyEvents = JSON.parse(readFileSync(resolve(DIR, 'events.json'), 'utf8'));

  const seasons = await J(`${BASE}/results/seasons`); await sleep(DELAY_MS);
  const yearsWanted = DRY_RUN
    ? [CURRENT_YEAR - 1]
    : Array.from({ length: SEASONS_BACK }, (_, i) => CURRENT_YEAR - 1 - i);
  const seasonsUsed = [];
  const seasonUuidByYear = {};
  yearsWanted.forEach(y => {
    const s = seasons.find(x => x.year === y);
    if (s) { seasonUuidByYear[y] = s.id; seasonsUsed.push(y); }
    else console.log(`  stagione ${y} non trovata su API, saltata`);
  });
  if (!seasonsUsed.length) throw new Error('nessuna stagione trovata su API');

  /* --- anagrafica stagione corrente: ponte legacy_id (API) <-> id (fantasy), via numero di gara ---
     NB: /riders ignora categoryUuid (bug noto dell'API) — il filtro va fatto lato client. */
  const anagraficaRaw = await J(`${BASE}/riders?seasonYear=${CURRENT_YEAR}&categoryUuid=${CAT_MOTOGP}`); await sleep(DELAY_MS);
  const anagrafica = anagraficaRaw.filter(a => a.current_career_step?.category?.legacy_id === CAT_LEGACY);
  const perNumero = {};
  anagrafica.forEach(a => { perNumero[a.current_career_step.number] = a; });

  const fantasyIdByLegacy = {};
  const nonAbbinati = [];
  fantasyRiders.forEach(r => {
    const a = perNumero[r.number];
    if (!a) {
      nonAbbinati.push({ fantasyId: r.id, numero: r.number, nome: `${r.firstName} ${r.lastName}`,
        motivo: `nessuno storico MotoGP ${CURRENT_YEAR} (numero ${r.number} non trovato in anagrafica API)` });
      return;
    }
    if (normCognome(a.surname) !== normCognome(r.lastName)) {
      console.log(`  WARN numero ${r.number}: cognome fantasy "${r.lastName}" vs API "${a.surname}" — abbinato comunque (numero coincide)`);
    }
    fantasyIdByLegacy[a.legacy_id] = r.id;
  });
  const abbinati = fantasyRiders.length - nonAbbinati.length;
  console.log(`  anagrafica: ${abbinati}/${fantasyRiders.length} piloti fantasy abbinati`);
  nonAbbinati.forEach(n => console.log(`  non abbinato: #${n.numero} ${n.nome} — ${n.motivo}`));

  if (abbinati < MIN_MATCH_FRAC * fantasyRiders.length) {
    throw new Error(`copertura anagrafica troppo bassa (${abbinati}/${fantasyRiders.length}, soglia ${MIN_MATCH_FRAC}) — probabile cambio di formato API`);
  }

  /* --- raccolta storica: eventi -> sessioni -> classification, per ogni stagione --- */
  const circuits = {};       /* circuitLegacyId -> { name, nation, races, wetRaces, wetSessions, sessions } */
  const perRiderAgg = {};    /* fantasyId -> { gare, punti, dnf, perCircuito:{cid:{n,punti,best,dnf}}, bucket }*/
  const ensureRider = fid => (perRiderAgg[fid] = perRiderAgg[fid] || { gare: 0, punti: 0, dnf: 0, perCircuito: {}, bucket: nuovoBucket() });

  /* eventCircuit: id evento fantasy -> circuit.legacy_id, costruito solo dalla stagione corrente
     (short_name non e' una chiave stabile negli anni: Austin AME->USA, Barcelona CAT->SLD->CAT, ecc.) */
  const eventCircuit = {};

  for (const year of seasonsUsed) {
    console.log(`  stagione ${year}...`);
    const events = await J(`${BASE}/results/events?seasonUuid=${seasonUuidByYear[year]}`); await sleep(DELAY_MS);
    const eventiReali = events.filter(e => !e.test);

    for (const ev of eventiReali) {
      const cid = ev.circuit?.legacy_id;
      if (cid == null) continue;
      circuits[cid] = circuits[cid] || { name: (ev.circuit.name || '').trim(), nation: ev.circuit.nation || '', races: 0, wetRaces: 0, wetSessions: 0, sessions: 0 };

      let sessions;
      try { sessions = await J(`${BASE}/results/sessions?eventUuid=${ev.id}&categoryUuid=${CAT_MOTOGP}`); }
      catch (e) { console.log(`    ${ev.short_name} ${year}: sessioni non disponibili (${e.message})`); continue; }
      await sleep(DELAY_MS);

      for (const s of sessions) {
        let cls;
        try { cls = await J(`${BASE}/results/session/${s.id}/classification`); }
        catch (e) { console.log(`    ${ev.short_name} ${year} ${s.type}: classification non disponibile (${e.message})`); continue; }
        await sleep(DELAY_MS);
        const entries = cls.classification || [];

        const track = s.condition?.track; /* 'Dry' | 'Wet' | assente -> sconosciuto, mai defaultato a Dry */
        circuits[cid].sessions++;
        if (track === 'Wet') circuits[cid].wetSessions++;
        if (s.type === 'RAC') {
          circuits[cid].races++;
          if (track === 'Wet') circuits[cid].wetRaces++;
        }

        for (const entry of entries) {
          const fid = fantasyIdByLegacy[entry.rider?.legacy_id];
          if (fid == null) continue; /* pilota storico non nella rosa fantasy corrente */
          const agg = ensureRider(fid);
          const isDnf = entry.position == null;

          if (s.type === 'RAC') {
            agg.gare++;
            agg.punti += entry.points || 0;
            if (isDnf) agg.dnf++;
            const pc = agg.perCircuito[cid] = agg.perCircuito[cid] || { n: 0, punti: 0, best: null, dnf: 0 };
            pc.n++; pc.punti += entry.points || 0;
            if (isDnf) pc.dnf++;
            else pc.best = pc.best == null ? entry.position : Math.min(pc.best, entry.position);
          }

          if (track === 'Dry' || track === 'Wet') {
            const key = track === 'Wet' ? 'bagnato' : 'asciutto';
            agg.bucket[key] = agg.bucket[key] || nuovoBucket();
            aggiungiAlBucket(agg.bucket[key], s.type, entry.position);
          }
        }
      }
    }
  }

  /* eventCircuit dalla stagione corrente: shortName fantasy <-> short_name API, poi risolto in circuit.legacy_id
     (chiamata separata: la stagione in corso non fa parte di seasonsUsed, che copre solo stagioni complete) */
  try {
    const curSeason = seasons.find(x => x.year === CURRENT_YEAR);
    if (curSeason) {
      const curEvents = await J(`${BASE}/results/events?seasonUuid=${curSeason.id}`); await sleep(DELAY_MS);
      const shortToCircuit = {};
      curEvents.filter(e => !e.test).forEach(e => { if (e.circuit?.legacy_id != null) shortToCircuit[e.short_name] = e.circuit.legacy_id; });
      fantasyEvents.forEach(fe => {
        if (fe.shortName && shortToCircuit[fe.shortName] != null) eventCircuit[fe.id] = shortToCircuit[fe.shortName];
      });
      console.log(`  eventCircuit: ${Object.keys(eventCircuit).length}/${fantasyEvents.length} GP fantasy collegati a un circuito storico`);
    }
  } catch (e) {
    console.log(`  WARN costruzione eventCircuit fallita (${e.message}) — il collegamento GP corrente->circuito restera' vuoto`);
  }

  /* --- assembla output finale --- */
  const riders = {};
  Object.entries(perRiderAgg).forEach(([fid, agg]) => {
    const fr = fantasyRiders.find(r => String(r.id) === String(fid));
    const legacy = Object.entries(fantasyIdByLegacy).find(([, v]) => String(v) === String(fid))?.[0];
    const perCircuito = {};
    Object.entries(agg.perCircuito).forEach(([cid, pc]) => {
      perCircuito[cid] = { n: pc.n, punti: pc.punti, media: pc.n ? Math.round((pc.punti / pc.n) * 10) / 10 : 0, best: pc.best, dnf: pc.dnf };
    });
    riders[fid] = {
      legacyId: legacy != null ? Number(legacy) : null,
      fullName: fr ? `${fr.firstName} ${fr.lastName}` : `#${fid}`,
      gare: agg.gare,
      punti: agg.punti,
      dnf: agg.dnf,
      mediaPunti: agg.gare ? Math.round((agg.punti / agg.gare) * 10) / 10 : 0,
      dnfRate: agg.gare ? Math.round((agg.dnf / agg.gare) * 1000) / 1000 : 0,
      perCircuito,
      bagnato: chiudiBucket(agg.bucket.bagnato || nuovoBucket()),
      asciutto: chiudiBucket(agg.bucket.asciutto || nuovoBucket()),
    };
  });

  /* piloti abbinati in anagrafica ma senza nessuna gara nelle stagioni storiche (rookie 2026) */
  fantasyRiders.forEach(r => {
    if (fantasyIdByLegacy[perNumero[r.number]?.legacy_id] === r.id && riders[r.id] == null) {
      nonAbbinati.push({ fantasyId: r.id, numero: r.number, nome: `${r.firstName} ${r.lastName}`,
        motivo: `nessuna gara in MotoGP nelle stagioni ${seasonsUsed.join('-')} (rookie)` });
    }
  });

  const out = {
    generatedAt: new Date().toISOString(),
    season: CURRENT_YEAR,
    seasonsUsed,
    circuits,
    eventCircuit,
    riders,
    nonAbbinati,
  };

  const dim = JSON.stringify(out).length;
  console.log(`  riepilogo: ${Object.keys(riders).length} piloti con storico, ${Object.keys(circuits).length} circuiti, ${(dim / 1024).toFixed(1)} KB`);

  if (DRY_RUN) {
    console.log('DRY RUN: nessuna scrittura su disco.');
    return;
  }

  const finale = resolve(DIR, 'rider-history.json');
  const tmp = finale + '.tmp';
  writeFileSync(tmp, JSON.stringify(out));
  renameSync(tmp, finale);
  console.log(`DONE — rider-history.json salvato (${(dim / 1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
