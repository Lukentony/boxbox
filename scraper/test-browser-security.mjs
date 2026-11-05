// Test opzionale: Playwright e Chromium già installati. Solo loopback e fixture sintetiche.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(execFileSync('git', ['-C', root, 'ls-files', '--', '*.js'], { encoding: 'utf8' })
  .trim().split('\n').filter(name => !name.includes('/')));
allowed.add('event-order.js');
for (const name of ['index.html', 'styles.css', 'favicon.ico', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) allowed.add(name);
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  let body = readFileSync(resolve(root, name));
  if (name === 'index.html') body = body.toString().replace('<script type="module" src="main.js"></script>', '');
  const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BOXBOX_CHROMIUM ? { executablePath: process.env.BOXBOX_CHROMIUM } : {}) });
  const output = resolve(root, 'docs/verifiche');
  mkdirSync(output, { recursive: true });
  for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { DATA } = await import('/state.js');
      const home = await import('/tab-home.js');
      const fantasy = await import('/tab-fantasy.js');
      const other = await import('/tab-other.js');
      const standings = await import('/tab-standings.js');
      window.__xss = 0;
      const hostile = '<img src=x onerror="window.__xss++">';
      const events = [{ id: 4, order: 20, status: 'complete', displayedName: 'Qatar', shortName: 'QAT', circuit: 'Lusail', dateStart: '2024-04-01', dateEnd: '2024-04-03' }];
      const rider = { id: 1, constructorId: 1, firstName: hostile, lastName: 'Pilota', number: 1, cost: 10e6,
        stats: { totalPoints: 10, avgPoints: 10, starts: 1, events: { 4: { points: 10, q2Points: 2, sprintPoints: 3, finalPoints: 5 } } }, costHistory: { 4: { cost: 10e6 } } };
      const player = { displayName: hostile, overallPoints: 10, teamValue: 50e6, season: { q: 2, sprint: 3, race: 5, extra: 0 }, events: { 4: { total: 10 } } };
      const team = { riders: [1], ridersSilver: [], constructors: [], squads: [], boosters: [], value: 50e6 };
      Object.assign(DATA, { riders: [rider], riderById: { 1: rider },
        constructors: [{ id: 1, name: hostile, stats: { events: { 4: { points: hostile } } } }], squads: [],
        constById: { 1: { name: hostile } }, squadById: {}, realPts: { 1: 5 }, events,
        allTeams: { teams: { 4: { [hostile]: team } } },
        breakdown: { events: { 4: events[0] }, players: { [hostile]: player }, byEvent: { 4: { standings: [{ displayName: hostile, total: 10 }] } } },
        news: { source: hostile, upcomingGP: { name: 'GP', hoursUntil: 2 }, items: Array.from({ length: 8 }, (_, i) => ({ title: `${hostile} News ${i}`, categories: [hostile], link: i ? 'https://example.test/" onmouseover="window.__xss++' : 'javascript:window.__xss++', image: 'data:image/svg+xml,x' })) },
        otherCategories: { categories: { moto2: { riders: [{ pos: 1, rider: hostile, bike: hostile, team: hostile, totalPoints: 10 }] } } },
      });
      window.testModules = { home, fantasy, other, standings, DATA, player, rider, team };
      home.renderHome();
      document.querySelector('#news-more').click();
      if (document.querySelectorAll('.news-card').length !== 8) throw new Error('News duplicate o perse');
      document.getElementById('s-fantasy').innerHTML = fantasy.renderSeasonView([player]) + fantasy.renderEventView(4, [player]);
      other.renderOtherCategory('moto2');
      standings.renderStandings();
      document.getElementById('s-standings').innerHTML += standings.riderDetailHtml(1);
      document.querySelector('[data-sv="constructors"]').click();
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__xss), 0, `${label}: nessun payload eseguito`);
    assert.equal(await page.locator('[onerror],[onmouseover],[onload],a[href^="javascript:"],img[src^="data:"]').count(), 0);
    assert.deepEqual(errors, [], `${label}: nessun errore moduli`);
    // Screenshot separati con dati normali: non valutare il design su payload volutamente ostili.
    await page.evaluate(() => {
      const { DATA, player, rider, team } = window.testModules;
      rider.firstName = 'Pilota'; rider.lastName = 'Demo';
      player.displayName = 'Giocatore demo';
      DATA.constById[1].name = 'Costruttore demo';
      DATA.breakdown.players = { Demo: player };
      DATA.allTeams.teams[4] = { [player.displayName]: team };
      DATA.breakdown.byEvent[4].standings = [{ displayName: player.displayName, total: 10 }];
      DATA.news.source = 'Fonte demo';
      DATA.news.items.forEach((item, i) => { item.title = `Notizia MotoGP ${i + 1}: aggiornamento dal paddock`; item.categories = ['MotoGP']; item.image = null; item.link = 'https://example.test/news'; });
    });
    for (const view of ['home', 'fantasy']) {
      await page.evaluate(async view => {
        const { switchTab } = await import('/ui.js');
        switchTab(view, true);
        if (view === 'fantasy') window.testModules.fantasy.renderFantasy();
      }, view);
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}/${view}: niente overflow orizzontale`);
      await page.screenshot({ path: resolve(output, `audit-${view}-${label}.png`), fullPage: true });
    }
    await page.locator('.gp-chip[data-gp="4"]').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}/GP: niente overflow`);
    await page.screenshot({ path: resolve(output, `audit-gp-${label}.png`), fullPage: true });
    assert.deepEqual(errors, [], `${label}: nessun errore durante navigazione e GP`);
    await context.close();
    console.log(`PASS ${label}: moduli reali, payload inerti, 8 news uniche, layout senza overflow, screenshot Home/Fantasy`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
