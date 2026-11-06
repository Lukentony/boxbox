#!/usr/bin/env bash
# Verifica ermetica: non avvia cron, API autenticate o notifiche.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for file in ./*.js scraper/*.mjs; do node --check "$file"; done
for file in cron/*.sh scraper/test-audit.sh; do bash -n "$file"; done
node scraper/test-boosters.mjs
node scraper/test-event-order.mjs
node --experimental-vm-modules scraper/test-news-classification.mjs
# Il test browser richiede Playwright e Chromium: non e' una dipendenza del progetto.
# Si lancia a mano dopo averli installati, vedi README.
git diff --check
