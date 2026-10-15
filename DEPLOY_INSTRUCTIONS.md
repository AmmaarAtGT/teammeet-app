# 🚀 TeamMeet — Railway Deployment Guide (Free, Zero Domain, 20 Users)

This package contains the complete, updated TeamMeet web app ready for 1-click deployment on Railway using LiveKit Cloud's free tier.

---

## ⚡ Quick 3-Step Setup

### Step 1: Get Free LiveKit Cloud Keys (2 Minutes)
1. Open [https://cloud.livekit.io/](https://cloud.livekit.io/) and Sign In with Google.
2. Click **Create Project** (Name: `TeamMeet`).
3. In **Settings > Keys**, copy:
   - `LIVEKIT_URL` (e.g. `wss://yourteam-xxxx.livekit.cloud`)
   - `LIVEKIT_API_KEY` (e.g. `APIxxxxxx`)
   - `LIVEKIT_API_SECRET` (e.g. `secretxxxxxx`)

---

### Step 2: Push to GitHub & Deploy on Railway
1. Create a new GitHub repo: `teammeet-app`.
2. Extract this zip and push all files to your GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "TeamMeet Railway deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/teammeet-app.git
   git push -u origin main
   ```
3. Open [https://railway.app/](https://railway.app/).
4. Click **New Project** → **Deploy from GitHub repo** → select `teammeet-app`.
5. Under the **Variables** tab, add:
   - `PORT` = `3000`
   - `LIVEKIT_URL` = `wss://yourteam-xxxx.livekit.cloud`
   - `LIVEKIT_API_KEY` = `your_api_key`
   - `LIVEKIT_API_SECRET` = `your_api_secret`
6. Under the **Settings** tab, scroll to **Networking** and click **"Generate Domain"**.
   - You will get a free live URL: `https://teammeet-app-production.up.railway.app`

---

## 👥 Permanent Team Rooms (No 90-Min Limits!)

Your 20-member team can bookmark and join anytime:
- 💻 **10 Developers:** `https://your-railway-url.up.railway.app/dev-room`
- 📢 **10 Marketing:** `https://your-railway-url.up.railway.app/marketing`
- 🏢 **All-Hands / General:** `https://your-railway-url.up.railway.app/general`
