#!/usr/bin/env bash
# boxbox-news-signal-watch.sh — Adaptive news-signal watcher
# Chiamato da cron */15 * * * *
# Girato da news-signal-phase.py: agisce solo nella finestra prima del blocco
# squadra (Q1 del prossimo GP). In idle esce senza fare nulla.
# Mirror di boxbox-race-watch.sh, stesso schema lock-file.

CRON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER="$(cd "$CRON_DIR/../scraper" && pwd)"
LOG="$CRON_DIR/news-signal-watch.log"
PHASE_SCRIPT="$CRON_DIR/news-signal-phase.py"
LOCK="/tmp/boxbox-newssignal.lock"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

if [ -f "$LOCK" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -lt 300 ]; then
    exit 0  # run gia' in corso, skip silenzioso
  fi
  rm -f "$LOCK"  # lock stale (>5min)
fi

DECISION=$(python3 "$PHASE_SCRIPT" 2>> "$LOG")
ACTION=$(echo "$DECISION" | grep '^ACTION=' | cut -d= -f2-)
PHASE=$(echo "$DECISION"  | grep '^PHASE='  | cut -d= -f2-)
REASON=$(echo "$DECISION" | grep '^REASON=' | cut -d= -f2-)

case "$ACTION" in
  run)
    log "NEWS-SIGNAL [$PHASE] → avvio — $REASON"
    touch "$LOCK"
    cd "$SCRAPER" || { log "FAIL cd $SCRAPER"; rm -f "$LOCK"; exit 1; }

    # 1) Passo separato: quale modello NVIDIA funziona oggi (nessun lavoro vero qui)
    if python3 "$CRON_DIR/nvidia-model-health.py" --watch >> "$LOG" 2>&1; then
      log "NEWS-SIGNAL [$PHASE] model-health OK"
    else
      log "NEWS-SIGNAL [$PHASE] model-health: nessun modello sano, procedo comunque (fallback)"
    fi

    # 2) News fresche (non aspetta il cron delle 8/20)
    if node fetch-news.mjs >> "$LOG" 2>&1; then
      cp news.json ../data/ 2>/dev/null
      log "NEWS-SIGNAL [$PHASE] fetch-news OK"
    else
      log "NEWS-SIGNAL [$PHASE] fetch-news FALLITO"
    fi

    # 3) Lavoro vero: classificazione LLM
    if node analyze-news.mjs >> "$LOG" 2>&1; then
      cp news-signals.json ../data/ 2>/dev/null
      log "NEWS-SIGNAL [$PHASE] analyze-news OK"
    else
      log "NEWS-SIGNAL [$PHASE] analyze-news fallito (non bloccante)"
    fi

    rm -f "$LOCK"
    ;;
  skip)
    # Silenzioso in idle — non loggare (96 esecuzioni/giorno in idle sarebbe spam)
    ;;
  done|locked)
    log "NEWS-SIGNAL [$PHASE] — $REASON"
    ;;
  *)
    log "NEWS-SIGNAL: ACTION sconosciuta: '$ACTION' — $REASON"
    ;;
esac

# ── Team freshness: composizione squadre rivali (piu' frequente in pre-lock) ──
# La pipeline oraria aggiorna all-teams.json 1x/h; qui lo si fa piu' spesso
# nella finestra pre-lock (quando i rivali fanno i cambi), con cadenza propria
# indipendente dal run news. Diff + notifica Discord via team-diff.mjs.
TEAM_STATE="/tmp/boxbox-team-fetch.ts"
case "$PHASE" in
  final_window) TEAM_INTERVAL=900 ;;   # ogni 15 min (cron */15)
  approaching)  TEAM_INTERVAL=1800 ;;  # ogni 30 min
  *)            TEAM_INTERVAL=0 ;;     # idle/locked/done: mai
esac
if [ "$TEAM_INTERVAL" -gt 0 ]; then
  LAST_TEAM=$(cat "$TEAM_STATE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ $((NOW - LAST_TEAM)) -ge "$TEAM_INTERVAL" ]; then
    touch "$LOCK"
    echo "$NOW" > "$TEAM_STATE"
    cd "$SCRAPER" || { log "TEAM FAIL cd $SCRAPER"; rm -f "$LOCK"; exit 1; }
    if node fetch-teams.mjs >> "$LOG" 2>&1; then
      cp all-teams.json ../data/ 2>/dev/null
      log "TEAM [$PHASE] fetch OK"
      DIFF=$(node team-diff.mjs 2>> "$LOG")
      if [ -n "$DIFF" ]; then
        # Lo stato anti-spam si committa SOLO dopo un invio confermato: se
        # notify-discord.sh fallisce, il prossimo giro ritenta lo stesso diff
        # invece di perderlo silenziosamente.
        if bash "$CRON_DIR/notify-discord.sh" "$DIFF"; then
          log "TEAM [$PHASE] cambi rilevati — notifica Discord inviata"
          node team-diff.mjs --commit-state >> "$LOG" 2>&1
        else
          log "TEAM [$PHASE] cambi rilevati ma notifica FALLITA — riprovo al prossimo giro"
        fi
      fi
    else
      log "TEAM [$PHASE] fetch fallito"
    fi
    rm -f "$LOCK"
  fi
fi
