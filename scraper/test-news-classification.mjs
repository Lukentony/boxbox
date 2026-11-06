import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import vm from 'node:vm';
import { aggregateByRider, classificationInstructions } from './news-classification.mjs';
const articles = [{ link: 'https://example.test/a' }, { link: 'https://example.test/b' }];
const riders = [{ id: 1 }, { id: 2 }];
const valid = { articleIndex: 0, riderIds: [1], signal: 'positive', reason: 'Rientro confermato' };
const aggregate = rows => aggregateByRider(rows, articles, riders);
assert.deepEqual({ ...aggregate([valid]) }, {
  1: { signal: 'positive', reason: 'Rientro confermato', articleLink: articles[0].link },
});
assert.deepEqual(Object.keys(aggregate([])), []);
assert.equal(aggregate([valid, { ...valid, articleIndex: 1, signal: 'negative' }])[1].signal, 'negative');
for (const rows of [
  {}, null, '[]', [null], [1], [{ ...valid, articleIndex: -1 }], [{ ...valid, articleIndex: 2 }],
  [{ ...valid, articleIndex: 0.5 }], [{ ...valid, articleIndex: '0' }],
  [{ ...valid, riderIds: ['1'] }], [{ ...valid, riderIds: [999] }], [{ ...valid, riderIds: ['__proto__'] }],
  [{ ...valid, riderIds: [] }], [{ ...valid, riderIds: null }],
  [{ ...valid, signal: '__proto__' }], [{ ...valid, signal: 'constructor' }], [{ ...valid, signal: 'unknown' }],
  [{ ...valid, reason: {} }], [{ ...valid, reason: '' }], [{ ...valid, reason: 'x'.repeat(501) }],
  [valid, { ...valid, signal: 'negative' }],
]) assert.throws(() => aggregate(rows), /Classificazione non valida/, JSON.stringify(rows));
// Esegue l'entry point vero con filesystem e fetch sintetici: nessuna .env reale viene letta.
async function pipeline(candidates) {
  const writes = [];
  const inputs = {
    '.env': 'NVIDIA_API_KEY=test-only',
    'fantasy-context.md': 'Regole di test',
    'riders.json': JSON.stringify(riders),
    'news.json': JSON.stringify({ items: articles }),
    'nvidia-model-state.json': JSON.stringify({ ranked_healthy: candidates }),
  };
  const context = vm.createContext({
    console: { log() {}, error() {} }, process: { exit(code) { assert.equal(code, 0); } },
    AbortSignal, fetch: async (_endpoint, request) => {
      assert.ok(JSON.parse(request.body).messages[0].content.includes(classificationInstructions(articles.length)), 'prompt e validatore condividono i vincoli');
      return {
        ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(
          JSON.parse(request.body).model === 'valid' ? [valid] : [{ ...valid, riderIds: [999] }]
        ) } }] }),
      };
    },
  });
  const source = readFileSync(new URL('./analyze-news.mjs', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context, initializeImportMeta(meta) {
    meta.url = new URL('./analyze-news.mjs', import.meta.url).href;
  } });
  const dependencies = {
    fs: { existsSync: file => Object.hasOwn(inputs, path.basename(file)),
      readFileSync: file => { const name = path.basename(file); assert.ok(Object.hasOwn(inputs, name), name); return inputs[name]; },
      writeFileSync: (file, value) => writes.push({ file: path.basename(file), value: JSON.parse(value) }) },
    path: { resolve: path.resolve, dirname: path.dirname }, url: { fileURLToPath: url.fileURLToPath },
    './news-classification.mjs': { aggregateByRider, classificationInstructions },
  };
  await module.link(name => {
    const values = dependencies[name];
    assert.ok(values, name);
    return new vm.SyntheticModule(Object.keys(values), function() {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
  return writes;
}
assert.equal((await pipeline(['invalid'])).length, 0, 'output malformato non sovrascrive il file');
const writes = await pipeline(['invalid', 'valid']);
assert.equal(writes.length, 1);
assert.equal(writes[0].file, 'news-signals.json');
assert.equal(writes[0].value.model, 'valid', 'solo una risposta validata promuove il modello');
assert.equal(writes[0].value.signals[1].articleLink, articles[0].link);
console.log('news-classification: ok (schema, riferimenti, enum, prototipi, fallback pipeline reale)');
