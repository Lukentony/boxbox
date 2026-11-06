import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { orderEvents } from '../event-order.js';

const scraper = fileURLToPath(new URL('.', import.meta.url));
const events = [
  { id: '4', order: 20, dateStart: '2024-04-07', status: 'complete', displayedName: 'Qatar' },
  { id: 19, order: 18, dateStart: '2024-03-02', status: 'complete' },
  { id: '20', order: 19, dateStart: '2024-03-24', status: 'complete' },
];
assert.deepEqual(orderEvents(events).map(e => String(e.id)), ['19', '20', '4']);
assert.deepEqual(orderEvents([{ id: 9 }, { id: 3 }]), []);
assert.deepEqual(orderEvents([...events, { id: 999 }]).map(e => String(e.id)), ['19', '20', '4']);
assert.deepEqual(orderEvents([{ id: 9, order: 0 }, { id: 3, order: -1 }]), []);
assert.deepEqual(orderEvents([{ id: 1, order: 1 }, { id: 2, dateStart: '2024-01-01' }]), []);
assert.deepEqual(orderEvents([
  { id: 1, order: 1, dateStart: '2024-02-02' }, { id: 2, dateStart: '2024-01-01' },
]).map(e => e.id), [2, 1]);
assert.deepEqual(orderEvents([
  { id: 9, dateStart: '2024-02-02' }, { id: 3, dateStart: '2024-01-01' },
]).map(e => e.id), [3, 9]);

// Browser state imports are exercised with only the minimal localStorage shim.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { DATA } = await import('../state.js');
const { riderPriceTrend } = await import('../analysis.js');
const { lastCompletedEvent } = await import('../selectors.js');
DATA.events = events;
DATA.breakdown = { byEvent: {
  19: { standings: [] }, 20: { standings: [] }, 4: { upcoming: true, standings: [] },
} };
assert.equal(lastCompletedEvent().id, '20'); // the upcoming entry is never a completed trend
DATA.breakdown.byEvent[4] = { standings: [] };
assert.equal(lastCompletedEvent().id, '4'); // last GP, no future event required
DATA.events[2].status = 'scheduled';
assert.equal(lastCompletedEvent().id, '4'); // non-complete metadata is excluded
DATA.events[2].status = 'complete';
DATA.events = [...events, { id: 888, dateStart: '2024-05-01' }];
assert.deepEqual(riderPriceTrend({ cost: 21_000_000, costHistory: {
  19: { cost: 18_000_000 }, 20: { cost: 20_000_000 }, 4: { cost: 21_000_000 },
} }), { lastM: 21, prevM: 20, deltaM: 1, dir: 1 });
assert.equal(lastCompletedEvent().id, '4', 'evento estraneo non invalida le gare con breakdown');
const trend = riderPriceTrend({ cost: 9_000_000, costHistory: {
  19: { cost: 0 }, '20': { cost: 20_000_000 }, '4': { cost: Infinity }, 999: { cost: 1 },
} });
assert.deepEqual(trend, { lastM: 20, prevM: 0, deltaM: 20, dir: 1 });
assert.deepEqual(riderPriceTrend({ cost: 7_000_000, costHistory: { 19: { cost: 0 }, 20: {} } }),
  { lastM: 7, prevM: 7, deltaM: 0, dir: 0 });
assert.deepEqual(riderPriceTrend({ cost: 8_000_000, costHistory: { 999: { cost: 2 } } }),
  { lastM: 8, prevM: 8, deltaM: 0, dir: 0 });

// Execute the real watcher against a private fixture; no .env, network, real files, or shared /tmp state.
const fixture = mkdtempSync(join(scraper, '.event-order-test-'));
const files = ['all-teams.json', 'riders.json', 'constructors.json', 'squads.json', 'events.json',
  'boxbox-team-diff-state.json', 'boxbox-team-diff-state.pending.json'];
try {
  const json = (name, value) => writeFileSync(join(fixture, name), JSON.stringify(value));
  json('all-teams.json', { teams: {
    19: { Present: { riders: [1], ridersSilver: [], constructors: [], squads: [] } },
    20: { Present: { riders: [1], ridersSilver: [], constructors: [], squads: [] },
      Late: { riders: [3], ridersSilver: [], constructors: [], squads: [] } },
    4: { Present: { riders: [2], ridersSilver: [], constructors: [], squads: [] } },
    999: { Present: { riders: [8], ridersSilver: [], constructors: [], squads: [] } },
  } });
  json('riders.json', [{ id: 1, firstName: 'One', lastName: 'Rider' }, { id: 2, firstName: 'Two', lastName: 'Rider' }]);
  json('constructors.json', []); json('squads.json', []); json('events.json', events);
  const run = spawnSync(process.execPath, [join(scraper, 'team-diff.mjs')], {
    cwd: fixture,
    env: { PATH: process.env.PATH, RIVALS: 'Present,Late', BOXBOX_TEAM_DIFF_DATA_DIR: fixture,
      BOXBOX_TEAM_DIFF_STATE_DIR: fixture }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /GP20 → Qatar/);
  assert.match(run.stdout, /messo T\. Rider/);
  assert.doesNotMatch(run.stdout, /Late/);
  assert.doesNotMatch(run.stdout, /GP999/);
} finally {
  for (const file of files) {
    try { unlinkSync(join(fixture, file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  rmdirSync(fixture);
}
console.log('event-order: ok');
