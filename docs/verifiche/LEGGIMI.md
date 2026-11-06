# Anteprime

Immagini prodotte da `scraper/test-browser.mjs`, che apre il frontend vero in Chromium headless
con dati sintetici, blocca ogni richiesta esterna e non tocca `data/`.

Cosa contengono e cosa no:

- i nomi dei piloti, i team e le squadre sono inventati per l'occasione;
- non ci sono nomi dei giocatori della lega, né dati personali;
- non ci sono dati scaricati da servizi esterni: la fixture vive dentro il test;
- il GP, le sessioni e il tabellone sono uno scenario costruito a mano, non una gara reale.

Le immagini si rigenerano con:

```
node scraper/test-browser.mjs
```

Il test richiede Playwright e un Chromium già presenti; `BOXBOX_CHROMIUM` può indicare
l'eseguibile. Se il test passa, gli screenshot corrispondono al codice di quel commit: sono
anch'essi un artefatto verificabile, non un ritaglio fatto a mano.

## Elenco

| File | Vista |
| --- | --- |
| `home-*.png` | Home: GP in corso, scorciatoie, top 3 di stagione, leader fantasy, ultime notizie |
| `live-*.png` | Live: intestazione del weekend, tabellone della sessione, programma |
| `classifiche-*.png` | Classifiche: piloti con punti e distacco |
| `pilota-*.png` | Dettaglio pilota: andamento per GP, storico prezzo |
| `fantasy-*.png` | Fantasy: andamento per GP, prezzi e valore |
| `gp-*.png` | Dettaglio di un GP scelto dalla scheda Fantasy |
| `notizie-*.png` | Notizie |
| `impostazioni-*.png` | Impostazioni e link utili |

Il suffisso è `-desktop` (1440×1000) o `-mobile` (390×844). Le immagini sono catturate alla
dimensione del viewport, non a pagina intera: mostrano quello che si vede aprendo la schermata.
