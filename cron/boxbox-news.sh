#!/usr/bin/env bash
set -uo pipefail

SCRAPER="/home/nasvpn/boxbox/scraper"
LOG="/home/nasvpn/boxbox/cron/cron.log"

log() { echo "[$(date "+%F %T")] $*" >> "$LOG"; }

cd "$SCRAPER" || { log "FAIL cd $SCRAPER"; exit 1; }

log "START news"

if node fetch-news.mjs >> "$LOG" 2>&1; then
  cp news.json dist/data/ 2>/dev/null
  log "DONE news"
else
  log "WARN news fetch fallito"
fi

log "START other categories"
if node fetch-other-categories.mjs >> "$LOG" 2>&1; then
  cp other-categories.json dist/data/ 2>/dev/null
  log "DONE other categories (Moto2/Moto3/WSBK)"
else
  log "WARN other categories fetch fallito"
fi
