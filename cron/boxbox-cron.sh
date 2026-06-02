#!/usr/bin/env bash
set -uo pipefail

SCRAPER="/home/nasvpn/boxbox/scraper"
CRON_DIR="/home/nasvpn/boxbox/cron"
LOG="$CRON_DIR/cron.log"
WEBHOOK="http://localhost:5678/webhook/boxbox-alert"
DIST="$SCRAPER/dist/data"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

cd "$SCRAPER" || { log "FAIL cd $SCRAPER"; exit 1; }

log "START pipeline"

mkdir -p "$DIST"

log "STEP public-data"
PUBLIC_OK=0
for f in riders.json events.json constructors.json squads.json; do
  URL="https://fantasy.motogp.com/json/fantasy/$f"
  if curl -fsS --compressed --max-time 15 -o "$SCRAPER/$f.tmp" "$URL" 2>/dev/null; then
    mv "$SCRAPER/$f.tmp" "$SCRAPER/$f"
    cp "$SCRAPER/$f" "$DIST/$f"
    PUBLIC_OK=$((PUBLIC_OK + 1))
  else
    rm -f "$SCRAPER/$f.tmp"
    log "WARN $f fetch fallito"
  fi
done
log "DONE public-data ($PUBLIC_OK/4)"

log "STEP refresh-session"
if ! node refresh-session.mjs >> "$LOG" 2>&1; then
  log "DAT/COOKIE scaduto, tentativo rinnovo automatico..."
  if node renew-dat.mjs >> "$LOG" 2>&1; then
    log "Rinnovo OK, riprovo refresh-session"
    if ! node refresh-session.mjs >> "$LOG" 2>&1; then
      log "SKIP fetch-data (rinnovo riuscito ma sessione ancora non valida)"
      curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json'         -d '{"message":"BoxBox: rinnovo DAT riuscito ma API ancora 401"}'         "$WEBHOOK" > /dev/null 2>&1 || true
      log "DONE pipeline (solo dati pubblici)"
      exit 0
    fi
  else
    log "SKIP fetch-data (rinnovo automatico fallito)"
    curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json'       -d '{"message":"BoxBox: DAT scaduto e rinnovo automatico fallito"}'       "$WEBHOOK" > /dev/null 2>&1 || true
    log "DONE pipeline (solo dati pubblici)"
    exit 0
  fi
fi

log "STEP fetch-data"
if ! node fetch-data.mjs >> "$LOG" 2>&1; then
  log "FAIL fetch-data"
  exit 2
fi

log "STEP compute"
node compute.mjs >> "$LOG" 2>&1 || log "WARN compute non bloccante"

cp breakdown.json all-teams.json "$DIST/" 2>/dev/null

log "DONE pipeline (completo)"
