import { scheduleAutoRefresh } from './auto-refresh.js';
import { DATA } from './state.js';
import { animateChildren, setTopbar } from './ui.js';

let currentOtherView = null; /* null = menu, oppure 'moto2','moto3','motoe','wsbk' */

export function renderOther() {
  const root = document.getElementById('s-other');
  
  /* Se siamo dentro una vista categoria */
  if (currentOtherView) {
    renderOtherCategory(currentOtherView);
    return;
  }

  const categories = [
    { id: 'moto2', name: 'Moto2', icon: '🏍️', desc: 'Campionato 2026' },
    { id: 'moto3', name: 'Moto3', icon: '🏍️', desc: 'Campionato 2026' },
    { id: 'wsbk', name: 'WorldSBK', icon: '🌍', desc: 'Superbike 2026' },
  ];

  const links = [
    { icon: '📊', name: 'Classifica MotoGP Live', url: 'https://www.motogp.com/en/world-standing/2026/motogp/championship-standings' },
    { icon: '📅', name: 'Calendario MotoGP', url: 'https://www.motogp.com/en/calendar/2026' },
    { icon: '📰', name: 'News Motorsport.com', url: 'https://www.motorsport.com/motogp/news/' },
    { icon: '⚡', name: 'Fantasy MotoGP', url: 'https://fantasy.motogp.com/' },
    { icon: '🏠', name: 'Box Box (GitHub)', url: 'https://github.com/Lukentony/boxbox' },
    { icon: '🌐', name: 'Sito di Luca', url: 'https://lukentony.it' },
  ];

  let h = '';

  h += `<div class="f-subtitle"><span>Classifiche altre categorie</span></div>`;
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">`;
  categories.forEach(cat => {
    h += `<div class="news-card" data-cat="${cat.id}" style="cursor:pointer;padding:16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px">
      <div style="font-size:28px">${cat.icon}</div>
      <div class="news-title" style="font-size:15px">${cat.name}</div>
      <div class="news-meta">${cat.desc}</div>
    </div>`;
  });
  h += `</div>`;

  h += `<div class="f-subtitle" style="margin-top:20px"><span>Link utili</span></div>`;
  links.forEach(lnk => {
    h += `<a href="${lnk.url}" target="_blank" rel="noopener" class="news-card" style="margin-bottom:6px;padding:10px 14px">
      <div style="font-size:18px;flex-shrink:0">${lnk.icon}</div>
      <div class="news-body" style="gap:0">
        <div class="news-title" style="font-size:13px">${lnk.name}</div>
      </div>
      <div style="font-size:14px;color:var(--text-faint)">→</div>
    </a>`;
  });

  /* Sezione impostazioni */
  const autoRefOn = localStorage.getItem('bbAutoRefresh') !== 'false';
  h += `<div class="f-subtitle" style="margin-top:20px"><span>Impostazioni</span></div>`;
  h += `<div class="card sett-card">`;
  h += `<div class="sett-row" data-sett="autoRefresh">
    <div class="sett-label">
      <div class="sett-name">Auto-aggiornamento dati</div>
      <div class="sett-desc">Ricarica i dati ogni 5 minuti durante i weekend GP</div>
    </div>
    <div class="sett-toggle ${autoRefOn ? 'is-on' : ''}"><div class="sett-thumb"></div></div>
  </div>`;
  const notifSupported = 'Notification' in window;
  const notifPerm = notifSupported ? Notification.permission : 'unsupported';
  const notifOn = notifPerm === 'granted' && localStorage.getItem('bbNotifications') === 'true';
  const notifDesc = notifPerm === 'denied'
    ? 'Bloccate dal browser — riabilitale nelle impostazioni del sito'
    : notifPerm === 'unsupported'
    ? 'Non supportate da questo browser'
    : 'Avviso quando i punti vengono aggiornati durante il GP';
  const notifDisabled = notifPerm === 'denied' || notifPerm === 'unsupported';
  h += `<div class="sett-row${notifDisabled ? ' sett-row--disabled' : ''}" data-sett="notifications">
    <div class="sett-label">
      <div class="sett-name">Notifiche aggiornamenti</div>
      <div class="sett-desc">${notifDesc}</div>
    </div>
    <div class="sett-toggle ${notifOn ? 'is-on' : ''}"><div class="sett-thumb"></div></div>
  </div>`;
  h += `</div>`;

  h += `<div class="fade-pad"></div>`;
  root.innerHTML = h;
  animateChildren(root);

  /* Click handler per categorie */
  root.querySelectorAll('[data-cat]').forEach(el => {
    el.addEventListener('click', () => {
      currentOtherView = el.dataset.cat;
      renderOther();
    });
  });

  /* Click handler per settings */
  root.querySelectorAll('.sett-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.sett;
      if (key === 'autoRefresh') {
        const current = localStorage.getItem('bbAutoRefresh') !== 'false';
        localStorage.setItem('bbAutoRefresh', current ? 'false' : 'true');
        scheduleAutoRefresh();
        renderOther();
      } else if (key === 'notifications') {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'denied') return;
        if (Notification.permission === 'default') {
          Notification.requestPermission().then(() => {
            if (Notification.permission === 'granted') {
              localStorage.setItem('bbNotifications', 'true');
            }
            renderOther();
          });
        } else {
          const cur = localStorage.getItem('bbNotifications') === 'true';
          localStorage.setItem('bbNotifications', cur ? 'false' : 'true');
          renderOther();
        }
      }
    });
  });
}

export function renderOtherCategory(catId) {
  const root = document.getElementById('s-other');
  const names = { moto2:'Moto2', moto3:'Moto3', wsbk:'WorldSBK' };
  const catName = names[catId] || catId;

  /* Aggiorna topbar */
  setTopbar(`${catName} 2026`, catName, '');

  let h = '';
  /* Back button */
  h += `<div class="seg" style="margin-bottom:12px">
    <button class="seg-btn is-active" id="back-other" style="margin-right:0">← Classifiche</button>
  </div>`;

  /* Ottieni dati categoria */
  const catData = DATA.otherCategories?.categories?.[catId];
  const riders = catData?.riders || [];
  const fetchedAt = DATA.otherCategories?.fetchedAt || null;

  if (riders.length > 0) {
    h += `<div class="card" style="padding:0;overflow:hidden">
      <table class="f-tbl">
        <thead><tr>
          <th>Pos</th><th>Pilota</th><th>Moto</th><th>Team</th><th>Pts</th>
        </tr></thead>
        <tbody>`;
    riders.forEach((r, i) => {
      const medal = r.pos === 1 ? '🥇' : r.pos === 2 ? '🥈' : r.pos === 3 ? '🥉' : '';
      h += `<tr class="${i===0?'is-leader':''}">
        <td class="user"><span class="pos">${r.pos}</span>${medal}</td>
        <td>${r.rider}</td>
        <td style="color:var(--text-dim);font-size:12px">${r.bike}</td>
        <td style="color:var(--text-faint);font-size:11px">${r.team}</td>
        <td class="tot">${r.totalPoints}</td>
      </tr>`;
    });
    h += `</tbody></table></div>`;
    if (fetchedAt) {
      const d = new Date(fetchedAt);
      h += `<div style="font-size:10px;color:var(--text-faint);margin-top:6px;text-align:center">Fonte: Wikipedia · aggiornato ${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}</div>`;
    }
  } else {
    h += `<div class="card"><div class="card-h"><span class="card-t">Classifica ${catName}</span></div>`;
    h += `<div class="empty" style="padding:24px">
      <div style="font-size:24px;margin-bottom:8px">🔌</div>
      <div>Dati ${catName} non disponibili.</div>
      <div style="font-size:12px;color:var(--text-faint);margin-top:6px">I dati vengono da Wikipedia. Se il campionato 2026 non è ancora iniziato, la pagina potrebbe non esistere.</div>
    </div>`;
    h += `</div>`;
  }

  h += `<div class="fade-pad"></div>`;
  root.innerHTML = h;
  animateChildren(root);

  document.getElementById('back-other').addEventListener('click', () => {
    currentOtherView = null;
    renderOther();
  });
}

/* Tactical analysis password gate + view */
