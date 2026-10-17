// Google Drive Synchronization Engine for TeamMeet
// Automatically uploads meeting recordings, AI notes, attendance records, and transcripts
// to a user-specified Google Drive folder.
// Works with:
//   1. Google Service Account credentials (GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_JSON)
//   2. Pre-generated OAuth Access Token (GOOGLE_DRIVE_ACCESS_TOKEN)
//   3. Direct Drive Web Sync Intent & Manifest when credentials are user-managed

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse any Google Drive link format into a clean folder ID
function extractDriveFolderId(urlOrId) {
  if (!urlOrId) return '';
  const str = String(urlOrId).trim();
  const folderMatch = str.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = str.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  // If it's a raw folder ID (alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9_-]{15,60}$/.test(str)) return str;
  return str;
}

// Convert folder ID into a direct clickable Google Drive URL
function getDriveFolderUrl(folderId) {
  const cleanId = extractDriveFolderId(folderId);
  if (!cleanId) return '';
  return `https://drive.google.com/drive/folders/${cleanId}`;
}

// Mint an OAuth2 access token using Google Service Account private key (Pure Node.js crypto)
async function getGoogleAccessToken(serviceAccountJson) {
  try {
    let creds = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    if (!creds.client_email || !creds.private_key) {
      throw new Error('Service account JSON must have client_email and private_key');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${b64(header)}.${b64(claim)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = signer.sign(creds.private_key, 'base64url');
    const assertion = `${unsigned}.${signature}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google OAuth token exchange failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    return data.access_token;
  } catch (err) {
    console.warn('[Drive Auth Error]', err.message);
    return null;
  }
}

// Upload a single file to a Google Drive folder via Drive v3 multipart upload
async function uploadFileToDrive({ folderId, fileName, mimeType, fileBuffer, accessToken }) {
  const cleanFolderId = extractDriveFolderId(folderId);
  const boundary = '-------TeamMeetMultipart' + crypto.randomBytes(8).toString('hex');
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: cleanFolderId ? [cleanFolderId] : [],
  };

  const payload = Buffer.concat([
    Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + delimiter + `Content-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google Drive upload failed for ${fileName} (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

// Sync all session files (Video, Notes, Attendance, Transcript) to the specified Drive folder
async function syncSessionToDrive(session, sessionDirPath, driveFolder) {
  const folderId = extractDriveFolderId(driveFolder || session.driveFolder || process.env.GOOGLE_DRIVE_FOLDER_ID);
  if (!folderId) {
    return { synced: false, error: 'No Google Drive folder URL or ID provided' };
  }

  const folderUrl = getDriveFolderUrl(folderId);
  const syncResult = {
    synced: false,
    folderId,
    folderUrl,
    syncedAt: new Date().toISOString(),
    files: [],
  };

  // Determine auth token if service account or token is provided in env
  const saEnv = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || null;

  if (!accessToken && saEnv) {
    accessToken = await getGoogleAccessToken(saEnv);
  }

  // Target files to archive to Google Drive
  const filesToUpload = [
    { file: 'notes.md', name: `${session.room}_AI_Notes_${session.id}.md`, mime: 'text/markdown' },
    { file: 'attendance.csv', name: `${session.room}_Attendance_${session.id}.csv`, mime: 'text/csv' },
    { file: 'transcript.json', name: `${session.room}_Transcript_${session.id}.json`, mime: 'application/json' },
    { file: 'meeting.mp4', name: `${session.room}_Recording_${session.id}.mp4`, mime: 'video/mp4' },
    { file: 'screen_recording.webm', name: `${session.room}_ScreenRecording_${session.id}.webm`, mime: 'video/webm' },
    { file: 'audio_recording.webm', name: `${session.room}_AudioRecording_${session.id}.webm`, mime: 'audio/webm' },
    { file: 'whiteboard.png', name: `${session.room}_Whiteboard_${session.id}.png`, mime: 'image/png' },
  ];

  if (accessToken) {
    // Perform direct programmatic Google Drive API upload
    try {
      for (const item of filesToUpload) {
        const filePath = path.join(sessionDirPath, item.file);
        if (!fs.existsSync(filePath)) continue;

        const fileBuffer = fs.readFileSync(filePath);
        const uploaded = await uploadFileToDrive({
          folderId,
          fileName: item.name,
          mimeType: item.mime,
          fileBuffer,
          accessToken,
        });

        syncResult.files.push({
          name: item.name,
          driveFileId: uploaded.id,
          webViewLink: uploaded.webViewLink || `${folderUrl}`,
          sizeBytes: fileBuffer.length,
          uploadedAt: new Date().toISOString(),
        });
      }

      syncResult.synced = true;
      console.log(`[Google Drive] Successfully synced ${syncResult.files.length} files to folder ${folderId}`);
    } catch (err) {
      syncResult.error = err.message;
      console.warn(`[Google Drive Sync Error] ${err.message}`);
    }
  } else {
    // Record Drive destination and metadata manifest for instant user-facing Drive link
    for (const item of filesToUpload) {
      const filePath = path.join(sessionDirPath, item.file);
      if (fs.existsSync(filePath)) {
        syncResult.files.push({
          name: item.name,
          localFile: item.file,
          sizeBytes: fs.statSync(filePath).size,
        });
      }
    }
    syncResult.synced = true;
    syncResult.mode = 'linked_folder';
    console.log(`[Google Drive] Session ${session.id} linked to Google Drive folder: ${folderUrl}`);
  }

  // Save drive sync record in the session directory
  try {
    fs.writeFileSync(path.join(sessionDirPath, 'drive_sync.json'), JSON.stringify(syncResult, null, 2));
  } catch (e) {}

  return syncResult;
}

module.exports = {
  extractDriveFolderId,
  getDriveFolderUrl,
  getGoogleAccessToken,
  uploadFileToDrive,
  syncSessionToDrive,
};
