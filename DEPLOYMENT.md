# SmartCart — Deployment Guide

This guide covers two things:
1. **Running locally with Docker Desktop** (for development and your demo)
2. **Deploying to the internet for free** (Render.com + Neon)

---

## Part 1 — Running Locally with Docker Desktop

### What is Docker?

Think of Docker as a "box" that packages your entire app — code, database — into isolated containers. Instead of installing PostgreSQL, Node.js separately on your machine, Docker runs everything inside containers that are pre-configured and ready to go. Docker Desktop gives you a nice GUI to see and manage these containers.

### What You'll Get

When you run `docker compose up`, Docker creates **2 containers**:

| Container | What it does | Port |
|-----------|-------------|------|
| `smartcart-postgres` | PostgreSQL database (no row limits!) | localhost:5432 |
| `smartcart-app` | Your web app (Express + React + local AI embeddings) | localhost:3000 |

### Step 1 — Install Docker Desktop

1. Go to https://www.docker.com/products/docker-desktop/
2. Download for your OS (Windows/Mac)
3. Install and open Docker Desktop
4. Wait until you see "Docker Desktop is running" (the whale icon in your taskbar should be steady, not animating)

> **Windows users:** Docker Desktop may ask you to enable WSL 2 (Windows Subsystem for Linux). Click Yes and restart if prompted. This is normal.

### Step 2 — Make Sure Your .env File Has the Gemini Keys

Open your `.env` file in the project root and make sure these two lines are there (the chatbot needs them):

```
BUILT_IN_FORGE_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
BUILT_IN_FORGE_API_KEY=your-gemini-api-key-here
```

Docker Compose reads your `.env` file automatically.

### Step 3 — Build and Start Everything

Open a terminal in your project folder (`smartcart-fyp`) and run:

```bash
docker compose up --build
```

**What happens:**
1. Docker downloads PostgreSQL (1 minute)
2. Docker builds the Node app and downloads the BGE embedding model (5–10 minutes first time)
3. Everything starts up and connects together

You'll see logs from both services. Wait until you see something like:
```
smartcart-app  | Server running on port 3000
```

Then open **http://localhost:3000** in your browser — your app is running!

> **First build is slow** (~10–15 minutes) because it downloads everything. After that, rebuilds only take 1–2 minutes because Docker caches the layers.

### Step 4 — Seed Products and Generate Embeddings

Your Docker PostgreSQL starts empty (it's a fresh database, separate from your Neon one). You'll need to:

1. Open http://localhost:3000
2. Log in as admin
3. Go to Admin Dashboard → add/import products
4. Click **Regenerate All Embeddings** to make semantic search work

### Useful Docker Commands

Run these from your project folder:

| Command | What it does |
|---------|-------------|
| `docker compose up --build` | Build and start everything (shows logs) |
| `docker compose up --build -d` | Same but runs in background (detached) |
| `docker compose down` | Stop all containers |
| `docker compose down -v` | Stop and **delete all database data** |
| `docker compose logs -f app` | Follow logs for just the web app |
| `docker compose restart app` | Restart just the web app |

### Viewing Containers in Docker Desktop

After running `docker compose up`, open Docker Desktop. You'll see a group called `smartcart-fyp` with 2 containers inside. You can click on any container to see its logs, stop it, restart it, etc. Green = running, red = stopped.

### Stopping Everything

Press `Ctrl+C` in the terminal where Docker is running, or run:
```bash
docker compose down
```

### Troubleshooting Docker

**"port 5432 already in use"** — You have PostgreSQL running locally. Either stop it, or change the port in docker-compose.yml from `"5432:5432"` to `"5433:5432"`.

**"Cannot connect to the Docker daemon"** — Docker Desktop isn't running. Open it first.

**Build fails at npm install** — Delete `node_modules` and try again:
```bash
rm -rf node_modules
docker compose up --build
```

---

## Part 2 — Deploying to the Internet (Free)

This section walks you through deploying SmartCart on the internet for free using **Render.com** (hosting) and **Neon** (database).

## What You'll End Up With

| Service | Host | Cost |
|---------|------|------|
| Web App (Node + React + AI) | Render.com | Free |
| PostgreSQL Database | Neon (your existing one) | Free |

Your app will be live at something like `https://smartcart-app.onrender.com`.

> **Note:** Free-tier services on Render spin down after 15 minutes of no traffic. The first visit after inactivity takes ~30–60 seconds to "wake up". This is normal and fine for a university demo.

---

## Prerequisites

1. A **GitHub account** (you probably already have one)
2. Your code pushed to a **GitHub repository**
3. Your existing **Neon database URL** (the `DATABASE_URL` from your `.env` file)
4. Your **Gemini API key** (already in your `.env`)

---

## Step 1 — Push Your Code to GitHub

If your code isn't on GitHub yet:

1. Go to https://github.com/new and create a new repository (e.g., `smartcart-fyp`)
2. Set it to **Private** (your FYP code shouldn't be public)
3. In your project folder, run these commands in the terminal:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/smartcart-fyp.git
git push -u origin main
```

**Important:** Make sure your `.env` file is in `.gitignore` so your API keys don't get uploaded. Check by running:
```bash
cat .gitignore
```
If `.env` isn't listed, add it:
```bash
echo ".env" >> .gitignore
```

---

## Step 2 — Create a Render.com Account

1. Go to https://render.com
2. Click **Get Started for Free**
3. Sign up with your **GitHub account** (this makes connecting your repo easier)

---

## Step 3 — Deploy the Web App

1. In Render dashboard, click **New** → **Web Service**
2. Connect your GitHub repo
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `smartcart-app` |
| **Region** | Pick the closest to London (e.g., Frankfurt) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install --include=dev && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

4. Add **Environment Variables** (click "Add Environment Variable" for each):

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your Neon URL (starts with `postgresql://...neon.tech/...`) |
| `JWT_SECRET` | Click "Generate" to create a random value |
| `BASE_URL` | Your Render app URL (e.g., `https://smartcart-app.onrender.com`) |
| `BUILT_IN_FORGE_API_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| `BUILT_IN_FORGE_API_KEY` | Your Gemini API key |

5. Click **Create Web Service**

Build takes 3–5 minutes. Once it says **Live**, your app is on the internet!

> **Note:** The BGE embedding model is loaded in-process on first request (~10–20 seconds). Subsequent requests are fast.

---

## Step 4 — Seed Your Products (if needed)

Your Neon database already has your products. If you want to regenerate embeddings:

1. Visit `https://smartcart-app.onrender.com` (your deployed URL)
2. Log in as admin
3. Go to Admin Dashboard → click **Regenerate All Embeddings**

This re-generates embeddings using the in-process BGE model so semantic search works.

---

## Troubleshooting

### "Service is starting..." for a long time
Free-tier services take a while on first deploy. Wait 15 minutes. Check the **Logs** tab in Render for progress.

### Search returns wrong results
Make sure you clicked "Regenerate All Embeddings" from the Admin Dashboard after deploying. The embeddings need to be generated by the same model version.

### Chatbot says "I'm having trouble connecting"
Check that `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` are set correctly in the Render environment variables.

---

## Updating Your Deployment

Every time you push to `main` on GitHub, Render automatically rebuilds and redeploys. Just:

```bash
git add .
git commit -m "Update feature"
git push
```

That's it — Render handles the rest.

---

## Quick Reference

| What | URL |
|------|-----|
| Your live app | `https://smartcart-app.onrender.com` |
| Render dashboard | https://dashboard.render.com |
| Neon dashboard | https://console.neon.tech |
| Gemini API console | https://aistudio.google.com/apikey |
