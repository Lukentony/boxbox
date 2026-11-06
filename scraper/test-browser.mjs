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
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', locale: 'it-IT', timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    // Il tempo delle fixture non deve cambiare date, contatori e screenshot fra due verifiche.
    await page.clock.setFixedTime(new Date('2026-11-06T10:00:00Z'));
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
        { id: 19, order: 18, displayedName: 'Australia demo', shortName: 'AUS' },
        { id: 20, order: 19, displayedName: 'Malaysia demo', shortName: 'MAL' },
        { id: 4, order: 20, displayedName: 'Qatar demo', shortName: 'QAT' },
      ].map((event, i) => ({ ...event, status: 'complete', circuit: 'Circuito demo', dateStart: `2024-04-${10 + i}`, dateEnd: `2024-04-${10 + i}` }));
      const rider = { id: 1, firstName: hostile, lastName: 'Demo', number: 1, constructorId: 1, cost: 21e6,
        costHistory: { 19: { cost: 18e6 }, 20: { cost: 20e6 }, 4: { cost: 21e6 } },
        stats: { starts: 3, totalPoints: 30, avgPoints: 10, last3Events: 30,
          events: Object.fromEntries(events.map(event => [event.id, { points: 10, q2Points: 2, sprintPoints: 3, finalPoints: 5, gridPosition: 2, sprintPosition: 2, finalPosition: 1 }])) } };
      const player = { displayName: 'Giocatore demo', overallPoints: 30, teamValue: 50e6, season: { q: 6, sprint: 9, race: 15, extra: 0, apiAdjustment: 0, total: 30 },
        events: Object.fromEntries(events.map(event => [event.id, { q: 2, sprint: 3, race: 5, extra: 0, total: 10 }])) };
      const team = { riders: [1], ridersSilver: [], constructors: [], squads: [], boosters: [], value: 50e6 };
      Object.assign(DATA, { riders: [rider], riderById: { 1: rider }, constructors: [], squads: [], realPts: { 1: 15 },
        constById: { 1: { name: 'Costruttore demo' } }, squadById: {}, events,
        breakdown: { events: Object.fromEntries(events.map(event => [event.id, event])), players: { Demo: player },
          byEvent: Object.fromEntries(events.map(event => [event.id, { standings: [{ displayName: player.displayName, q: 2, sprint: 3, race: 5, extra: 0, total: 10 }] }])) },
        allTeams: { teams: Object.fromEntries(events.map(event => [event.id, { [player.displayName]: team }])) },
        news: { source: 'Feed demo', items: Array.from({ length: 8 }, (_, i) => ({ title: `${hostile} Notizia ${i}`, categories: [hostile],
          link: i ? 'https://example.test/?q=" onmouseover="window.__xss++' : 'javascript:window.__xss++', image: 'data:image/svg+xml,x' })) },
        weekend: null,
      });
      window.testModules = { ui, DATA, rider };
      ui.setupNav();
    });
    await page.locator('.bnav-btn[data-tab="news"]').click();
    await page.waitForFunction(() => location.hash === '#/notizie' && document.getElementById('s-news').classList.contains('is-active'));
    assert.equal(await page.locator('#s-news .news-card').count(), 8);
    assert.equal(await page.locator('#s-news .news-card').first().getAttribute('href'), null);
    assert.equal(await page.locator('[onerror],[onmouseover],[onload],a[href^="javascript:"],img[src^="data:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), 0);
    assert.ok(await page.locator('#s-news').innerText().then(text => text.includes('<img src=x onerror=')), 'testo ostile letterale, non doppio escaping');
    await page.evaluate(() => { const { DATA, rider } = window.testModules; rider.firstName = 'Pilota';
      DATA.news.items.forEach((item, i) => { item.title = `Notizia MotoGP ${i + 1}: aggiornamento dal paddock`; item.categories = ['MotoGP']; item.image = null; item.link = 'https://example.test/news'; }); });
    const views = [
      ['home', '#/home', '#s-home'], ['notizie', '#/notizie', '#s-news'],
      ['pilota', '#/pilota/1', '#s-standings'], ['fantasy', '#/fantasy', '#s-fantasy'], ['live', '#/live', '#s-live'],
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
      if (name === 'live') assert.ok((await page.locator('#s-live').innerText()).includes('Qatar'), 'ultimo GP cronologico nel Live');
      await page.screenshot({ path: resolve(output, `${name}-${label}.png`), fullPage: true, animations: 'disabled' });
      if (name === 'home') {
        // Verifica anche il comando in fondo alla pagina, oltre la nav fissa nello screenshot.
        await page.locator('#news-tutte').click();
        await page.waitForFunction(() => location.hash === '#/notizie' && document.querySelector('#s-news.is-active'));
        assert.equal(await page.locator('#s-news .news-card').count(), 8);
      }
    }
    await page.evaluate(() => window.testModules.ui.vaiA('#/fantasy'));
    await page.locator('#s-fantasy.is-active .gp-chip[data-gp="4"]').click();
    assert.equal(await page.locator('#s-fantasy .p-tbl .total td').last().innerText(), '10');
    await page.screenshot({ path: resolve(output, `gp-${label}.png`), fullPage: true, animations: 'disabled' });
    assert.deepEqual(errors, [], 'nessun errore nei moduli e nel router privato');
    assert.ok(!requests.some(path => /analisi\.js|motore-view\.js|\/data\//.test(path)), 'nessuna richiesta di moduli privati o dati reali');
    await context.close();
    console.log(`PASS pubblico ${label}: router, DOM sicuro, calendario pilota, Live, Fantasy e GP; nessun overflow`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
