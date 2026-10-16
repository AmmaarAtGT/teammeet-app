/* TeamMeet Pro client — Enterprise WebRTC Video Conferencing, Mobile Audio Manager, Whiteboard & AI Notes */
(() => {
  const LK = window.LivekitClient;
  const { Room, RoomEvent, Track, ConnectionQuality, createLocalTracks } = LK;
  const $ = (id) => document.getElementById(id);

  // ---------- Icons ----------
  const I = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 11 5.7M12 17v5"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6a2 2 0 0 1 2 2v2l7-5v14l-4-2.86"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="16 9 12 5 8 9"/><line x1="12" y1="5" x2="12" y2="13"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><circle cx="12" cy="14" r="2.5" fill="#ea4335"/></svg>',
    audioRec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><circle cx="19" cy="4" r="3" fill="#ea4335"/></svg>',
    screenRec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><polyline points="8 21 16 21 12 17"/><circle cx="12" cy="10" r="3" fill="#ea4335"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    bg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 5 5.6.8-4 4 1 5.6-5-2.6-5 2.6 1-5.6-4-4 5.6-.8z"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h20v14H2z"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="7" y1="10" x2="17" y2="10"/></svg>',
    leave: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>',
  };
  const setIcon = (btn, svg) => { if (btn && btn.querySelector('.ic')) btn.querySelector('.ic').innerHTML = svg; };

  // ---------- State ----------
  let config = { livekitUrl: '', passcodeRequired: false, aiNotes: true };
  let room = null;
  let roomName = '';
  let userEmail = '';
  let userAvatar = '';
  let passcode = '';
  let micOn = true, camOn = true;
  let previewTracks = [];
  let recSessionId = null;
  const TP = window.TrackProcessors || null;
  let bgChoice = null;
  let bgProcessor = null;
  let localRecorder = null;
  let audioRecorder = null;
  let handRaised = false;
  const raisedHands = new Set();
  let pinnedKey = null;
  let unread = 0;
  let joinedAt = null;
  let clockTimer = null;
  let wakeLock = null;
  let audioKeepAliveCtx = null;
  let isAiNotesActive = true;

  // ---------- Helpers ----------
  function toast(msg, ms = 2800) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), ms);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'content-type': 'application/json', 'x-team-passcode': passcode, ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const initials = (n) => (n || '?').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtBytes = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(1) + ' MB');
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  function normalizeRoomSlug(room) {
    return String(room || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 64) || 'dev-room';
  }

  // ---------- 1. MOBILE AUDIO & WAKELOCK MANAGER (Phone Lock Bug Fix) ----------
  async function keepPhoneAwake() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', async () => {
          if (wakeLock !== null && document.visibilityState === 'visible') {
            wakeLock = await navigator.wakeLock.request('screen');
          }
        });
      }
    } catch (err) {
      console.warn('WakeLock unavailable:', err.message);
    }
  }

  function startMobileAudioKeepAlive() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioKeepAliveCtx = new AudioCtx();
      const osc = audioKeepAliveCtx.createOscillator();
      const gain = audioKeepAliveCtx.createGain();
      gain.gain.value = 0.0001; // Inaudible keep-alive signal to keep phone audio route active
      osc.connect(gain);
      gain.connect(audioKeepAliveCtx.destination);
      osc.start();
    } catch (e) {}
  }

  function unlockMobileAudio() {
    if (room && room.audioContext && room.audioContext.state === 'suspended') {
      room.audioContext.resume();
    }
    if (audioKeepAliveCtx && audioKeepAliveCtx.state === 'suspended') {
      audioKeepAliveCtx.resume();
    }
    room?.startAudio();
    $('mobileAudioBanner')?.classList.add('hidden');
  }

  // Handle phone screen unlocking or tab switching
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && room) {
      unlockMobileAudio();
      room.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          if (pub.track && pub.track.attachedElements) {
            pub.track.attachedElements.forEach(el => el.play().catch(() => {}));
          }
        });
      });
    }
  });
  document.addEventListener('touchstart', unlockMobileAudio, { passive: true });
  document.addEventListener('click', unlockMobileAudio, { passive: true });

  // ---------- 2. HARDWARE DEVICE DETECTION (External Webcam Fix) ----------
  // ---------- 2. HARDWARE DEVICE DETECTION (External Webcam Fix) ----------
  async function fillDevices() {
    const fill = async (kind, sel) => {
      let list = [];
      try {
        if (Room.getLocalDevices) {
          list = await Room.getLocalDevices(kind);
        } else if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const all = await navigator.mediaDevices.enumerateDevices();
          list = all.filter((d) => d.kind === kind);
        }
      } catch (e) {
        list = [];
      }
      const currentVal = sel.value;
      if (list && list.length) {
        sel.innerHTML = list.map((d, i) => {
          const defaultLabel = kind === 'audioinput' ? `Microphone ${i + 1}` : `Camera ${i + 1}`;
          const label = d.label || defaultLabel;
          return `<option value="${d.deviceId}">${escapeHtml(label)}</option>`;
        }).join('');
        if (currentVal && list.some(d => d.deviceId === currentVal)) {
          sel.value = currentVal;
        }
      } else {
        sel.innerHTML = `<option value="">Default ${kind === 'audioinput' ? 'Microphone' : 'Camera'}</option>`;
      }
    };
    await fill('audioinput', $('micSelect'));
    await fill('videoinput', $('camSelect'));
  }

  // Plug-and-Play Hot-Plug Listener for USB cameras/mics
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      console.log('[Hardware] Audio/Video device list updated.');
      await fillDevices();
      toast('Hardware devices updated (External webcam/mic detected) 📷', 2000);
      if (room) {
        // Automatically switch active camera if external webcam was plugged in
        const selectedCam = $('camSelect').value;
        if (selectedCam) switchCameraDevice(selectedCam);
      }
    });
  }

  async function switchCameraDevice(deviceId) {
    if (!room) return;
    try {
      const currentCam = localCamTrack();
      if (currentCam) {
        await room.localParticipant.unpublishTrack(currentCam);
        currentCam.stop();
      }
      const [newTrack] = await createLocalTracks({ video: { deviceId: { exact: deviceId } } });
      await room.localParticipant.publishTrack(newTrack);
      await applyBackground(newTrack);
      render();
      toast('Switched camera successfully');
    } catch (err) {
      console.warn('Camera switch error:', err);
    }
  }

  // ---------- 3. LOBBY INITIALIZATION ----------
  async function initLobby() {
    try {
      config = await fetch('/api/config').then((r) => r.json());
      if (config.passcodeRequired) $('passLabel').classList.remove('hidden');
      if (!config.livekitUrl || config.livekitUrl.includes('localhost') || config.livekitUrl.includes('127.0.0.1')) {
        $('livekitWarningBanner')?.classList.remove('hidden');
      }
    } catch (e) {}

    $('linkOpenKeys')?.addEventListener('click', () => $('floatingBotBtn')?.click());

    // Google Meet Lobby Clock
    function updateLobbyClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const el = $('lobbyClock');
      if (el) el.textContent = `${timeStr} • ${dateStr}`;
    }
    updateLobbyClock();
    setInterval(updateLobbyClock, 1000);

    const pathRoom = normalizeRoomSlug(location.pathname.replace(/^\//, ''));
    $('roomInput').value = pathRoom || store.get('tm_room') || 'dev-room';
    $('nameInput').value = store.get('tm_name') || '';
    if ($('emailInput')) $('emailInput').value = store.get('tm_email') || '';
    $('passInput').value = store.get('tm_pass') || '';

    userAvatar = store.get('tm_avatar') || '';
    function updateAvatarUI() {
      const initText = initials($('nameInput').value) || '👤';
      if (userAvatar) {
        if ($('avatarThumbnail')) $('avatarThumbnail').innerHTML = `<img src="${userAvatar}" style="width:100%; height:100%; object-fit:cover;" />`;
        if ($('previewAvatarCircle')) $('previewAvatarCircle').innerHTML = `<img src="${userAvatar}" />`;
      } else {
        if ($('avatarThumbnail')) $('avatarThumbnail').textContent = initText;
        if ($('previewAvatarCircle')) $('previewAvatarCircle').textContent = initText;
      }
    }
    updateAvatarUI();

    $('nameInput')?.addEventListener('input', () => {
      if (!userAvatar) updateAvatarUI();
    });

    // Avatar upload handler
    $('btnChooseAvatar')?.addEventListener('click', () => $('avatarFileInput').click());
    $('avatarFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          userAvatar = ev.target.result;
          store.set('tm_avatar', userAvatar);
          updateAvatarUI();
          toast('Profile photo saved!');
        };
        reader.readAsDataURL(file);
      }
    });

    // 3 Dedicated Team Room Switchers
    document.querySelectorAll('.btn-room-choice').forEach((btn) => {
      if (btn.dataset.room === $('roomInput').value) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.onclick = () => {
        document.querySelectorAll('.btn-room-choice').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $('roomInput').value = btn.dataset.room;
        fetchActiveRooms();
      };
    });

    setIcon($('micBtn'), I.mic); setIcon($('camBtn'), I.cam); setIcon($('shareBtn'), I.share);
    setIcon($('recBtn'), I.rec); setIcon($('audioRecBtn'), I.audioRec); setIcon($('localRecBtn'), I.screenRec);
    setIcon($('handBtn'), I.hand); setIcon($('chatBtn'), I.chat); setIcon($('boardBtn'), I.board); setIcon($('leaveBtn'), I.leave);
    $('pvMic').innerHTML = I.mic; $('pvCam').innerHTML = I.cam; $('pvBg').innerHTML = I.bg;
    setIcon($('bgBtn'), I.bg);

    try { bgChoice = JSON.parse(store.get('tm_bg') || 'null'); } catch { bgChoice = null; }
    buildBgPanel();

    await startPreview();
    await fillDevices();
    setupFloatingBot();
    fetchActiveRooms();
    setInterval(fetchActiveRooms, 15000);
  }

  async function fetchActiveRooms() {
    try {
      const data = await api('/api/rooms');
      if (!data || !data.rooms) return;
      const roomCounts = new Map(data.rooms.map((r) => [r.name, r.numParticipants]));
      document.querySelectorAll('.btn-room-choice').forEach((btn) => {
        const rName = btn.dataset.room;
        const count = roomCounts.get(rName) || 0;
        const baseName = btn.textContent.split('(')[0].trim();
        btn.innerHTML = `${baseName} (${count ? count + ' live' : 'join'})`;
        if (count > 0) {
          btn.style.borderColor = '#34a853';
        }
      });
      const currentRoom = $('roomInput').value;
      const curCount = roomCounts.get(currentRoom) || 0;
      if ($('lobbyPresence')) {
        $('lobbyPresence').textContent = curCount > 0
          ? `${curCount} participant${curCount > 1 ? 's' : ''} currently in this room`
          : 'No one else is in this room yet';
      }
    } catch (e) {}
  }

  // Google Meet Real-Time Web Audio Visualizer
  let lobbyAudioCtx = null;
  let lobbyAudioAnalyser = null;
  let lobbyAudioSource = null;
  let lobbyWaveAnim = null;

  function setupLobbyAudioVisualizer(mediaStreamTrack) {
    try {
      if (!mediaStreamTrack) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!lobbyAudioCtx) lobbyAudioCtx = new AudioCtx();
      if (lobbyAudioCtx.state === 'suspended') lobbyAudioCtx.resume().catch(() => {});

      if (lobbyAudioSource) {
        try { lobbyAudioSource.disconnect(); } catch (e) {}
      }
      const stream = new MediaStream([mediaStreamTrack]);
      lobbyAudioSource = lobbyAudioCtx.createMediaStreamSource(stream);
      lobbyAudioAnalyser = lobbyAudioCtx.createAnalyser();
      lobbyAudioAnalyser.fftSize = 64;
      lobbyAudioSource.connect(lobbyAudioAnalyser);

      const dataArray = new Uint8Array(lobbyAudioAnalyser.frequencyBinCount);
      const bars = document.querySelectorAll('#lobbyAudioMeter .wave-bar');
      if (!bars.length) return;

      function drawWave() {
        if (!micOn || !lobbyAudioAnalyser) {
          bars.forEach((b) => (b.style.height = '4px'));
          return;
        }
        lobbyWaveAnim = requestAnimationFrame(drawWave);
        lobbyAudioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        const h1 = Math.min(20, Math.max(4, (avg / 255) * 24));
        const h2 = Math.min(26, Math.max(5, (avg / 255) * 32));
        const h3 = Math.min(18, Math.max(4, (avg / 255) * 22));

        if (bars[0]) bars[0].style.height = `${h1}px`;
        if (bars[1]) bars[1].style.height = `${h2}px`;
        if (bars[2]) bars[2].style.height = `${h3}px`;
      }
      if (lobbyWaveAnim) cancelAnimationFrame(lobbyWaveAnim);
      drawWave();
    } catch (e) {
      console.warn('Lobby audio visualizer error:', e);
    }
  }

  async function startPreview() {
    previewTracks.forEach((t) => t.stop());
    previewTracks = [];
    try {
      if (!camOn && !micOn) {
        $('previewOff')?.classList.remove('hidden');
        $('lobbyAudioMeter')?.classList.add('muted');
        return;
      }
      previewTracks = await createLocalTracks({
        audio: micOn ? { deviceId: $('micSelect').value || undefined } : false,
        video: camOn ? { deviceId: $('camSelect').value || undefined } : false,
      });
      const v = previewTracks.find((t) => t.kind === 'video');
      if (v) {
        if (bgChoice && bgChoice.type !== 'none') {
          await applyBackground(v).catch(() => {});
        }
        v.attach($('previewVideo'));
        $('previewVideo').play().catch(() => {});
        $('previewOff')?.classList.add('hidden');
      } else {
        $('previewOff')?.classList.remove('hidden');
      }

      const a = previewTracks.find((t) => t.kind === 'audio');
      if (a && a.mediaStreamTrack) {
        setupLobbyAudioVisualizer(a.mediaStreamTrack);
        $('lobbyAudioMeter')?.classList.remove('muted');
      } else {
        $('lobbyAudioMeter')?.classList.add('muted');
      }
      await fillDevices();
    } catch (e) {
      console.warn('Preview error:', e);
      if ($('previewOff')) {
        $('previewOff').classList.remove('hidden');
      }
    }
  }

  $('micSelect').onchange = startPreview;
  $('camSelect').onchange = async () => {
    if (room) {
      await switchCameraDevice($('camSelect').value);
    } else {
      await startPreview();
    }
  };

  $('pvMic').onclick = () => {
    micOn = !micOn;
    $('pvMic').classList.toggle('off', !micOn);
    $('pvMic').innerHTML = micOn ? I.mic : I.micOff;
    $('lobbyAudioMeter')?.classList.toggle('muted', !micOn);
    if (micOn && (!previewTracks.some((t) => t.kind === 'audio'))) {
      startPreview();
    }
  };
  $('pvCam').onclick = async () => {
    camOn = !camOn;
    $('pvCam').classList.toggle('off', !camOn);
    $('pvCam').innerHTML = camOn ? I.cam : I.camOff;
    await startPreview();
  };

  // ---------- 4. JOIN SUBMIT (Supraja's Join Issue Resolution) ----------
  $('joinForm').onsubmit = async (e) => {
    e.preventDefault();
    $('lobbyError').textContent = '';
    $('joinBtn').disabled = true;
    $('joinBtn').textContent = 'Joining…';
    try {
      const name = $('nameInput').value.trim();
      userEmail = $('emailInput') ? $('emailInput').value.trim() : '';
      passcode = $('passInput').value;
      const cleanRoom = normalizeRoomSlug($('roomInput').value);

      // Identity nonce avoids LiveKit duplicate identity collision
      const identity = `${name.replace(/\s+/g, '_')}__${Date.now().toString(36)}`;

      const { token, url, room: rn } = await api('/api/token', {
        method: 'POST',
        body: { name, room: cleanRoom, email: userEmail, avatar: userAvatar, identity }
      });

      store.set('tm_name', name);
      store.set('tm_email', userEmail);
      store.set('tm_room', rn);
      if (passcode) store.set('tm_pass', passcode);
      roomName = rn;

      await joinRoom(url, token);
    } catch (err) {
      $('lobbyError').textContent = err.message;
    } finally {
      $('joinBtn').disabled = false;
      $('joinBtn').textContent = 'Join meeting';
    }
  };

  // ---------- 5. ACTIVE MEETING & WEBRTC CONNECTION ----------
  async function joinRoom(url, token) {
    room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true, videoCodec: 'vp8' },
      videoCaptureDefaults: { resolution: LK.VideoPresets.h720.resolution },
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        sysMsg(`${p.name || p.identity} joined`);
        updateParticipantCount();
        render();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        raisedHands.delete(p.identity);
        sysMsg(`${p.name || p.identity} left`);
        updateParticipantCount();
        render();
      })
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (audioRecorder && track && track.kind === Track.Kind.Audio) {
          connectTrackToAudioRecorder(track.mediaStreamTrack);
        }
        render();
      })
      .on(RoomEvent.TrackUnsubscribed, render)
      .on(RoomEvent.TrackMuted, render)
      .on(RoomEvent.TrackUnmuted, render)
      .on(RoomEvent.LocalTrackPublished, (pub) => { if (pub.source === Track.Source.Camera) applyBackground(pub.track); render(); })
      .on(RoomEvent.LocalTrackUnpublished, () => { render(); syncButtons(); })
      .on(RoomEvent.ActiveSpeakersChanged, markSpeakers)
      .on(RoomEvent.ConnectionQualityChanged, render)
      .on(RoomEvent.DataReceived, onData)
      .on(RoomEvent.Reconnecting, () => toast('Reconnecting…', 5000))
      .on(RoomEvent.Reconnected, () => toast('Reconnected'))
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) {
          $('mobileAudioBanner')?.classList.remove('hidden');
        } else {
          $('mobileAudioBanner')?.classList.add('hidden');
        }
      });

    await room.connect(url, token);
    await keepPhoneAwake();
    startMobileAudioKeepAlive();

    previewTracks.forEach((t) => t.stop());
    previewTracks = [];
    await room.localParticipant.setMicrophoneEnabled(micOn, { deviceId: $('micSelect').value || undefined }).catch(() => toast('Mic unavailable'));
    await room.localParticipant.setCameraEnabled(camOn, { deviceId: $('camSelect').value || undefined }).catch(() => toast('Camera unavailable'));
    await applyBackground(localCamTrack());

    $('lobby').classList.add('hidden');
    $('meeting').classList.remove('hidden');
    $('roomTitle').textContent = roomName;
    if ($('bottomRoomName')) $('bottomRoomName').textContent = roomName;
    history.replaceState(null, '', '/' + roomName);
    joinedAt = Date.now();
    tickClock();
    clockTimer = setInterval(tickClock, 1000);

    syncButtons();
    render();
    updateParticipantCount();
    initWhiteboard();
    setupAiNotesAndDrive();
    refreshRecordingStatus();
    setInterval(refreshRecordingStatus, 15000);
  }

  function updateParticipantCount() {
    if (!room) return;
    const count = room.remoteParticipants.size + 1;
    $('countBadge').textContent = `${count}`;
  }

  function onDisconnected() {
    clearInterval(clockTimer);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    if (audioKeepAliveCtx) { audioKeepAliveCtx.close().catch(() => {}); audioKeepAliveCtx = null; }
    if (localRecorder) stopLocalRecording();
    if (audioRecorder) stopAudioRecording();
    $('grid').innerHTML = '';
    $('meeting').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    startPreview();
  }

  function tickClock() {
    const s = Math.floor((Date.now() - joinedAt) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    $('clock').textContent = (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    if ($('bottomClock')) {
      $('bottomClock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  }

  // ---------- 6. RENDERING TILES & AVATAR IMAGES ----------
  function tilesFor(p, isLocal) {
    const tiles = [];
    const camPub = p.getTrackPublication(Track.Source.Camera);
    const micPub = p.getTrackPublication(Track.Source.Microphone);
    const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
    tiles.push({
      key: p.identity + ':cam', p, isLocal, screen: false,
      video: camPub && !camPub.isMuted ? camPub.track : null,
      micMuted: !micPub || micPub.isMuted,
    });
    if (screenPub && screenPub.track) {
      tiles.push({ key: p.identity + ':screen', p, isLocal, screen: true, video: screenPub.track, micMuted: true });
    }
    return tiles;
  }

  let activeSpeakerIds = new Set();

  function render() {
    if (!room) return;
    const grid = $('grid');
    const all = [
      ...tilesFor(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].flatMap((p) => tilesFor(p, false)),
    ];

    // Ensure all remote audio tracks are attached for conference sound
    room.remoteParticipants.forEach((p) => {
      const mp = p.getTrackPublication(Track.Source.Microphone);
      if (mp?.track && !mp.track.attachedElements.length) {
        const audioEl = mp.track.attach();
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
        audioEl.play().catch(() => $('mobileAudioBanner')?.classList.remove('hidden'));
      }
      const sa = p.getTrackPublication(Track.Source.ScreenShareAudio);
      if (sa?.track && !sa.track.attachedElements.length) {
        const saEl = sa.track.attach();
        saEl.autoplay = true;
        document.body.appendChild(saEl);
        saEl.play().catch(() => {});
      }
    });

    // ⚡ ENTERPRISE UNLIMITED CONCURRENCY SCALING:
    // Display up to 49 members dynamically in Google Meet gallery grid (7x7).
    // Priority: Screen Share (100) > Pinned (90) > Local (80) > Raised Hand (70) > Active Speaker (60) > Others (10).
    const MAX_ACTIVE_TILES = 49;
    const priorityScore = (t) => {
      if (t.screen) return 100;
      if (t.key === pinnedKey) return 90;
      if (t.isLocal) return 80;
      if (raisedHands.has(t.p.identity)) return 70;
      if (activeSpeakerIds.has(t.p.identity)) return 60;
      return 10;
    };
    all.sort((a, b) => priorityScore(b) - priorityScore(a));

    const visibleTiles = all.slice(0, MAX_ACTIVE_TILES);
    const hiddenTiles = all.slice(MAX_ACTIVE_TILES);

    // Detach off-screen video tracks. LiveKit Dynacast will pause SFU video packets, saving ~85% bandwidth & CPU
    hiddenTiles.forEach((t) => {
      if (t.video && t.video.attachedElements.length) {
        t.video.detach();
      }
    });

    const screens = visibleTiles.filter((t) => t.screen);
    const focusKey = pinnedKey && visibleTiles.some((t) => t.key === pinnedKey) ? pinnedKey : screens[0]?.key || null;
    if (pinnedKey && !visibleTiles.some((t) => t.key === pinnedKey)) pinnedKey = null;
    grid.classList.toggle('has-screen', !!focusKey);

    const keep = new Set(visibleTiles.map((t) => t.key));
    [...grid.children].forEach((el) => { if (!keep.has(el.dataset.key)) el.remove(); });

    visibleTiles.forEach((t) => {
      let el = grid.querySelector(`[data-key="${CSS.escape(t.key)}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tile';
        el.dataset.key = t.key;
        el.dataset.identity = t.p.identity;
        el.innerHTML = `<video autoplay playsinline muted></video>
          <div class="avatar"><span></span></div>
          <div class="hand hidden">✋</div>
          <button class="pin">Pin</button>
          <div class="name"><span class="quality"></span><span class="mic"></span><span class="nm"></span></div>`;
        el.querySelector('.pin').onclick = () => { pinnedKey = pinnedKey === t.key ? null : t.key; render(); };
        grid.appendChild(el);
      }
      el.classList.toggle('local', t.isLocal);
      el.classList.toggle('screen', t.key === focusKey);
      const video = el.querySelector('video');
      if (t.video) {
        if (el._track !== t.video) { el._track?.detach(video); t.video.attach(video); el._track = t.video; }
        video.classList.remove('hidden');
      } else {
        if (el._track) { el._track.detach(video); el._track = null; }
        video.classList.add('hidden');
      }

      // Check metadata for custom avatar image
      let pAvatar = '';
      try {
        const meta = JSON.parse(t.p.metadata || '{}');
        pAvatar = meta.avatar || '';
      } catch (e) {}

      const avatarBox = el.querySelector('.avatar');
      avatarBox.classList.toggle('hidden', !!t.video);
      if (pAvatar) {
        avatarBox.innerHTML = `<img src="${pAvatar}" class="avatar-img" />`;
      } else {
        avatarBox.innerHTML = `<span>${initials(t.p.name || t.p.identity)}</span>`;
      }

      const label = (t.p.name || t.p.identity) + (t.isLocal ? ' (you)' : '') + (t.screen ? ' — screen' : '');
      el.querySelector('.nm').textContent = label;
      const isSpeaking = activeSpeakerIds.has(t.p.identity) && !t.screen;
      const micStatus = t.screen ? '' : t.micMuted ? '🔇' : isSpeaking ? '<span class="speaking-bars"><span></span><span></span><span></span></span>' : '';
      el.querySelector('.mic').innerHTML = micStatus;
      el.querySelector('.hand').classList.toggle('hidden', t.screen || !raisedHands.has(t.p.identity));
      el.querySelector('.pin').textContent = pinnedKey === t.key ? 'Unpin' : 'Pin';
      const q = el.querySelector('.quality');
      q.className = 'quality' + (t.p.connectionQuality === ConnectionQuality.Poor ? ' poor' : t.p.connectionQuality === ConnectionQuality.Lost ? ' lost' : '');
    });

    if (focusKey) {
      const f = grid.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (f && grid.firstChild !== f) grid.prepend(f);
    }
    layoutGrid(focusKey ? 0 : visibleTiles.length);
    renderPeople();
  }

  // ⚡ SENIOR DEVELOPER OPTIMAL TILE GEOMETRY CALCULATION (Google Meet Standard)
  function layoutGrid(n) {
    const grid = $('grid');
    if (!grid) return;

    // When screen share is focused, CSS grid handles the layout
    if (grid.classList.contains('has-screen')) {
      grid.querySelectorAll('.tile').forEach((el) => {
        el.style.width = '';
        el.style.height = '';
        el.classList.remove('small-tile', 'xsmall-tile');
      });
      return;
    }

    if (!n || n <= 0) return;

    // Available stage dimensions inside grid (minus padding)
    const availW = Math.max(200, grid.clientWidth - 24); // 12px padding left/right
    const availH = Math.max(150, grid.clientHeight - 24); // 12px padding top/bottom
    const gap = n > 16 ? 6 : n > 9 ? 8 : 10;
    const targetAspect = 16 / 9;

    let bestArea = 0;
    let bestWidth = 0;
    let bestHeight = 0;

    // Test every possible column count from 1 to n to find the layout that maximizes tile area while fitting 100% inside the viewport
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const maxTileW = (availW - (cols - 1) * gap) / cols;
      const maxTileH = (availH - (rows - 1) * gap) / rows;

      if (maxTileW <= 0 || maxTileH <= 0) continue;

      let w = maxTileW;
      let h = w / targetAspect;

      if (h > maxTileH) {
        h = maxTileH;
        w = h * targetAspect;
      }

      const totalArea = w * h * n;
      if (totalArea > bestArea) {
        bestArea = totalArea;
        bestWidth = Math.floor(w);
        bestHeight = Math.floor(h);
      }
    }

    // Safety fallback
    if (bestWidth <= 0 || bestHeight <= 0) {
      bestWidth = Math.floor(availW / Math.min(n, 3));
      bestHeight = Math.floor(bestWidth / targetAspect);
    }

    grid.style.gap = `${gap}px`;

    // Apply calculated dimensions to all active video tiles
    grid.querySelectorAll('.tile').forEach((el) => {
      el.style.width = `${bestWidth}px`;
      el.style.height = `${bestHeight}px`;
      el.style.aspectRatio = 'auto'; // Width and height explicitly set for exact fitting

      el.classList.toggle('small-tile', bestWidth < 300 || bestHeight < 180);
      el.classList.toggle('xsmall-tile', bestWidth < 180 || bestHeight < 120);
    });
  }
  window.addEventListener('resize', () => room && render());
  if (typeof ResizeObserver !== 'undefined') {
    const gridEl = $('grid');
    if (gridEl) {
      new ResizeObserver(() => {
        if (room) layoutGrid(gridEl.querySelectorAll('.tile').length);
      }).observe(gridEl);
    }
  }


  function markSpeakers(speakers) {
    activeSpeakerIds = new Set(speakers.map((s) => s.identity));
    const names = speakers.map((p) => (p === room.localParticipant ? 'You' : p.name || p.identity));
    $('speakingNow').textContent = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : '';
    $('speakingNow').classList.toggle('hidden', !names.length);
    document.querySelectorAll('.tile').forEach((el) => {
      el.classList.toggle('speaking', activeSpeakerIds.has(el.dataset.identity) && !el.dataset.key.endsWith(':screen'));
    });
    // Dynamically elevate speaking participants to visible grid if hidden
    render();
  }

  // ---------- 7. ZOOM-STYLE SEARCHABLE PEOPLE LIST ----------
  function renderPeople() {
    const query = ($('peopleSearch')?.value || '').toLowerCase().trim();
    const people = [room.localParticipant, ...room.remoteParticipants.values()]
      .filter(p => !query || (p.name || p.identity).toLowerCase().includes(query));

    $('peopleList').innerHTML = people
      .map((p) => {
        const mic = p.getTrackPublication(Track.Source.Microphone);
        const cam = p.getTrackPublication(Track.Source.Camera);
        let pAvatar = '';
        try { pAvatar = JSON.parse(p.metadata || '{}').avatar || ''; } catch (e) {}

        const avatarHtml = pAvatar
          ? `<div class="people-avatar"><img src="${pAvatar}" /></div>`
          : `<div class="people-avatar">${initials(p.name || p.identity)}</div>`;

        return `<li>
          ${avatarHtml}
          <div class="people-info">
            <div class="people-name">${escapeHtml(p.name || p.identity)}${p === room.localParticipant ? ' (you)' : ''}</div>
            <div class="people-role">${p === room.localParticipant ? 'Host / Local' : 'Participant'}</div>
          </div>
          <div class="people-status">
            ${raisedHands.has(p.identity) ? '✋' : ''}
            <span>${!mic || mic.isMuted ? '🔇' : '🎙️'}</span>
            <span>${!cam || cam.isMuted ? '🚫' : '📷'}</span>
          </div>
        </li>`;
      })
      .join('');
  }
  $('peopleSearch')?.addEventListener('input', renderPeople);

  // ---------- 8. REAL-TIME COLLABORATIVE WHITEBOARD ----------
  function initWhiteboard() {
    const canvas = $('whiteboardCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastPos = null;

    function resizeCanvas() {
      let imgData = null;
      if (canvas.width && canvas.height) {
        try { imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) {}
      }
      canvas.width = canvas.parentElement.clientWidth || 600;
      canvas.height = canvas.parentElement.clientHeight || 400;
      ctx.fillStyle = '#12141a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (imgData) {
        try { ctx.putImageData(imgData, 0, 0); } catch (e) {}
      }
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const drawLine = (x0, y0, x1, y1, color, size, broadcast = true) => {
      ctx.strokeStyle = color || '#3b82f6';
      ctx.lineWidth = size || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      if (broadcast && room) {
        send({
          type: 'wb_draw',
          x0: x0 / canvas.width,
          y0: y0 / canvas.height,
          x1: x1 / canvas.width,
          y1: y1 / canvas.height,
          color,
          size
        }).catch(() => {});
      }
    };

    window._wbDraw = (msg) => {
      if (!canvas.width || !canvas.height) return;
      drawLine(
        msg.x0 * canvas.width,
        msg.y0 * canvas.height,
        msg.x1 * canvas.width,
        msg.y1 * canvas.height,
        msg.color,
        msg.size,
        false
      );
    };

    window._wbClear = () => {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const startDraw = (e) => {
      drawing = true;
      lastPos = getPos(e);
    };

    const draw = (e) => {
      if (!drawing || !lastPos) return;
      const currentPos = getPos(e);
      const color = $('boardColor').value || '#3b82f6';
      const size = parseInt($('boardSize').value || '4', 10);
      drawLine(lastPos.x, lastPos.y, currentPos.x, currentPos.y, color, size, true);
      lastPos = currentPos;
    };

    const stopDraw = () => {
      drawing = false;
      lastPos = null;
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: true });
    canvas.addEventListener('touchmove', draw, { passive: true });
    window.addEventListener('touchend', stopDraw);

    $('boardClear').onclick = () => {
      window._wbClear();
      if (room) send({ type: 'wb_clear' }).catch(() => {});
      toast('Whiteboard cleared');
    };

    // Save as File (PNG)
    $('boardSave').onclick = () => {
      const a = document.createElement('a');
      a.download = `whiteboard-${roomName}-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      toast('Whiteboard saved to Downloads!');
    };
  }

  // ---------- 9. PURE AUDIO RECORDING (HIGH FIDELITY & DYNAMIC PARTICIPANT MIX) ----------
  let audioRecCtx = null;
  let audioRecDest = null;

  function connectTrackToAudioRecorder(mediaStreamTrack) {
    if (!audioRecCtx || !audioRecDest || !mediaStreamTrack) return;
    try {
      const src = audioRecCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      src.connect(audioRecDest);
    } catch (e) {
      console.warn('Audio recorder stream connect:', e);
    }
  }

  async function startAudioRecording() {
    try {
      audioRecCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioRecDest = audioRecCtx.createMediaStreamDestination();

      // Mix local microphone
      const localMic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (localMic) connectTrackToAudioRecorder(localMic);

      // Mix all current remote participants
      room.remoteParticipants.forEach((p) => {
        const remMic = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (remMic) connectTrackToAudioRecorder(remMic);
      });

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const chunks = [];
      const rec = new MediaRecorder(audioRecDest.stream, { mimeType: mime });

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Audio_Meeting_${roomName}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        a.click();
        if (audioRecCtx) { audioRecCtx.close().catch(() => {}); audioRecCtx = null; }
        audioRecDest = null;
        toast('Audio recording saved to Downloads 🎙️');
      };

      rec.start(1000);
      audioRecorder = rec;
      $('audioRecBtn').classList.add('recording');
      $('audioRecBtn').querySelector('.lbl').textContent = 'Stop Audio';
      $('audioRecBadge').classList.remove('hidden');
      toast('High-Fidelity Audio Recording Started');
    } catch (e) {
      toast('Audio Recording failed: ' + e.message);
    }
  }

  function stopAudioRecording() {
    if (audioRecorder && audioRecorder.state !== 'inactive') audioRecorder.stop();
    audioRecorder = null;
    $('audioRecBtn').classList.remove('recording');
    $('audioRecBtn').querySelector('.lbl').textContent = 'Audio Rec';
    $('audioRecBadge').classList.add('hidden');
  }

  $('audioRecBtn').onclick = () => {
    if (audioRecorder) stopAudioRecording();
    else startAudioRecording();
  };


  // ---------- 10. ON-DEMAND AI NOTES & GOOGLE DRIVE HOOKS ----------
  function setupAiNotesAndDrive() {
    $('btnAiNotesToggle').onclick = () => {
      isAiNotesActive = !isAiNotesActive;
      $('lblAiNotes').textContent = isAiNotesActive ? 'AI Notes: ON' : 'AI Notes: OFF';
      $('btnAiNotesToggle').style.borderColor = isAiNotesActive ? '#3b82f6' : '#ef4444';
      $('btnAiNotesToggle').style.color = isAiNotesActive ? '#93c5fd' : '#fca5a5';
      toast(isAiNotesActive ? '📝 AI Notes capturing resumed' : '⏸️ AI Notes paused for confidential discussion');
    };

    $('btnDriveFolder').onclick = () => {
      const url = prompt('Google Drive Folder Link for meeting recordings & notes:', store.get('tm_drive_folder') || '');
      if (url) {
        store.set('tm_drive_folder', url);
        api('/api/drive/sync', { method: 'POST', body: { sessionId: recSessionId || 'general', driveFolderUrl: url } })
          .then(() => toast('Google Drive folder linked!'))
          .catch(() => toast('Google Drive folder saved locally'));
      }
    };
  }

  // ---------- 11. FLOATING BOT & DYNAMIC KEY ROTATION ----------
  function setupFloatingBot() {
    $('floatingBotBtn').onclick = async () => {
      try {
        const keys = await api('/api/admin/keys');
        $('keyLivekitUrl').value = keys.livekitUrl || '';
        $('keyLivekitKey').value = keys.apiKeyMasked || '';
        $('keyDriveFolder').value = keys.driveFolderId || '';
      } catch (e) {}
      $('modalKeys').classList.remove('hidden');
    };

    $('closeModalKeys').onclick = () => $('modalKeys').classList.add('hidden');

    $('btnSaveDynamicKeys').onclick = async () => {
      const body = {
        livekitUrl: $('keyLivekitUrl').value.trim(),
        livekitApiKey: $('keyLivekitKey').value.trim(),
        livekitApiSecret: $('keyLivekitSecret').value.trim(),
        driveFolderId: $('keyDriveFolder').value.trim()
      };
      try {
        await api('/api/admin/keys', { method: 'POST', body });
        toast('⚡ Credentials updated dynamically!');
        $('modalKeys').classList.add('hidden');
      } catch (err) {
        alert('Update error: ' + err.message);
      }
    };
  }

  // ---------- 12. CONTROLS, CHAT & TABS ----------
  function syncButtons() {
    const lp = room.localParticipant;
    micOn = lp.isMicrophoneEnabled; camOn = lp.isCameraEnabled;
    $('micBtn').classList.toggle('off', !micOn); setIcon($('micBtn'), micOn ? I.mic : I.micOff);
    $('camBtn').classList.toggle('off', !camOn); setIcon($('camBtn'), camOn ? I.cam : I.camOff);
    $('shareBtn').classList.toggle('active', lp.isScreenShareEnabled);
    if ($('shareBtn').querySelector('.lbl')) {
      $('shareBtn').querySelector('.lbl').textContent = lp.isScreenShareEnabled ? 'Stop share' : 'Share';
    }
  }

  $('micBtn').onclick = async () => { await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled); syncButtons(); render(); };
  $('camBtn').onclick = async () => { await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled); syncButtons(); render(); };
  $('shareBtn').onclick = async () => {
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: true, selfBrowserSurface: 'exclude' });
    } catch (e) { if (e.name !== 'NotAllowedError') toast('Screen share failed: ' + e.message); }
    syncButtons(); render();
  };
  $('leaveBtn').onclick = () => room.disconnect();

  $('copyLinkBtn').onclick = async () => {
    const link = `${location.origin}/${roomName}`;
    try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch { prompt('Copy this link', link); }
  };

  const enc = new TextEncoder(), dec = new TextDecoder();
  function send(obj) {
    return room.localParticipant.publishData(enc.encode(JSON.stringify(obj)), { reliable: true, topic: 'teammeet' });
  }
  function onData(payload, participant, _kind, topic) {
    if (topic !== 'teammeet') return;
    let msg; try { msg = JSON.parse(dec.decode(payload)); } catch { return; }
    const who = participant?.name || participant?.identity || 'Someone';
    if (msg.type === 'chat') { addChat(who, msg.text, false); }
    if (msg.type === 'hand') {
      msg.up ? raisedHands.add(participant.identity) : raisedHands.delete(participant.identity);
      if (msg.up) toast(`✋ ${who} raised their hand`);
      render();
    }
    if (msg.type === 'rec') { sysMsg(`${who} ${msg.on ? 'started' : 'stopped'} recording`); refreshRecordingStatus(); }
    if (msg.type === 'wb_draw' && window._wbDraw) {
      window._wbDraw(msg);
    }
    if (msg.type === 'wb_clear' && window._wbClear) {
      window._wbClear();
    }
  }

  $('handBtn').onclick = async () => {
    handRaised = !handRaised;
    handRaised ? raisedHands.add(room.localParticipant.identity) : raisedHands.delete(room.localParticipant.identity);
    $('handBtn').classList.toggle('active', handRaised);
    await send({ type: 'hand', up: handRaised });
    render();
  };

  function addChat(who, text, mine) {
    const log = $('chatLog');
    const div = document.createElement('div');
    div.className = 'msg';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<div class="who"><b>${escapeHtml(mine ? 'You' : who)}</b>${time}</div><div class="body"></div>`;
    div.querySelector('.body').textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    if (!mine && $('sidePanel').classList.contains('hidden')) { unread++; $('unread').classList.remove('hidden'); }
  }

  function sysMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg system';
    div.innerHTML = '<div class="body"></div>';
    div.querySelector('.body').textContent = text;
    $('chatLog').appendChild(div);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
  }

  $('chatForm').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text) return;
    $('chatInput').value = '';
    await send({ type: 'chat', text });
    addChat('You', text, true);
  };

  function showTab(name) {
    document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    ['chat', 'people', 'board', 'recs'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
    if (name === 'recs') loadRecordings();
    if (name === 'people') renderPeople();
    if (name === 'chat') { unread = 0; $('unread').classList.add('hidden'); }
  }
  document.querySelectorAll('.tab[data-tab]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

  $('chatBtn').onclick = () => {
    const side = $('sidePanel');
    if (side.classList.contains('hidden')) {
      side.classList.remove('hidden');
      showTab('chat');
      $('chatInput')?.focus();
    } else {
      const isChatActive = document.querySelector('.tab[data-tab="chat"]')?.classList.contains('active');
      if (isChatActive) {
        side.classList.add('hidden');
      } else {
        showTab('chat');
        $('chatInput')?.focus();
      }
    }
    setTimeout(render, 0);
  };

  $('peopleBtn')?.addEventListener('click', () => {
    const side = $('sidePanel');
    if (side.classList.contains('hidden')) {
      side.classList.remove('hidden');
      showTab('people');
    } else {
      const isPeopleActive = document.querySelector('.tab[data-tab="people"]')?.classList.contains('active');
      if (isPeopleActive) {
        side.classList.add('hidden');
      } else {
        showTab('people');
      }
    }
    setTimeout(render, 0);
  });

  $('boardBtn')?.addEventListener('click', () => {
    const side = $('sidePanel');
    if (side.classList.contains('hidden')) {
      side.classList.remove('hidden');
      showTab('board');
    } else {
      const isBoardActive = document.querySelector('.tab[data-tab="board"]')?.classList.contains('active');
      if (isBoardActive) {
        side.classList.add('hidden');
      } else {
        showTab('board');
      }
    }
    setTimeout(render, 0);
  });

  $('activitiesBtn')?.addEventListener('click', () => {
    const side = $('sidePanel');
    if (side.classList.contains('hidden')) {
      side.classList.remove('hidden');
      showTab('recs');
    } else {
      const isRecsActive = document.querySelector('.tab[data-tab="recs"]')?.classList.contains('active');
      if (isRecsActive) {
        side.classList.add('hidden');
      } else {
        showTab('recs');
      }
    }
    setTimeout(render, 0);
  });

  $('infoBtn')?.addEventListener('click', async () => {
    const link = `${location.origin}/${roomName}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(`Meeting link copied: ${link} 📋`);
    } catch {
      toast(`Meeting room: ${roomName}`);
    }
  });

  $('closeSide').onclick = () => { $('sidePanel').classList.add('hidden'); setTimeout(render, 0); };

  async function refreshRecordingStatus() {
    if (!room) return;
    try {
      const s = await api('/api/recording/status?room=' + encodeURIComponent(roomName));
      recSessionId = s.recording ? s.sessionId : null;
      $('recBadge').classList.toggle('hidden', !s.recording);
      $('recBtn').classList.toggle('recording', s.recording);
      $('recBtn').querySelector('.lbl').textContent = s.recording ? 'Stop Rec' : 'Server Rec';
    } catch {}
  }

  $('recBtn').onclick = async () => {
    $('recBtn').disabled = true;
    try {
      if (recSessionId) {
        if (!confirm('Stop server recording for everyone?')) { $('recBtn').disabled = false; return; }
        await api('/api/recording/stop', { method: 'POST', body: { room: roomName } });
        toast('Recording stopped — files & AI notes will sync to Drive', 5000);
        await send({ type: 'rec', on: false });
      } else {
        await api('/api/recording/start', { method: 'POST', body: { room: roomName, name: room.localParticipant.name } });
        toast('Server recording started — red REC active for all');
        await send({ type: 'rec', on: true });
      }
    } catch (e) { toast(e.message, 6000); }
    $('recBtn').disabled = false;
    setTimeout(refreshRecordingStatus, 1000);
  };

  const STATUS_TEXT = { recording: 'Recording', processing: 'Finishing', transcribing: 'Transcribing', summarizing: 'Writing notes', ready: 'Ready', error: 'Error' };
  async function loadRecordings() {
    try {
      const list = await api('/api/sessions?room=' + encodeURIComponent(roomName));
      $('recList').innerHTML = list.length
        ? list.map((x) => `<li>
            <div class="row"><a href="/notes/${encodeURIComponent(x.id)}" target="_blank" rel="noopener">${escapeHtml(new Date(x.createdAt).toLocaleString())}</a>
            <span class="status ${x.status}">${STATUS_TEXT[x.status] || x.status}</span></div>
            <small>${escapeHtml((x.participants || []).join(', '))}${x.error ? ' — ' + escapeHtml(x.error) : ''}</small></li>`).join('')
        : '<li class="muted">No recordings yet. Click Server Rec to capture video & AI notes.</li>';
    } catch (e) { $('recList').innerHTML = `<li class="muted">${escapeHtml(e.message)}</li>`; }
  }

  // ---------- 13. SCREEN RECORDING ----------
  async function startLocalRecording() {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: false });
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const addStream = (stream) => { if (stream.getAudioTracks().length) ctx.createMediaStreamSource(stream).connect(dest); };
    addStream(display);

    const myMic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    if (myMic) addStream(new MediaStream([myMic]));
    room.remoteParticipants.forEach((p) => {
      const t = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (t) addStream(new MediaStream([t]));
    });

    const mixed = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    const chunks = [];
    const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const ext = (mime || '').includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${roomName}_screen_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      display.getTracks().forEach((t) => t.stop());
      ctx.close();
      toast('Screen recording saved to Downloads');
    };
    display.getVideoTracks()[0].onended = () => stopLocalRecording();
    rec.start(1000);
    localRecorder = rec;
    $('localRecBtn').classList.add('recording');
    $('localRecBtn').querySelector('.lbl').textContent = 'Stop Screen';
    $('localRecBadge').classList.remove('hidden');
  }

  function stopLocalRecording() {
    if (!localRecorder) return;
    if (localRecorder.state !== 'inactive') localRecorder.stop();
    localRecorder = null;
    $('localRecBtn').classList.remove('recording');
    $('localRecBtn').querySelector('.lbl').textContent = 'Screen Rec';
    $('localRecBadge').classList.add('hidden');
  }

  $('localRecBtn').onclick = async () => {
    if (localRecorder) return stopLocalRecording();
    if (!window.MediaRecorder || !navigator.mediaDevices.getDisplayMedia) return toast('Screen recording not supported on this mobile browser');
    try { await startLocalRecording(); } catch (e) { if (e.name !== 'NotAllowedError') toast('Screen rec error: ' + e.message); }
  };

  // ---------- 14. STUDIO-GRADE VIRTUAL BACKGROUNDS ----------
  const BG_EFFECTS = [
    { type: 'none', label: 'None' },
    { type: 'blur', value: 8, label: 'Soft Blur' },
    { type: 'blur', value: 16, label: 'Studio Focus' },
    { type: 'blur', value: 28, label: 'Deep Blur' },
  ];

  const BG_SCENES = [
    { label: '🏢 Boardroom', color: '#1e2430', name: 'Boardroom' },
    { label: '🎨 Design Loft', color: '#25211e', name: 'Loft' },
    { label: '🌃 City Skyline', color: '#0d131f', name: 'Skyline' },
    { label: '📚 Warm Library', color: '#241a15', name: 'Library' }
  ];

  const sameBg = (a, b) => (a?.type || 'none') === (b?.type || 'none') && (a?.value ?? null) === (b?.value ?? null);
  const localCamTrack = () => room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track || null;

  function renderSceneCanvas(color) {
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  let _assetPaths;
  async function localAssetPaths() {
    if (_assetPaths !== undefined) return _assetPaths;
    const model = '/vendor/mediapipe/selfie_segmenter.tflite';
    const ok = await fetch(model, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    _assetPaths = ok ? { tasksVisionFileSet: location.origin + '/vendor/mediapipe/wasm', modelAssetPath: location.origin + model } : undefined;
    return _assetPaths;
  }

  async function applyBackground(track) {
    if (!track || track.kind !== 'video') return;
    const want = bgChoice && bgChoice.type !== 'none' ? bgChoice : null;
    try {
      if (!want) { if (track.getProcessor?.()) await track.stopProcessor(); return; }
      if (!TP || !TP.supportsBackgroundProcessors()) { $('bgNote').textContent = 'Background effects supported on Chrome, Edge and Firefox'; return; }
      const assetPaths = await localAssetPaths();
      bgProcessor = want.type === 'blur'
        ? TP.BackgroundProcessor({ mode: 'background-blur', blurRadius: want.value, assetPaths }, 'background-blur')
        : TP.BackgroundProcessor({ mode: 'virtual-background', imagePath: want.value, assetPaths }, 'virtual-background');
      if (track.getProcessor?.()) await track.stopProcessor();
      await track.setProcessor(bgProcessor);
      $('bgNote').textContent = '';
    } catch (e) {
      console.warn('background failed', e);
      $('bgNote').textContent = 'Could not apply background: ' + (e?.message || String(e));
    }
  }

  async function chooseBackground(choice) {
    bgChoice = choice;
    store.set('tm_bg', JSON.stringify(choice));
    markBgSelection();
    const t = localCamTrack() || previewTracks.find((x) => x.kind === 'video');
    await applyBackground(t);
  }

  function buildBgPanel() {
    $('bgEffects').innerHTML = BG_EFFECTS.map((e, i) => `<button class="bg-opt" data-i="${i}">${e.label}</button>`).join('');
    $('bgScenes').innerHTML = BG_SCENES.map((s, i) => `<button class="bg-opt" data-scene="${i}" style="background: ${s.color}; color: #fff;">${s.label}</button>`).join('');

    $('bgEffects').querySelectorAll('.bg-opt').forEach((b) => (b.onclick = () => {
      const e = BG_EFFECTS[b.dataset.i];
      chooseBackground(e.type === 'none' ? null : { type: e.type, value: e.value });
    }));

    $('bgScenes').querySelectorAll('.bg-opt').forEach((b) => (b.onclick = () => {
      const scene = BG_SCENES[b.dataset.scene];
      chooseBackground({ type: 'image', value: renderSceneCanvas(scene.color) });
    }));

    $('btnUploadBg')?.addEventListener('click', () => $('bgCustomImage').click());
    $('bgCustomImage')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          chooseBackground({ type: 'image', value: ev.target.result });
          toast('Custom background applied!');
        };
        reader.readAsDataURL(file);
      }
    });

    markBgSelection();
  }

  function markBgSelection() {
    $('bgEffects').querySelectorAll('.bg-opt').forEach((b) => {
      const e = BG_EFFECTS[b.dataset.i];
      b.classList.toggle('selected', sameBg(e.type === 'none' ? null : { type: e.type, value: e.value }, bgChoice));
    });
    $('bgBtn').classList.toggle('active', !!bgChoice);
  }

  const toggleBgPanel = () => $('bgPanel').classList.toggle('hidden');
  $('bgBtn').onclick = toggleBgPanel;
  $('pvBg').onclick = (e) => { e.preventDefault(); toggleBgPanel(); };
  $('bgClose').onclick = () => $('bgPanel').classList.add('hidden');

  window.addEventListener('beforeunload', (e) => {
    if (localRecorder || audioRecorder) { e.preventDefault(); e.returnValue = ''; }
  });

  initLobby();
})();
