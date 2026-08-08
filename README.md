# Box Box 🏍️

![Vanilla JS](https://img.shields.io/badge/frontend-vanilla%20JS-f7df1e?logo=javascript&logoColor=black)
![ES Modules](https://img.shields.io/badge/modules-native%20ES-3178c6)
![Node.js](https://img.shields.io/badge/pipeline-Node.js-339933?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/deploy-Docker-2496ed?logo=docker&logoColor=white)
![PWA](https://img.shields.io/badge/-PWA-5a0fc8?logo=pwa&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

PWA per seguire la MotoGP 2026 e la classifica FantasyGP di una lega privata tra amici.

**Perché esiste**: l'app ufficiale Fantasy MotoGP è lenta e piena di pubblicità. Volevo
qualcosa di veloce, leggero, che funzionasse anche offline — e che mi dicesse subito da dove
arrivano i punti (quali, sprint, gara, bonus), non solo il totale.

**Disclaimer**: progetto personale, non affiliato a Dorna Sports / MotoGP. Usa le API
pubbliche/autenticate di `fantasy.motogp.com`: rispetta i loro Termini di Servizio.

## Funzionalità

- Calendario MotoGP 2026 con countdown al prossimo GP e stato live durante il weekend
- Classifica FantasyGP della lega, con breakdown punti per componente (Quali/Sprint/Gara/Bonus)
- Andamento punti per GP, giocatore per giocatore
- Prezzi & valore: chi sale/scende di prezzo, miglior rapporto punti/milione
- Dettaglio pilota: andamento per GP, storico prezzo, forma recente
- Classifiche Moto2, Moto3, WorldSBK
- News da Motorsport.com, raggruppate per GP imminente; segnale di sentiment per pilota via LLM
  (NVIDIA NIM) quando disponibile — degradazione soft se la chiave API non è configurata
- Notifica su Discord quando un rivale della lega cambia roster prima del lock squadra
- Notifiche in-app (Notification API) durante i weekend di gara
- PWA installabile, funzionamento offline via service worker

## Stack

- **Frontend**: HTML/CSS/JS vanilla, **ES module nativi** (`<script type="module">`,
  `import`/`export`) — zero dipendenze, **zero build step**. Il browser esegue i moduli così
  come sono; il deploy è semplicemente copiare i file su un server statico.
- **Pipeline dati**: Node.js, zero dipendenze runtime, `type: module`
- **Server**: Docker, `nginx:alpine`
- **PWA**: Service worker con cache network-first per i dati, cache-first per la shell
- **Automazione**: cron adattivo (cadenza diversa idle → weekend di gara → pre-lock squadra),
  rinnovo automatico della sessione via Playwright/Chrome DevTools Protocol

### Perché niente bundler

Il frontend è ~1400 righe divise in moduli per responsabilità (un file per tab, un file per lo
stato condiviso, uno per i formatter, ecc. — vedi `Struttura` sotto). Gli ES module nativi dei
browser moderni bastano per tenerlo leggibile senza introdurre una toolchain: niente `npm
install`, niente step di compilazione, un `<script type="module" src="main.js">` e via.
L'unico requisito è servire i file via HTTP (non `file://`), per via delle policy CORS sui
moduli — qualunque server statico va bene, incluso `python3 -m http.server` in locale.

## Setup

```bash
cd scraper
cp .env.example .env   # compila LEAGUE_ID, credenziali, RIVALS, webhook Discord (tutto opzionale
                        # tranne le credenziali Fantasy — vedi i commenti nel file)
node refresh-session.mjs && node fetch-data.mjs && node compute.mjs && node fetch-news.mjs
cd ..
python3 -m http.server 8080   # o: docker compose up
```

## Struttura

```
index.html                  Shell HTML statica + <script type="module" src="main.js">
styles.css                  Design system (un solo file, nessun preprocessore)
main.js                     Entry point: registra il service worker, avvia il caricamento dati
state.js                    Stato condiviso (DATA + tab/GP selezionati)
data.js                     load() / refreshData() — fetch e popolamento di DATA
format.js, selectors.js,    Helper puri: formattazione, derivazioni sui dati, metriche
  analysis.js, countdown.js   prezzo/valore/forma, countdown
ui.js                       Navigazione tra tab, orchestrazione del render
tab-home.js                 Tab Home (countdown, top3, news)
tab-standings.js            Tab Campionato (piloti/costruttori/team/calendario)
tab-fantasy.js              Tab Fantasy (classifica stagione, dettaglio GP)
tab-other.js                Tab Altre (Moto2/Moto3/WSBK, impostazioni)
pull-to-refresh.js,         Pull-to-refresh, notifiche in-app, auto-refresh nei weekend
  notifications.js,
  auto-refresh.js
sw.js                       Service worker (cache shell + dati)

scraper/
├── fetch-data.mjs          Leaderboard + roster squadre da fantasy.motogp.com
├── fetch-teams.mjs         Fetch leggero del solo GP in pre-show (per il watcher rivali)
├── fetch-news.mjs          RSS Motorsport.com, raggruppamento per GP imminente
├── analyze-news.mjs        Classificazione sentiment news per pilota via LLM (opzionale)
├── compute.mjs             Calcolo breakdown punti (Quali/Sprint/Gara/Bonus)
├── team-diff.mjs           Diff roster rivali tra GP, anti-spam a due fasi
├── refresh-session.mjs     Verifica validità sessione/cookie
├── renew-dat.mjs           Rinnovo automatico cookie via Playwright/CDP
├── test-weekend-pipeline.mjs  Test suite dry-run della pipeline
└── .env.example            Template configurazione

cron/
├── boxbox-cron.sh                  Pipeline oraria (dati + calcolo)
├── boxbox-news.sh                  News + classifiche altre categorie, 2x/giorno
├── boxbox-race-watch.sh            Cadenza adattiva durante i weekend di gara
├── boxbox-news-signal-watch.sh     Cadenza adattiva pre-lock squadra + watcher rivali
├── race-phase.py, news-signal-phase.py   "Cervello" delle cadenze adattive
├── nvidia-model-health.py          Sceglie il modello LLM più sano tra quelli disponibili
└── notify-discord.sh               Notifiche (DAT scaduto, cambi rivali, ecc.)
```

## Pipeline

Cron orario: dati pubblici + autenticati, calcolo breakdown. Cron adattivo durante i weekend di
gara e nella finestra prima del blocco squadra (fino a ogni 2-15 minuti, altrimenti idle). Cron
2x/giorno: news + classifiche Moto2/Moto3/WSBK.

## Licenza

MIT — vedi [LICENSE](LICENSE).
