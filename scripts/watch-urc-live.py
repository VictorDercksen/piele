"""Phase 0 watcher: polls URC matchstats for a round and records how live data behaves.

Usage: python3 scripts/watch-urc-live.py <round> <out_dir> <stop_iso_utc> [interval_seconds]
Writes polls.jsonl (one compact line per poll per match) and raw/<n>.json whenever the
response changes. Stops at stop time or when every polled match is finalised.
"""
import hashlib, json, os, sys, time, urllib.request
from datetime import datetime, timezone

URL = "https://www.unitedrugby.com/graphql"
QUERY = """query($r:[Int]){ matchstats(season_id:[202601], round:$r) {
 match_id match_status match_period home_score away_score last_updated updated_at match_datetime
 stats_data { matchStatus period periodTypeId minute second timerRunning timerTimestamp finalised matchWinner
   homeTeam { name score { currentScore htScore ftScore finalScore } }
   awayTeam { name score { currentScore htScore ftScore finalScore } }
   events { id minute second time timestamp lastModified display type { id name } period { id name } team { id name } player { id name } } } } }"""

rnd, out, stop = int(sys.argv[1]), sys.argv[2], datetime.fromisoformat(sys.argv[3])
interval = int(sys.argv[4]) if len(sys.argv) > 4 else 30
os.makedirs(f"{out}/raw", exist_ok=True)
last_hash, n = None, 0
while datetime.now(timezone.utc) < stop:
    started = time.time()
    now = datetime.now(timezone.utc)
    try:
        req = urllib.request.Request(URL, data=json.dumps({"query": QUERY, "variables": {"r": [rnd]}}).encode(),
            headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Piele/0.1 live watcher"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items() if k.lower() in ("cache-control", "cf-cache-status", "age", "x-graphql-query-id")}
            body = json.load(resp)
        latency = round(time.time() - started, 2)
    except Exception as exc:  # noqa: BLE001
        with open(f"{out}/polls.jsonl", "a") as f:
            f.write(json.dumps({"at": now.isoformat(), "error": repr(exc)[:300]}) + "\n")
        time.sleep(interval)
        continue
    rows = (body.get("data") or {}).get("matchstats") or []
    digest = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    changed = digest != last_hash
    if changed:
        n += 1
        with open(f"{out}/raw/{n:04d}.json", "w") as f:
            json.dump({"at": now.isoformat(), "headers": headers, "body": body}, f)
        last_hash = digest
    live = []
    with open(f"{out}/polls.jsonl", "a") as f:
        for m in rows:
            s = m.get("stats_data") or {}
            ev = s.get("events") or []
            last = max(ev, key=lambda e: e.get("id") or 0) if ev else {}
            line = {"at": now.isoformat(), "latency": latency, "changed": changed, "raw": n, "headers": headers,
                "id": m["match_id"], "kickoff": m["match_datetime"], "status": m["match_status"], "period": m["match_period"],
                "sdStatus": s.get("matchStatus"), "sdPeriod": s.get("period"), "periodTypeId": s.get("periodTypeId"),
                "minute": s.get("minute"), "second": s.get("second"), "timerRunning": s.get("timerRunning"),
                "timerTimestamp": s.get("timerTimestamp"), "finalised": s.get("finalised"),
                "score": [m.get("home_score"), m.get("away_score")],
                "current": [((s.get("homeTeam") or {}).get("score") or {}).get("currentScore"), ((s.get("awayTeam") or {}).get("score") or {}).get("currentScore")],
                "lastUpdated": m.get("last_updated"), "events": len(ev),
                "lastEvent": {k: last.get(k) for k in ("id", "minute", "display", "timestamp", "lastModified")} if last else None}
            f.write(json.dumps(line) + "\n")
            kickoff = datetime.fromisoformat(m["match_datetime"]).replace(tzinfo=timezone.utc)
            if kickoff <= now + (stop - now) and not s.get("finalised"):
                live.append(m["match_id"])
    if rows and not live:
        break
    time.sleep(max(1, interval - (time.time() - started)))
