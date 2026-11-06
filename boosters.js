/* booster.js — la regola dei booster FantasyGP in un posto solo.
   La usano compute.mjs (i punti) e tab-fantasy.js (i tag sulle card e le righe
   della tabella): prima era scritta due volte e le due copie dicevano cose
   diverse, perche' solo la card del pilota conosceva 'golden' e nessuna
   conosceva 'super'.

   Dove finiscono i punti lo dice teamEventScoring(), in fondo al file: e' la
   stessa funzione per il breakdown della pipeline e per la tabella dell'app,
   cosi' i due numeri non possono raccontare due storie diverse.

   Tipi presenti nei dati veri (dist/data/all-teams.json, letto il 26/10/2026: 10
   rider, 4 golden, 3 super):
     rider          details {riderId}  quel pilota conta un'altra volta (2x)
     golden         details {riderId}  un pilota extra, fuori rosa, a punteggio pieno
     super          details null       tutto il GP conta doppio: Q, sprint, gara,
                                       costruttore e squadra
     transfer/transfers                nessun effetto sui punti (sposta i cambi)

   Il booster e' per evento, non per stagione: chi legge deve passare la squadra
   di quel GP (all-teams.json.teams[eventId][giocatore]). */

/* Etichette dei tag. Il 2X e' l'informazione che l'utente deve vedere: un
   'super' senza 2X sembrava un booster di sola immagine. */
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
export function boosterKind(booster) {
  const grezzo = booster?.boosterType;
  if (typeof grezzo !== 'string') return null;
  const tipo = grezzo.trim().toLowerCase();
  const canonico = ALIAS[tipo] || tipo;
  return TIPI.has(canonico) ? canonico : null;
}

/* Id del pilota a cui il booster si riferisce, se ne ha uno. 'super' non ne ha
   (details e' null nei dati veri). */
export function boosterRiderId(booster) {
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

/* ═════════════════════════════════════════════════════════
   I PUNTI DI UN GP, VOCE PER VOCE
   ═════════════════════════════════════════════════════════ */
/* Perche' esiste (31/10/2026): compute.mjs sommava i punti per conto suo e
   tab-fantasy.js li ricalcolava per disegnare la tabella. I due conti non
   tornavano sullo stesso GP: evento 20 (MALAYSIA), squadra di Lukentony con il
   booster 'super', API 151 punti, e la card diceva 151 in testa e 104 nella
   riga Totale -- perche' il disegno raddoppiava costruttore e squadra ma non le
   righe dei piloti. Con una funzione sola il secondo conto non esiste: le voci
   che la tabella mostra sono quelle che questa funzione somma.

   Ordine delle voci: quello della tabella del gioco (oro, golden, argento,
   costruttore, squad). Un pilota in rosa senza statistiche per quel GP resta
   una voce con `senzaDati: true` e punti zero: la vista scrive "—" invece di
   far sparire il pilota dalla tabella.

   I punti escono non arrotondati: arrotonda chi li scrive (compute.mjs per il
   breakdown, fmt() per la vista), cosi' la somma delle voci non cambia valore
   passando dal disegno. */
export function teamEventScoring(team, eventId, lookups) {
  const riderById = lookups?.riderById || {};
  const constrById = lookups?.constrById || {};
  const squadById = lookups?.squadById || {};
  const eid = String(eventId);
  const lines = [];

  const riga = (tipo, id) => {
    const esistente = lines.find(l => l.tipo === tipo && l.id === id);
    if (esistente) return esistente;
    const nuova = { tipo, id, q: 0, sprint: 0, race: 0, bonus: 0, tot: 0 };
    lines.push(nuova);
    return nuova;
  };

  /* I punti di un pilota finiscono nella sua riga anche quando arrivano da un
     booster 'rider', che li conta una seconda volta: la riga dice quanto quel
     pilota porta alla squadra, non la meta' che si vede nel gioco. */
  const addRider = (tipo, rid, factor) => {
    const line = riga(tipo, rid);
    const e = riderById[rid]?.stats?.events?.[eid];
    if (!e) {
      line.senzaDati = true;
      return;
    }
    const tot = (e.points || 0) * factor;
    const q = (e.q2Points || e.q1Points || 0) * factor;
    const sprint = (e.sprintPoints || 0) * factor;
    const race = (e.finalPoints || 0) * factor;
    line.q += q; line.sprint += sprint; line.race += race;
    /* Il resto (giro veloce, pilota della gara, penalita' DNF, posizioni
       guadagnate...) sta nel bonus: e' la differenza che compute.mjs chiama
       'extra'. Le voci del costruttore e della squadra ci finiscono intere,
       perche' non si possono splittare per fase. */
    line.bonus += tot - q - sprint - race;
    line.tot += tot;
  };

  /* Chi e' in rosa decide anche dove finisce il booster 'rider'; i Golden sono
     fuori rosa per definizione (goldenRiderIds li esclude). */
  const tipoInRosa = new Map();
  (team?.riders || []).forEach(rid => tipoInRosa.set(rid, 'gold'));
  (team?.ridersSilver || []).forEach(rid => tipoInRosa.set(rid, 'silver'));
  const golden = goldenRiderIds(team);
  golden.forEach(rid => { if (!tipoInRosa.has(rid)) tipoInRosa.set(rid, 'golden'); });

  (team?.riders || []).forEach(rid => addRider('gold', rid, 1));
  golden.forEach(rid => addRider('golden', rid, 1));
  (team?.ridersSilver || []).forEach(rid => addRider('silver', rid, 0.5));
  (team?.boosters || []).forEach(b => {
    const rid = boosterKind(b) === 'rider' ? boosterRiderId(b) : null;
    if (rid != null) addRider(tipoInRosa.get(rid) || 'gold', rid, 1);
  });
  (team?.constructors || []).forEach(cid => {
    const line = riga('constructor', cid);
    const pts = constrById[cid]?.stats?.events?.[eid]?.points || 0;
    line.bonus += pts;
    line.tot += pts;
  });
  (team?.squads || []).forEach(sid => {
    const line = riga('squad', sid);
    const pts = squadById[sid]?.stats?.events?.[eid]?.points || 0;
    line.bonus += pts;
    line.tot += pts;
  });

  /* Il Super raddoppia il GP intero: Q, sprint, gara, costruttore e squadra.
     Verificato sui dati veri del 26/10/2026 (GP Australia): con il super
     l'API espone 133 punti dove il conto ne da' 66,5, e 123 dove ne da' 61,5,
     bonus di costruttore e squadra compresi. Il raddoppio si applica qui, una
     volta sola, alle voci e quindi al totale: non a meta' tabella. */
  const doppio = teamDoubled(team) ? 2 : 1;
  lines.forEach(l => {
    l.q *= doppio; l.sprint *= doppio; l.race *= doppio; l.bonus *= doppio; l.tot *= doppio;
  });

  const somma = (campo) => lines.reduce((s, l) => s + l[campo], 0);
  return {
    q: somma('q'),
    sprint: somma('sprint'),
    race: somma('race'),
    extra: somma('bonus'),
    total: somma('tot'),
    lines,
  };
}

/* Testo del tag per un booster intero (non per il solo tipo). Un tipo
   sconosciuto resta leggibile in maiuscolo invece di sparire. */
export function boosterLabel(booster) {
  const tipo = boosterKind(booster);
  if (tipo) return ETICHETTE[tipo];
  const grezzo = typeof booster?.boosterType === 'string' ? booster.boosterType.trim() : '';
  return grezzo ? grezzo.toUpperCase() : 'BOOSTER';
}
