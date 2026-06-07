#!/usr/bin/env bash
# boxbox-race-watch.sh — Adaptive race watcher
# Chiamato da cron */2 * * * *
# Esegue la pipeline solo durante le finestre di gara (sprint/final).
# In idle, esce senza fare nulla in <100ms.

CRON_DIR="/home/nasvpn/boxbox/cron"
LOG="$CRON_DIR/race-watch.log"
PHASE_SCRIPT="$CRON_DIR/race-phase.py"
PIPELINE="$CRON_DIR/boxbox-cron.sh"
LOCK="/tmp/boxbox-pipeline.lock"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# Evita run concorrenti (pipeline già in esecuzione)
if [ -f "$LOCK" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -lt 300 ]; then
    exit 0  # pipeline già in corso, skip silenzioso
  fi
  rm -f "$LOCK"  # lock stale (>5min): rimuovi e continua
fi

# Ottieni decisione dallo script Python
DECISION=$(python3 "$PHASE_SCRIPT" 2>> "$LOG")
ACTION=$(echo "$DECISION" | grep '^ACTION=' | cut -d= -f2-)
PHASE=$(echo "$DECISION"  | grep '^PHASE='  | cut -d= -f2-)
REASON=$(echo "$DECISION" | grep '^REASON=' | cut -d= -f2-)

case "$ACTION" in
  run_pipeline)
    log "RACE-WATCH [$PHASE] → pipeline — $REASON"
    touch "$LOCK"
    bash "$PIPELINE" >> "$LOG" 2>&1
    EXIT_CODE=$?
    rm -f "$LOCK"
    if [ $EXIT_CODE -eq 0 ]; then
      log "RACE-WATCH [$PHASE] pipeline OK"
    else
      log "RACE-WATCH [$PHASE] pipeline FAIL (exit $EXIT_CODE)"
    fi
    ;;
  done)
    log "RACE-WATCH [done] — $REASON"
    ;;
  skip)
    # Silenzioso — non loggare (720 esecuzioni/giorno in idle sarebbe spam)
    ;;
  *)
    log "RACE-WATCH: ACTION sconosciuta: '$ACTION' — $REASON"
    ;;
esac
