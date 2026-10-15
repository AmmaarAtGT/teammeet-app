// Run: npm test   (no LiveKit server needed — these cover the app's own logic)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const REC = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-rec-'));
let proc;

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env, PORT: String(PORT), TEAM_PASSCODE: 'letmein', RECORDINGS_DIR: REC,
      LIVEKIT_API_KEY: 'testkey', LIVEKIT_API_SECRET: 'testsecret_testsecret_testsecret_12',
      LIVEKIT_URL: 'wss://rtc.test', LIVEKIT_HOST: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  await waitUp();
});
after(() => proc?.kill());

const post = (p, body, pass = 'letmein') =>
  fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-team-passcode': pass }, body: JSON.stringify(body) });

test('config exposes LiveKit URL and passcode requirement', async () => {
  const c = await (await fetch(`${BASE}/api/config`)).json();
  assert.equal(c.livekitUrl, 'wss://rtc.test');
  assert.equal(c.passcodeRequired, true);
  assert.equal(c.aiNotes, true);
});

test('token: wrong passcode is rejected', async () => {
  const r = await post('/api/token', { room: 'team', name: 'Amit' }, 'nope');
  assert.equal(r.status, 401);
});

test('token: missing name is rejected', async () => {
  const r = await post('/api/token', { room: 'team' });
  assert.equal(r.status, 400);
});

test('token: valid JWT with room grant and long TTL (no 90-min limit)', async () => {
  const r = await post('/api/token', { room: 'Daily Standup!', name: 'Amit Kumar' });
  assert.equal(r.status, 200);
  const { token, room, identity } = await r.json();
  assert.equal(room, 'daily-standup-');
  assert.match(identity, /^Amit_Kumar-[0-9a-f]{6}$/);
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(payload.iss, 'testkey');
  assert.equal(payload.name, 'Amit Kumar');
  assert.equal(payload.video.room, 'daily-standup-');
  assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.canPublish, true);
  assert.ok(payload.exp - payload.nbf >= 23 * 3600, 'token should last ~24h');
});

test('recording status is false when nothing is recording', async () => {
  const s = await (await fetch(`${BASE}/api/recording/status?room=team`)).json();
  assert.equal(s.recording, false);
});

test('recording start fails cleanly when LiveKit/egress is unreachable', async () => {
  const r = await post('/api/recording/start', { room: 'team', name: 'Amit' });
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /Could not start recording/);
});

test('sessions list + detail + file access', async () => {
  const id = 'team_2026-01-01T00-00-00-000Z';
  fs.mkdirSync(path.join(REC, id), { recursive: true });
  fs.writeFileSync(path.join(REC, id, 'session.json'), JSON.stringify({ id, room: 'team', status: 'ready', createdAt: '2026-01-01T00:00:00Z', participants: ['Amit'], tracks: [] }));
  fs.writeFileSync(path.join(REC, id, 'notes.md'), '# hi');
  const list = await (await fetch(`${BASE}/api/sessions?room=team`, { headers: { 'x-team-passcode': 'letmein' } })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'ready');
  assert.equal((await fetch(`${BASE}/api/sessions`)).status, 401, 'needs passcode');
  const md = await fetch(`${BASE}/files/${id}/notes.md?p=letmein`);
  assert.equal(await md.text(), '# hi');
  assert.equal((await fetch(`${BASE}/files/${id}/session.json?p=letmein`)).status, 404, 'only whitelisted files are served');
  assert.equal((await fetch(`${BASE}/files/..%2F..%2Fetc/passwd?p=letmein`)).status, 404, 'no path traversal');
});

test('room links and notes pages serve the UI', async () => {
  assert.match(await (await fetch(`${BASE}/standup`)).text(), /TeamMeet/);
  assert.match(await (await fetch(`${BASE}/notes/abc`)).text(), /Meeting notes/i);
});
