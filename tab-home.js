import { startCountdown, stopCountdown } from './countdown.js';
import { frammento, nodo, nodoSvg } from './dom.js';
import { flagOf, fmtDate, fmtOra } from './format.js';
import { activeEvent, activePlayers, avvioGp, nextScheduledEvent } from './selectors.js';
import { DATA } from './state.js';
import { newsCard } from './tab-news.js';
import { PERCORSI, animateChildren, vaiA } from './ui.js';

/* ─── Blocchi riusati da Home e Live ─── */

/* "Adesso": GP attivo o prossimo, con countdown (id dedicato per non
   sovrapporre Home e Live: entrambe le sezioni restano nel DOM).
   Esportata: la usa anche la stanza Live quando il weekend non e' in corso. */
/* Riga sotto il countdown: dice a cosa si riferisce e quando, in chiaro.
   L'avvio lo decide avvioGp(): prima sessione del prossimo weekend se il server
   l'ha gia' scaricata, altrimenti prima gara del calendario fantasy. */
function avvioHtml(e) {
  const a = avvioGp(e);
  if (!a.iso) return null;
  const etichetta = a.etichetta ? `${a.etichetta} · ` : '';
  const conOra = String(a.iso).includes('T') ? ` ${fmtOra(a.iso)}` : '';
  return nodo('div', { class: 'cd-nota' }, `al via · ${etichetta}${fmtDate(a.iso)}${conOra}`);
}

export function heroNodo(hero, cdId) {
  const liveTag = hero.status === 'active' ? nodo('span', { class: 'tag tag--live' }, 'LIVE') : null;
  const sotto = hero.status !== 'active'
    ? frammento(nodo('div', { class: 'cd', id: cdId }), avvioHtml(hero))
    : nodo('div', { class: 'cd' },
      nodo('div', { class: 'cd-u cd-u--stato' },
        nodo('div', { class: 'cd-n cd-n--stato' }, 'IN CORSO'),
        nodo('div', { class: 'cd-l' }, `${fmtDate(hero.dateStart)} – ${fmtDate(hero.dateEnd)}`)));
  return nodo('div', { class: 'hero' },
    nodo('div', { class: 'hero-r' },
      nodo('span', { class: 'hero-round' }, `Round ${hero.order || hero.id}`),
      nodo('span', { class: 'hero-flag' }, flagOf(hero)),
      liveTag),
    nodo('div', { class: 'hero-name' }, hero.displayedName.trim()),
    nodo('div', { class: 'hero-circuit' }, hero.circuit),
    sotto);
}

/* Scorciatoie: stesse destinazioni della barra in basso, ma in evidenza in Home.
   Icone SVG identiche a quelle della barra (niente emoji), proporzioni in CSS. */
function scorciatoieNodo() {
  const ico = {
    live: [['path', { d: 'M3 12h4l3-8 4 16 3-8h4' }]],
    classifiche: [
      ['path', { d: 'M6 4h12v4a6 6 0 0 1-12 0z' }],
      ['path', { d: 'M4 4h2v2a2 2 0 0 1-2 2zM20 4h-2v2a2 2 0 0 0 2 2z' }],
      ['path', { d: 'M9 14h6l-1 6h-4z' }],
    ],
    fantasy: [['path', { d: 'M13 2L4 14h7l-1 8 9-12h-7z' }]],
    notizie: [
      ['rect', { x: '3', y: '4', width: '18', height: '16', rx: '2' }],
      ['path', { d: 'M7 8h10M7 12h10M7 16h6' }],
    ],
  };
  const voci = [
    { rotta: PERCORSI.live, ico: 'live', name: 'Live', desc: 'Weekend e sessioni' },
    { rotta: PERCORSI.classifiche, ico: 'classifiche', name: 'Classifiche', desc: 'Piloti, team, serie' },
    { rotta: PERCORSI.fantasy, ico: 'fantasy', name: 'Fantasy', desc: 'Lega, rose, prezzi' },
    { rotta: PERCORSI.notizie, ico: 'notizie', name: 'Notizie', desc: 'Feed completo' },
  ];
  return nodo('div', { class: 'scorciatoie' },
    voci.map(v => nodo('button', { type: 'button', class: 'scorciatoia', 'data-vai': v.rotta },
      nodo('span', { class: 'scorciatoia-ico' },
        nodoSvg('svg', {
          viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }, ico[v.ico].map(([tag, attributi]) => nodoSvg(tag, attributi)))),
      nodo('span', { class: 'scorciatoia-nome' }, v.name),
      nodo('span', { class: 'scorciatoia-desc' }, v.desc))));
}

/* Top 3 del campionato: anteprima, mai la classifica completa. Ogni riga porta
   al permalink del pilota (#/pilota/:id). */
function top3Nodo(top3) {
  const righe = top3.map((r, i) => {
    const team = DATA.constById[r.constructorId]?.name || '';
    const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : 'plate plate--bronze';
    const ferito = r.status === 'injured' ? nodo('span', { class: 'injured' }, '●') : null;
    return nodo('div', { class: 'row' + (i === 0 ? ' is-leader' : ''), 'data-rid': r.id, style: 'cursor:pointer' },
      nodo('div', { class: plateCls }, nodo('span', null, r.number || r.id)),
      nodo('div', { class: 'row-m' },
        nodo('div', { class: 'row-name' }, r.firstName + ' ' + r.lastName + (ferito ? ' ' : ''), ferito),
        nodo('div', { class: 'row-sub' }, team)),
      nodo('div', { class: 'row-pts' }, DATA.realPts?.[r.id] ?? 0));
  });
  return nodo('div', { class: 'card' },
    nodo('div', { class: 'card-h' },
      nodo('span', { class: 'card-t' }, 'Top 3 Stagione'),
      nodo('span', { class: 'card-meta' }, 'tocca per il dettaglio')),
    righe);
}

function leaderCallNodo(leader, secondPts) {
  if (!leader) return null;
  return nodo('div', { class: 'leader-call', 'data-go': 'fantasy' },
    nodo('div', { class: 'leader-call-h' },
      nodo('div', { class: 'card-t' }, '⚡ Fantasy · Leader'),
      nodo('span', { class: 'leader-call-arrow' }, '→')),
    nodo('div', { class: 'leader-call-name' }, '@' + leader.displayName),
    nodo('div', { style: 'display:flex;align-items:baseline;gap:6px' },
      nodo('span', { class: 'leader-call-num' }, leader.overallPoints),
      nodo('span', { style: 'font-family:var(--f-mono);font-size:11px;color:var(--text-faint);letter-spacing:.12em' }, 'PT')),
    nodo('div', { class: 'leader-call-meta' },
      nodo('span', null, '+' + (leader.overallPoints - secondPts).toFixed(1) + ' dal 2°'),
      nodo('span', null, 'Valore team €' + (leader.teamValue / 1e6).toFixed(1) + 'M')));
}

/* Al massimo tre notizie: il feed completo sta nella stanza Notizie. */
function newsMiniNodo() {
  const items = DATA.news?.items || [];
  if (!items.length) return null;
  return frammento(
    nodo('div', { class: 'news-h' },
      nodo('span', { class: 'news-h-t' }, 'Ultime notizie'),
      nodo('span', { class: 'news-h-src' }, DATA.news.source || 'motorsport.com')),
    items.slice(0, 3).map(n => newsCard(n)),
    nodo('button', { type: 'button', class: 'news-more', id: 'news-tutte' }, 'Tutte le notizie →'));
}

/* ═════════════════════════════════════════════════════════
   HOME — cruscotto: "Adesso", scorciatoie, anteprime. Nessuna lista completa.
   ═════════════════════════════════════════════════════════ */
export function renderHome() {
  const root = document.getElementById('s-home');
  const active = activeEvent();
  const next = active ? null : nextScheduledEvent();
  const hero = active || next;
  const top3 = DATA.riders.filter(r => r.status !== 'disqualified').sort((a,b) => (DATA.realPts?.[b.id] ?? 0) - (DATA.realPts?.[a.id] ?? 0)).slice(0, 3);
  const leader = activePlayers()[0];
  const secondPts = activePlayers()[1]?.overallPoints ?? 0;

  const contenuto = [];
  contenuto.push(nodo('div', { class: 'f-subtitle' }, nodo('span', null, 'Adesso')));
  if (hero) {
    contenuto.push(heroNodo(hero, 'cd'));
    if (hero.status !== 'active') {
      const inizio = avvioGp(hero).iso;
      if (inizio) setTimeout(() => startCountdown(inizio, 'cd'), 50);
    } else stopCountdown('cd');
  } else {
    contenuto.push(nodo('div', { class: 'card' },
      nodo('div', { class: 'empty', style: 'padding:16px' }, 'Nessun GP in calendario.')));
  }

  contenuto.push(nodo('div', { class: 'f-subtitle', style: 'margin-top:12px' }, nodo('span', null, 'Scorciatoie')));
  contenuto.push(scorciatoieNodo());

  contenuto.push(top3Nodo(top3));
  contenuto.push(leaderCallNodo(leader, secondPts));
  contenuto.push(newsMiniNodo());
  contenuto.push(nodo('div', { class: 'fade-pad' }));

  root.replaceChildren(frammento(contenuto));
  animateChildren(root);

  root.querySelectorAll('[data-vai]').forEach(el => {
    el.addEventListener('click', () => vaiA(el.dataset.vai));
  });
  root.querySelectorAll('[data-rid]').forEach(el => {
    el.addEventListener('click', () => vaiA(PERCORSI.pilota(el.dataset.rid)));
  });
  root.querySelector('.leader-call')?.addEventListener('click', () => vaiA(PERCORSI.fantasy));
  root.querySelector('#news-tutte')?.addEventListener('click', () => vaiA(PERCORSI.notizie));
}

/* ═════════════════════════════════════════════════════════
   LIVE — stanza provvisoria (Tappa 2): riusa i blocchi gia' esistenti.
   La normalizzazione del feed e la vista definitiva arrivano nella Tappa 3.
   ═════════════════════════════════════════════════════════ */
export function renderLive() {
  const root = document.getElementById('s-live');
  const active = activeEvent();
  const next = active ? null : nextScheduledEvent();
  const hero = active || next;
  const last = lastCompletedEvent();

  const contenuto = [];
  contenuto.push(nodo('div', { class: 'f-subtitle' }, nodo('span', null, 'Adesso')));
  if (hero) {
    contenuto.push(heroNodo(hero, 'cd-live'));
    if (hero.status !== 'active') setTimeout(() => startCountdown(hero.dateStart, 'cd-live'), 50);
    else stopCountdown('cd-live');
  } else {
    contenuto.push(nodo('div', { class: 'card' },
      nodo('div', { class: 'empty', style: 'padding:16px' }, 'Nessun GP in corso o in arrivo.')));
  }

  contenuto.push(weekendCardHtml());
  contenuto.push(ultimoGpHtml(last));
  contenuto.push(nodo('div', { class: 'fade-pad' }));

  root.replaceChildren(frammento(contenuto));
  animateChildren(root);
}
