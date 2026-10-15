#!/usr/bin/env bash
# Tests the recording → transcript → AI-notes pipeline WITHOUT LiveKit, Whisper or an LLM:
# it fakes a finished 2-speaker recording and stubs the worker + LLM.
# Run from app/:  bash tests/e2e/pipeline_e2e.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
T=$(mktemp -d); ID=team_2026-01-01T10-00-00-000Z
mkdir -p $T/$ID/audio
head -c 5000 /dev/urandom > $T/$ID/audio/Ammar-aa__TR_1.ogg
head -c 5000 /dev/urandom > $T/$ID/audio/Akhtar-bb__TR_2.ogg
cat > $T/$ID/session.json <<JSON
{"id":"$ID","room":"team","status":"processing","createdAt":"2026-01-01T10:00:00.000Z","stoppedAt":"2026-01-01T10:30:00.000Z","compositeEgressId":null,
 "tracks":[{"trackSid":"TR_1","identity":"Ammar-aa","name":"Ammar","file":"audio/Ammar-aa__TR_1.ogg","egressId":null},
           {"trackSid":"TR_2","identity":"Akhtar-bb","name":"Akhtar","file":"audio/Akhtar-bb__TR_2.ogg","egressId":null}]}
JSON
cat > $T/stubs.py <<'PY'
import json, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['content-length'])))
        if self.server.server_port == 18100:   # fake Whisper worker
            seg = [{"start":1,"end":4,"text":"Akhtar, can you review the code today?"},{"start":20,"end":23,"text":"I will deploy tomorrow."}] \
                  if 'Ammar' in body['path'] else [{"start":10,"end":13,"text":"Yes, I'll review it in fifteen minutes."}]
            out = {"segments": seg}
        else:                                  # fake LLM
            out = {"choices":[{"message":{"content":json.dumps({"summary":"Review and deploy planned.","decisions":[],
                   "action_items":[{"owner":"Akhtar","items":[{"task":"Review code","due":"today","context":""}]},
                                   {"owner":"Ammar","items":[{"task":"Deploy","due":"tomorrow","context":""}]}],
                   "topics":[],"open_questions":[]})}}]}
        b = json.dumps(out).encode(); self.send_response(200); self.send_header('content-type','application/json'); self.end_headers(); self.wfile.write(b)
for p in (18100, 18200):
    s = HTTPServer(('127.0.0.1', p), H); threading.Thread(target=s.serve_forever, daemon=True).start()
threading.Event().wait()
PY
python3 $T/stubs.py & STUB=$!
PORT=13200 RECORDINGS_DIR=$T WORKER_URL=http://127.0.0.1:18100 LLM_BASE_URL=http://127.0.0.1:18200/v1 LIVEKIT_HOST=http://127.0.0.1:1 node server.js >/dev/null 2>&1 & APP=$!
trap 'kill $APP $STUB 2>/dev/null; rm -rf $T' EXIT
for i in $(seq 1 30); do grep -q '"status": "ready"' $T/$ID/session.json 2>/dev/null && break; sleep 1; done
python3 - $T/$ID <<'PY'
import json, sys
d = sys.argv[1]
s = json.load(open(f"{d}/session.json")); t = json.load(open(f"{d}/transcript.json")); n = json.load(open(f"{d}/notes.json"))
assert s["status"] == "ready", s
assert [l["speaker"] for l in t] == ["Ammar", "Akhtar", "Ammar"], t        # interleaved by time, exact names
assert {p["owner"] for p in n["action_items"]} == {"Ammar", "Akhtar"}, n
assert "### Akhtar" in open(f"{d}/notes.md").read()
print("PIPELINE CHECKS PASSED")
PY
