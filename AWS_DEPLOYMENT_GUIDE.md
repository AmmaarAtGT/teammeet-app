# 🚀 AWS Production Deployment Guide for TeamMeet

> **Author:** Senior Development & DevOps Team  
> **Target Audience:** Junior Developers, DevOps Engineers & Contributors  
> **Platform:** AWS (Amazon Web Services) with AWS App Runner & Amazon ECR  
> **Runtime:** Node.js 22 LTS / Docker Container

---

## 📋 Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step 1: Create an Amazon ECR Repository](#step-1-create-an-amazon-ecr-repository)
4. [Step 2: Create an IAM Deployment User](#step-2-create-an-iam-deployment-user)
5. [Step 3: Setup AWS App Runner Service](#step-3-setup-aws-app-runner-service)
6. [Step 4: Configure Production Environment Variables](#step-4-configure-production-environment-variables)
7. [Step 5: Set GitHub Repository Secrets for CI/CD](#step-5-set-github-repository-secrets-for-cicd)
8. [Step 6: Triggering & Verifying Zero-Downtime Deployments](#step-6-triggering--verifying-zero-downtime-deployments)
9. [Zero Local Downloads & Cloud Sync Architecture](#zero-local-downloads--cloud-sync-architecture)
10. [Troubleshooting & Common Pitfalls](#troubleshooting--common-pitfalls)

---

## 1. Architecture Overview

TeamMeet is a containerized, enterprise-ready real-time communication platform built on Node.js and LiveKit WebRTC. When deploying to AWS:

```
[ Developer / Git Push to main ]
              │
              ▼
[ GitHub Actions CI/CD Pipeline ]
   ├─ Step 1: Run unit & integration tests (npm test)
   ├─ Step 2: Build production Docker image (node:22-slim)
   └─ Step 3: Push image to Amazon ECR (teammeet-app)
              │
              ▼
    [ Amazon ECR Registry ]
              │
              ▼ (Triggers deployment)
    [ AWS App Runner Service ]
        ├─ High-availability auto-scaling container (Port 3000)
        ├─ SSL/TLS Certificate Termination (Custom Domain or AWS URL)
        ├─ Connects to LiveKit Cloud (WebRTC media routing)
        └─ Syncs recordings/attendance/notes directly to Google Drive
```

---

## 2. Prerequisites

Before starting, ensure you have:
1. An active **AWS Account** with administrative permissions.
2. The **AWS CLI** installed and configured (`aws configure`), or access to the **AWS Management Console**.
3. A **GitHub account** with access to your repository settings (`Settings > Secrets and variables > Actions`).
4. Credentials for external services:
   - **LiveKit Cloud:** Project URL, API Key, and API Secret from [cloud.livekit.io](https://cloud.livekit.io).
   - **Google Cloud Service Account:** JSON key with access to Google Drive API.
   - **Gemini API Key:** From Google AI Studio (for AI summary and live action item extraction).

---

## 3. Step 1: Create an Amazon ECR Repository

Amazon Elastic Container Registry (ECR) stores our production Docker images.

### Via AWS Management Console:
1. Go to the AWS Console and search for **Elastic Container Registry (ECR)**.
2. Select **Repositories** from the left navigation pane and click **Create repository**.
3. Choose **Private**.
4. In **Repository name**, enter: `teammeet-app`.
5. Under **Tag immutability**, select **Disabled** (or Enabled if using strict SHA tags).
6. Under **Scan on push**, toggle to **Enabled** (recommended for vulnerability scanning).
7. Click **Create repository**.
8. Note down your **Repository URI** (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com/teammeet-app`).

### Via AWS CLI:
```bash
aws ecr create-repository \
  --repository-name teammeet-app \
  --image-scanning-configuration scanOnPush=true \
  --region us-east-1
```

---

## 4. Step 2: Create an IAM Deployment User

We need a dedicated IAM user for GitHub Actions with only the permissions required to push images and trigger deployments (Principle of Least Privilege).

1. Go to the **IAM Console** > **Users** > **Create user**.
2. Name the user: `github-actions-teammeet-deployer`.
3. Do **not** enable AWS Management Console access (API-only user).
4. Click **Next** > **Attach policies directly** > **Create policy** (JSON):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetRepositoryPolicy",
        "ecr:DescribeRepositories",
        "ecr:ListImages",
        "ecr:DescribeImages",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:*:*:repository/teammeet-app"
    },
    {
      "Sid": "AppRunnerDeploy",
      "Effect": "Allow",
      "Action": [
        "apprunner:StartDeployment",
        "apprunner:DescribeService"
      ],
      "Resource": "*"
    }
  ]
}
```
5. Name the policy: `TeamMeetGitHubActionsDeployPolicy` and attach it to the user.
6. Open the created user, go to the **Security credentials** tab, and click **Create access key**.
7. Select **Application running outside AWS**, click **Next**, and download/copy:
   - `Access Key ID`
   - `Secret Access Key`

---

## 5. Step 3: Setup AWS App Runner Service

AWS App Runner provides fully managed container execution, automated zero-downtime rolling updates, and built-in HTTPS.

1. Go to **AWS App Runner** > **Create service**.
2. **Source and deployment:**
   - **Repository type:** `Container registry`
   - **Provider:** `Amazon ECR`
   - **Container image URI:** Click **Browse** and select `teammeet-app:latest` (or enter `123456789012.dkr.ecr.us-east-1.amazonaws.com/teammeet-app:latest`).
   - **Deployment trigger:** `Automatic` (App Runner will deploy automatically whenever a new image is pushed to ECR).
   - **ECR access role:** Select **Create new service role** (App Runner will create `AppRunnerECRAccessRole`).
3. Click **Next**.
4. **Configure service:**
   - **Service name:** `teammeet-app-production`
   - **Virtual CPU & Memory:** `1 vCPU, 2 GB` (or `2 vCPU, 4 GB` for higher traffic).
   - **Port:** `3000` (Crucial! The Express app listens on port 3000).
5. Proceed to Step 4 below to configure Environment Variables before clicking Create.

---

## 6. Step 4: Configure Production Environment Variables

In App Runner's **Environment variables** section, add the following key-value pairs:

| Variable Name | Sample Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production caching & security |
| `PORT` | `3000` | Port listened to by Express |
| `LIVEKIT_URL` | `wss://your-domain.livekit.cloud` | Your LiveKit WebSocket server URL |
| `LIVEKIT_API_KEY` | `APIxxxxxxxxxxxx` | LiveKit Cloud API Key |
| `LIVEKIT_API_SECRET` | `secretxxxxxxxxxxxx` | LiveKit Cloud API Secret |
| `TEAM_PASSCODE` | `YourSecureCompanyPasscode` | Required passcode to join meetings |
| `SESSION_SECRET` | `Random64CharAlphaNumericString` | Express session encryption secret |
| `GEMINI_API_KEY` | `AIzaSy...` | Gemini 2.5 Flash API Key for AI meeting notes |
| `GOOGLE_DRIVE_FOLDER_ID` | `1abCDeFGhiJKlmNoPQRsTuvwxYZ` | Default Google Drive Folder ID for cloud sync |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `{"type":"service_account",...}` | Full JSON string of GCP Service Account |

Click **Next**, review the configuration, and click **Create & deploy**.

Once deployed (usually 3–5 minutes), App Runner will provide your live URL (e.g., `https://xxxxxx.us-east-1.awsapprunner.com`).

---

## 7. Step 5: Set GitHub Repository Secrets for CI/CD

Now wire your GitHub repository to deploy automatically on every push to `main`.

1. Go to your GitHub repository: `https://github.com/your-org/teammeet-app`.
2. Navigate to **Settings** > **Secrets and variables** > **Actions**.
3. Under **Repository secrets**, click **New repository secret** and add:

- `AWS_ACCESS_KEY_ID`: The IAM user Access Key ID from Step 2.
- `AWS_SECRET_ACCESS_KEY`: The IAM user Secret Access Key from Step 2.
- `AWS_REGION`: Your AWS region (e.g., `us-east-1`).
- `ECR_REPOSITORY`: `teammeet-app`.
- `APP_RUNNER_SERVICE_ARN`: The ARN of your App Runner service (found on the App Runner service overview page).
- `RAILWAY_DEPLOY_HOOK` (Optional): If you also want to keep the Railway deployment updated simultaneously.

---

## 8. Step 6: Triggering & Verifying Zero-Downtime Deployments

To deploy a new change:
1. Push your commits to `main`:
   ```bash
   git add .
   git commit -m "feat: enhance mobile screen sharing and live AI notes"
   git push origin main
   ```
2. Navigate to the **Actions** tab on GitHub.
3. Observe the pipeline:
   - **Job 1 (Test):** Checks out code, validates syntax across all JS files, and runs the 18 automated tests.
   - **Job 2 (Deploy to AWS):** Logs into Amazon ECR, builds the production container, pushes tags (`latest` and `$GITHUB_SHA`), and triggers AWS App Runner.
4. App Runner performs a **zero-downtime rolling deployment**:
   - The new container starts up and passes health checks on port 3000.
   - Traffic smoothly switches to the new container.
   - The old container is safely drained and stopped.

---

## 9. Zero Local Downloads & Cloud Sync Architecture

As requested by enterprise security standards, **TeamMeet does not save recordings, attendance lists, or notes to local user devices (`a.download` is disabled)**.

Instead:
1. **Screen Recordings & Audio Recordings:**
   - Captured in browser memory chunks via `MediaRecorder`.
   - On stop, encoded to Base64 and sent directly to `/api/recordings/upload`.
   - The backend immediately syncs them to the linked Google Drive folder via Google Drive v3 API.
2. **Attendance CSVs:**
   - When the host clicks "Sync Attendance to Drive", `/api/attendance/sync-drive` formats the records and pushes `attendance.csv` straight to the Google Drive folder.
3. **Collaborative Whiteboard:**
   - Clicking "Sync to Drive" uploads the whiteboard canvas snapshot directly to the meeting folder in Google Drive.
4. **Live AI Notes & Takeaways:**
   - Pop up in real-time in the floating ticker (`#aiNotesLivePop`).
   - Synced into the meeting summary in Google Drive.

---

## 10. Troubleshooting & Common Pitfalls

### Issue 1: App Runner deployment fails health check
- **Cause:** App Runner default health check port doesn't match container port.
- **Fix:** Ensure the App Runner service port is set to `3000` (matching `server.js` `EXPOSE 3000`).

### Issue 2: Screen sharing on iOS Safari says "Screen share failed"
- **Cause:** Passing Chrome-specific desktop parameters like `{ selfBrowserSurface: 'exclude' }` or requesting audio track on mobile Safari.
- **Fix:** Handled automatically in `public/app.js` with mobile constraint detection (`isMobile ? { audio: false } : { audio: true, selfBrowserSurface: 'exclude' }`).

### Issue 3: Google Drive uploads fail with 403 Forbidden
- **Cause:** The Google Service Account email does not have Editor permission on the target Google Drive folder.
- **Fix:** Open Google Drive in your browser, right-click the folder, click **Share**, and paste your Google Service Account email (`xxx@xxx.iam.gserviceaccount.com`) as an **Editor**.

---

*For further assistance or escalation, contact the lead architecture team or submit an issue in the repository.*
