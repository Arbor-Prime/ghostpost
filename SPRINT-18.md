# GhostPost Sprint 18 — LinkedIn Content Engine + Results Dashboard

## What This Sprint Does

Two things:

1. **Ports the LinkedIn Autopilot from the CC into GhostPost's backend.** The full content generation engine — SLAY/PAS frameworks, weekly calendars, trend jacking, trend scanning, post CRUD, analytics — now lives inside GhostPost and uses the voice profile to match your actual tone.

2. **Creates a Results Dashboard API** for the Command Centre. The CC doesn't need to know about personas or browser sessions — it just needs leads, stats, activity, campaigns, and conversion funnels. Six lightweight endpoints that give the CC everything it needs.

## New Files

| File | Purpose |
|------|---------|
| `src/db/migrations/014-linkedin-content.sql` | linkedin_posts table |
| `src/services/linkedin/content-engine.js` | AI content generation with SLAY/PAS, voice profile integration |
| `src/routes/linkedin.js` | 12 LinkedIn content API endpoints |
| `src/routes/results.js` | 6 Results Dashboard endpoints for CC |

## Deployment

```bash
cd /opt/ghostpost
git fetch origin
git checkout sprint-18-linkedin-content-and-results

# Migration
psql "$DATABASE_URL" -f src/db/migrations/014-linkedin-content.sql

# Add to server.js:
# const { registerLinkedInRoutes } = require('./routes/linkedin');
# const { registerResultsRoutes } = require('./routes/results');
# registerLinkedInRoutes(app);
# registerResultsRoutes(app);

# Restart
pm2 restart ghostpost
```

## LinkedIn Content Endpoints

| Method | Path | What |
|--------|------|------|
| POST | /api/linkedin/generate | Single post (pillar, framework, tone) |
| POST | /api/linkedin/generate-week | 4-post weekly calendar |
| POST | /api/linkedin/trend-jack | Turn trending topic into post |
| POST | /api/linkedin/scan-trends | AI finds 5 trending topics |
| POST | /api/linkedin/rewrite | Improve existing post |
| GET | /api/linkedin/posts | List posts (filterable) |
| GET | /api/linkedin/posts/:id | Single post |
| PUT | /api/linkedin/posts/:id | Update post |
| DELETE | /api/linkedin/posts/:id | Delete post |
| POST | /api/linkedin/posts/:id/regenerate | Regenerate with new angle |
| POST | /api/linkedin/posts/:id/track | Track performance |
| GET | /api/linkedin/analytics | Overall analytics |

## Results Dashboard Endpoints (for CC)

| Method | Path | What |
|--------|------|------|
| GET | /api/results/overview | Everything in one call — outreach, linkedin, twitter, learning, voice stats |
| GET | /api/results/leads | All leads (filterable by status, platform) |
| GET | /api/results/leads/hot | Leads that replied — need human follow-up |
| GET | /api/results/activity | Last 50 actions across all systems |
| GET | /api/results/campaigns | Campaign performance with reply rates |
| GET | /api/results/conversion-funnel | Leads → Contacted → Replied → Converted |

## Verify

```bash
# Results overview
curl http://localhost:3000/api/results/overview

# Generate a LinkedIn post
curl -X POST http://localhost:3000/api/linkedin/generate \
  -H "Content-Type: application/json" \
  -d '{"pillar": "tam", "framework": "slay"}'

# Conversion funnel
curl http://localhost:3000/api/results/conversion-funnel
```
