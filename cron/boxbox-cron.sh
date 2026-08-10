#!/usr/bin/env bash
set -uo pipefail

CRON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER="$(cd "$CRON_DIR/../scraper" && pwd)"
LOG="$CRON_DIR/cron.log"
NOTIFY="$CRON_DIR/notify-discord.sh"
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
      bash "$NOTIFY" "BoxBox: rinnovo DAT riuscito ma API ancora 401" || true
      log "DONE pipeline (solo dati pubblici)"
      exit 0
    fi
  else
    log "SKIP fetch-data (rinnovo automatico fallito)"
    bash "$NOTIFY" "BoxBox: DAT scaduto e rinnovo automatico fallito" || true
    log "DONE pipeline (solo dati pubblici)"
    exit 0
  fi
fi

log "STEP fetch-data"
node fetch-data.mjs >> "$LOG" 2>&1
FETCH_EXIT=$?
if [ "$FETCH_EXIT" -eq 3 ]; then
  # fetch-data.mjs segnala con exit 3 il caso "leaderboard vuota, roster non
  # aggiornato" (sessione Fantasy in errore lato provider). Non e' un FAIL vero
  # e proprio: i dati pubblici restano comunque aggiornati.
  log "WARN fetch-data: leaderboard vuota, roster non aggiornato (dati pubblici ok)"
  bash "$NOTIFY" "BoxBox: leaderboard Fantasy vuota (sessione?) — roster non aggiornato, riprovo al prossimo giro" || true
elif [ "$FETCH_EXIT" -ne 0 ]; then
  log "FAIL fetch-data"
  exit 2
fi

log "STEP compute"
node compute.mjs >> "$LOG" 2>&1 || log "WARN compute non bloccante"

cp breakdown.json all-teams.json "$DIST/" 2>/dev/null

log "STEP rider-history"
HIST="rider-history.json"
if [ -f "$HIST" ] && grep -q "\"season\":$(date +%Y)" "$HIST"; then
  log "SKIP rider-history (gia' stagione $(date +%Y))"
else
  if node fetch-rider-history.mjs >> "$LOG" 2>&1; then
    cp "$HIST" "$DIST/" 2>/dev/null
    log "DONE rider-history"
  else
    log "WARN rider-history fallito (non bloccante, resta il file precedente)"
  fi
fi

log "DONE pipeline (completo)"
