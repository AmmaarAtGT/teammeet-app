// Real-Time Attendance & Camera State Tracking Engine for TeamMeet
// Tracks join time, leave time, duration, email, camera ON/OFF timestamps, and attendance status.
// Exports formatted CSV, JSON, and Markdown tables for meeting archives.

const fs = require('fs');
const path = require('path');

// In-memory store: roomName -> Map<identity, AttendanceRecord>
const roomAttendance = new Map();

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestamp(isoStr) {
  if (!isoStr) return 'Active';
  const d = new Date(isoStr);
  return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

function recordJoin(room, { name, email, identity, avatar, cameraOn = false }) {
  if (!room || !identity) return null;
  const cleanRoom = String(room).trim().toLowerCase();
  if (!roomAttendance.has(cleanRoom)) {
    roomAttendance.set(cleanRoom, new Map());
  }

  const map = roomAttendance.get(cleanRoom);
  const existing = map.get(identity);
  const nowIso = new Date().toISOString();

  if (existing) {
    // Participant reconnected
    existing.leftAt = null;
    existing.status = 'Attending';
    if (email && !existing.email) existing.email = email;
    if (name) existing.name = name;
    return existing;
  }

  const record = {
    identity,
    name: name || identity,
    email: email || '',
    avatar: avatar || '',
    room: cleanRoom,
    joinedAt: nowIso,
    leftAt: null,
    durationSec: 0,
    status: 'Attended',
    cameraState: cameraOn ? 'ON' : 'OFF',
    cameraLastToggled: nowIso,
    cameraOnSec: 0,
    cameraOffSec: 0,
    cameraChanges: [
      { state: cameraOn ? 'ON' : 'OFF', timestamp: nowIso }
    ]
  };

  map.set(identity, record);
  return record;
}

function recordCameraChange(room, identity, isCameraOn) {
  if (!room || !identity) return null;
  const cleanRoom = String(room).trim().toLowerCase();
  const map = roomAttendance.get(cleanRoom);
  if (!map || !map.has(identity)) return null;

  const rec = map.get(identity);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const lastMs = rec.cameraLastToggled ? Date.parse(rec.cameraLastToggled) : now;
  const elapsed = Math.max(0, Math.round((now - lastMs) / 1000));

  if (rec.cameraState === 'ON') {
    rec.cameraOnSec = (rec.cameraOnSec || 0) + elapsed;
  } else {
    rec.cameraOffSec = (rec.cameraOffSec || 0) + elapsed;
  }

  const newState = isCameraOn ? 'ON' : 'OFF';
  rec.cameraState = newState;
  rec.cameraLastToggled = nowIso;
  if (!rec.cameraChanges) rec.cameraChanges = [];
  rec.cameraChanges.push({ state: newState, timestamp: nowIso });

  return rec;
}

function recordLeave(room, identity) {
  if (!room || !identity) return null;
  const cleanRoom = String(room).trim().toLowerCase();
  const map = roomAttendance.get(cleanRoom);
  if (!map || !map.has(identity)) return null;

  const record = map.get(identity);
  const nowIso = new Date().toISOString();
  record.leftAt = nowIso;
  record.status = 'Left';

  const startMs = Date.parse(record.joinedAt);
  const endMs = Date.parse(record.leftAt);
  if (startMs && endMs && endMs >= startMs) {
    record.durationSec = Math.round((endMs - startMs) / 1000);
  }

  // Finalize camera duration
  if (record.cameraLastToggled) {
    const elapsed = Math.max(0, Math.round((endMs - Date.parse(record.cameraLastToggled)) / 1000));
    if (record.cameraState === 'ON') {
      record.cameraOnSec = (record.cameraOnSec || 0) + elapsed;
    } else {
      record.cameraOffSec = (record.cameraOffSec || 0) + elapsed;
    }
  }

  return record;
}

function getRoomAttendance(room) {
  const cleanRoom = String(room || '').trim().toLowerCase();
  const map = roomAttendance.get(cleanRoom);
  if (!map) return [];

  const nowMs = Date.now();
  return Array.from(map.values()).map((rec) => {
    let dur = rec.durationSec;
    if (!rec.leftAt && rec.joinedAt) {
      dur = Math.max(1, Math.round((nowMs - Date.parse(rec.joinedAt)) / 1000));
    }

    // Dynamic camera duration calculation
    let onSec = rec.cameraOnSec || 0;
    let offSec = rec.cameraOffSec || 0;
    if (!rec.leftAt && rec.cameraLastToggled) {
      const activeElapsed = Math.max(0, Math.round((nowMs - Date.parse(rec.cameraLastToggled)) / 1000));
      if (rec.cameraState === 'ON') {
        onSec += activeElapsed;
      } else {
        offSec += activeElapsed;
      }
    }

    return {
      ...rec,
      durationSec: dur,
      durationFormatted: formatDuration(dur),
      joinedAtFormatted: formatTimestamp(rec.joinedAt),
      leftAtFormatted: formatTimestamp(rec.leftAt),
      cameraState: rec.cameraState || 'OFF',
      cameraOnSec: onSec,
      cameraOffSec: offSec,
      cameraOnFormatted: formatDuration(onSec),
      cameraOffFormatted: formatDuration(offSec),
    };
  });
}

function generateAttendanceCsv(records) {
  const headers = [
    'Participant Name',
    'Email Address',
    'Joined At (UTC)',
    'Left At (UTC)',
    'Total Duration',
    'Camera State',
    'Camera ON Duration',
    'Camera OFF Duration',
    'Status'
  ];

  const rows = records.map((r) => [
    `"${String(r.name).replace(/"/g, '""')}"`,
    `"${String(r.email || 'N/A').replace(/"/g, '""')}"`,
    `"${r.joinedAtFormatted || formatTimestamp(r.joinedAt)}"`,
    `"${r.leftAtFormatted || formatTimestamp(r.leftAt)}"`,
    `"${r.durationFormatted || formatDuration(r.durationSec)}"`,
    `"${r.cameraState || 'OFF'}"`,
    `"${r.cameraOnFormatted || formatDuration(r.cameraOnSec)}"`,
    `"${r.cameraOffFormatted || formatDuration(r.cameraOffSec)}"`,
    `"${r.status || 'Attended'}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

function generateAttendanceMarkdown(records) {
  if (!records || !records.length) return 'No attendance records captured.';
  const lines = [
    '| Participant | Email | Joined At | Left At | Duration | Camera | Cam ON | Cam OFF | Status |',
    '|---|---|---|---|---|:---:|---|---|---|',
  ];
  for (const r of records) {
    const joined = r.joinedAtFormatted || formatTimestamp(r.joinedAt);
    const left = r.leftAtFormatted || formatTimestamp(r.leftAt);
    const dur = r.durationFormatted || formatDuration(r.durationSec);
    const cam = r.cameraState === 'ON' ? '🟢 ON' : '🔴 OFF';
    const camOn = r.cameraOnFormatted || formatDuration(r.cameraOnSec);
    const camOff = r.cameraOffFormatted || formatDuration(r.cameraOffSec);
    lines.push(`| **${r.name}** | ${r.email || '—'} | ${joined} | ${left} | ${dur} | ${cam} | ${camOn} | ${camOff} | \`${r.status}\` |`);
  }
  return lines.join('\n');
}

function exportAttendanceForSession(room, sessionDirPath) {
  const records = getRoomAttendance(room);
  const csv = generateAttendanceCsv(records);
  const md = generateAttendanceMarkdown(records);

  try {
    fs.writeFileSync(path.join(sessionDirPath, 'attendance.json'), JSON.stringify(records, null, 2));
    fs.writeFileSync(path.join(sessionDirPath, 'attendance.csv'), csv, 'utf8');
  } catch (err) {
    console.warn('[Attendance Export Warning]', err.message);
  }

  return { records, csv, markdown: md };
}

module.exports = {
  recordJoin,
  recordLeave,
  recordCameraChange,
  getRoomAttendance,
  generateAttendanceCsv,
  generateAttendanceMarkdown,
  exportAttendanceForSession,
  formatDuration,
  formatTimestamp,
};
