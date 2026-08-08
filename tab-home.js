import { startCountdown, stopCountdown } from './countdown.js';
import { flagOf, fmtDate, timeAgo } from './format.js';
import { activeEvent, activePlayers, lastCompletedEvent, nextScheduledEvent } from './selectors.js';
import { DATA } from './state.js';
import { animateChildren, switchTab } from './ui.js';

export function renderHome() {
  const root = document.getElementById('s-home');
  const active = activeEvent();
  const next = active ? null : nextScheduledEvent();
  const last = lastCompletedEvent();
  const top3 = DATA.riders.filter(r => r.status !== 'disqualified').sort((a,b) => (DATA.realPts?.[b.id] ?? 0) - (DATA.realPts?.[a.id] ?? 0)).slice(0, 3);
  const leader = activePlayers()[0];
  const secondPts = activePlayers()[1]?.overallPoints ?? 0;

  let h = '';

  /* Hero: prossimo GP (o attivo) */
  const hero = active || next;
  if (hero) {
    const liveTag = hero.status === 'active' ? '<span class="tag tag--live">LIVE</span>' : '';
    h += `
      <div class="hero">
        <div class="hero-r">
          <span class="hero-round">Round ${hero.order || hero.id}</span>
          <span class="hero-flag">${flagOf(hero)}</span>
          ${liveTag}
        </div>
        <div class="hero-name">${hero.displayedName.trim()}</div>
        <div class="hero-circuit">${hero.circuit}</div>
        ${hero.status !== 'active' ? `<div class="cd" id="cd"></div>` :
          `<div class="cd"><div class="cd-u"><div class="cd-n" style="color:var(--accent);background:none;-webkit-text-fill-color:var(--accent)">IN CORSO</div><div class="cd-l">${fmtDate(hero.dateStart)} – ${fmtDate(hero.dateEnd)}</div></div></div>`}
      </div>
    `;
    if (hero.status !== 'active') setTimeout(() => startCountdown(hero.dateStart), 50);
    else stopCountdown();
  }

  /* Top 3 piloti — affiancati */
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">`;
  /* Top 3 Stagione */
  h += `<div class="card" style="margin-bottom:0"><div class="card-h"><span class="card-t">Top 3 Stagione</span></div>`;
  top3.forEach((r, i) => {
    const team = DATA.constById[r.constructorId]?.name || '';
    const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : 'plate plate--bronze';
    const injured = r.status === 'injured' ? ' <span class="injured">●</span>' : '';
    h += `
      <div class="row ${i === 0 ? 'is-leader' : ''}">
        <div class="${plateCls}"><span>${r.number || r.id}</span></div>
        <div class="row-m">
          <div class="row-name">${r.firstName} ${r.lastName}${injured}</div>
          <div class="row-sub">${team}</div>
        </div>
        <div class="row-pts">${DATA.realPts?.[r.id] ?? 0}</div>
      </div>
    `;
  });
  h += `</div>`;
  /* Top 3 Ultimo GP */
  if (last) {
    const lastResults = DATA.riders
      .filter(r => r.stats?.events?.[last.id])
      .map(r => ({ r, e: r.stats.events[last.id] }))
      .sort((a,b) => (b.e.finalPoints || 0) - (a.e.finalPoints || 0))
      .slice(0, 3);
    h += `<div class="card" style="margin-bottom:0"><div class="card-h">
      <span class="card-t">${flagOf(last)} · Gara</span>
      <span class="card-meta">${last.displayedName.trim()}</span>
    </div>`;
    lastResults.forEach((x, i) => {
      const plateCls = i === 0 ? 'plate plate--gold' : i === 1 ? 'plate plate--silver' : 'plate plate--bronze';
      h += `
        <div class="row">
          <div class="${plateCls}"><span>${x.r.number || x.r.id}</span></div>
          <div class="row-m">
            <div class="row-name">${x.r.firstName} ${x.r.lastName}</div>
            <div class="row-sub">${DATA.constById[x.r.constructorId]?.name || ''}</div>
          </div>
          <div class="row-pts">${x.e.finalPoints || 0}<div class="pts-sub">pt gara</div></div>
        </div>
      `;
    });
    h += `</div>`;
  } else {
    h += `<div class="card" style="margin-bottom:0"><div class="card-h"><span class="card-t">Ultimo GP</span></div><div class="empty" style="padding:16px">Nessun GP completato.</div></div>`;
  }
  h += `</div>`; /* fine grid */

  /* Leader Fantasy */
  if (leader) {
    h += `
      <div class="leader-call" data-go="fantasy">
        <div class="leader-call-h">
          <div class="card-t">⚡ Fantasy · Leader</div>
          <span class="leader-call-arrow">→</span>
        </div>
        <div class="leader-call-name">@${leader.displayName}</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span class="leader-call-num">${leader.overallPoints}</span>
          <span style="font-family:var(--f-mono);font-size:11px;color:var(--text-faint);letter-spacing:.12em">PT</span>
        </div>
        <div class="leader-call-meta">
          <span>+${(leader.overallPoints - secondPts).toFixed(1)} dal 2°</span>
          <span>Valore team €${(leader.teamValue/1e6).toFixed(1)}M</span>
        </div>
      </div>
    `;
  }

  /* News — raggruppate per GP imminente, recuperato 2026-08-08 (Claude), stessa causa/nota
     di renderUpcomingEventView sopra: il backend (fetch-news.mjs) produceva upcomingGP/gpRelated
     senza che nessuna UI li leggesse. Codice del 7/06 (commit 12ad823), invariato. */
  if (DATA.news?.items?.length) {
    const upGP = DATA.news.upcomingGP;
    const gpNews = upGP ? DATA.news.items.filter(n => n.gpRelated) : [];
    const restNews = upGP ? DATA.news.items.filter(n => !n.gpRelated) : DATA.news.items;
    const mkCard = n => {
      const ago = timeAgo(n.pubDate);
      const cats = (n.categories || []).filter(c => c !== 'MotoGP').slice(0,1).join('');
      return `<a class="news-card${n.gpRelated ? ' news-card--gp' : ''}" href="${n.link}" target="_blank" rel="noopener">
        ${n.image ? `<img class="news-img" src="${n.image}" alt="" loading="lazy">` : ''}
        <div class="news-body">
          <div class="news-title">${n.title}</div>
          <div class="news-meta">${ago}${cats ? ' · ' + cats : ''}</div>
        </div>
      </a>`;
    };
    if (gpNews.length) {
      h += `<div class="news-h"><span class="news-h-t">🏁 ${upGP.name}</span><span class="news-h-src">${upGP.hoursUntil}h al via</span></div>`;
      gpNews.forEach(n => { h += mkCard(n); });
    }
    const shownRest = restNews.slice(0, gpNews.length ? 4 : 6);
    const moreRest = restNews.slice(gpNews.length ? 4 : 6);
    h += `<div class="news-h"><span class="news-h-t">Ultime notizie</span><span class="news-h-src">${DATA.news.source || 'motorsport.com'}</span></div>`;
    shownRest.forEach(n => { h += mkCard(n); });
    if (moreRest.length) {
      h += `<div class="news-more" id="news-more">Altre ${moreRest.length} notizie ▾</div>`;
    }
  }

  h += `<div class="fade-pad"></div>`;
  root.innerHTML = h;
  animateChildren(root);

  /* deep link */
  root.querySelector('.leader-call')?.addEventListener('click', () => switchTab('fantasy'));

  /* expand news */
  const moreBtn = root.querySelector('#news-more');
  if (moreBtn && DATA.news?.items) {
    moreBtn.addEventListener('click', () => {
      const _upGP = DATA.news.upcomingGP;
      const extra = (_upGP ? DATA.news.items.filter(n => !n.gpRelated) : DATA.news.items).slice(_upGP ? 4 : 6);
      let eh = '';
      extra.forEach(n => {
        const ago = timeAgo(n.pubDate);
        const cats = (n.categories || []).filter(c => c !== 'MotoGP').slice(0,1).join('');
        eh += `<a class="news-card" href="${n.link}" target="_blank" rel="noopener">
          ${n.image ? `<img class="news-img" src="${n.image}" alt="" loading="lazy">` : ''}
          <div class="news-body">
            <div class="news-title">${n.title}</div>
            <div class="news-meta">${ago}${cats ? ' · ' + cats : ''}</div>
          </div>
        </a>`;
      });
      moreBtn.insertAdjacentHTML('beforebegin', eh);
      moreBtn.remove();
    });
  }
}

/* ═════════════════════════════════════════════════════════
   CAMPIONATO (PILOTI / COSTRUTTORI / TEAM)
   ═════════════════════════════════════════════════════════ */
