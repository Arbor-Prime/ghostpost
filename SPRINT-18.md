# GhostPost Sprint 18 — Results Dashboard + LinkedIn Brain Knowledge

## What This Sprint Does

Two things:

1. **Results Dashboard API** — lightweight endpoints that the Command Centre polls to show a GhostPost analytics page. Leads, campaigns, conversion funnel, activity feed.

2. **LinkedIn Methodology baked into the brain** — Lara Acosta's full Cleo playbook (edu-selling, ICP/IFP targeting, SLAY/PAS, scarcity psychology, cold DM rules, connection request rules, comment strategy) is now part of the brain's knowledge layer. When GhostPost operates on LinkedIn, this knowledge shapes every action automatically via the prompt enricher.

## Architecture

```
Command Centre (Rezvo)
  └── GhostPost Dashboard page
        └── Polls /api/results/* endpoints on GP server

GhostPost Brain
  └── Prompt Enricher
        ├── Learned patterns (from Sprint 17 observation)
        └── LinkedIn methodology knowledge (Lara/Cleo playbook)
              ├── Cold DM rules
              ├── Connection request rules  
              ├── Comment strategy
              ├── Post creation (SLAY/PAS/edu-sell)
              └── Scarcity/launch psychology
```

## New Files

| File | Purpose |
|------|---------|
| `src/routes/results.js` | 6 Results Dashboard endpoints for CC |
| `src/services/brain/knowledge/linkedin-methodology.js` | LinkedIn communication knowledge for the brain |

## Modified Files

| File | Change |
|------|--------|
| `src/services/learning/prompt-enricher.js` | Injects LinkedIn knowledge when platform is 'linkedin' |

## Deployment

```bash
cd /opt/ghostpost
git fetch origin
git checkout sprint-18-linkedin-content-and-results

# Add to server.js:
# const { registerResultsRoutes } = require('./routes/results');
# registerResultsRoutes(app);

# Restart and test
```

## Results Dashboard Endpoints (for CC)

| Method | Path | What |
|--------|------|------|
| GET | /api/results/overview | Everything in one call |
| GET | /api/results/leads | All leads (filterable) |
| GET | /api/results/leads/hot | Leads that replied |
| GET | /api/results/activity | Last 50 actions |
| GET | /api/results/campaigns | Campaign performance |
| GET | /api/results/conversion-funnel | Leads → Contacted → Replied → Converted |

## Verify

```bash
curl http://localhost:3000/api/results/overview
curl http://localhost:3000/api/results/conversion-funnel
```
