// Unica autorità sul confine di fiducia fra risposta del modello e segnali pubblicati.
const priority = new Map([['negative', 2], ['positive', 1], ['neutral', 0]]);
const MAX_REASON_LENGTH = 500;
export function classificationInstructions(articleCount) {
  return `Vincoli obbligatori: articleIndex è un intero da 0 a ${articleCount - 1}, senza virgolette.
Una sola riga per articolo: riunisci tutti i piloti citati in riderIds.
riderIds è un array non vuoto di ID interi positivi, senza virgolette, presenti nell'elenco.
signal è esattamente uno fra ${[...priority.keys()].join(', ')}.
reason è una stringa non vuota, massimo ${MAX_REASON_LENGTH} caratteri. Se non ci sono articoli pertinenti restituisci [].`;
}
export function aggregateByRider(classifications, articles, riders) {
  const riderIds = new Set(riders.map(rider => String(rider.id)));
  const seenArticles = new Set();
  const invalid = () => { throw new Error('Classificazione non valida: schema o riferimenti'); };
  if (!Array.isArray(classifications) || classifications.length > articles.length) invalid();
  // Validare tutto prima di aggregare: non pubblicare una risposta parzialmente valida.
  for (const row of classifications) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !Number.isInteger(row.articleIndex) || row.articleIndex < 0
      || row.articleIndex >= articles.length || !articles[row.articleIndex]
      || seenArticles.has(row.articleIndex)
      || !Array.isArray(row.riderIds) || !row.riderIds.length
      || !row.riderIds.every(id => Number.isSafeInteger(id) && id > 0 && riderIds.has(String(id)))
      || !priority.has(row.signal)
      || typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > MAX_REASON_LENGTH) invalid();
    seenArticles.add(row.articleIndex);
  }
  const signals = Object.create(null);
  for (const row of classifications) {
    for (const id of new Set(row.riderIds)) {
      const existing = signals[id];
      // La priorità storica resta invariata; la freschezza è un problema separato.
      if (!existing || priority.get(row.signal) > priority.get(existing.signal)) {
        signals[id] = { signal: row.signal, reason: row.reason.trim(), articleLink: articles[row.articleIndex].link };
      }
    }
  }
  return signals;
}
