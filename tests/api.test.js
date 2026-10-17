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

test('rooms endpoint returns active rooms safely', async () => {
  const res = await fetch(`${BASE}/api/rooms`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.rooms));
});

test('admin keys: fetch masked keys and update dynamically', async () => {
  const getRes = await fetch(`${BASE}/api/admin/keys`, { headers: { 'x-team-passcode': 'letmein' } });
  assert.equal(getRes.status, 200);
  const keys = await getRes.json();
  assert.equal(keys.livekitUrl, 'wss://rtc.test');
  assert.ok(keys.apiKeyMasked.includes('***'));

  const postRes = await post('/api/admin/keys', {
    livekitUrl: 'wss://updated.rtc.test',
    livekitApiKey: 'newkey',
    livekitApiSecret: 'newsecret_newsecret_newsecret_123',
    driveFolderId: 'https://drive.google.com/drive/folders/test12345'
  });
  assert.equal(postRes.status, 200);
  const updated = await postRes.json();
  assert.equal(updated.ok, true);
  assert.equal(updated.livekitUrl, 'wss://updated.rtc.test');
});

test('drive sync endpoint saves folder link', async () => {
  const res = await post('/api/drive/sync', {
    sessionId: 'general',
    driveFolderUrl: 'https://drive.google.com/drive/folders/teamfolder'
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.synced, true);
  assert.equal(body.driveFolder, 'https://drive.google.com/drive/folders/teamfolder');
});

test('token: carries avatar and email in LiveKit metadata', async () => {
  const r = await post('/api/token', {
    room: 'dev-room',
    name: 'Supraja',
    email: 'supraja@test.com',
    avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  });
  assert.equal(r.status, 200);
  const { token } = await r.json();
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const meta = JSON.parse(payload.metadata);
  assert.equal(meta.email, 'supraja@test.com');
  assert.ok(meta.avatar.startsWith('data:image/png'));
});

test('attendance: automatically records join timestamp and serves JSON and CSV reports', async () => {
  // 1. Join room
  const tokenRes = await post('/api/token', {
    room: 'att-room',
    name: 'Rahul Sharma',
    email: 'rahul@enterprise.com',
  });
  assert.equal(tokenRes.status, 200);
  const { identity } = await tokenRes.json();

  // 2. Query attendance in JSON format
  const attRes = await fetch(`${BASE}/api/attendance?room=att-room`);
  assert.equal(attRes.status, 200);
  const data = await attRes.json();
  assert.equal(data.room, 'att-room');
  assert.ok(Array.isArray(data.records));
  const rahul = data.records.find((r) => r.identity === identity);
  assert.ok(rahul, 'Participant should be in attendance');
  assert.equal(rahul.name, 'Rahul Sharma');
  assert.equal(rahul.email, 'rahul@enterprise.com');
  assert.ok(rahul.joinedAt);

  // 3. Query attendance in downloadable CSV format
  const csvRes = await fetch(`${BASE}/api/attendance?room=att-room&format=csv`);
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.headers.get('content-type').includes('csv'));
  const csvText = await csvRes.text();
  assert.ok(csvText.includes('Participant Name'));
  assert.ok(csvText.includes('Rahul Sharma'));
  assert.ok(csvText.includes('rahul@enterprise.com'));

  // 4. Record participant leaving
  const leaveRes = await post('/api/attendance/leave', {
    room: 'att-room',
    identity,
  });
  assert.equal(leaveRes.status, 200);
  const leaveData = await leaveRes.json();
  assert.equal(leaveData.ok, true);
  assert.equal(leaveData.record.status, 'Left');
  assert.ok(leaveData.record.leftAt);
});

test('drive sync: session detail includes attendance and drive sync records', async () => {
  const id = 'att-session-123';
  const sessDir = path.join(REC, id);
  fs.mkdirSync(sessDir, { recursive: true });
  fs.writeFileSync(path.join(sessDir, 'session.json'), JSON.stringify({
    id, room: 'board-room', status: 'ready', createdAt: new Date().toISOString(), tracks: []
  }));
  fs.writeFileSync(path.join(sessDir, 'attendance.csv'), 'Participant,Email\nRahul,rahul@corp.com');
  fs.writeFileSync(path.join(sessDir, 'attendance.json'), JSON.stringify([{ name: 'Rahul', status: 'Attended' }]));
  fs.writeFileSync(path.join(sessDir, 'drive_sync.json'), JSON.stringify({ synced: true, folderId: 'folder-abc-123' }));

  const detailRes = await (await fetch(`${BASE}/api/sessions/${id}`, { headers: { 'x-team-passcode': 'letmein' } })).json();
  assert.ok(detailRes.attendance);
  assert.equal(detailRes.attendance[0].name, 'Rahul');
  assert.ok(detailRes.driveSync);
  assert.equal(detailRes.driveSync.folderId, 'folder-abc-123');

  // Verify attendance.csv is downloadable
  const csvFile = await fetch(`${BASE}/files/${id}/attendance.csv?p=letmein`);
  assert.equal(csvFile.status, 200);
  assert.ok((await csvFile.text()).includes('rahul@corp.com'));
});

