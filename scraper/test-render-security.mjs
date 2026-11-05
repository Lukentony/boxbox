// Regressioni sui renderer reali, senza rete, dati personali o DOM del dispositivo.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const base = new URL('../', import.meta.url);
const payload = '<img src=x onerror=alert(1)>';
async function renderer(name, data, players = []) {
  const roots = {};
  const context = vm.createContext({
    URL, Date, console, setTimeout() {},
    document: { getElementById: id => roots[id] },
    localStorage: { getItem: () => 'false', setItem() {} },
    window: {}, history: { pushState() {}, back() {} },
  });
  const stubs = {
    './countdown.js': { startCountdown() {}, stopCountdown() {} },
    './selectors.js': {
      activeEvent: () => null, activePlayers: () => players, lastCompletedEvent: () => null,
      nextScheduledEvent: () => null, effectiveStatus: () => 'complete', champPoints: () => 0,
    },
    './state.js': { DATA: data, currentGp: 'season', setCurrentGp() {} },
    './ui.js': { animateChildren() {}, switchTab() {}, setTopbar() {} },
    './analysis.js': {
      riderPriceTrend: () => ({ deltaM: 0, dir: 0, lastM: 1 }),
      riderValue: () => ({ perM: 0 }), gpSig: id => String(id), riderForm: () => ({}),
    },
    './boosters.js': {
      boosterLabel: x => x.boosterType, goldenRiderIds: () => [], riderDoubled: () => false, teamDoubled: () => false,
    },
    './auto-refresh.js': { scheduleAutoRefresh() {} },
  };
  const files = new Map();
  async function load(file) {
    if (files.has(file)) return files.get(file);
    const mod = new vm.SourceTextModule(await readFile(new URL(file, base), 'utf8'), { context, identifier: file });
    files.set(file, mod);
    return mod;
  }
  const mod = await load(name);
  await mod.link(async specifier => {
    if (specifier === './format.js' || specifier === './event-order.js') return load(specifier);
    const values = stubs[specifier];
    assert.ok(values, `stub mancante: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function() {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return { api: mod.namespace, roots };
}
function root(expand = false) {
  const button = { insertAdjacentHTML(_where, html) { this.extra = html; }, remove() {}, addEventListener(_type, callback) { this.click = callback; } };
  return { innerHTML: '', button, querySelector: selector => expand && selector === '#news-more' ? button : null,
    querySelectorAll: () => [], addEventListener() {} };
}
function safe(html) {
  assert.ok(!html.includes(payload), 'il payload non deve diventare markup nel sink reale');
  assert.doesNotMatch(html, /(?:href|src)="(?:javascript|data|vbscript):/i);
  assert.ok(html.includes('&lt;img'), 'il testo ostile deve restare visibile come testo');
}

const items = Array.from({ length: 8 }, (_, i) => ({
  title: `${payload} News ${i}`, link: i ? 'https://example.test/a?q=" onmouseover="alert(1)' : 'javascript:alert(1)',
  image: i ? 'https://example.test/image.png' : 'data:image/svg+xml,x', categories: [payload], pubDate: '',
}));
const data = { riders: [], constById: {}, news: { items, upcomingGP: { name: 'GP', hoursUntil: 2 }, source: payload } };
const home = await renderer('tab-home.js', data, [{ displayName: payload, overallPoints: 1, teamValue: 1 }]);
home.roots['s-home'] = root(true);
home.api.renderHome();
const homeRoot = home.roots['s-home'];
safe(homeRoot.innerHTML);
assert.match(homeRoot.innerHTML, /href="https:\/\/example.test\//);
homeRoot.button.click();
safe(homeRoot.button.extra);
const newsHtml = homeRoot.innerHTML + homeRoot.button.extra;
for (let i = 0; i < items.length; i++) assert.equal(newsHtml.split(`News ${i}`).length - 1, 1, 'nessuna news duplicata in espansione senza correlate');

const fantasyData = { riders: [], events: [], breakdown: { byEvent: {} }, allTeams: { teams: { 1: { [payload]: { riders: [1] } } } },
  riderById: { 1: { firstName: payload, lastName: payload, stats: {} } }, constById: {} };
const fantasy = await renderer('tab-fantasy.js', fantasyData);
safe(fantasy.api.renderSeasonView([{ displayName: payload, overallPoints: 1, teamValue: 1 }]));
safe(fantasy.api.renderUpcomingEventView({ id: 1, displayedName: payload, circuit: payload, dateStart: '2024-01-01' }));
fantasyData.events = [{ id: 1, displayedName: payload }];
fantasyData.breakdown.byEvent[1] = { standings: [{ displayName: payload, total: 0 }] };
safe(fantasy.api.renderEventView(1, []));

const other = await renderer('tab-other.js', { otherCategories: { categories: { moto2: {
  riders: [{ pos: payload, rider: payload, bike: payload, team: payload, totalPoints: payload }],
} } } });
other.roots['s-other'] = root();
other.roots['back-other'] = root();
other.api.renderOtherCategory('moto2');
safe(other.roots['s-other'].innerHTML);

const rider = { id: 1, firstName: payload, lastName: payload, stats: {}, cost: 1 };
const standings = await renderer('tab-standings.js', { riders: [rider], constById: {}, events: [] });
standings.roots['s-standings'] = root();
standings.api.renderStandings();
safe(standings.roots['s-standings'].innerHTML);
safe(standings.api.riderDetailHtml(1));
const { escapeHtml, safeHttpUrl } = await import('../format.js');
assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.test', '/relative', 'https://', null]) assert.equal(safeHttpUrl(url), '');
assert.equal(safeHttpUrl('https://example.test'), 'https://example.test/');
console.log('render-security: ok (RSS iniziali/espansi, nickname, Fantasy, Wikipedia, piloti, URL)');
