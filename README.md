# 🎥 TeamMeet — Production Enterprise Video Conferencing Platform

> **Modern, Ultra-Low Latency, Unlimited-Duration Video Meetings for High-Performance Teams.**  
> Built with LiveKit WebRTC, Node.js Express, HTML5 Canvas Whiteboard, and Client-Side Audio Recording.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Deploy-Railway%20%7C%20LiveKit%20Cloud-success)](DEPLOY_INSTRUCTIONS.md)
[![Status](https://img.shields.io/badge/Production-Ready-brightgreen)](FEATURES.md)

---

## 🚀 Key Highlights & Architecture

- **♾️ Zero Meeting Timeouts:** 24-hour token duration. Never get cut off at 90 minutes.
- **📱 Mobile Sleep Protection:** Solves mobile browser auto-lock audio mutes using the Screen WakeLock API & Web Audio oscillator keepalive.
- **🎙️ Direct Audio Recording:** Pure conference multi-track audio recording with instant local download (zero server egress overhead).
- **🧠 On-Demand AI Meeting Notes:** Toggle transcription on/off at will to capture key decisions without wasting tokens.
- **🎨 Integrated Collaborative Whiteboard:** Real-time whiteboard canvas with full color palette, highlighter, pen sizing, and 1-click PNG export.
- **☁️ Google Drive Auto-Sync:** Direct cloud archiving of meeting notes, whiteboard exports, and audio recordings.
- **🧹 15-Day Automated Media Purge:** Server-side retention daemon automatically clears temporary recordings to prevent disk exhaustion.
- **🤖 Dynamic Credential Rotator:** Built-in floating bot to hot-swap LiveKit API keys without server restarts or downtime.
- **🖼️ Studio Virtual Backgrounds:** Boardroom, Design Loft, Skyline, Warm Library, and Custom Image Upload.
- **🔌 Hot-Plug Device Detection:** Auto-detects external USB webcams and Bluetooth headsets dynamically.

---

## 👥 Permanent Team Meeting Rooms

Bookmarked permanent rooms for the team (zero room creation limit):

| Team | Permanent URL Path | Purpose |
| :--- | :--- | :--- |
| **💻 Dev Team (10 Devs)** | `/dev-room` | Daily standups, code reviews, pairing |
| **📢 Marketing Team (10 Non-tech)** | `/marketing` | Campaign syncs, design discussions |
| **🏢 All-Hands / General** | `/general` | Company-wide meetings, town halls |

---

## ⚡ 1-Click Railway & LiveKit Cloud Deployment

No new domain or complex infrastructure needed. TeamMeet deploys in 5 minutes on Railway with LiveKit Cloud Free Tier (50GB free monthly bandwidth).

1. **Sign up at [LiveKit Cloud](https://cloud.livekit.io/)** (Free Tier):
   - Copy `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
2. **Deploy on [Railway](https://railway.app/):**
   - Click **New Project** → **Deploy from GitHub repo** → select `AmmaarAtGT/teammeet-app`.
   - Add Environment Variables:
     - `PORT` = `3000`
     - `LIVEKIT_URL` = `wss://yourteam-xxxx.livekit.cloud`
     - `LIVEKIT_API_KEY` = `your_key`
     - `LIVEKIT_API_SECRET` = `your_secret`
   - In **Settings > Networking**, click **Generate Domain**.

📖 For detailed junior developer steps, see [JUNIOR_DEPLOY_GUIDE.md](JUNIOR_DEPLOY_GUIDE.md).

---

## 🖥️ Local Development Setup

```bash
# Clone the repository
git clone https://github.com/AmmaarAtGT/teammeet-app.git
cd teammeet-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Run local development server
npm start
# Open http://localhost:3000
```

---

## 📑 Detailed Guides & Documentation

- [🌟 FEATURES.md](FEATURES.md) — Comprehensive breakdown of all 12 enterprise features, technical architecture, and AWS EC2 sizing matrix (`t3.medium`).
- [📘 JUNIOR_DEPLOY_GUIDE.md](JUNIOR_DEPLOY_GUIDE.md) — Step-by-step instructions for junior engineers & interns.
- [🚀 DEPLOY_INSTRUCTIONS.md](DEPLOY_INSTRUCTIONS.md) — Railway deployment instructions.
- [🎨 Interactive Visual Guide](public/guide.html) — Animated visual feature guide accessible at `/guide.html`.

---

## 🔒 Security & Data Hygiene
- **No Data Leakage:** Token generation occurs strictly server-side using cryptographic secrets.
- **Automated Purge:** `PURGE_RETENTION_DAYS=15` ensures ephemeral media does not persist indefinitely.
- **Passcode Protection:** Optional `TEAM_PASSCODE` can be set in `.env` to restrict room entry to authorized personnel.
