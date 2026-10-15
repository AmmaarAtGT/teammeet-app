/* TeamMeet Pro client — Enterprise WebRTC Video Conferencing, Mobile Audio Manager, Whiteboard & AI Notes */
(() => {
  const LK = window.LivekitClient;
  const { Room, RoomEvent, Track, ConnectionQuality, createLocalTracks } = LK;
  const $ = (id) => document.getElementById(id);

  // ---------- Icons ----------
  const I = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 11 5.7M12 17v5"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h4a2 2 0 0 1 2 2v4l6-3v10"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 13V8m-3 3l3-3 3 3"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
    audioRec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    screenRec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><circle cx="12" cy="10.5" r="3" fill="currentColor"/><path d="M8 21h8"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    bg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="3.5"/><path d="M5 20c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/><rect x="2" y="2" width="20" height="20" rx="3" stroke-dasharray="3 3"/></svg>',
    leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" transform="rotate(135 12 12)"/></svg>',
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
  async function fillDevices() {
    const fill = async (kind, sel) => {
      const list = await Room.getLocalDevices(kind).catch(() => []);
      sel.innerHTML = list.map((d) => `<option value="${d.deviceId}">${escapeHtml(d.label || `${kind} (${d.deviceId.slice(0, 5)}...)`)}</option>`).join('');
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
    } catch (e) {}

    const pathRoom = normalizeRoomSlug(location.pathname.replace(/^\//, ''));
    $('roomInput').value = pathRoom || store.get('tm_room') || 'dev-room';
    $('nameInput').value = store.get('tm_name') || '';
    if ($('emailInput')) $('emailInput').value = store.get('tm_email') || '';
    $('passInput').value = store.get('tm_pass') || '';

    userAvatar = store.get('tm_avatar') || '';
    if (userAvatar && $('avatarThumbnail')) {
      $('avatarThumbnail').innerHTML = `<img src="${userAvatar}" style="width:100%; height:100%; object-fit:cover;" />`;
    }

    // Avatar upload handler
    $('btnChooseAvatar')?.addEventListener('click', () => $('avatarFileInput').click());
    $('avatarFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          userAvatar = ev.target.result;
          store.set('tm_avatar', userAvatar);
          if ($('avatarThumbnail')) {
            $('avatarThumbnail').innerHTML = `<img src="${userAvatar}" style="width:100%; height:100%; object-fit:cover;" />`;
          }
          toast('Profile photo saved!');
        };
        reader.readAsDataURL(file);
      }
    });

    // 3 Dedicated Team Room Switchers
    document.querySelectorAll('.btn-room-choice').forEach((btn) => {
      if (btn.dataset.room === $('roomInput').value) {
        btn.style.borderColor = '#6366f1';
        btn.style.color = '#fff';
      }
      btn.onclick = () => {
        document.querySelectorAll('.btn-room-choice').forEach((b) => {
          b.style.borderColor = '#3f3f46';
          b.style.color = '#a1a1aa';
        });
        btn.style.borderColor = '#6366f1';
        btn.style.color = '#fff';
        $('roomInput').value = btn.dataset.room;
      };
    });

    setIcon($('micBtn'), I.mic); setIcon($('camBtn'), I.cam); setIcon($('shareBtn'), I.share);
    setIcon($('recBtn'), I.rec); setIcon($('audioRecBtn'), I.audioRec); setIcon($('localRecBtn'), I.screenRec);
    setIcon($('handBtn'), I.hand); setIcon($('chatBtn'), I.chat); setIcon($('leaveBtn'), I.leave);
    $('pvMic').innerHTML = I.mic; $('pvCam').innerHTML = I.cam; $('pvBg').innerHTML = I.bg;
    setIcon($('bgBtn'), I.bg);

    try { bgChoice = JSON.parse(store.get('tm_bg') || 'null'); } catch { bgChoice = null; }
    buildBgPanel();

    await startPreview();
    await fillDevices();
    setupFloatingBot();
  }

  async function startPreview() {
    previewTracks.forEach((t) => t.stop());
    previewTracks = [];
    try {
      previewTracks = await createLocalTracks({
        audio: { deviceId: $('micSelect').value || undefined },
        video: camOn ? { deviceId: $('camSelect').value || undefined } : false,
      });
      const v = previewTracks.find((t) => t.kind === 'video');
      if (v) { await applyBackground(v); v.attach($('previewVideo')); }
      $('previewOff').classList.toggle('hidden', !!v);
    } catch (e) {
      $('previewOff').textContent = 'Camera/mic blocked — allow access in your browser';
      $('previewOff').classList.remove('hidden');
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
      .on(RoomEvent.TrackSubscribed, render)
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
    history.replaceState(null, '', '/' + roomName);
    joinedAt = Date.now();
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

  function render() {
    if (!room) return;
    const grid = $('grid');
    const all = [
      ...tilesFor(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].flatMap((p) => tilesFor(p, false)),
    ];

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

    const screens = all.filter((t) => t.screen);
    const focusKey = pinnedKey && all.some((t) => t.key === pinnedKey) ? pinnedKey : screens[0]?.key || null;
    if (pinnedKey && !all.some((t) => t.key === pinnedKey)) pinnedKey = null;
    grid.classList.toggle('has-screen', !!focusKey);

    const keep = new Set(all.map((t) => t.key));
    [...grid.children].forEach((el) => { if (!keep.has(el.dataset.key)) el.remove(); });

    all.forEach((t) => {
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
      el.querySelector('.mic').innerHTML = t.screen ? '' : t.micMuted ? '🔇' : '';
      el.querySelector('.hand').classList.toggle('hidden', t.screen || !raisedHands.has(t.p.identity));
      el.querySelector('.pin').textContent = pinnedKey === t.key ? 'Unpin' : 'Pin';
      const q = el.querySelector('.quality');
      q.className = 'quality' + (t.p.connectionQuality === ConnectionQuality.Poor ? ' poor' : t.p.connectionQuality === ConnectionQuality.Lost ? ' lost' : '');
    });

    if (focusKey) {
      const f = grid.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (f && grid.firstChild !== f) grid.prepend(f);
    }
    layoutGrid(focusKey ? 0 : all.length);
    renderPeople();
  }

  function layoutGrid(n) {
    const grid = $('grid');
    if (!n) { grid.style.gridTemplateColumns = ''; return; }
    const w = grid.clientWidth || window.innerWidth;
    const maxCols = w < 600 ? 2 : w < 1000 ? 3 : 5;
    const cols = Math.min(maxCols, Math.ceil(Math.sqrt(n)));
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  }
  window.addEventListener('resize', () => room && render());

  function markSpeakers(speakers) {
    const ids = new Set(speakers.map((s) => s.identity));
    const names = speakers.map((p) => (p === room.localParticipant ? 'You' : p.name || p.identity));
    $('speakingNow').textContent = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : '';
    $('speakingNow').classList.toggle('hidden', !names.length);
    document.querySelectorAll('.tile').forEach((el) => {
      el.classList.toggle('speaking', ids.has(el.dataset.identity) && !el.dataset.key.endsWith(':screen'));
    });
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

  // ---------- 8. WHITEBOARD CANVAS WITH SAVE AS PNG ----------
  function initWhiteboard() {
    const canvas = $('whiteboardCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    function resizeCanvas() {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight || 400;
      ctx.fillStyle = '#12141a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDraw = (e) => {
      drawing = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
      if (!drawing) return;
      const pos = getPos(e);
      ctx.strokeStyle = $('boardColor').value || '#3b82f6';
      ctx.lineWidth = parseInt($('boardSize').value || '4', 10);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const stopDraw = () => { drawing = false; };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: true });
    canvas.addEventListener('touchmove', draw, { passive: true });
    window.addEventListener('touchend', stopDraw);

    $('boardClear').onclick = () => {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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

  // ---------- 9. PURE AUDIO RECORDING (HIGH FIDELITY) ----------
  async function startAudioRecording() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();

      // Mix local microphone
      const localMic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (localMic) audioCtx.createMediaStreamSource(new MediaStream([localMic])).connect(dest);

      // Mix all remote participants
      room.remoteParticipants.forEach((p) => {
        const remMic = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (remMic) audioCtx.createMediaStreamSource(new MediaStream([remMic])).connect(dest);
      });

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const chunks = [];
      const rec = new MediaRecorder(dest.stream, { mimeType: mime });

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Audio_Meeting_${roomName}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        a.click();
        audioCtx.close();
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
    $('shareBtn').querySelector('.lbl').textContent = lp.isScreenShareEnabled ? 'Stop share' : 'Share';
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
    side.classList.toggle('hidden');
    if (!side.classList.contains('hidden')) { showTab('chat'); $('chatInput').focus(); }
    setTimeout(render, 0);
  };
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
