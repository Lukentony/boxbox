#!/usr/bin/env bash
# notify-discord.sh — Invia un messaggio boxbox a un canale Discord via webhook
# Uso: bash notify-discord.sh "messaggio"
# Il webhook URL vive in scraper/.env (DISCORD_WEBHOOK_URL), mai hardcoded qui.
# Tag HTML semplici nel messaggio -> markdown Discord. Color 3900150 (verde).

set -uo pipefail

CRON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER="$(cd "$CRON_DIR/../scraper" && pwd)"
LOG="$CRON_DIR/cron.log"
MSG="${1:-BoxBox: alert generico}"

# Carica solo la variabile del webhook dal .env (nessun altro valore letto)
WEBHOOK=""
if [ -f "$SCRAPER/.env" ]; then
  WEBHOOK=$(grep -E "^DISCORD_WEBHOOK_URL=" "$SCRAPER/.env" | head -1 | cut -d= -f2-)
fi
if [ -z "$WEBHOOK" ]; then
  echo "[$(date '+%F %T')] ⚠️ Discord: DISCORD_WEBHOOK_URL assente in scraper/.env" >> "$LOG"
  exit 1
fi

# Tag HTML usati dai messaggi esistenti -> markdown Discord.
# Lavora sul testo con newline VERI: l'escape per JSON lo fa python piu' sotto,
# in un solo posto, invece di essere ricostruito a mano con sed (fragile: non
# gestirebbe correttamente newline reali multi-riga ne' l'escape di <code>).
MSG_MD="${MSG//<br>/$'\n'}"
MSG_MD="${MSG_MD//<br\/>/$'\n'}"
MSG_MD="${MSG_MD//<b>/**}"
MSG_MD="${MSG_MD//<\/b>/**}"
MSG_MD="${MSG_MD//<i>/_}"
MSG_MD="${MSG_MD//<\/i>/_}"
MSG_MD="${MSG_MD//<code>/\`}"
MSG_MD="${MSG_MD//<\/code>/\`}"

BODY=$(printf '%s' "$MSG_MD" | python3 -c '
import json, sys
msg = sys.stdin.read()
print(json.dumps({"embeds": [{"description": msg, "color": 3900150}]}))
')

if [ -z "$BODY" ]; then
  echo "[$(date '+%F %T')] ⚠️ Discord: costruzione JSON fallita per: ${MSG:0:80}" >> "$LOG"
  exit 1
fi

if curl -fsS --max-time 10 \
     -X POST \
     -H 'Content-Type: application/json' \
     -d "$BODY" \
     "$WEBHOOK" > /dev/null 2>&1; then
  echo "[$(date '+%F %T')] 📨 Discord inviato: ${MSG:0:80}" >> "$LOG"
  exit 0
else
  echo "[$(date '+%F %T')] ⚠️ Discord fallito: ${MSG:0:80}" >> "$LOG"
  exit 1
fi
