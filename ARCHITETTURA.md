# Architettura del repository pubblico BoxBox

Verificata sui sorgenti locali il 2026-11-06. Questo repository è la versione pubblica curata
dell'app: stesso frontend dell'uso privato, **senza** le parti riservate all'uso privato. Non descrive il deploy privato e non dimostra quale revisione sia in
esecuzione su un server. Per il metodo di verifica leggere
[docs/audit-2026-11-05.md](docs/audit-2026-11-05.md).

## Componenti e flussi

Il browser carica `index.html` → `main.js` → moduli ES nativi. `state.js` conserva `DATA` e le
preferenze di navigazione; `data.js` carica i JSON da `data/`. Le schermate costruiscono nodi DOM
con `dom.js`, quindi un testo proveniente da un feed resta testo. Non esiste un backend HTTP
applicativo, né un database o un bundler. Le stanze sono Home, Live, Classifiche, Fantasy,
Notizie e Impostazioni; il router vive nell'hash e non esiste una stanza "Altre".

Gli script Node in `scraper/` acquisiscono dati Fantasy MotoGP, feed news, risultati del weekend
e classifiche di altre categorie. `compute.mjs` calcola `breakdown.json`; gli script cron copiano
i risultati nella cartella pubblica `data/`. `team-diff.mjs` genera messaggi per il watcher; la
conferma dello stato anti-spam avviene solo dopo l'invio riuscito. `analyze-news.mjs` chiama
NVIDIA NIM per classificare articoli, non per compiere azioni sul gioco.

## Autorità condivise

- `boosters.js` definisce i moltiplicatori usati da frontend e calcolo Node.
- `event-order.js` ordina solo eventi con metadati temporali: `order` positivo, oppure
  `dateStart` se comune a tutto l'insieme. Non usa gli ID come tempo. Insiemi non confrontabili
  vengono scartati; i chiamanti filtrano prima gli eventi pertinenti.
- `format.js` definisce l'escaping HTML e la politica URL: passano solo URL assoluti HTTP/HTTPS,
  quindi un link o un'immagine `javascript:` o `data:` non viene reso attivo.
- `scraper/news-classification.mjs` valida l'intera risposta LLM prima dell'aggregazione e
  genera i vincoli del prompt dalla stessa definizione. Gli ID devono appartenere al dataset
  piloti e gli indici agli articoli inviati; le risposte malformate non vengono pubblicate.

## Dati e confini di fiducia

`data/*.json` è destinato a chi può raggiungere il server: il frontend non è un confine di
accesso. Gli input RSS, API, Wikipedia e LLM non sono markup fidato. Le preferenze in
`localStorage` non costituiscono autenticazione. I dati sorgente generati in `scraper/` e i
file di credenziali non devono stare nella radice HTTP.

`all-teams.json` viene scritto con temporaneo e rename; questo evita un file troncato ma non
certifica la completezza dei roster né rende atomico l'intero gruppo di JSON. L'anti-spam
predefinito del watcher è temporaneo: `BOXBOX_TEAM_DIFF_STATE_DIR` e
`BOXBOX_TEAM_DIFF_DATA_DIR` permettono directory dedicate, usate dai test per non toccare
lo stato reale. La loro introduzione non migra alcun dato operativo.

## Distribuzione e recupero

Il Dockerfile costruisce un'immagine nginx copiando solo i file frontend espliciti e `*.js`;
Compose monta `data/` per gli aggiornamenti. Non servire l'intera directory del clone con un
server generico: dopo il setup comprende anche configurazione riservata. La configurazione
nginx e la politica di esposizione devono essere verificate dal gestore del deploy; nessun
server o container è stato modificato in questo audit.

Il service worker precachea la shell; le modifiche alla shell richiedono un nuovo nome di
cache. La versione di questa revisione è `boxbox-public-v22`, indipendente dalla numerazione
del deploy privato. I dati usano network-first con fallback offline; `sw-stale` è un'indicazione,
non una certificazione di coerenza fra file. La shell non contiene moduli che non esistono in
questo repository.

`scraper/refresh-session.mjs` legge `LEAGUE_ID` dal `.env`: l'identificativo della lega non è
una costante del codice. Il file `.env` non entra nel repository e non va servito via HTTP.

Per ricostruire il frontend bastano checkout e server statico correttamente confinato. Per
rigenerare dati autenticati servono credenziali e configurazione esterne a Git. Non esiste in
questo mirror una procedura verificata per il backup/ripristino dell'installazione privata:
non dedurla da questi file e non cancellare gli snapshot esistenti per ripartire.

## Verifica

`bash scraper/test-audit.sh` esegue sintassi e regressioni senza rete o credenziali.
`node scraper/test-browser.mjs` aggiunge il browser headless con fixture sintetiche,
richiedendo Playwright/Chromium già disponibili; salva gli screenshot in `docs/verifiche/`.
Nessuno dei due è una prova del deploy reale né una certificazione di sicurezza completa.
