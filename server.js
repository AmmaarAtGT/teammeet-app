// TeamMeet — app server
// - Issues LiveKit access tokens (24h TTL → no meeting time limit)
// - Starts/stops server-side recording via LiveKit Egress:
//     * one grid-layout MP4 of the whole meeting
//     * one audio file PER SPEAKER (this is how the AI notes know exactly who said what)
// - After a recording stops: transcribes each speaker (self-hosted Whisper worker),
//   merges into one speaker-labelled transcript, and asks an LLM for a summary +
//   action items per participant ("Fireflies-style" meeting notes).
// - Serves the web UI and the finished recordings/notes.

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  EncodedFileOutput,
  EncodedFileType,
  DirectFileOutput,
  EgressStatus,
} = require('livekit-server-sdk');
const { summarize } = require('./summarize');
const attendance = require('./attendance');
const driveSync = require('./driveSync');

let PORT = process.env.PORT || 3000;
let LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
let LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
let LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
let LIVEKIT_HOST = process.env.LIVEKIT_HOST || (process.env.LIVEKIT_URL ? process.env.LIVEKIT_URL.replace(/^ws/, 'http') : 'http://localhost:7880');
let TEAM_PASSCODE = process.env.TEAM_PASSCODE || '';
let RECORDINGS_DIR = process.env.RECORDINGS_DIR || path.join(__dirname, '..', 'recordings');
let EGRESS_OUTPUT_DIR = process.env.EGRESS_OUTPUT_DIR || '/out';
let TOKEN_TTL = process.env.TOKEN_TTL || '24h';
let WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000';
let AI_NOTES = process.env.AI_NOTES || 'on';
let GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
let PURGE_RETENTION_DAYS = parseInt(process.env.PURGE_RETENTION_DAYS || '15', 10);

const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let egress = new EgressClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
let rooms = new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

function reloadLiveKitClients() {
  LIVEKIT_HOST = LIVEKIT_URL.replace(/^ws/, 'http');
  egress = new EgressClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  rooms = new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

// 15-Day Auto-Purge Worker: Cleans up local disk automatically
function purgeOldRecordings(days = PURGE_RETENTION_DAYS) {
  try {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    if (!fs.existsSync(RECORDINGS_DIR)) return;
    const dirs = fs.readdirSync(RECORDINGS_DIR);
    let purged = 0;
    for (const d of dirs) {
      const p = path.join(RECORDINGS_DIR, d);
      const stat = fs.statSync(p);
      if (stat.isDirectory() && stat.mtimeMs < cutoff) {
        fs.rmSync(p, { recursive: true, force: true });
        purged++;
      }
    }
    if (purged > 0) console.log(`[Auto-Purge] Deleted ${purged} meeting recordings older than ${days} days.`);
  } catch (e) {
    console.warn('[Auto-Purge warning]', e.message);
  }
}
purgeOldRecordings();
const purgeTimer = setInterval(purgeOldRecordings, 24 * 60 * 60 * 1000);
if (purgeTimer && purgeTimer.unref) purgeTimer.unref();

const cleanRoom = (r) => String(r || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 64);
const cleanName = (n) => String(n || '').trim().slice(0, 48);
const safeId = (s) => String(s || '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nsToMs = (ns) => (ns ? Number(BigInt(ns) / 1000000n) : 0);
const MIC = 2; // TrackSource.MICROPHONE in the LiveKit protocol

function checkPasscode(req, res) {
  if (!TEAM_PASSCODE) return true;
  const given = req.get('x-team-passcode') || req.body?.passcode || req.query.p || '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(TEAM_PASSCODE);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  res.status(401).json({ error: 'Wrong team passcode' });
  return false;
}

// ---------------------------------------------------------------------------
// Sessions: one folder per recording under RECORDINGS_DIR/<sessionId>/
//   session.json      status + metadata
//   meeting.mp4       grid recording (written by egress)
//   audio/*.ogg       one file per speaker track (written by egress)
//   transcript.json   merged, speaker-labelled transcript
//   notes.json/.md    AI summary + action items
// ---------------------------------------------------------------------------
const active = new Map(); // room -> session (while recording)

const sessionDir = (id) => path.join(RECORDINGS_DIR, safeId(id));
function saveSession(s) {
  fs.mkdirSync(sessionDir(s.id), { recursive: true });
  fs.writeFileSync(path.join(sessionDir(s.id), 'session.json'), JSON.stringify(s, null, 2));
}
function loadSession(id) {
  try { return JSON.parse(fs.readFileSync(path.join(sessionDir(id), 'session.json'), 'utf8')); } catch { return null; }
}

// Start an audio-only track egress for every microphone not yet being captured.
async function captureNewSpeakers(s) {
  const participants = await rooms.listParticipants(s.room);
  for (const p of participants) {
    for (const t of p.tracks || []) {
      if (t.source !== MIC || s.tracks.some((x) => x.trackSid === t.sid)) continue;
      const file = `audio/${safeId(p.identity)}__${t.sid}.ogg`;
      // reserve the slot before awaiting so the poller never double-starts
      const entry = { trackSid: t.sid, identity: p.identity, name: p.name || p.identity, file, egressId: null };
      s.tracks.push(entry);
      try {
        const info = await egress.startTrackEgress(
          s.room,
          new DirectFileOutput({ filepath: `${EGRESS_OUTPUT_DIR}/${s.id}/${file}` }),
          t.sid
        );
        entry.egressId = info.egressId;
      } catch (e) {
        entry.error = e.message;
        console.warn(`[rec] could not capture ${p.identity}: ${e.message}`);
      }
      saveSession(s);
    }
  }
}

async function startSession(room, startedBy, driveFolder) {
  if (active.has(room)) return active.get(room);
  const id = `${room}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.mkdirSync(path.join(sessionDir(id), 'audio'), { recursive: true });
  fs.chmodSync(sessionDir(id), 0o777);
  fs.chmodSync(path.join(sessionDir(id), 'audio'), 0o777);

  const info = await egress.startRoomCompositeEgress(
    room,
    new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath: `${EGRESS_OUTPUT_DIR}/${id}/meeting.mp4` }),
    { layout: 'grid' }
  );
  const s = {
    id, room, startedBy, status: 'recording',
    createdAt: new Date().toISOString(),
    compositeEgressId: info.egressId,
    driveFolder: driveFolder || GOOGLE_DRIVE_FOLDER_ID || '',
    tracks: [],
  };
  active.set(room, s);
  saveSession(s);

  if (AI_NOTES !== 'off') {
    await captureNewSpeakers(s).catch((e) => console.warn('[rec]', e.message));
    // people who join (or re-join) while recording get captured too
    s._poll = setInterval(() => captureNewSpeakers(s).catch(() => {}), 5000);
  }
  return s;
}

async function stopSession(room) {
  const s = active.get(room);
  if (!s) return null;
  clearInterval(s._poll);
  delete s._poll;
  active.delete(room);
  const ids = [s.compositeEgressId, ...s.tracks.map((t) => t.egressId)].filter(Boolean);
  await Promise.all(ids.map((id) => egress.stopEgress(id).catch(() => {})));
  s.status = 'processing';
  s.stoppedAt = new Date().toISOString();
  saveSession(s);
  processSession(s.id).catch((e) => console.error('[notes]', e));
  return s;
}

// Wait for egress to finish writing, then transcribe, summarize, record attendance and sync to Google Drive.
async function processSession(id) {
  const s = loadSession(id);
  if (!s) return;
  const set = (patch) => { Object.assign(s, patch); saveSession(s); };
  try {
    // 1) wait for all egress jobs to finish (up to ~30 min for very long meetings)
    const ids = [s.compositeEgressId, ...s.tracks.map((t) => t.egressId)].filter(Boolean);
    const done = [EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED, EgressStatus.EGRESS_LIMIT_REACHED];
    let infos = [];
    for (let i = 0; ids.length && i < 360; i++) {
      infos = (await Promise.all(ids.map((eid) => egress.listEgress({ egressId: eid }).catch(() => [])))).flat();
      if (infos.length && infos.every((x) => done.includes(x.status))) break;
      if (!infos.length && i >= 24) break; // egress unreachable for 2 min → use whatever files exist
      await sleep(5000);
    }
    const byId = Object.fromEntries(infos.map((x) => [x.egressId, x]));
    const meetingStart = nsToMs(byId[s.compositeEgressId]?.startedAt) || Date.parse(s.createdAt);
    s.tracks.forEach((t) => {
      const info = byId[t.egressId];
      t.startedAtMs = nsToMs(info?.startedAt) || meetingStart;
      t.offsetSec = Math.max(0, (t.startedAtMs - meetingStart) / 1000);
    });
    s.hasVideo = fs.existsSync(path.join(sessionDir(id), 'meeting.mp4'));

    // Attendance export for session
    const att = attendance.exportAttendanceForSession(s.room, sessionDir(id));
    s.attendance = att.records;
    s.participants = [...new Set([...s.tracks.map((t) => t.name), ...(att.records || []).map((r) => r.name)])];

    const targetDrive = s.driveFolder || GOOGLE_DRIVE_FOLDER_ID;

    if (AI_NOTES === 'off' || !s.tracks.length) {
      const fallbackNotes = {
        summary: `Meeting conducted in room "${s.room}" on ${new Date(s.createdAt).toLocaleDateString()} with ${s.participants.join(', ') || 'team members'}.`,
        decisions: [],
        action_items: [],
        topics: [],
        open_questions: [],
        model: 'built-in',
        generatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(sessionDir(id), 'notes.json'), JSON.stringify(fallbackNotes, null, 2));
      fs.writeFileSync(path.join(sessionDir(id), 'notes.md'), notesToMarkdown(s, fallbackNotes, att.records));

      if (targetDrive) {
        try {
          const driveResult = await driveSync.syncSessionToDrive(s, sessionDir(id), targetDrive);
          s.driveSync = driveResult;
        } catch (e) {
          console.warn('[Google Drive Sync Warning]', e.message);
        }
      }
      return set({ status: 'ready' });
    }

    // 2) transcribe each speaker's audio separately → speaker labels are exact
    set({ status: 'transcribing' });
    const lines = [];
    for (const t of s.tracks) {
      const abs = path.join(sessionDir(id), t.file);
      if (!fs.existsSync(abs) || fs.statSync(abs).size < 2000) continue;
      const r = await fetch(`${WORKER_URL}/transcribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `${safeId(id)}/${t.file}` }),
      });
      if (!r.ok) throw new Error(`Transcription worker error: ${r.status} ${await r.text()}`);
      const { segments } = await r.json();
      for (const seg of segments) {
        const text = seg.text.trim();
        if (text) lines.push({ speaker: t.name, start: seg.start + t.offsetSec, end: seg.end + t.offsetSec, text });
      }
    }
    lines.sort((a, b) => a.start - b.start);
    fs.writeFileSync(path.join(sessionDir(id), 'transcript.json'), JSON.stringify(lines, null, 2));

    // 3) AI summary + action items per participant
    set({ status: 'summarizing' });
    const notes = await summarize(lines, { room: s.room, date: s.createdAt, participants: s.participants });
    fs.writeFileSync(path.join(sessionDir(id), 'notes.json'), JSON.stringify(notes, null, 2));
    fs.writeFileSync(path.join(sessionDir(id), 'notes.md'), notesToMarkdown(s, notes, att.records));

    // 4) Google Drive synchronization if folder link is supplied
    if (targetDrive) {
      try {
        set({ status: 'syncing_drive' });
        const driveResult = await driveSync.syncSessionToDrive(s, sessionDir(id), targetDrive);
        s.driveSync = driveResult;
      } catch (err) {
        console.warn(`[Google Drive Sync Error] ${err.message}`);
      }
    }

    set({ status: 'ready' });
  } catch (e) {
    console.error(`[notes] ${id}:`, e);
    set({ status: 'error', error: e.message });
  }
}

function notesToMarkdown(s, n, attRecords = []) {
  const out = [`# Meeting notes — ${s.room}`, `${new Date(s.createdAt).toLocaleString()} · ${s.participants.join(', ')}`, '', '## Summary', n.summary || '', ''];
  if (n.decisions?.length) out.push('## Decisions', ...n.decisions.map((d) => `- ${d}`), '');
  if (n.action_items?.length) {
    out.push('## Action items');
    for (const p of n.action_items) {
      out.push(`### ${p.owner}`, ...p.items.map((i) => `- [ ] ${i.task}${i.due ? ` _(due: ${i.due})_` : ''}`), '');
    }
  }
  if (n.topics?.length) {
    out.push('## Topics');
    for (const t of n.topics) out.push(`### ${t.title}`, t.notes || '', '');
  }
  if (n.open_questions?.length) out.push('## Open questions', ...n.open_questions.map((q) => `- ${q}`), '');
  if (attRecords && attRecords.length) {
    out.push('## Attendance Record', attendance.generateAttendanceMarkdown(attRecords), '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
app.get('/api/config', (_req, res) => {
  res.json({ livekitUrl: LIVEKIT_URL, passcodeRequired: Boolean(TEAM_PASSCODE), aiNotes: AI_NOTES !== 'off' });
});

function generateLiveKitToken({ apiKey, apiSecret, identity, name, room, metadata }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: identity,
    name: name || identity,
    nbf: now - 300, // 5 min in past prevents clock skew and token expired errors
    exp: now + (7 * 86400), // 7 days ensures token never expires mid-call
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
    metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}),
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

app.post('/api/token', async (req, res) => {
  if (!checkPasscode(req, res)) return;
  const room = cleanRoom(req.body.room);
  const name = cleanName(req.body.name);
  if (!room || !name) return res.status(400).json({ error: 'room and name are required' });
  const identity = req.body.identity || `${name.replace(/\s+/g, '_')}-${crypto.randomBytes(3).toString('hex')}`;
  const email = req.body.email || '';
  const avatar = req.body.avatar || '';
  const cameraOn = Boolean(req.body.cameraOn);

  // Real-time Attendance tracking on join with exact timestamp & initial camera status
  attendance.recordJoin(room, { name, email, identity, avatar, cameraOn });

  const metadata = JSON.stringify({
    avatar,
    email,
    joinedAt: Date.now()
  });

  const token = generateLiveKitToken({
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
    identity,
    name,
    room,
    metadata
  });

  res.json({ token, url: LIVEKIT_URL, room, identity });
});

// Real-time Camera ON/OFF tracking endpoint
app.post('/api/attendance/camera', (req, res) => {
  const room = cleanRoom(req.body.room);
  const identity = req.body.identity;
  const cameraOn = Boolean(req.body.cameraOn);
  if (!room || !identity) return res.status(400).json({ error: 'room and identity required' });
  const record = attendance.recordCameraChange(room, identity, cameraOn);
  res.json({ ok: true, record });
});

// Leave attendance endpoint
app.post('/api/attendance/leave', (req, res) => {
  const room = cleanRoom(req.body.room);
  const identity = req.body.identity;
  if (!room || !identity) return res.status(400).json({ error: 'room and identity required' });
  const record = attendance.recordLeave(room, identity);
  res.json({ ok: true, record });
});

// Attendance snapshot endpoint (take periodic screenshots of attendees with camera ON)
app.post('/api/sessions/:id/snapshot', (req, res) => {
  if (!checkPasscode(req, res)) return;
  const id = safeId(req.params.id);
  const snapDir = path.join(sessionDir(id), 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const { imageBase64, speaker } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const fileName = `snap_${Date.now()}_${safeId(speaker || 'participant')}.jpg`;
  fs.writeFileSync(path.join(snapDir, fileName), Buffer.from(data, 'base64'));
  res.json({ ok: true, file: fileName });
});

// Attendance export & query endpoint (JSON or downloadable CSV)
app.get('/api/attendance', (req, res) => {
  const room = cleanRoom(req.query.room);
  if (!room) return res.status(400).json({ error: 'room query param required' });
  const records = attendance.getRoomAttendance(room);
  if (req.query.format === 'csv') {
    const csv = attendance.generateAttendanceCsv(records);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${room}.csv"`);
    return res.send(csv);
  }
  res.json({ room, records });
});

// Active rooms query for multi-room 50-100 user deployments
app.get('/api/rooms', async (_req, res) => {
  try {
    const list = await rooms.listRooms();
    const result = list.map((r) => ({
      name: r.name,
      numParticipants: r.numParticipants,
      creationTime: r.creationTime
    }));
    res.json({ rooms: result });
  } catch (e) {
    res.json({ rooms: [] });
  }
});

// Dynamic Key Rotation at runtime (Zero downtime, no redeploy)
app.get('/api/admin/keys', (req, res) => {
  if (!checkPasscode(req, res)) return;
  res.json({
    livekitUrl: LIVEKIT_URL,
    apiKeyMasked: LIVEKIT_API_KEY ? LIVEKIT_API_KEY.slice(0, 4) + '***' : '',
    driveFolderId: GOOGLE_DRIVE_FOLDER_ID
  });
});

app.post('/api/admin/keys', (req, res) => {
  if (!checkPasscode(req, res)) return;
  const { livekitUrl, livekitApiKey, livekitApiSecret, driveFolderId } = req.body || {};
  if (livekitUrl) LIVEKIT_URL = livekitUrl.trim();
  if (livekitApiKey) LIVEKIT_API_KEY = livekitApiKey.trim();
  if (livekitApiSecret) LIVEKIT_API_SECRET = livekitApiSecret.trim();
  if (driveFolderId !== undefined) GOOGLE_DRIVE_FOLDER_ID = String(driveFolderId).trim();

  reloadLiveKitClients();
  console.log(`[Admin] LiveKit credentials hot-reloaded: ${LIVEKIT_URL}`);
  res.json({ ok: true, livekitUrl: LIVEKIT_URL });
});

// Google Drive Sync Endpoint
app.post('/api/drive/sync', async (req, res) => {
  if (!checkPasscode(req, res)) return;
  const { sessionId, driveFolderUrl } = req.body || {};
  if (driveFolderUrl) GOOGLE_DRIVE_FOLDER_ID = String(driveFolderUrl).trim();
  let syncResult = null;
  if (sessionId && sessionId !== 'general') {
    const s = loadSession(sessionId);
    if (s) {
      s.driveFolder = GOOGLE_DRIVE_FOLDER_ID;
      s.driveSyncedAt = new Date().toISOString();
      saveSession(s);
      syncResult = await driveSync.syncSessionToDrive(s, sessionDir(s.id), GOOGLE_DRIVE_FOLDER_ID);
      s.driveSync = syncResult;
      saveSession(s);
    }
  }
  res.json({ ok: true, synced: true, driveFolder: GOOGLE_DRIVE_FOLDER_ID, result: syncResult });
});

// Universal Upload endpoint: saves client-side screen recordings, audio recordings, or whiteboard images
// directly to the server session directory and automatically syncs to Google Drive (Zero local downloads)
app.post('/api/recordings/upload', async (req, res) => {
  if (!checkPasscode(req, res)) return;
  const room = cleanRoom(req.body.room || 'dev-room');
  const type = req.body.type || 'screen'; // 'screen' | 'audio' | 'whiteboard'
  const dataBase64 = req.body.dataBase64;
  const driveFolder = req.body.driveFolder || GOOGLE_DRIVE_FOLDER_ID;
  if (!dataBase64) return res.status(400).json({ error: 'dataBase64 required' });

  // Locate active session or create dedicated archive session for this room
  let s = active.get(room);
  let id = s ? s.id : `room_${safeId(room)}_${Date.now()}`;
  if (!s) {
    s = {
      id,
      room,
      status: 'ready',
      createdAt: new Date().toISOString(),
      driveFolder: driveFolder || GOOGLE_DRIVE_FOLDER_ID || '',
      tracks: []
    };
    saveSession(s);
  }

  const sessDir = sessionDir(id);
  fs.mkdirSync(sessDir, { recursive: true });

  const rawData = dataBase64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(rawData, 'base64');

  let fileName = '';
  if (type === 'whiteboard') {
    fileName = 'whiteboard.png';
  } else if (type === 'audio') {
    fileName = 'audio_recording.webm';
  } else {
    fileName = 'screen_recording.webm';
  }

  fs.writeFileSync(path.join(sessDir, fileName), buffer);

  // Export attendance to ensure latest records are together with recording
  attendance.exportAttendanceForSession(room, sessDir);

  // Sync session files to Google Drive
  let syncResult = null;
  const targetDrive = driveFolder || s.driveFolder || GOOGLE_DRIVE_FOLDER_ID;
  if (targetDrive) {
    try {
      syncResult = await driveSync.syncSessionToDrive(s, sessDir, targetDrive);
      s.driveSync = syncResult;
      saveSession(s);
    } catch (err) {
      console.warn('[Upload Drive Sync Warning]', err.message);
    }
  }

  res.json({
    ok: true,
    sessionId: id,
    file: fileName,
    syncedToDrive: Boolean(syncResult?.synced),
    driveFolderUrl: driveSync.getDriveFolderUrl(targetDrive),
    driveSync: syncResult
  });
});

// Force sync attendance to Google Drive (Zero local downloads)
app.post('/api/attendance/sync-drive', async (req, res) => {
  if (!checkPasscode(req, res)) return;
  const room = cleanRoom(req.body.room || 'dev-room');
  const targetDrive = req.body.driveFolder || GOOGLE_DRIVE_FOLDER_ID;

  const id = `att_${safeId(room)}_${Date.now()}`;
  const s = {
    id,
    room,
    status: 'ready',
    createdAt: new Date().toISOString(),
    driveFolder: targetDrive || '',
    tracks: []
  };
  saveSession(s);

  const sessDir = sessionDir(id);
  const att = attendance.exportAttendanceForSession(room, sessDir);
  s.attendance = att.records;

  let syncResult = null;
  if (targetDrive) {
    try {
      syncResult = await driveSync.syncSessionToDrive(s, sessDir, targetDrive);
      s.driveSync = syncResult;
      saveSession(s);
    } catch (err) {
      console.warn('[Attendance Drive Sync Warning]', err.message);
    }
  }

  res.json({
    ok: true,
    sessionId: id,
    recordsCount: att.records.length,
    syncedToDrive: Boolean(syncResult?.synced),
    driveFolderUrl: driveSync.getDriveFolderUrl(targetDrive),
    driveSync: syncResult
  });
});

app.get('/api/recording/status', (req, res) => {
  const s = active.get(cleanRoom(req.query.room));
  res.json({ recording: Boolean(s), sessionId: s?.id || null, since: s?.createdAt || null });
});

app.post('/api/recording/start', async (req, res) => {
  if (!checkPasscode(req, res)) return;
  try {
    const s = await startSession(cleanRoom(req.body.room), cleanName(req.body.name), req.body.driveFolder);
    res.json({ sessionId: s.id });
  } catch (e) {
    res.status(500).json({ error: `Could not start recording: ${e.message}. Is the egress service running?` });
  }
});

app.post('/api/recording/stop', async (req, res) => {
  if (!checkPasscode(req, res)) return;
  const s = await stopSession(cleanRoom(req.body.room));
  res.json({ ok: true, sessionId: s?.id || null });
});

app.get('/api/sessions', (req, res) => {
  if (!checkPasscode(req, res)) return;
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  const list = fs.readdirSync(RECORDINGS_DIR)
    .map((d) => loadSession(d))
    .filter(Boolean)
    .filter((s) => !req.query.room || s.room === cleanRoom(req.query.room))
    .map(({ id, room, status, createdAt, stoppedAt, participants, error }) => ({ id, room, status, createdAt, stoppedAt, participants, error }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

app.get('/api/sessions/:id', (req, res) => {
  if (!checkPasscode(req, res)) return;
  const s = loadSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(sessionDir(s.id), f), 'utf8')); } catch { return null; } };
  res.json({
    session: s,
    transcript: read('transcript.json'),
    notes: read('notes.json'),
    attendance: read('attendance.json') || s.attendance || null,
    driveSync: read('drive_sync.json') || s.driveSync || null,
  });
});

// Re-run transcription/summary (e.g. after switching to a better LLM)
app.post('/api/sessions/:id/reprocess', (req, res) => {
  if (!checkPasscode(req, res)) return;
  const s = loadSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (['transcribing', 'summarizing', 'recording'].includes(s.status)) return res.status(409).json({ error: 'Already in progress' });
  s.status = 'processing'; delete s.error; saveSession(s);
  processSession(s.id).catch(() => {});
  res.json({ ok: true });
});

// Download/stream recording files: /files/<sessionId>/meeting.mp4, notes.md, transcript.json, attendance.csv …
app.get('/files/:id/:file', (req, res) => {
  if (!checkPasscode(req, res)) return;
  const allowed = ['meeting.mp4', 'notes.md', 'notes.json', 'transcript.json', 'attendance.csv', 'attendance.json', 'drive_sync.json'];
  if (!allowed.includes(req.params.file)) return res.status(404).end();
  const f = path.join(sessionDir(req.params.id), req.params.file);
  if (!fs.existsSync(f)) return res.status(404).end();
  if (req.query.download) return res.download(f, `${safeId(req.params.id)}_${req.params.file}`);
  res.sendFile(f);
});

app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/notes/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'notes.html')));
// Any /some-room path loads the app (so links like https://meet.example.com/standup work)
app.get(/^\/[a-zA-Z0-9-_]+$/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// On restart: finish any sessions that were mid-processing; mark interrupted recordings
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
for (const d of fs.readdirSync(RECORDINGS_DIR)) {
  const s = loadSession(d);
  if (!s) continue;
  if (s.status === 'recording') {
    // the app restarted mid-recording: stop the recorder jobs so the files get finalised
    [s.compositeEgressId, ...s.tracks.map((t) => t.egressId)].filter(Boolean).forEach((id) => egress.stopEgress(id).catch(() => {}));
    s.status = 'processing'; s.note = 'App restarted during recording; recording was stopped'; saveSession(s);
  }
  if (['processing', 'transcribing', 'summarizing'].includes(s.status)) processSession(s.id).catch(() => {});
}

app.listen(PORT, () => console.log(`TeamMeet app listening on :${PORT} (LiveKit: ${LIVEKIT_URL})`));
