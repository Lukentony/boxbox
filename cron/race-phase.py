#!/usr/bin/env python3
"""
race-phase.py — BoxBox adaptive race watcher brain
Determina la fase della sessione corrente e se eseguire la pipeline.

Output (variabili shell):
  PHASE=idle|approaching|pre_race|race_live|post_race|results|done
  ACTION=skip|run_pipeline|done
  REASON=<descrizione leggibile>
"""

import json, sys, os
from datetime import datetime, timezone, timedelta
from pathlib import Path
import urllib.request, urllib.error

EVENTS_LOCAL  = Path('/home/nasvpn/boxbox/scraper/dist/data/events.json')
RIDERS_LOCAL  = Path('/home/nasvpn/boxbox/scraper/dist/data/riders.json')
STATE_FILE    = Path('/tmp/boxbox-racewatch.json')
EVENTS_URL    = 'https://fantasy.motogp.com/json/fantasy/events.json'
RIDERS_URL    = 'https://fantasy.motogp.com/json/fantasy/riders.json'

# Finestre temporali (secondi)
PRE_WINDOW     = 3600   # 1h prima della sessione: entra in modalità attiva
APPROACH_EXTRA = 7200   # 3h prima in totale: fase approaching (2h+PRE)
BUFFER_WINDOW  = 7200   # 2h dopo fine prevista: attende i risultati

# Intervallo minimo tra pipeline runs per fase (secondi)
INTERVALS = {
    'approaching': 1800,  # 30 min
    'pre_race':     300,  # 5 min
    'race_live':    120,  # 2 min
    'post_race':    120,  # 2 min
    'results':      300,  # 5 min (cooldown, 3 conferme)
    'idle':        None,  # mai
    'done':        None,
}

# ─── Helpers ──────────────────────────────────────────────────

def out(phase, action, reason):
    print(f"PHASE={phase}")
    print(f"ACTION={action}")
    print(f"REASON={reason}")

def load_state():
    try:
        return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    except Exception:
        return {}

def save_state(s):
    try:
        STATE_FILE.write_text(json.dumps(s, default=str))
    except Exception:
        pass

def fetch_json_public(url, timeout=8):
    """Fetch JSON da URL pubblico. Ritorna None su errore."""
    try:
        req = urllib.request.Request(
            url,
            headers={
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; BoxBoxWatcher/1.0)',
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def count_final_points(riders_data, ev_id):
    """Conta rider con finalPoints > 0 per un dato evento."""
    if not riders_data:
        return 0, 0
    riders = riders_data if isinstance(riders_data, list) else list(riders_data.values())
    with_final, checked = 0, 0
    ev_id_int = int(ev_id) if str(ev_id).isdigit() else None
    for r in riders:
        if not isinstance(r, dict):
            continue
        ev_data = r.get('stats', {}).get('events', {})
        hun = ev_data.get(str(ev_id)) or (ev_data.get(ev_id_int) if ev_id_int is not None else None)
        if hun and isinstance(hun, dict):
            checked += 1
            if (hun.get('finalPoints') or 0) > 0:
                with_final += 1
    return with_final, checked

# ─── Main ─────────────────────────────────────────────────────

now   = datetime.now(timezone.utc)
state = load_state()

last_run_str = state.get('last_run', '2000-01-01T00:00:00+00:00')
try:
    last_run = datetime.fromisoformat(last_run_str)
except Exception:
    last_run = datetime(2000, 1, 1, tzinfo=timezone.utc)

# ─── Legge events.json locale ─────────────────────────────────
try:
    events = json.loads(EVENTS_LOCAL.read_text())
except Exception as e:
    out('idle', 'skip', f'cannot read events.json: {e}')
    sys.exit(0)

# ─── Trova sessioni rilevanti (sprint + final non complete) ───
candidates = []

for ev in events:
    if ev.get('status') == 'complete':
        continue
    ev_id = str(ev['id'])

    # Salta eventi già marcati come done in state
    if state.get('done_ev') == ev_id:
        continue

    for race in ev.get('races', []):
        rtype = race.get('type')
        if rtype not in ('sprint', 'final'):
            continue
        if race.get('status') == 'complete':
            continue

        try:
            start = datetime.fromisoformat(race['dateStart']).astimezone(timezone.utc)
        except Exception:
            continue

        # Stima durata: sprint ~25 min, final ~50 min
        duration = timedelta(minutes=25 if rtype == 'sprint' else 50)
        try:
            raw_end = datetime.fromisoformat(race['dateEnd']).astimezone(timezone.utc)
            end = raw_end if raw_end > start + timedelta(minutes=5) else start + duration
        except Exception:
            end = start + duration

        window_open  = start - timedelta(seconds=APPROACH_EXTRA)
        window_close = end   + timedelta(seconds=BUFFER_WINDOW)

        if window_open <= now <= window_close:
            candidates.append({
                'ev_id':       ev_id,
                'ev_name':     ev.get('displayedName', ev.get('name', ev_id)),
                'race_id':     str(race['id']),
                'type':        rtype,
                'start':       start,
                'end':         end,
                'window_open':  window_open,
                'window_close': window_close,
                'race_status': race.get('status'),
            })

if not candidates:
    out('idle', 'skip', 'nessuna sessione nel window temporale')
    sys.exit(0)

# Priorità: active > prossimo per start
target = sorted(candidates, key=lambda x: (
    0 if x['race_status'] == 'active' else 1,
    x['start']
))[0]

ev_id     = target['ev_id']
race_id   = target['race_id']
race_type = target['type']
ev_name   = target['ev_name']
label     = f"{ev_name} {race_type.upper()}"

# ─── Determina fase ───────────────────────────────────────────
if now < target['start']:
    secs_before = (target['start'] - now).total_seconds()
    phase = 'pre_race' if secs_before <= PRE_WINDOW else 'approaching'

elif now < target['end'] or target['race_status'] == 'active':
    phase = 'race_live'

else:
    # Sessione finita o in ritardo — verifica risultati in locale
    riders_local = None
    try:
        riders_local = json.loads(RIDERS_LOCAL.read_text())
    except Exception:
        pass

    with_final, checked = count_final_points(riders_local, ev_id)

    if checked > 0 and with_final >= max(1, checked * 0.5):
        phase = 'results'
        confirms = state.get('result_confirms', 0) + 1
        state['result_confirms'] = confirms

        if confirms >= 3:
            # Abbastanza conferme: usciamo dal hot zone
            save_state({'last_run': last_run_str, 'done_ev': ev_id})
            out('done', 'done',
                f'{label}: risultati confermati ({with_final}/{checked} rider), '
                f'conferme={confirms} — uscita hot zone')
            sys.exit(0)
    else:
        phase = 'post_race'
        state['result_confirms'] = 0

# ─── Controlla intervallo minimo ──────────────────────────────
min_interval = INTERVALS.get(phase, 3600)
elapsed = (now - last_run).total_seconds()

if elapsed < min_interval:
    out(phase, 'skip',
        f'{label} [{phase}]: ultimo run {elapsed:.0f}s fa, min={min_interval}s')
    sys.exit(0)

# ─── Live API check: rileva status flip race → complete ───────
# Eseguito solo in race_live/post_race per minimizzare richieste API
live_flip = False
if phase in ('race_live', 'post_race'):
    live_events = fetch_json_public(EVENTS_URL)
    if live_events:
        for lev in live_events:
            if str(lev.get('id')) == ev_id:
                for lrace in lev.get('races', []):
                    if str(lrace.get('id')) == race_id:
                        if lrace.get('status') == 'complete':
                            live_flip = True
                            phase = 'post_race'  # gara appena conclusa
                        break
                break

    # In post_race: controlla anche finalPoints dalla API pubblica riders
    if phase == 'post_race':
        live_riders = fetch_json_public(RIDERS_URL)
        if live_riders:
            with_final_live, checked_live = count_final_points(live_riders, ev_id)
            if checked_live > 0 and with_final_live >= max(1, checked_live * 0.5):
                phase = 'results'
                state['result_confirms'] = state.get('result_confirms', 0)

# ─── Aggiorna state e segnala esecuzione pipeline ─────────────
state['last_run']  = now.isoformat()
state['phase']     = phase
state['watching']  = label
if live_flip:
    state['live_flip_detected'] = now.isoformat()
save_state(state)

flip_note = ' [LIVE STATUS FLIP: gara completata]' if live_flip else ''
out(phase, 'run_pipeline',
    f'{label} [{phase}]: elapsed={elapsed:.0f}s{flip_note}')
