# 📘 TeamMeet Deployment & Setup Guide (Junior Developer Step-by-Step)

> **Objective:** Deploy TeamMeet on Railway with Free LiveKit Cloud, configure `.env`, and provide 3 permanent meeting rooms for our 20-member team (10 Devs + 10 Marketing) with **NO 90-minute limit**.
> **Estimated Time:** 10 to 15 minutes.
> **Prerequisites:** A GitHub account, a Railway account, and a Google account.

---

## 📌 OVERVIEW (Read This First)
We are running our video meetings without touching our AWS instances or buying a new domain.
- **Frontend & App:** Runs on **Railway** (free HTTPS domain).
- **Video & Audio Media Server:** Handled by **LiveKit Cloud** (Free Tier - 50GB/month bandwidth).
- **Duration:** 24-Hour continuous rooms (**No 90-min timeout**).

---

## 🛠️ STEP 1: Get Free LiveKit Cloud Keys (3 Minutes)

1. Open **[https://cloud.livekit.io/](https://cloud.livekit.io/)** in your browser.
2. Click **Sign in with Google**.
3. Click **Create Project** → Name it: `TeamMeet`.
4. Go to **Settings** (left sidebar) → Click on **Keys**.
5. You will see three credentials. **Copy and save them in Notepad:**
   - **`LIVEKIT_URL`** (Looks like: `wss://teammeet-xxxxxx.livekit.cloud`)
   - **`LIVEKIT_API_KEY`** (Looks like: `APIxxxxxxxxxxxx`)
   - **`LIVEKIT_API_SECRET`** (Looks like: `secretxxxxxxxxxxxxxxxxxxxx`)

*(Keep this tab open, we will paste these into Railway in Step 3).*

---

## 💻 STEP 2: Push Code to GitHub (5 Minutes)

1. Extract the provided `teammeet-railway.zip` on your computer.
2. Open your terminal / VS Code in that extracted folder (`teammeet-railway-ready`).
3. Go to **[GitHub](https://github.com/)** and click **New Repository**:
   - Repository name: `teammeet-app`
   - Privacy: **Private** (or Public)
   - Do NOT initialize with README (our folder already has everything).
   - Click **Create repository**.
4. In your local terminal, run these commands:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for TeamMeet Railway deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/teammeet-app.git
   git push -u origin main
   ```
5. Refresh your GitHub page to make sure all files (`server.js`, `Dockerfile`, `package.json`, `public/`) are uploaded.

---

## 🚀 STEP 3: Deploy on Railway (5 Minutes)

1. Open **[https://railway.app/](https://railway.app/)** and Log in (using your GitHub account).
2. On your Dashboard, click **New Project** → Select **Deploy from GitHub repo**.
3. Choose your `teammeet-app` repository.
4. Click **Deploy Now**.
5. While it starts building, click on the **Variables** tab (top menu).
6. Click **New Variable** and add these **4 exact environment variables**:

| Variable Name | Value | Notes |
| :--- | :--- | :--- |
| `PORT` | `3000` | Required for internal server port |
| `NODE_ENV` | `production` | Enables production mode |
| `LIVEKIT_URL` | `wss://teammeet-xxxxxx.livekit.cloud` | From Step 1 |
| `LIVEKIT_API_KEY` | `APIxxxxxxxxxxxx` | From Step 1 |
| `LIVEKIT_API_SECRET` | `secretxxxxxxxxxxxxxxxxxxxx` | From Step 1 |

*(Optional: If you want a passcode so only internal team can join, add `TEAM_PASSCODE` = `your_passcode`)*.

---

## 🌐 STEP 4: Generate the Free Live URL (1 Minute)

1. In Railway, click on the **Settings** tab.
2. Scroll down to the **Networking** section.
3. Click on the button: **"Generate Domain"**.
4. Railway will immediately generate a public HTTPS URL, for example:
   👉 `https://teammeet-app-production.up.railway.app`

---

## ✅ STEP 5: Verification & Team Links Sharing

Open the generated Railway link in your browser:
1. Verify that your camera preview and mic toggle appear.
2. Test joining a room.

Share these **3 permanent room URLs** with the team:

- 💻 **Dev Team (10 Developers):**  
  `https://teammeet-app-production.up.railway.app/dev-room`
- 📢 **Marketing Team (10 Non-tech):**  
  `https://teammeet-app-production.up.railway.app/marketing`
- 🏢 **All-Hands / General Meetings:**  
  `https://teammeet-app-production.up.railway.app/general`

> **Note for Team:**
> - These links **never expire**.
> - There is **no 90-minute meeting limit**.
> - Anyone can bookmark their respective room link and join daily without asking for a new link.
