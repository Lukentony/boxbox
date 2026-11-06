/* Costruzione dei nodi DOM dell'app.
   Le schermate si disegnano con createElement/textContent invece che con
   stringhe HTML (innerHTML): un testo che arriva da fuori resta testo e non
   puo' diventare markup. Le regole stanno in un posto solo:

   - `nodo('div', { class: 'card', style: '...' }, figli...)`;
   - `class` finisce in className, ogni altro attributo con setAttribute
     (per l'SVG serve `nodoSvg`: senza namespace il browser crea un elemento
     HTML sconosciuto che non disegna niente);
   - i figli null/undefined/false si saltano, cosi' le condizioni restano inline;
   - un figlio stringa o numero diventa un nodo di testo, mai markup;
   - un array di figli viene appiattito (comodo con .map). */

function riempi(elemento, attributi, figli) {
  if (attributi) {
    for (const chiave in attributi) {
      const valore = attributi[chiave];
      if (valore == null || valore === false) continue;
      if (chiave === 'class') elemento.className = valore;
      else elemento.setAttribute(chiave, valore);
    }
  }
  /* flat() su tutti i livelli: un array dentro un altro array (comodo quando un
     pezzo si costruisce con .map e poi si annida) non deve restare un array,
     altrimenti append() lo stampa come testo. */
  for (const figlio of figli.flat(Infinity)) {
    if (figlio == null || figlio === false) continue;
    elemento.append(figlio);
  }
  return elemento;
}

export function nodo(tag, attributi, ...figli) {
  return riempi(document.createElement(tag), attributi, figli);
}

export function nodoSvg(tag, attributi, ...figli) {
  return riempi(document.createElementNS('http://www.w3.org/2000/svg', tag), attributi, figli);
}

/* Frammento: piu' nodi di primo livello senza un contenitore in piu'. */
export function frammento(...figli) {
  const f = document.createDocumentFragment();
  for (const figlio of figli.flat(Infinity)) {
    if (figlio == null || figlio === false) continue;
    f.append(figlio);
  }
  return f;
}
