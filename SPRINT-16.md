# GhostPost Sprint 16 — Manus-Style Visible Browser + Multi-Platform Outreach

## READ THIS FIRST

You are working on GhostPost, a standalone project at `/opt/ghostpost/` on 78.111.89.140:3000. 
**IMPORTANT:** SSH in and explore the existing codebase before making ANY changes. Run `cat src/server.js | head -50` to understand the current structure.

## Server Access

- **IP:** 78.111.89.140
- **SSH:** `ssh root@78.111.89.140`
- **OS:** Ubuntu 24.04.4 LTS
- **Node:** v20.20.0
- **Code:** `/opt/ghostpost/`
- **PM2:** `pm2 restart ghostpost`

## What's Already Running (Sprints 1-11 — DONE)

- Express API on port 3000
- PostgreSQL, Redis, BullMQ job queues
- Playwright with stealth plugin + fingerprint management
- Observer engine (X/Twitter feed scanning)
- Voice onboarding (Whisper transcription, NLP extraction)
- 8 time-window persona engine with circadian curves
- Opportunity scoring + Ollama reply generation
- Cookie-based X auth with AES-256-GCM encryption
- Reply posting with human typing simulation
- Embedded browser via CDP screencast (Sprint 11)
- LinkedIn content generation via Rezvo API (Sprint 12 spec)

## Sprint 16 Goal

Extend GhostPost into a **Manus-style visible browser automation engine** for Instagram and LinkedIn outreach. The user can:

1. Add Instagram/LinkedIn accounts
2. Watch the browser work in real-time (live JPEG stream via WebSocket)
3. Manually intervene (log in, solve CAPTCHAs, take over control)
4. Create outreach campaigns with message templates
5. Search for business leads by hashtag/keyword
6. Send personalised DMs and connection requests with human-like behaviour
7. Track campaign results (sent, replied, converted)

This is the "Manus Computer" for merchant acquisition — visible, controllable, and human-like.

---

## Step 1: Install System Dependencies

```bash
# Xvfb enables headed browsers on the headless server
sudo apt-get update && sudo apt-get install -y xvfb

# ws for WebSocket (may already be installed)
cd /opt/ghostpost && npm install ws
```

## Step 2: Run Database Migration

```bash
psql -U ghostpost -d ghostpost -f src/db/migrations/012-multi-platform.sql
```

This creates 5 new tables: `platform_accounts`, `campaigns`, `leads`, `outreach_messages`, `browser_sessions`.

## Step 3: Copy New Files

Copy these files from the Sprint 16 package into `/opt/ghostpost/`:

```
src/
  services/
    browser-gui/
      platform-browser-manager.js   # Manages persistent browser contexts per account
      browser-stream-ws.js           # WebSocket handler for live browser streaming
    platforms/
      humanise-multi.js              # Human behavior (typing, mouse, scrolling, delays)
      instagram-automation.js        # Instagram search + DM automation
      linkedin-automation.js         # LinkedIn search + connect + message
      campaign-scheduler.js          # BullMQ orchestrator for all campaigns
  routes/
    outreach.js                      # API routes: accounts, campaigns, leads, browser control
  db/
    migrations/
      012-multi-platform.sql         # Database schema
```

## Step 4: Wire Into server.js

Read `SERVER-INTEGRATION-GUIDE.js` for exact instructions. Summary:

1. Import PlatformBrowserManager, CampaignScheduler, outreach routes, ws
2. Create browserManager and campaignScheduler instances (after db/redis setup)
3. `app.use('/api/outreach', outreachRoutes(db, redis, browserManager))`
4. Create WebSocketServer on the same HTTP server at path `/ws/browser`
5. Call `setupBrowserWebSocket(wss, browserManager)`
6. Call `campaignScheduler.start()`
7. Add graceful shutdown handlers

## Step 5: Create Data Directories

```bash
mkdir -p /opt/ghostpost/data/browser-profiles
mkdir -p /opt/ghostpost/data/screenshots
```

## Step 6: Restart

```bash
cd /opt/ghostpost && pm2 restart ghostpost
```

## Step 7: Verify

```bash
# Health check
curl http://localhost:3000/api/outreach/stats

# Create an Instagram account
curl -X POST http://localhost:3000/api/outreach/accounts \
  -H "Content-Type: application/json" \
  -d '{"platform": "instagram", "username": "test_account"}'

# Launch browser for manual login
curl -X POST http://localhost:3000/api/outreach/browser/launch/1

# Check active sessions
curl http://localhost:3000/api/outreach/browser/sessions
```

---

## Architecture Overview

```
Frontend (React)
  ├── Canvas showing live JPEG stream ← WebSocket ← Playwright screenshot loop
  └── Click/Type/Scroll events → WebSocket → Playwright page actions

Backend (Express + BullMQ)
  ├── /api/outreach/accounts     — CRUD platform accounts
  ├── /api/outreach/campaigns    — CRUD campaigns with templates
  ├── /api/outreach/campaigns/:id/leads — Add/list leads  
  ├── /api/outreach/campaigns/:id/search — Search platform for leads
  ├── /api/outreach/browser/*    — Launch, close, navigate, input, screenshot
  └── /api/outreach/stats        — Dashboard stats

Campaign Scheduler (BullMQ)
  ├── Checks every 15 min for campaigns needing work
  ├── Queues outreach-session or warmup-session jobs
  ├── Worker launches browser → runs automation → closes browser
  └── Respects daily/hourly limits per account

Platform Automation
  ├── Instagram: search → visit profile → check DMs open → type + send
  ├── LinkedIn: search → visit profile → connect/message → type + send
  └── Both: warmup browsing, gaussian delays, Bezier mouse, typo simulation
```

## Safe Limits Built In

| Platform | Daily Max | Hourly Max | Session Max | Warmup Period |
|----------|-----------|------------|-------------|---------------|
| Instagram DMs | 40/account | 5-10 | 20 | 7-14 days |
| LinkedIn Connections | 20/account | 5 | 15 | 30 days |
| LinkedIn Messages | 50/account | 10 | 25 | After connection |

## API Endpoints Quick Reference

| Method | Path | What |
|--------|------|------|
| GET | /api/outreach/accounts | List accounts |
| POST | /api/outreach/accounts | Add account |
| PATCH | /api/outreach/accounts/:id/status | Update status |
| GET | /api/outreach/campaigns | List campaigns |
| POST | /api/outreach/campaigns | Create campaign |
| PATCH | /api/outreach/campaigns/:id/status | Activate/pause |
| GET | /api/outreach/campaigns/:id/leads | Get leads |
| POST | /api/outreach/campaigns/:id/leads | Add leads (bulk) |
| POST | /api/outreach/campaigns/:id/search | Search platform |
| POST | /api/outreach/browser/launch/:id | Launch visible browser |
| POST | /api/outreach/browser/close/:id | Close browser |
| POST | /api/outreach/browser/navigate/:id | Navigate URL |
| POST | /api/outreach/browser/input/:id | Click/type/scroll |
| GET | /api/outreach/browser/screenshot/:id | Get screenshot |
| GET | /api/outreach/browser/sessions | Active sessions |
| GET | /api/outreach/stats | Dashboard stats |

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/db/migrations/012-multi-platform.sql` | CREATE | 5 new tables |
| `src/services/browser-gui/platform-browser-manager.js` | CREATE | Browser lifecycle, screenshots, input relay |
| `src/services/browser-gui/browser-stream-ws.js` | CREATE | WebSocket JPEG streaming |
| `src/services/platforms/humanise-multi.js` | CREATE | Typing, mouse, scroll simulation |
| `src/services/platforms/instagram-automation.js` | CREATE | Instagram search + DM |
| `src/services/platforms/linkedin-automation.js` | CREATE | LinkedIn search + connect + message |
| `src/services/platforms/campaign-scheduler.js` | CREATE | BullMQ orchestrator |
| `src/routes/outreach.js` | CREATE | 16 API endpoints |
| `src/server.js` | MODIFY | Wire in new imports + routes + WebSocket |
| `SERVER-INTEGRATION-GUIDE.js` | REFERENCE | Exact code to add to server.js |

## What's Next After This Sprint

- **Sprint 17:** React frontend for the outreach command centre (live browser viewer, campaign builder, lead manager, stats dashboard)
- **Sprint 18:** Dojo targeting matrix integration (auto-classify leads by vertical, auto-skip prohibited)
- **Sprint 19:** Follow-up sequences (day 3 check-in, day 7 value add, day 10 email pivot)
- **Sprint 20:** Multi-account rotation (scale horizontally across accounts)
