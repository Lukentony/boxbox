// Solo loopback, file frontend selezionati e fixture sintetiche. Nessuna .env.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = root;
const allowed = new Set(['index.html', 'styles.css', 'favicon.ico', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'ui.js', 'dom.js', 'state.js', 'format.js', 'selectors.js', 'analysis.js', 'event-order.js', 'boosters.js',
  'countdown.js', 'tab-home.js', 'tab-news.js', 'tab-live.js', 'tab-standings.js', 'tab-fantasy.js', 'tab-other.js',
  'auto-refresh.js', 'data.js', 'notifications.js']);
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  let body = readFileSync(resolve(dist, name));
  if (name === 'index.html') body = body.toString().replace('<script type="module" src="main.js"></script>', '');
  let type = 'application/octet-stream';
  if (name.endsWith('.js')) type = 'text/javascript';
  else if (name.endsWith('.css')) type = 'text/css';
  else if (name.endsWith('.html')) type = 'text/html';
  res.writeHead(200, { 'Content-Type': type }); res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BOXBOX_CHROMIUM ? { executablePath: process.env.BOXBOX_CHROMIUM } : {}) });
  const output = resolve(root, 'docs/verifiche');
  mkdirSync(output, { recursive: true });
  for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', locale: 'it-IT', timezoneId: 'Europe/Rome', permissions: ['notifications'] });
    const page = await context.newPage();
    // Fixture: un browser che supporta le notifiche, altrimenti lo screenshot
    // delle impostazioni mostra lo stato "bloccate" proprio di Chromium headless.
    await context.addInitScript(() => {
      class NotificaFinta {
        static permission = 'default';
        static requestPermission() { return Promise.resolve('granted'); }
      }
      Object.defineProperty(window, 'Notification', { value: NotificaFinta, configurable: true });
    });
    // Il tempo delle fixture non deve cambiare date, contatori e screenshot fra due verifiche.
    await page.clock.setFixedTime(new Date('2026-04-25T10:00:00Z'));
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { DATA } = await import('/state.js');
      const ui = await import('/ui.js');
      window.__xss = 0;
      const hostile = '<img src=x onerror="window.__xss++">';
      const events = [
        { id: 19, order: 18, displayedName: 'Australia', shortName: 'AUS', dateStart: '2026-04-10', dateEnd: '2026-04-12', status: 'complete' },
        { id: 20, order: 19, displayedName: 'Malaysia', shortName: 'MAL', dateStart: '2026-04-17', dateEnd: '2026-04-19', status: 'complete' },
        { id: 4, order: 20, displayedName: 'Qatar', shortName: 'QAT', dateStart: '2026-04-24', dateEnd: '2026-04-26', status: 'active' },
      ].map(event => ({ ...event, circuit: event.shortName === 'QAT' ? 'Lusail International Circuit' : 'Circuito di prova' }));
      const nomi = [['Andrea', 'Moretti'], ['Marco', 'Serra'], ['Luca', 'Fanti'], ['Gioele', 'Riva'],
        ['Davide', 'Conti'], ['Sara', 'Ferrero'], ['Pietro', 'Villa'], ['Rocco', 'Greco']];
      const riders = nomi.map(([nome, cognome], i) => ({ id: i + 1, firstName: i === 0 ? hostile : nome, lastName: cognome,
        number: i + 1, constructorId: (i % 3) + 1, cost: 21e6 - i * 1.5e6,
        costHistory: { 19: { cost: 21e6 - i * 1.5e6 + (i < 3 ? -2e6 : 2e6) }, 20: { cost: 21e6 - i * 1.5e6 + (i < 3 ? -1e6 : 1e6) }, 4: { cost: 21e6 - i * 1.5e6 } },
        stats: { starts: 3, totalPoints: 30 - i * 3, avgPoints: 10 - i, last3Events: 30 - i * 3,
          events: Object.fromEntries(events.map(event => [event.id, { points: 10 - i, q2Points: 2, sprintPoints: 1, finalPoints: 4, gridPosition: i + 1, sprintPosition: i + 1, finalPosition: i + 1 }])) } }));
      const player = (nome, punti) => ({ displayName: nome, overallPoints: punti, teamValue: 50e6,
        season: { q: 6, sprint: 9, race: punti - 15, extra: 0, apiAdjustment: 0, total: punti },
        events: Object.fromEntries(events.map(event => [event.id, { q: 2, sprint: 3, race: 5, extra: 0, total: 10 }])) });
      const players = [player('Squadra Alfa', 30), player('Squadra Beta', 27), player('Squadra Gamma', 21)];
      const team = { riders: [1, 2], ridersSilver: [], constructors: [], squads: [], boosters: [], value: 50e6 };
      const teamConBooster = { riders: [1, 2], ridersSilver: [], constructors: [], squads: [], boosters: [{ boosterType: 'rider', details: { riderId: 7 } }], value: 50e6 };
      const standings = points => players.map((p, i) => ({
        displayName: p.displayName, q: 2, sprint: 3, race: 5 - i, extra: 0, total: points - i,
        ...(i === 0 ? { avvisi: [{ codice: 'booster-fuori-rosa', riderId: 7 }] } : {})
      }));
      const classifica = () => riders.map((r, i) => ({ position: i + 1, name: r.firstName + ' ' + r.lastName,
        team: 'Team ' + ((i % 3) + 1), gapFirst: i === 0 ? '0.000' : '+' + (i / 10).toFixed(3), bestLap: '1:52.' + (10 + i), totalLaps: 20 - i }));
      const weekend = {
        generatedAt: '2026-04-25T09:40:00Z', season: 2026,
        event: { shortName: 'QAT', name: 'Gran Premio del Qatar', circuit: 'Lusail International Circuit',
          status: 'CURRENT', dateStart: '2026-04-24', dateEnd: '2026-04-26' },
        sessions: [
          { id: 's-fp1', type: 'FP', number: 1, date: '2026-04-24T09:00:00Z', status: 'FINISHED', classification: classifica() },
          { id: 's-fp2', type: 'FP', number: 2, date: '2026-04-24T13:00:00Z', status: 'FINISHED', classification: classifica() },
          { id: 's-q2', type: 'Q', number: 2, date: '2026-04-25T09:30:00Z', status: 'FINISHED', classification: classifica() },
          { id: 's-rac', type: 'RAC', number: null, date: '2026-04-26T13:00:00Z', status: 'SCHEDULED', classification: [] },
        ],
        currentSessionId: null, nextSessionId: 's-rac',
        live: { fetchedAt: '2026-04-25T09:55:00Z', category: 'MotoGP', sessionShortName: 'Q2',
          board: riders.slice(0, 5).map((r, i) => ({ pos: i + 1, name: r.firstName + ' ' + r.lastName, team: 'Team ' + ((i % 3) + 1),
            gapFirst: i === 0 ? '0.000' : '+' + (i / 10).toFixed(3), lastLap: '1:52.' + (10 + i), laps: 6 + i, onPit: false })) },
      };
      Object.assign(DATA, { riders, riderById: Object.fromEntries(riders.map(r => [r.id, r])), constructors: [], squads: [],
        realPts: { 1: 15, 2: 12, 3: 9, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3 },
        constById: { 1: { name: 'Costruttore Alfa' }, 2: { name: 'Costruttore Beta' }, 3: { name: 'Costruttore Gamma' } }, squadById: {}, events,
        breakdown: { events: Object.fromEntries(events.map(event => [event.id, event])),
          players: Object.fromEntries(players.map(p => [p.displayName, p])),
          byEvent: Object.fromEntries(events.map((event, i) => [event.id, { standings: standings(30 + i) }])) },
        allTeams: { teams: Object.fromEntries(events.map(event => [event.id,
          Object.fromEntries(players.map((p, i) => [p.displayName, i === 0 ? teamConBooster : team]))])) },
        news: { source: 'Feed demo', items: Array.from({ length: 8 }, (_, i) => ({ title: `${hostile} Notizia ${i}`, categories: [hostile],
          link: i ? 'https://example.test/?q=" onmouseover="window.__xss++' : 'javascript:window.__xss++', image: 'data:image/svg+xml,x' })) },
        weekend,
      });
      window.testModules = { ui, DATA, riders };
      ui.setupNav();
    });
    await page.locator('.bnav-btn[data-tab="news"]').click();
    await page.waitForFunction(() => location.hash === '#/notizie' && document.getElementById('s-news').classList.contains('is-active'));
    assert.equal(await page.locator('#s-news .news-card').count(), 8);
    assert.equal(await page.locator('#s-news .news-card').first().getAttribute('href'), null);
    assert.equal(await page.locator('[onerror],[onmouseover],[onload],a[href^="javascript:"],img[src^="data:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), 0);
    assert.ok(await page.locator('#s-news').innerText().then(text => text.includes('<img src=x onerror=')), 'testo ostile letterale, non doppio escaping');
    await page.evaluate(() => { const { DATA, riders } = window.testModules; riders[0].firstName = 'Andrea';
      DATA.weekend.live.board.forEach((row, i) => { row.name = riders[i].firstName + ' ' + riders[i].lastName; });
      DATA.news.items.forEach((item, i) => { item.title = `Notizia MotoGP ${i + 1}: aggiornamento dal paddock`; item.categories = ['MotoGP']; item.image = null; item.link = 'https://example.test/news'; }); });
    const views = [
      ['home', '#/home', '#s-home'], ['notizie', '#/notizie', '#s-news'],
      ['classifiche', '#/classifiche', '#s-standings'],
      ['pilota', '#/pilota/1', '#s-standings'], ['fantasy', '#/fantasy', '#s-fantasy'], ['live', '#/live', '#s-live'],
      ['impostazioni', '#/impostazioni', '#s-settings'],
    ];
    for (const [name, hash, section] of views) {
      await page.evaluate(hash => window.testModules.ui.vaiA(hash), hash);
      await page.waitForFunction(({ hash, section }) => location.hash === hash && document.querySelector(section).classList.contains('is-active'), { hash, section });
      await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}/${name}: overflow`);
      if (name === 'pilota') {
        const cells = await page.locator('#s-standings .p-tbl tr td:first-child').allTextContents();
        assert.deepEqual(cells, ['AUS', 'MAL', 'QAT']);
      }
      if (name === 'live') {
        const testo = await page.locator('#s-live').innerText();
        assert.ok(/qatar/i.test(testo), 'weekend in corso nel Live; visto: ' + testo.slice(0, 160).replace(/\s+/g, ' '));
      }
      await page.screenshot({ path: resolve(output, `${name}-${label}.png`), animations: 'disabled' });
      if (name === 'home') {
        // Verifica anche il comando in fondo alla pagina, oltre la nav fissa nello screenshot.
        await page.locator('#news-tutte').click();
        await page.waitForFunction(() => location.hash === '#/notizie' && document.querySelector('#s-news.is-active'));
        assert.equal(await page.locator('#s-news .news-card').count(), 8);
      }
    }
    await page.evaluate(() => window.testModules.ui.vaiA('#/fantasy'));
    await page.locator('#s-fantasy.is-active .gp-chip[data-gp="4"]').click();
    assert.deepEqual(await page.locator('#s-fantasy .p-tbl tr.total td:last-child').allTextContents(), ['32', '31', '30'], 'punti del GP scelto, una riga per giocatore');
    assert.ok((await page.locator('#s-fantasy').innerText()).includes('Da verificare'), 'blocco Da verificare visibile nella card del GP');
    await page.screenshot({ path: resolve(output, `gp-${label}.png`), animations: 'disabled' });
    assert.deepEqual(errors, [], 'nessun errore nei moduli e nel router');
    assert.ok(!requests.some(path => /analisi\.js|motore-view\.js|\/data\//.test(path)), 'nessuna richiesta di moduli privati o dati reali');
    await context.close();
    console.log(`PASS pubblico ${label}: router, DOM sicuro, calendario pilota, Live, Fantasy e GP; nessun overflow`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
