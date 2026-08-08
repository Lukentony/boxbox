#!/usr/bin/env python3
"""
news-signal-phase.py — BoxBox news-signal watcher brain
Mirror di race-phase.py, ma il "momento critico" non è la gara: è il BLOCCO squadra,
che scatta all'inizio delle qualifiche (Q1) del prossimo GP, non a event.dateStart
(per alcuni GP i due orari sono lontani anche piu' di un giorno, es. Thailandia).

Output (variabili shell):
  PHASE=idle|approaching|final_window|locked|done
  ACTION=skip|run|done
  REASON=<descrizione leggibile>
"""

import json, sys
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
EVENTS_LOCAL = BASE_DIR / 'scraper' / 'dist' / 'data' / 'events.json'
STATE_FILE = Path('/tmp/boxbox-newssignal.json')

# Finestre (ore prima del blocco/Q1)
APPROACHING_FROM_H = 48   # oltre le 48h: idle, non serve ancora agire
FINAL_WINDOW_FROM_H = 12  # sotto le 12h: finestra calda

INTERVALS = {
    'approaching':   6 * 3600,   # un run ogni 6h
    'final_window':  2 * 3600,   # un run ogni 2h
    'idle': None,
    'locked': None,
}


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


def q1_start(event):
    """Orario di Q1 per l'evento, o None se non presente in races[]."""
    for race in event.get('races', []):
        if race.get('type') == 'q1' and race.get('dateStart'):
            try:
                return datetime.fromisoformat(race['dateStart']).astimezone(timezone.utc)
            except Exception:
                return None
    return None


def main():
    now = datetime.now(timezone.utc)
    state = load_state()

    try:
        events = json.loads(EVENTS_LOCAL.read_text())
    except Exception as e:
        out('idle', 'skip', f'cannot read events.json: {e}')
        return

    # Prossimo evento non completato, in ordine di data
    upcoming = [e for e in events if e.get('status') != 'complete' and e.get('dateStart')]
    upcoming.sort(key=lambda e: e['dateStart'])
    if not upcoming:
        out('idle', 'skip', 'nessun GP futuro trovato')
        return

    ev = upcoming[0]
    ev_id = str(ev['id'])
    ev_name = ev.get('displayedName', ev.get('name', ev_id))

    lock_time = q1_start(ev)
    if lock_time is None:
        # Fallback: nessuna Q1 nei dati (calendario non ancora popolato) — usa dateStart evento
        try:
            lock_time = datetime.fromisoformat(ev['dateStart']).astimezone(timezone.utc)
        except Exception:
            out('idle', 'skip', f'{ev_name}: nessun orario utilizzabile')
            return

    hours_to_lock = (lock_time - now).total_seconds() / 3600

    if hours_to_lock <= 0:
        # Squadra bloccata per questo GP: non ripetere finche' non e' passato ad un altro GP
        if state.get('done_ev') == ev_id:
            out('done', 'skip', f'{ev_name}: gia\' segnato locked, in attesa del prossimo GP')
            return
        save_state({'done_ev': ev_id, 'last_run': state.get('last_run')})
        out('locked', 'skip', f'{ev_name}: Q1 gia\' iniziata ({-hours_to_lock:.1f}h fa) — squadra bloccata')
        return

    if hours_to_lock > APPROACHING_FROM_H:
        out('idle', 'skip', f'{ev_name}: Q1 tra {hours_to_lock:.1f}h — troppo presto')
        return

    phase = 'final_window' if hours_to_lock <= FINAL_WINDOW_FROM_H else 'approaching'
    min_interval = INTERVALS[phase]

    last_run_str = state.get('last_run')
    last_run = None
    if last_run_str:
        try:
            last_run = datetime.fromisoformat(last_run_str)
        except Exception:
            pass

    if last_run is not None:
        elapsed = (now - last_run).total_seconds()
        if elapsed < min_interval:
            out(phase, 'skip', f'{ev_name} [{phase}]: ultimo run {elapsed:.0f}s fa, min={min_interval}s')
            return

    state['last_run'] = now.isoformat()
    state.pop('done_ev', None)  # nuovo GP in vista, resetta l'eventuale flag locked precedente
    save_state(state)
    out(phase, 'run', f'{ev_name} [{phase}]: Q1 tra {hours_to_lock:.1f}h')


if __name__ == '__main__':
    main()
