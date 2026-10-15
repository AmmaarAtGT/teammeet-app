# 🌟 TeamMeet Production — Features, Architecture & Operational Guide

Welcome to **TeamMeet Production Edition**. This document provides an exhaustive breakdown of all enterprise and collaboration capabilities engineered into TeamMeet, architecture diagrams, and hardware/cloud sizing recommendations.

---

## 📋 Table of Contents
1. [Core Features Overview](#1-core-features-overview)
2. [Detailed Feature Breakdown](#2-detailed-feature-breakdown)
   - [📱 1. Mobile Auto-Lock & Audio Keepalive Engine](#1-mobile-auto-lock--audio-keepalive-engine)
   - [🎙️ 2. Pure Conference Audio Recording](#2-pure-conference-audio-recording)
   - [🧠 3. On-Demand AI Meeting Notes & Summarizer](#3-on-demand-ai-meeting-notes--summarizer)
   - [🎨 4. Collaborative Interactive Whiteboard](#4-collaborative-interactive-whiteboard)
   - [☁️ 5. Google Drive Integration & Auto-Sync](#5-google-drive-integration--auto-sync)
   - [🧹 6. 10–15 Day Automated Data Retention Purge](#6-1015-day-automated-data-retention-purge)
   - [🤖 7. Floating Bot Dynamic Credential Switcher](#7-floating-bot-dynamic-credential-switcher)
   - [🖼️ 8. Dynamic Professional Virtual Backgrounds](#8-dynamic-professional-virtual-backgrounds)
   - [👤 9. Custom Profile Avatars & Identity Manager](#9-custom-profile-avatars--identity-manager)
   - [👥 10. Zoom-Grade Participant Roster & Live Badge](#10-zoom-grade-participant-roster--live-badge)
   - [♾️ 11. Zero Room Limits & 24-Hour Token Durations](#11-zero-room-limits--24-hour-token-durations)
   - [🔌 12. Hot-Plug Hardware & External Webcam Detection](#12-hot-plug-hardware--external-webcam-detection)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [AWS Instance Sizing & Scaling Recommendations](#4-aws-instance-sizing--scaling-recommendations)
5. [Environment Variables Reference (`.env`)](#5-environment-variables-reference-env)

---

## 1. Core Features Overview

| Feature | Description | Status |
| :--- | :--- | :--- |
| **50–100 User Scale Engine** | Dynacast + AdaptiveStream priority grid (12 active tiles + full conference audio) | ✅ Production |
| **Multi-Room Concurrency** | Unlimited parallel rooms (`/dev-room`, `/marketing`, etc.) with live lobby occupancy tracking | ✅ Production |
| **Collaborative Whiteboard** | Real-time synchronized canvas over LiveKit DataChannel + 1-click PNG export | ✅ Production |
| **Mobile Audio Keepalive** | Fixes screen-off mute on iOS & Android using WakeLock & Web Audio | ✅ Production |
| **Audio-Only Recording** | Direct client-side Web Audio master stream recording with WAV/WebM download | ✅ Production |
| **On-Demand AI Notes** | Transcription & AI summary triggered only when needed, avoiding token waste | ✅ Production |
| **Google Drive Sync** | Connect team folder ID to auto-archive recordings, transcripts, and whiteboard snapshots | ✅ Production |
| **15-Day Auto Purge** | Automated cron daemon running on the server to prevent disk saturation | ✅ Production |
| **Dynamic Key Bot** | Floating bot modal to rotate LiveKit API credentials on the fly without rebooting | ✅ Production |
| **Executive Backgrounds** | Realistic boardroom, modern loft, city skyline, library, and custom upload | ✅ Production |
| **Avatar Profile Image** | Upload custom photo or auto-generate initial badge with live preview | ✅ Production |
| **Hot-Plug Webcams** | Dynamically detects USB/virtual cameras during live calls via `devicechange` | ✅ Production |
| **Unlimited Rooms** | No limit on meeting rooms; 24-hour token duration prevents unexpected drops | ✅ Production |


---

## 2. Detailed Feature Breakdown

### 📱 1. Mobile Auto-Lock & Audio Keepalive Engine
- **Problem Solved:** When users joined from iOS Safari or Android Chrome, the phone's auto-lock dimmed and turned off the screen, causing the OS to suspend JavaScript execution, muting incoming speaker audio and outgoing mic.
- **Solution:**
  1. Utilizes `navigator.wakeLock.request('screen')` to prevent the phone display from sleeping while connected to a meeting.
  2. Synthesizes an imperceptible high-frequency keepalive oscillator via Web Audio `AudioContext` to keep the mobile audio pipeline active in the background.
  3. Binds `visibilitychange` listeners to auto-resume suspended `AudioContext` and restart remote `<audio>` playback if the user switches apps and returns.

### 🎙️ 2. Pure Conference Audio Recording
- **Implementation:** Integrated into the top control bar (`#audioRecBtn`).
- **How it Works:** Combines local mic input and all incoming remote peer audio into a single `MediaStreamAudioDestinationNode` using the Web Audio API.
- **Benefits:**
  - Lightweight compared to server-side video egress (0% server CPU usage).
  - Can record long 3–4 hour planning discussions without dropping frames.
  - Generates instant local download upon clicking "Stop".

### 🧠 3. On-Demand AI Meeting Notes & Summarizer
- **Smart Activation:** Rather than burning LLM tokens across casual chatter, users toggle `#btnAiNotesToggle` ("AI Notes: On/Off") specifically for important discussions.
- **Output:** Structured markdown summary formatted with Key Decisions, Action Items, and Discussion Highlights, exportable directly to Drive or local file.

### 🎨 4. Collaborative Interactive Whiteboard
- **Access:** Side panel tab or top bar shortcut.
- **Capabilities:**
  - Pen sizes (2px, 5px, 12px), Highlighter mode (semi-transparent), Eraser.
  - Curated color palette (Obsidian, Crimson, Cobalt, Emerald, Amber).
  - Single-click **"Export PNG"** to save whiteboard drawings for documentation or Google Drive sync.

### ☁️ 5. Google Drive Integration & Auto-Sync
- **Workflow:** Users can input their team's Google Drive Folder ID directly from the interface (`#btnDriveConnect`).
- **Persistence:** Automatically packages audio recordings, whiteboard PNGs, and meeting summary notes, posting to the `/api/drive/sync` endpoint for archiving.

### 🧹 6. 10–15 Day Automated Data Retention Purge
- **Problem Solved:** Long meeting audio recordings and temporary egress files can quickly exhaust server disk space.
- **Engine:** `server.js` executes an automated purge worker every 12 hours:
  - Scans `/recordings` and `/tmp/media` directories.
  - Automatically deletes any files older than 15 days (`PURGE_RETENTION_DAYS = 15`).
  - Logs freed disk space to standard output.

### 🤖 7. Floating Bot Dynamic Credential Switcher
- **Location:** Discrete floating bot badge in the bottom right (`#floatingBotBtn`).
- **Use Case:** If LiveKit Cloud free tier reaches its monthly bandwidth cap or API keys change, the room owner can update `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` directly in the modal.
- **Zero Downtime:** Calls `POST /api/admin/keys`, immediately updating memory and `.env` on the backend without restarting the server or dropping other rooms.

### 🖼️ 8. Dynamic Professional Virtual Backgrounds
- Replaced flat solid colors with high-resolution realistic environments:
  - 🏢 **Executive Boardroom**
  - 🏙️ **Modern Skyline Loft**
  - 🌆 **Evening Tech Hub**
  - 📚 **Warm Academic Library**
  - 🌫️ **Cinematic Gaussian Blur**
  - 📁 **Custom User Upload**

### 👤 9. Custom Profile Avatars & Identity Manager
- Participants can upload their profile picture or photo before entering.
- Automatically cropped and encoded into LiveKit participant metadata.
- If no picture is provided, renders a vibrant corporate gradient avatar with participant initials.

### 👥 10. Zoom-Grade Participant Roster & Live Badge
- Live participant counter badge (`#countBadge`) tracks real-time occupancy.
- Slide-out roster shows active speaker states, mic/cam mute icons, and custom avatar photos for every connected peer.

### ♾️ 11. Zero Room Limits & 24-Hour Token Durations
- Replaced 90-minute meeting dropouts with 24-hour maximum token lifetimes (`ttl: 86400`).
- No hard limit on created rooms or concurrency beyond LiveKit's network capacity.

### 🔌 12. Hot-Plug Hardware & External Webcam Detection
- Listens to `navigator.mediaDevices.addEventListener('devicechange')`.
- Plugging in a USB webcam or Bluetooth headset instantly populates dropdown menus during a live call without requiring a page refresh.

---

## 3. System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSERS                                   |
|   (Desktop Chrome / Edge / Firefox / iOS Safari / Android Chrome with WakeLock)    |
+-----------------------------------------------------------------------------------+
             |                                                       ^
  1. Token & Metadata Exchange                        2. WebRTC Media Tracks
             v                                                       v
+------------------------------------+              +-------------------------------+
|      Node.js Express Server        |              |     LiveKit Cloud SFU         |
|         (Railway PaaS)             |              |   (wss://*.livekit.cloud)     |
+------------------------------------+              +-------------------------------+
  - Dynamic API Credential Reload                     - Selective Forwarding Unit
  - 15-Day Auto-Purge Worker Engine                   - Low-latency Audio/Video Mesh
  - Google Drive Sync Dispatcher                      - Zero Inbound Firewall Config
  - Room Slug Normalization
  - Static Production Assets
```

---

## 4. AWS Instance Sizing & Scaling Recommendations

If the team chooses to transition from Railway to a private AWS EC2 deployment in the future, follow this sizing guide:

> **Important:** Do NOT deploy on existing `t3.micro` production instances (`vasu`, `Autorefer-env`, `Autorefer-01`). A 1GB RAM instance will crash under WebRTC audio/video workloads.

### Recommended AWS EC2 Configurations:

| Stage | Target Capacity | Recommended EC2 Type | vCPU / RAM | Storage | Est. Monthly Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Smooth Starter (Recommended)** | 20 Team Members (10 Dev + 10 Mktg) | **`t3.medium`** | 2 vCPU / 4 GB | 30 GB gp3 | ~$30 / month |
| **Self-Hosted LiveKit & Egress** | 50+ Concurrent Users | **`c6i.large`** | 2 vCPU / 4 GB | 50 GB gp3 | ~$62 / month |
| **Enterprise with Local AI Whisper** | 100+ Concurrent + AI Egress | **`c6i.xlarge`** | 4 vCPU / 8 GB | 100 GB gp3 | ~$124 / month |

### Why `t3.medium` is the Ideal Smooth Start:
- 4GB of RAM provides ample headroom for Node.js, Web Audio socket handling, and OS buffers.
- Burstable CPU credits (`t3` series) gracefully handle sudden spikes when multiple participants join simultaneously.
- Cost-effective for internal company tooling before scaling up.

---

## 5. Environment Variables Reference (`.env`)

```ini
# Server Configuration
PORT=3000
NODE_ENV=production

# LiveKit Cloud Credentials (from cloud.livekit.io)
LIVEKIT_URL=wss://your-subdomain.livekit.cloud
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here

# Retention & Purge Policy
PURGE_RETENTION_DAYS=15

# Optional Team Passcode (Leave empty for open internal access)
TEAM_PASSCODE=

# Google Drive Sync (Optional service account or webhook)
GOOGLE_DRIVE_FOLDER_ID=
```
