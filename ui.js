import { stopCountdown } from './countdown.js';
import { activeEvent, effectiveStatus } from './selectors.js';
import { DATA, currentTab, setCurrentTab } from './state.js';
import { renderHome } from './tab-home.js';
import { impostaLiveVista, renderLive } from './tab-live.js';
import { renderNews } from './tab-news.js';
import { renderFantasy } from './tab-fantasy.js';
import { renderSettings } from './tab-other.js';
import { impostaVistaStandings, renderStandings } from './tab-standings.js';

/* Titolo della topbar. Non prende HTML: il badge "Live" si costruisce come nodo
   in mostraBadgeLive(), cosi' da qui non si inietta markup. */
export function setTopbar(eyebrow, title) {
  document.getElementById('topbar-eyebrow').textContent = eyebrow;
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-r').replaceChildren();
}

/* Badge "Live" nella topbar: nodo costruito a mano, non una stringa HTML. */
function mostraBadgeLive() {
  const r = document.getElementById('topbar-r');
  const dot = document.createElement('span');
  dot.className = 'live-dot';
  dot.textContent = 'Live';
  r.replaceChildren(dot);
}

/* ═════════════════════════════════════════════════════════
   STANZE (render)
   ═════════════════════════════════════════════════════════ */
/* Renderizza la sezione della rotta. Non decide niente sulla navigazione: la
   vista (lista, sotto-vista, mount) e' gia' stata impostata dal router. La
   sezione puo' non coincidere con la stanza della barra in basso: l'Analisi e'
   un mount interno che tiene evidenziata la stanza Fantasy. */
function mostraStanza(rotta) {
  const sezione = rotta.sezione;
  if (rotta.stanza) setCurrentTab(rotta.stanza);

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('is-active'));
  const scr = document.getElementById('s-' + sezione);
  scr.classList.add('is-active');
  const btn = rotta.stanza ? document.querySelector('.bnav-btn[data-tab="' + rotta.stanza + '"]') : null;
  if (btn) btn.classList.add('is-active');
  const ingranaggio = document.getElementById('btn-impostazioni');
  if (ingranaggio) ingranaggio.classList.toggle('is-active', sezione === 'settings' || rotta.menu === 'settings');

  /* Topbar contestuale */
  const titoli = {
    home: ['STAGIONE 2026', 'Box Box'],
    live: ['Weekend', 'Live'],
    standings: ['Stagione 2026', 'Classifiche'],
    fantasy: ['Lega privata', 'Fantasy'],
    news: ['Motorsport', 'Notizie'],
    settings: ['Box Box', 'Impostazioni']
  };
  const titolo = titoli[sezione] || titoli.home;
  setTopbar(titolo[0], titolo[1]);
  if (activeEvent()) mostraBadgeLive();

  /* Un solo countdown per volta: Home e Live usano due elementi distinti
     (id="cd" e id="cd-live"), altrimenti il timer di uno aggiornerebbe
     l'elemento dell'altro, che resta nel DOM anche da nascosto. */
  if (sezione !== 'home') stopCountdown('cd');
  if (sezione !== 'live') stopCountdown('cd-live');

  if (sezione === 'home') renderHome();
  if (sezione === 'live') renderLive();
  if (sezione === 'standings') renderStandings();
  if (sezione === 'fantasy') renderFantasy();
  if (sezione === 'news') renderNews();
  if (sezione === 'settings') renderSettings();

  /* Il toggle Campionato/FantasyGP cambia i punti delle classifiche MotoGP:
     sulle altre serie non ha effetto, quindi non si mostra. */
  const modeToggle = document.getElementById('mode-toggle');
  if (modeToggle) {
    modeToggle.classList.toggle('is-visible',
      sezione === 'standings' && rotta.vistaClassifiche?.standingsView !== 'altre');
  }

  /* (re-)triggera lo stagger sui figli della sezione attiva */
  animateChildren(scr);
}

/* Aggiunge la classe .anim-in ai figli per far ripartire l'animazione di entrata.
   Necessario perché animation: ... both su display:none non si avvia in Chrome
   finché il display non torna visibile, e re-toggling della classe genitore non
   re-triggera l'animazione. */
export function animateChildren(scr) {
  const kids = [...scr.children];
  kids.forEach(c => c.classList.remove('anim-in'));
  /* force reflow per resettare lo stato dell'animazione */
  void scr.offsetWidth;
  kids.forEach(c => c.classList.add('anim-in'));
}

/* ═════════════════════════════════════════════════════════
   ROTTE HASH — unica fonte della navigazione
   Le sotto-viste stanno sotto la stanza che le contiene, cosi' un hash diretto
   o un reload riaprono la vista che si stava guardando. I permalink piatti
   (#/gp/:id, #/pilota/:id, #/serie/:id) arrivano nella Tappa 4.
   ═════════════════════════════════════════════════════════ */
export const PERCORSI = {
  home: '#/home',
  live: '#/live',
  liveSessione: id => '#/live/sessione/' + id,
  classifiche: '#/classifiche',
  classificheCostruttori: '#/classifiche/costruttori',
  classificheTeam: '#/classifiche/team',
  classificheCalendario: '#/classifiche/calendario',
  classificheAltre: '#/classifiche/altre',
  /* Permalink (Tappa 4): la navigazione dell'app usa queste forme piatte, le
     forme annidate sotto #/classifiche restano accettate dal parser. */
  pilota: id => '#/pilota/' + id,
  gp: id => '#/gp/' + id,
  serie: id => '#/serie/' + id,
  /* Rotte annidate ancora usate dalle sotto-viste di Classifiche. */
  programma: id => '#/classifiche/programma/' + id,
  sessione: (gpId, sid) => '#/classifiche/programma/' + gpId + '/sessione/' + sid,
  fantasy: '#/fantasy',
  notizie: '#/notizie',
  impostazioni: '#/impostazioni'
};

/* Percorso della stanza di ogni bottone della barra in basso (data-tab). */
const PERCORSO_STANZA = {
  home: PERCORSI.home,
  live: PERCORSI.live,
  standings: PERCORSI.classifiche,
  fantasy: PERCORSI.fantasy,
  news: PERCORSI.notizie
};

/* Semi salvati da una versione precedente dell'app: bbTab poteva valere "other"
   (la stanza "Altre" non esiste piu', le serie sono scese sotto Classifiche).
   Un valore ignoto ricade su Home. */
const SEME_LEGACY = { other: PERCORSI.classifiche };

/* Naviga scrivendo l'hash: non renderizza niente da sola, il render lo fa
   l'evento hashchange. Se l'hash e' gia' quello non si crea una voce in piu'. */
export function vaiA(hash) {
  if (!hash || location.hash === hash) return;
  location.hash = hash;
}

/* Da hash a rotta. Hash assente o stanza sconosciuta → Home; sotto-vista
   sconosciuta → vista base della sua stanza, mai uno schermo vuoto. */
function parseRotta(hash) {
  const segmenti = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '').split('/').filter(Boolean);

  if (segmenti[0] === 'classifiche') {
    return rottaClassifiche(parseVistaClassifiche(segmenti.slice(1)));
  }
  /* Permalink piatti (Tappa 4). #/gp/:id risolve da solo la vista giusta; per
     pilota e serie basta la vista base con l'entita' scelta. */
  if (segmenti[0] === 'gp' && segmenti[1]) return risolviGp(segmenti[1]);
  if (segmenti[0] === 'pilota' && segmenti[1]) {
    return rottaClassifiche({ ...VISTA_BASE, selectedRiderId: segmenti[1] });
  }
  if (segmenti[0] === 'serie' && segmenti[1]) {
    return rottaClassifiche({ ...VISTA_BASE, standingsView: 'altre', selectedSerie: segmenti[1] });
  }
  if (segmenti[0] === 'live') {
    const sid = (segmenti[1] === 'sessione' && segmenti[2]) ? segmenti[2] : null;
    return { chiave: 'live:' + (sid || ''), stanza: 'live', sezione: 'live', vistaLive: sid };
  }
  if (segmenti[0] === 'fantasy') return { chiave: 'fantasy', stanza: 'fantasy', sezione: 'fantasy' };
  if (segmenti[0] === 'notizie') return { chiave: 'news', stanza: 'news', sezione: 'news' };
  if (segmenti[0] === 'impostazioni') return { chiave: 'settings', stanza: null, sezione: 'settings' };
  return { chiave: 'home', stanza: 'home', sezione: 'home' };
}

/* Stato base di una vista di Classifiche: nessuna sotto-vista selezionata. */
const VISTA_BASE = {
  standingsView: 'riders', selectedSerie: null, selectedResultGp: null, selectedRiderId: null,
  selectedProgramGp: null, selectedProgramSession: null
};

/* Una vista di Classifiche con la sua chiave: la chiave e' la stessa per la
   forma piatta e per quella annidata, cosi' cambiare forma non rende due volte. */
function rottaClassifiche(vista) {
  return {
    chiave: 'classifiche:' + [vista.standingsView, vista.selectedSerie, vista.selectedResultGp, vista.selectedRiderId, vista.selectedProgramGp, vista.selectedProgramSession].join('|'),
    stanza: 'standings',
    sezione: 'standings',
    vistaClassifiche: vista
  };
}

/* #/gp/:id — un indirizzo per GP, la vista la decide lo stato dell'evento:
   concluso → risultati, in corso → stanza Live, futuro → programma del weekend.
   Un id inesistente non e' un errore: si apre la vista risultati, che ha gia'
   lo stato vuoto "GP non trovato". */
function risolviGp(gpId) {
  const id = String(gpId);
  const ev = (DATA.events || []).find(e => String(e.id) === id);
  const stato = ev ? effectiveStatus(ev) : null;
  if (stato === 'active') {
    return { chiave: 'live', stanza: 'live', sezione: 'live', vistaLive: null };
  }
  return rottaClassifiche({
    ...VISTA_BASE,
    standingsView: 'calendar',
    selectedResultGp: (stato === 'complete' || !ev) ? id : null,
    selectedProgramGp: (ev && stato !== 'complete') ? id : null
  });
}

function parseVistaClassifiche(parti) {
  const base = { ...VISTA_BASE };
  const [a, b, c, d] = parti;
  if (a === 'costruttori') return { ...base, standingsView: 'constructors' };
  if (a === 'team') return { ...base, standingsView: 'squads' };
  if (a === 'calendario') return { ...base, standingsView: 'calendar' };
  /* Qualsiasi id passa: la whitelist delle serie vive dove si disegna la
     classifica, cosi' un id inesistente produce uno stato vuoto e non un menu. */
  if (a === 'altre') return { ...base, standingsView: 'altre', selectedSerie: b || null };
  if (a === 'pilota' && b) return { ...base, selectedRiderId: b };
  if (a === 'gp' && b) return { ...base, standingsView: 'calendar', selectedResultGp: b };
  if (a === 'programma' && b) {
    const vista = { ...base, standingsView: 'calendar', selectedProgramGp: b };
    if (c === 'sessione' && d) vista.selectedProgramSession = d;
    return vista;
  }
  return base;
}

let rottaApplicata = null;

/* Renderizza la rotta dell'hash corrente. La stessa rotta non viene
   renderizzata due volte: all'avvio, con hash assente, setupNav() scrive
   l'hash e il suo hashchange arriva subito dopo. Con forza=true si ridisegna
   anche una rotta gia' applicata (lo usa il refresh dei dati). */
function applicaRotta(forza) {
  const rotta = parseRotta(location.hash);
  if (forza !== true && rotta.chiave === rottaApplicata) return;
  rottaApplicata = rotta.chiave;
  if (rotta.sezione === 'standings') impostaVistaStandings(rotta.vistaClassifiche);
  else if (rotta.sezione === 'live') impostaLiveVista(rotta.vistaLive);
  mostraStanza(rotta);
}

/* Ridisegna la rotta corrente. La chiama il refresh dei dati (pull-to-refresh e
   auto-aggiornamento) al posto di un giro su tutte le stanze: aggiorna la vista
   che si sta guardando, sotto-viste comprese. */
export function rendiRottaCorrente() { applicaRotta(true); }

/* Avvia il router. Va chiamata quando i dati sono caricati: renderizza subito
   la rotta dell'hash. Se l'hash manca (avvio della PWA: start_url "/") la
   stanza iniziale e' quella dell'ultima visita, letta da localStorage. */
export function setupNav() {
  window.addEventListener('hashchange', () => applicaRotta());

  document.getElementById('bnav').addEventListener('click', e => {
    const btn = e.target.closest('.bnav-btn');
    if (!btn) return;
    vaiA(PERCORSO_STANZA[btn.dataset.tab] || PERCORSI.home);
  });

  const ingranaggio = document.getElementById('btn-impostazioni');
  if (ingranaggio) ingranaggio.addEventListener('click', () => vaiA(PERCORSI.impostazioni));

  if (!location.hash) {
    location.replace(PERCORSO_STANZA[currentTab] || SEME_LEGACY[currentTab] || PERCORSI.home);
  }
  applicaRotta();
}

export function renderAll() {
  renderHome();
  renderLive();
  renderStandings();
  renderFantasy();
  renderNews();
  /* Il modulo Analisi non entra qui: e' privato e si carica solo aprendolo. */
  if (activeEvent()) mostraBadgeLive();
}

/* ═════════════════════════════════════════════════════════
   PULL TO REFRESH
   ═════════════════════════════════════════════════════════ */
