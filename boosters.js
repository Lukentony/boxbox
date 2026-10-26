/* boosters.js — la regola dei booster FantasyGP in un posto solo.
   La usano il disegno (tab-fantasy.js, import './boosters.js') e il calcolo dei
   punti (scraper/compute.mjs, import '../boosters.js'). Prima la regola era
   scritta due volte e le due copie non dicevano la stessa cosa: il disegno
   conosceva solo 'rider', il calcolo 'rider' e 'golden', e nessuno dei due
   conosceva 'super' — chi lo giocava non vedeva ne' il tag ne' i punti doppi.

   Tipi presenti nei dati FantasyGP (letti dalla pipeline viva il 26/10/2026:
   10 rider, 4 golden, 3 super):
     rider          details {riderId}  quel pilota conta un'altra volta (2x)
     golden         details {riderId}  un pilota extra, fuori rosa, a punteggio pieno
     super          details null       tutto il GP conta doppio: Q, sprint, gara,
                                       costruttore e squadra
     transfer/transfers                nessun effetto sui punti (sposta i cambi)

   Il booster e' per evento, non per stagione: chi legge deve passare la squadra
   di quel GP (all-teams.json.teams[eventId][giocatore]). */

/* Etichette dei tag. Il 2X e' l'informazione che l'utente deve vedere: un
   'super' senza 2X sembrerebbe un booster di sola immagine. */
const ETICHETTE = {
  rider: 'RIDER 2X',
  super: 'SUPER 2X',
  golden: 'GOLDEN',
  transfer: 'TRANSFERS',
};

/* Alias storici dello stesso tipo: l'API ha usato entrambe le forme. */
const ALIAS = { transfers: 'transfer' };

/* Tipi che producono un effetto sui punti. Un tipo nuovo non viene indovinato:
   senza effetto finche' non lo si aggiunge qui, e il tag lo mostra lo stesso. */
const TIPI = new Set(['rider', 'golden', 'super', 'transfer']);

/* Tipo normalizzato del booster: 'rider' | 'golden' | 'super' | 'transfer' |
   null se il tipo manca o non e' fra quelli che sappiamo trattare. */
function boosterKind(booster) {
  const grezzo = booster?.boosterType;
  if (typeof grezzo !== 'string') return null;
  const tipo = grezzo.trim().toLowerCase();
  const canonico = ALIAS[tipo] || tipo;
  return TIPI.has(canonico) ? canonico : null;
}

/* Id del pilota a cui il booster si riferisce, se ne ha uno. 'super' non ne ha
   (details e' null nei dati veri). */
function boosterRiderId(booster) {
  const tipo = boosterKind(booster);
  if (tipo !== 'rider' && tipo !== 'golden') return null;
  const id = booster?.details?.riderId;
  return id == null ? null : id;
}

/* Il GP intero raddoppia: un solo 'super' basta. */
export function teamDoubled(team) {
  return (team?.boosters || []).some(booster => boosterKind(booster) === 'super');
}

/* I punti di questo pilota sono raddoppiati: dal suo 'rider' oppure dal 'super'
   che raddoppia tutta la squadra (argento compreso). */
export function riderDoubled(team, riderId) {
  if (riderId == null) return false;
  if (teamDoubled(team)) return true;
  return (team?.boosters || []).some(booster =>
    boosterKind(booster) === 'rider' && boosterRiderId(booster) === riderId);
}

/* Piloti Golden da contare come extra: a punteggio pieno, una volta sola, e
   solo se non sono gia' in rosa (oro o argento) — altrimenti sarebbero doppi. */
export function goldenRiderIds(team) {
  const inRosa = new Set([...(team?.riders || []), ...(team?.ridersSilver || [])]);
  const ids = (team?.boosters || [])
    .filter(booster => boosterKind(booster) === 'golden')
    .map(booster => boosterRiderId(booster))
    .filter(id => id != null && !inRosa.has(id));
  return [...new Set(ids)];
}

/* Testo del tag per un booster intero (non per il solo tipo). Un tipo
   sconosciuto resta leggibile in maiuscolo invece di sparire. */
export function boosterLabel(booster) {
  const tipo = boosterKind(booster);
  if (tipo) return ETICHETTE[tipo];
  const grezzo = typeof booster?.boosterType === 'string' ? booster.boosterType.trim() : '';
  return grezzo ? grezzo.toUpperCase() : 'BOOSTER';
}
