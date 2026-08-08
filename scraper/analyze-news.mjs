// analyze-news.mjs — classifica news.json per pilota (segnale fantasy) via NVIDIA NIM.
// Lanciato da boxbox-news-signal-watch.sh, DOPO nvidia-model-health.py --watch (che sceglie
// il modello). Fallimento = nessun output, mai un errore bloccante: il frontend gestisce
// l'assenza di news-signals.json con .catch(() => null), come per news.json/other-categories.json.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://integrate.api.nvidia.com/v1';
const FALLBACK_MODEL = 'meta/llama-3.3-70b-instruct'; // usato solo se manca lo stato del health-check

function loadEnv() {
  const path = resolve(DIR, '.env');
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function loadModelCandidates() {
  const path = resolve(DIR, 'nvidia-model-state.json');
  try {
    const state = JSON.parse(readFileSync(path, 'utf-8'));
    if (Array.isArray(state.ranked_healthy) && state.ranked_healthy.length) {
      return state.ranked_healthy;
    }
  } catch {}
  return [FALLBACK_MODEL];
}

function extractJson(text) {
  // L'LLM puo' wrappare la risposta in prosa/backtick — prende il primo blocco { } o [ ] valido.
  const starts = ['[', '{'];
  for (const s of starts) {
    const i = text.indexOf(s);
    if (i === -1) continue;
    const close = s === '[' ? ']' : '}';
    for (let j = text.length - 1; j > i; j--) {
      if (text[j] !== close) continue;
      try { return JSON.parse(text.slice(i, j + 1)); } catch {}
    }
  }
  return null;
}

async function callModel(model, apiKey, prompt) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = extractJson(content);
  if (!parsed) throw new Error('Risposta non JSON-parsabile');
  return parsed;
}

function buildPrompt(rulesText, riders, articles) {
  const riderList = riders.map(r => `${r.id}: ${r.firstName || ''} ${r.lastName}`.trim()).join('\n');
  const articlesList = articles.map((a, i) =>
    `[${i}] ${a.title}\n${a.description}`
  ).join('\n\n');

  return `${rulesText}

## Elenco piloti (id: nome)
${riderList}

## Notizie da classificare
${articlesList}

## Cosa restituire
Rispondi SOLO con un array JSON, senza testo prima o dopo, un elemento per ogni notizia che cita
almeno un pilota dell'elenco sopra (ignora le notizie che non citano nessun pilota):
[
  {"articleIndex": 0, "riderIds": [1], "signal": "positive|negative|neutral", "reason": "motivo breve in italiano, una riga"}
]`;
}

function aggregateByRider(classifications, articles) {
  const priority = { negative: 2, positive: 1, neutral: 0 };
  const signals = {};
  for (const c of classifications) {
    if (!c || !Array.isArray(c.riderIds)) continue;
    const article = articles[c.articleIndex];
    for (const rid of c.riderIds) {
      const key = String(rid);
      const existing = signals[key];
      if (!existing || priority[c.signal] > priority[existing.signal]) {
        signals[key] = {
          signal: c.signal,
          reason: c.reason,
          articleLink: article?.link,
        };
      }
    }
  }
  return signals;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('NVIDIA_API_KEY assente in .env — salto (non bloccante)');
    return;
  }

  const rulesText = readFileSync(resolve(DIR, 'fantasy-context.md'), 'utf-8');
  const riders = JSON.parse(readFileSync(resolve(DIR, 'riders.json'), 'utf-8'))
    .map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName }));
  const news = JSON.parse(readFileSync(resolve(DIR, 'news.json'), 'utf-8'));
  const articles = news.items || [];
  if (!articles.length) {
    console.log('Nessuna news da classificare — salto');
    return;
  }

  const prompt = buildPrompt(rulesText, riders, articles);
  // nemotron-mini-4b ha context 4096 token: col prompt pieno delle news va in
  // HTTP 400 (context length exceeded). Skip quando il prompt e troppo grosso.
  const estTokens = Math.round(prompt.length / 4);
  const SMALL_CTX = new Set(['nvidia/nemotron-mini-4b-instruct']);
  const candidates = loadModelCandidates().filter(m => {
    if (SMALL_CTX.has(m) && estTokens > 2000) {
      console.log(`  skip ${m}: context 4096 < prompt stimato ~${estTokens} token`);
      return false;
    }
    return true;
  });

  let result = null, usedModel = null, lastError = null;
  for (const model of candidates) {
    try {
      console.log(`Provo modello ${model}...`);
      result = await callModel(model, apiKey, prompt);
      usedModel = model;
      break;
    } catch (e) {
      lastError = e;
      console.error(`  fallito (${model}): ${e.message}`);
    }
  }

  if (!result) {
    console.error(`Tutti i modelli falliti — salto (ultimo errore: ${lastError?.message})`);
    return;
  }

  const signals = aggregateByRider(result, articles);
  const output = {
    fetchedAt: new Date().toISOString(),
    model: usedModel,
    signals,
  };
  writeFileSync(resolve(DIR, 'news-signals.json'), JSON.stringify(output, null, 2));
  console.log(`DONE — news-signals.json salvato (${Object.keys(signals).length} piloti, modello ${usedModel})`);
}

main().catch(e => {
  console.error(`Errore non bloccante: ${e.message}`);
  process.exit(0);
});
