// fetch-weekend.mjs — dati di sessione del weekend di gara da API MotoGP pubblica
// Uso: node fetch-weekend.mjs [--dry-run]
// Non usa credenziali: gli stessi endpoint pubblici di fetch-rider-history.mjs.
// Scrive weekend.json (poi il cron lo copia in dist/data/), atomico via .tmp+rename.

import { writeFileSync, renameSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://api.motogp.pulselive.com/motogp/v1';
const CAT_MOTOGP = 'e8c110ad-64aa-4e8e-8a86-f2f152f6a942';
const DELAY_MS = 150;
const RETRY_MS = [500, 2000, 5000];

const DRY_RUN = process.argv.includes('--dry-run');
const CURRENT_YEAR = new Date().getFullYear();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── Fusi orari dell'API MotoGP ───
   L'API restituisce l'orario locale del circuito etichettato `+00:00`, ma non
   e' UTC: e' l'ora del muro del circuito (a Spielberg le 10:50 sono le 10:50
   locali, non le 10:50 UTC). Il browser invece converte sempre nel fuso del
   dispositivo, quindi senza riallineamento ogni orario della stanza Live
   risultava spostato (in Italia +2h, a Motegi +9h). Qui la data torna a essere
   UTC vera; la UI continua a mostrarla nel fuso di chi guarda, come deve. */
const FUSO_NAZIONE = {
  THA: 'Asia/Bangkok', BRA: 'America/Sao_Paulo', USA: 'America/Chicago',
  SPA: 'Europe/Madrid', FRA: 'Europe/Paris', ITA: 'Europe/Rome',
  HUN: 'Europe/Budapest', CZE: 'Europe/Prague', NED: 'Europe/Amsterdam',
  GER: 'Europe/Berlin', GBR: 'Europe/London', AUT: 'Europe/Vienna',
  JPN: 'Asia/Tokyo', INA: 'Asia/Makassar', AUS: 'Australia/Melbourne',
  MAL: 'Asia/Kuala_Lumpur', QAT: 'Asia/Qatar', POR: 'Europe/Lisbon',
};
/* Nazioni con piu' fusi orari: comanda il circuito (legacy_id dell'API). */
const FUSO_CIRCUITO = {
  101: 'America/Chicago',    /* Circuit of the Americas (Austin, TX) */
  39: 'America/Sao_Paulo',   /* Goiania */
  32: 'Australia/Melbourne', /* Phillip Island (Victoria) */
};

export function fusoDelCircuito(ev) {
  const legacy = ev?.circuit?.legacy_id;
  return FUSO_CIRCUITO[legacy] || FUSO_NAZIONE[ev?.circuit?.nation] || null;
}

/* Il prossimo GP da correre secondo l'API (status NOT-STARTED, il piu' vicino).
   Esportata: serve anche ai test, con eventi finti. */
export function prossimoEventoApi(events) {
  return (events || [])
    .filter(e => e && e.status === 'NOT-STARTED')
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))[0] || null;
}

/* Offset (minuti) di un fuso in un dato istante: "GMT+02:00" → 120. */
function offsetFuso(tz, istante) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(istante).find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const m = nome.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/* "2026-09-19T10:50:00+00:00" (ora locale del circuito travestita da UTC)
   → ISO UTC vero. Due passaggi sull'offset per gestire anche i cambi di ora
   legale (l'offset dipende dall'istante, non solo dal fuso). */
export function dataLocaleAUtc(localIso, tz) {
  if (!tz) return localIso;
  const m = String(localIso || '').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return localIso;
  const muroUtc = Date.parse(m[1] + (m[1].length === 16 ? ':00' : '') + 'Z');
  if (!Number.isFinite(muroUtc)) return localIso;
  const prima = muroUtc - offsetFuso(tz, new Date(muroUtc)) * 60000;
  const seconda = muroUtc - offsetFuso(tz, new Date(prima)) * 60000;
  return new Date(seconda).toISOString();
}

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

/* Classificazione di una sessione, ridotta ai campi che la UI usa. */
function riduciClassifica(cls) {
  return (cls?.classification || []).map(e => ({
    position: e.position ?? null,
    name: e.rider?.full_name || '',
    number: e.rider?.number ?? null,
    team: e.team?.name || '',
    constructor: e.constructor?.name || '',
    bestLap: e.best_lap?.time || null,
    bestLapNumber: e.best_lap?.number ?? null,
    totalLaps: e.total_laps ?? null,
    topSpeed: e.top_speed ?? null,
    gapFirst: e.gap?.first ?? null,
    status: e.status || null,
  }));
}

/* Il feed del live timing risponde 200 con corpo vuoto fuori sessione: non e'
   un errore, e' "nessun tabellone disponibile". Stessa cosa per un corpo che
   non e' JSON. */
async function testoOpzionale(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BoxBox/2.0 (MotoGP Dashboard)' } });
    if (!res.ok) return null;
    const txt = await res.text();
    return txt.trim() ? txt : null;
  } catch {
    return null;
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* Feed timing-gateway/livetiming-lite → tabellone normalizzato.
   Forma attesa (documentata a monte, non garantita): { head: {...},
   rider: { "<id>": { pos, rider_number, rider_name, rider_surname, team_name,
   bike_name, lap_time, last_lap_time, num_lap, gap_first, gap_prev, on_pit } } }.
   Ogni campo e' letto con la sua guardia: se la forma cambia si torna null e la
   stanza Live degrada a programma + ultima classifica, mai un errore. */
export function normalizzaLive(feed) {
  if (!feed || typeof feed !== 'object') return null;
  const head = (feed.head && typeof feed.head === 'object') ? feed.head : {};
  const righe = (feed.rider && typeof feed.rider === 'object') ? Object.values(feed.rider) : [];

  const board = righe
    .filter(r => r && typeof r === 'object' && num(r.pos ?? r.order) != null)
    .map(r => {
      const grezza = num(r.pos ?? r.order);
      return {
        /* Posizione valida solo se positiva: il feed marca i ritirati con -1.
           -1 non e' una posizione, e con il sort crescente finiva in testa;
           diventa null e la riga va in fondo, dove la UI scrive DNF. */
        pos: grezza > 0 ? grezza : null,
        number: r.rider_number == null ? null : String(r.rider_number),
        /* Solo stringhe: se il feed cambia forma (nome oggetto/numero) la riga
           resta senza nome e viene scartata invece di mostrare "[object Object]". */
        name: [r.rider_name, r.rider_surname].filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).join(' ')
          || (typeof r.rider_shortname === 'string' ? r.rider_shortname.trim() : ''),
        team: typeof r.team_name === 'string' ? r.team_name : '',
        bike: typeof r.bike_name === 'string' ? r.bike_name : '',
        lapTime: typeof r.lap_time === 'string' ? r.lap_time : null,
        lastLap: typeof r.last_lap_time === 'string' ? r.last_lap_time : null,
        laps: num(r.num_lap),
        gapFirst: typeof r.gap_first === 'string' ? r.gap_first : null,
        gapPrev: typeof r.gap_prev === 'string' ? r.gap_prev : null,
        onPit: r.on_pit === true,
      };
    })
    .filter(r => r.name)
    .sort((a, b) => (a.pos ?? Number.MAX_SAFE_INTEGER) - (b.pos ?? Number.MAX_SAFE_INTEGER));

  if (!board.length) return null;
  return {
    sessionName: typeof head.session_name === 'string' ? head.session_name : null,
    sessionShortName: typeof head.session_shortname === 'string' ? head.session_shortname : null,
    /* Il tabellone puo' essere di un'altra classe (Moto2/Moto3) mentre il
       weekend della stanza Live e' MotoGP: senza la categoria l'intestazione
       "Diretta · Q2" sembrava riferirsi alla MotoGP. */
    category: typeof head.category === 'string' && head.category.trim() ? head.category.trim() : null,
    statusName: typeof head.session_status_name === 'string' ? head.session_status_name : null,
    remainingMs: num(head.remaining),
    board,
  };
}

async function main() {
  console.log(`fetch-weekend: avvio${DRY_RUN ? ' (--dry-run, nessuna scrittura)' : ''}`);

  /* events.json (fantasy) serve solo a collegare il GP API al GP del calendario
     BoxBox. Se non c'e' si procede lo stesso: il match resta null. */
  let fantasyEvents = [];
  try { fantasyEvents = JSON.parse(readFileSync(resolve(DIR, 'events.json'), 'utf8')); }
  catch { console.log('  WARN events.json non leggibile: nessun collegamento al calendario fantasy'); }

  const seasons = await J(`${BASE}/results/seasons`); await sleep(DELAY_MS);
  const season = seasons.find(s => s.year === CURRENT_YEAR) || seasons.find(s => s.current);
  if (!season) throw new Error(`nessuna stagione ${CURRENT_YEAR} su API`);

  const events = (await J(`${BASE}/results/events?seasonUuid=${season.id}`)).filter(e => !e.test);
  await sleep(DELAY_MS);
  /* Weekend in corso se l'API segna CURRENT; altrimenti l'ultimo evento concluso. */
  const current = events.find(e => e.status === 'CURRENT');
  const finished = events.filter(e => e.status === 'FINISHED').sort((a, b) => new Date(b.date_start) - new Date(a.date_start));
  const ev = current || finished[0];
  if (!ev) throw new Error('nessun evento corrente o concluso trovato');

  const fantasyMatch = fantasyEvents.find(fe => fe.shortName && ev.short_name && fe.shortName === ev.short_name);
  const nextApi = prossimoEventoApi(events);

  const sessionsRaw = await J(`${BASE}/results/sessions?eventUuid=${ev.id}&categoryUuid=${CAT_MOTOGP}`); await sleep(DELAY_MS);

  /* Cache: se il file precedente riguarda lo stesso GP e una sessione ha gia' la
     sua classificazione con lo stesso stato, non la richiediamo di nuovo. */
  let prev = null;
  try { prev = JSON.parse(readFileSync(resolve(DIR, 'weekend.json'), 'utf8')); } catch { prev = null; }
  const prevSessions = (prev && prev.event && prev.event.apiId === ev.id) ? (prev.sessions || []) : [];

  const sessions = [];
  const fuso = fusoDelCircuito(ev);
  if (!fuso) console.log(`  WARN nessun fuso noto per ${ev.circuit?.nation || '?'} — orari lasciati come dall'API`);
  for (const s of sessionsRaw) {
    const old = prevSessions.find(x => x.id === s.id);
    const riusa = old && old.status === s.status && Array.isArray(old.classification) && old.classification.length;
    let classification = riusa ? old.classification : [];
    if (!riusa && (s.status === 'FINISHED' || s.status === 'STARTED')) {
      try {
        const cls = await J(`${BASE}/results/session/${s.id}/classification`); await sleep(DELAY_MS);
        classification = riduciClassifica(cls);
      } catch (e) {
        console.log(`  WARN classificazione ${s.type}${s.number || ''} non disponibile (${e.message})`);
      }
    }
    sessions.push({
      id: s.id,
      type: s.type,
      number: s.number ?? null,
      /* date: UTC vera (per la UI, che la converte nel fuso del dispositivo);
         dateLocal: come arriva dall'API, ora locale del circuito. */
      date: dataLocaleAUtc(s.date, fuso),
      dateLocal: s.date,
      status: s.status,
      classification,
    });
  }

  /* Sessione in corso (STARTED) e prossima (prima non iniziata, per orario). */
  const ordinate = sessions.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const corrente = sessions.find(s => s.status === 'STARTED') || null;
  const prossima = ordinate.find(s => s.status !== 'FINISHED' && s.status !== 'STARTED') || null;

  /* Tabellone del live timing: si prova solo durante un weekend in corso. Il feed
     risponde 200 col corpo vuoto quando nessuno e' in pista e puo' cambiare
     forma: in entrambi i casi si resta senza tabellone e la stanza Live mostra
     programma + ultima classifica. */
  let live = null;
  if (ev.status === 'CURRENT') {
    const testo = await testoOpzionale(`${BASE}/timing-gateway/livetiming-lite`);
    await sleep(DELAY_MS);
    if (testo) {
      try { live = normalizzaLive(JSON.parse(testo)); }
      catch { live = null; console.log('  WARN livetiming-lite non decodificabile: tabellone assente'); }
      if (!live) console.log('  WARN livetiming-lite senza righe utili: tabellone assente');
    } else {
      console.log('  INFO livetiming-lite vuoto: nessuna sessione in pista');
    }
  }
  const liveOut = {
    fetchedAt: live ? new Date().toISOString() : null,
    category: live ? live.category : null,
    sessionName: live ? live.sessionName : null,
    sessionShortName: live ? live.sessionShortName : null,
    statusName: live ? live.statusName : null,
    remainingMs: live ? live.remainingMs : null,
    board: live ? live.board : [],
  };

  /* Sessioni del prossimo GP: senza queste la stanza Calendario conosce solo le
     quattro gare del calendario fantasy, non l'intero programma del weekend, e
     il countdown non sa quando comincia il venerdi'. Una chiamata in piu' per
     giro di cron, con la stessa normalizzazione del weekend in corso. */
  let nextOut = null;
  if (nextApi) {
    try {
      const rawNext = await J(`${BASE}/results/sessions?eventUuid=${nextApi.id}&categoryUuid=${CAT_MOTOGP}`);
      await sleep(DELAY_MS);
      const fusoNext = fusoDelCircuito(nextApi);
      if (!fusoNext) console.log(`  WARN nessun fuso noto per ${nextApi.circuit?.nation || '?'} (prossimo GP) — orari lasciati come dall'API`);
      const fantasyNext = fantasyEvents.find(fe => fe.shortName && nextApi.short_name && fe.shortName === nextApi.short_name);
      nextOut = {
        event: {
          apiId: nextApi.id,
          shortName: nextApi.short_name || null,
          name: nextApi.name || null,
          circuit: nextApi.circuit?.name || null,
          status: nextApi.status || null,
          dateStart: nextApi.date_start || null,
          dateEnd: nextApi.date_end || null,
          fantasyId: fantasyNext ? fantasyNext.id : null,
        },
        sessions: (Array.isArray(rawNext) ? rawNext : []).map(s => ({
          id: s.id,
          type: s.type,
          number: s.number ?? null,
          date: dataLocaleAUtc(s.date, fusoNext),
          dateLocal: s.date,
          status: s.status,
          classification: [], /* il prossimo weekend non ha ancora classifiche */
        })),
      };
      console.log(`  prossimo GP: ${nextOut.event.shortName} — ${nextOut.sessions.length} sessioni`);
    } catch (e) {
      console.log(`  WARN sessioni del prossimo GP non disponibili (${e.message})`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    season: CURRENT_YEAR,
    event: {
      apiId: ev.id,
      shortName: ev.short_name || null,
      name: ev.name || null,
      circuit: ev.circuit?.name || null,
      status: ev.status || null,
      dateStart: ev.date_start || null,
      dateEnd: ev.date_end || null,
      fantasyId: fantasyMatch ? fantasyMatch.id : null,
    },
    sessions,
    /* Sessione in corso e prossima: le calcola il server una volta sola, cosi'
       la stanza Live non deve indovinare (e il browser non chiama nessuna API). */
    currentSessionId: corrente ? corrente.id : null,
    nextSessionId: prossima ? prossima.id : null,
    next: nextOut,
    live: liveOut,
  };

  const conClassifica = sessions.filter(s => s.classification.length).length;
  console.log(`  GP ${ev.short_name} [${ev.status}] — ${sessions.length} sessioni, ${conClassifica} con classifica`);  console.log(`  live: ${liveOut.board.length ? liveOut.board.length + ' piloti nel tabellone' + (liveOut.category ? ' (' + liveOut.category + ')' : '') : 'nessun tabellone (fuori sessione o feed assente)'}`);
  const dim = JSON.stringify(out).length;
  console.log(`  weekend.json: ${(dim / 1024).toFixed(1)} KB`);

  if (DRY_RUN) { console.log('DRY RUN: nessuna scrittura su disco.'); return; }

  const finale = resolve(DIR, 'weekend.json');
  const tmp = finale + '.tmp';
  writeFileSync(tmp, JSON.stringify(out));
  renameSync(tmp, finale);
  console.log('DONE — weekend.json salvato');
}

/* Il file si lancia dal cron ma resta importabile per i test: main() parte solo
   quando e' eseguito come script, non quando normalizzaLive viene importata. */
const lanciatoDirettamente = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (lanciatoDirettamente) {
  main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
}
