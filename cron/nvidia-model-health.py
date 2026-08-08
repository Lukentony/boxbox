#!/usr/bin/env python3
"""nvidia-model-health.py - Testa modelli NVIDIA e reporta stato.

Copia adattata di tools/nvidia-model-health.py per l'uso da parte di BoxBox
(cron/boxbox-news-signal-watch.sh la lancia PRIMA di analyze-news.mjs, come
passo separato: solo un test banale su tutti i modelli, nessun lavoro vero).

Uso:
  python3 nvidia-model-health.py              # testa tutti
  python3 nvidia-model-health.py --quick       # solo 3 modelli principali
  python3 nvidia-model-health.py --watch       # output JSON one-shot

Esce con 0 = almeno un modello funziona, 1 = nessuno funziona.
"""

import json, os, sys, time, subprocess, argparse
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
SCRAPER_ENV = os.path.join(DIR, "..", "scraper", ".env")
STATE_OUT = os.path.join(DIR, "..", "scraper", "nvidia-model-state.json")

API_KEY = os.environ.get("NVIDIA_API_KEY", "")
BASE_URL = "https://integrate.api.nvidia.com/v1"

# Modelli da testare (nome_descrittivo, API_model_id)
MODELS = [
    ("Llama 3.3 70B", "meta/llama-3.3-70b-instruct"),
    ("Llama 3.1 70B", "meta/llama-3.1-70b-instruct"),
    ("Gemma 4 31B", "google/gemma-4-31b-it"),
    ("Gemma 3 12B", "google/gemma-3-12b-it"),
    ("DeepSeek V4 Flash", "deepseek-ai/deepseek-v4-flash"),
    ("DeepSeek V4 Pro", "deepseek-ai/deepseek-v4-pro"),
    ("Nemotron 4 340B", "nvidia/nemotron-4-340b-instruct"),
    ("Qwen 3.5", "qwen/qwen3.5-122b-a10b"),
    ("Step 3.5 Flash", "stepfun-ai/step-3.5-flash"),
    ("Nemotron Mini 4B", "nvidia/nemotron-mini-4b-instruct"),
]

TEST_PROMPT = "Rispondi in una riga: qual e' la capitale della Francia?"
TIMEOUT = 30  # secondi per modello


def test_model(name, model_id, api_key):
    """Testa un modello NVIDIA. Ritorna dict con risultato."""
    start = time.time()
    result = {
        "name": name,
        "model": model_id,
        "ok": False,
        "latency_ms": 0,
        "error": None,
        "response": None,
    }
    try:
        r = subprocess.run(
            ["curl", "-s", "-w", r"\n%{http_code}",
             "-X", "POST",
             f"{BASE_URL}/chat/completions",
             "-H", f"Authorization: Bearer {api_key}",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({
                 "model": model_id,
                 "messages": [{"role":"user","content":TEST_PROMPT}],
                 "max_tokens": 50,
                 "temperature": 0.1,
             })],
            capture_output=True, text=True, timeout=TIMEOUT
        )
        elapsed = int((time.time() - start) * 1000)
        result["latency_ms"] = elapsed

        parts = r.stdout.rsplit("\n", 1)
        http_code = parts[-1].strip() if len(parts) > 1 else "000"
        body = parts[0] if len(parts) > 1 else r.stdout

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {} if http_code == "200" else {"error": body[:200]}
            if http_code == "200":
                result["ok"] = bool(body.strip())
                result["response"] = body.strip()[:100]
                return result

        if http_code == "200":
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            result["ok"] = bool(content.strip())
            result["response"] = content.strip()[:100]
        elif "DEGRADED" in body:
            result["error"] = "DEGRADED"
        elif "429" in http_code or "rate_limit" in body.lower():
            result["error"] = "RATE_LIMITED"
        elif "401" in http_code:
            result["error"] = "UNAUTHORIZED"
        else:
            result["error"] = f"HTTP {http_code}: {data.get('error', {}).get('message', body[:100])}"
    except subprocess.TimeoutExpired:
        result["error"] = "TIMEOUT"
    except Exception as e:
        result["error"] = str(e)[:100]

    return result


def load_env_file(path):
    """Parser minimale KEY=VALUE, stesso stile di fetch-data.mjs/renew-dat.mjs."""
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def get_api_key():
    """Trova la chiave API NVIDIA: variabile d'ambiente, poi .env di boxbox."""
    if API_KEY:
        return API_KEY

    boxbox_env = load_env_file(SCRAPER_ENV)
    if boxbox_env.get("NVIDIA_API_KEY"):
        return boxbox_env["NVIDIA_API_KEY"]

    return ""


def main():
    parser = argparse.ArgumentParser(description="Testa modelli NVIDIA")
    parser.add_argument("--quick", action="store_true", help="Solo primi 3 modelli")
    parser.add_argument("--watch", action="store_true", help="Output JSON")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        print("ERROR: NVIDIA_API_KEY non trovata (variabile d'ambiente o scraper/.env)")
        sys.exit(1)

    models = MODELS[:3] if args.quick else MODELS

    results = []
    for name, model_id in models:
        print(f"Test {name} ({model_id})... ", end="", flush=True)
        r = test_model(name, model_id, api_key)
        status = "OK" if r["ok"] else (r["error"] or "FAIL")
        print(f"{r['latency_ms']}ms -> {status}")
        results.append(r)

    healthy = [r for r in results if r["ok"]]
    healthy.sort(key=lambda x: x["latency_ms"])

    if args.watch:
        state = {
            "ts": datetime.now().isoformat(),
            "healthy_count": len(healthy),
            "models": results,
            "ranked_healthy": [r["model"] for r in healthy],
        }
        with open(STATE_OUT, "w") as f:
            json.dump(state, f, indent=2)
        if healthy:
            print(f"\nModelli funzionanti ({len(healthy)}/{len(models)}):")
            for r in healthy:
                print(f"  OK {r['name']}: {r['latency_ms']}ms")
            print(f"\nConsigliato: {healthy[0]['name']} ({healthy[0]['model']})")
            print(f"Scritto: {STATE_OUT}")
        else:
            print("\nNessun modello funzionante trovato!")

    sys.exit(0 if healthy else 1)


if __name__ == "__main__":
    main()
