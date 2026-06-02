#!/usr/bin/env bash
# notify-telegram.sh — Invia alert via webhook n8n → Telegram
# Uso: bash notify-telegram.sh "messaggio"

MSG="${1:-BoxBox: alert generico}"
WEBHOOK="http://localhost:5678/webhook/boxbox-alert"
LOG="/home/nasvpn/boxbox/cron/cron.log"

# Escape delle virgolette nel messaggio per JSON sicuro
MSG_ESC="${MSG//\\/\\\\}"
MSG_ESC="${MSG_ESC//\"/\\\"}"

if curl -fsS --max-time 10 \
     -X POST \
     -H 'Content-Type: application/json' \
     -d "{\"message\":\"${MSG_ESC}\"}" \
     "$WEBHOOK" > /dev/null 2>&1; then
  echo "[$(date '+%F %T')] 📨 Alert inviato: ${MSG:0:80}" >> "$LOG"
else
  echo "[$(date '+%F %T')] ⚠️ Alert fallito (n8n non raggiungibile): ${MSG:0:80}" >> "$LOG"
fi
