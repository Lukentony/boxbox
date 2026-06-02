# Box Box 🏍️

PWA per seguire la MotoGP 2026 e la classifica FantasyGP di una lega privata.

**Disclaimer**: App personale per uso tra amici. Dati da API di terze parti. Rispetta i ToS.

## Funzionalita

- Calendario MotoGP 2026 con countdown e live
- Classifica FantasyGP della lega privata
- Andamento punti per GP (oro/argento/bronzo)
- Classifiche Moto2, Moto3, WorldSBK
- Notizie Motorsport (RSS italiano)
- PWA installabile su mobile

## Stack

- Frontend: HTML/CSS/JS vanilla (PWA con service worker)
- Backend: Node.js (type module, zero dipendenze)
- Server: Docker nginx:alpine
- Dati: fantasy.motogp.com API, Wikipedia API, motorsport.com RSS

## Setup

1. `cp .env.example .env` e compila le credenziali
2. Esegui: `node refresh-session.mjs && node fetch-data.mjs && node compute.mjs`

## Struttura

```
index.html              Frontend PWA
dist/data/              Dati JSON serviti
fetch-data.mjs          Dati da fantasy.motogp.com
fetch-news.mjs          RSS motorsport.com
fetch-other-categories.mjs  Wikipedia API
compute.mjs             Calcolo punti
refresh-session.mjs     Verifica cookie
renew-dat.mjs           Auto-rinnovo cookie
cron/                   Script cron
.env.example            Template
```

## Pipeline

Cron orario: public data, refresh session, fetch auth data, compute breakdown.
Cron 2x/giorno: RSS news + Wikipedia standings.
