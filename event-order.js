// Gli ID identificano eventi, non il tempo. Nessuna cronologia viene dedotta dagli ID.
const orderValue = event => {
  const value = event?.order;
  if (!(typeof value === 'number' || (typeof value === 'string' && value.trim()))) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const dateValue = event => {
  const n = Date.parse(event?.dateStart);
  return Number.isFinite(n) ? n : null;
};

export function orderEvents(events = []) {
  const known = events.filter(event => orderValue(event) != null || dateValue(event) != null);
  // Una sola chiave per l'intero insieme: confronti misti order/data non sono transitivi.
  let key;
  if (known.every(event => orderValue(event) != null)) key = orderValue;
  else if (known.every(event => dateValue(event) != null)) key = dateValue;
  else return []; // Metadati non confrontabili: non inventare un trend o una coppia.
  return known.slice().sort((a, b) => key(a) - key(b));
}
