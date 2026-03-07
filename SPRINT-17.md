# GhostPost Sprint 17 — Conversation Learning Engine

## What This Does

GhostPost now watches how real humans talk to each other across X, Instagram, and LinkedIn. It observes public conversations, extracts communication patterns, and uses them to make every message it writes more human.

The brain gets smarter every day without anyone touching it.

## What It Watches

- **X**: Reply chains on public tweets. How people open conversations, push back, agree, pitch.
- **Instagram**: Comment threads on business posts. How customers talk to restaurants, how businesses respond.
- **LinkedIn**: Comment threads on public posts. How people pitch without sounding like they're pitching.

## What It Extracts

- Opening lines that get responses vs ones that get ignored
- Optimal message length per platform and vertical
- Tone and formality that drives engagement
- Whether questions outperform statements
- How business owners in specific verticals talk
- Regional language patterns

## Architecture

```
Harvest (every 6h)           Extract (every 12h)          Enrich (every reply)
    │                              │                            │
    ▼                              ▼                            ▼
Browse X/IG/LI ──► Store    Read conversations ──► Run    Build prompt ──► Inject
public threads     in DB    through Ollama         patterns from DB    learned patterns
                            to find patterns                          into system prompt
```

## New Files

| File | Purpose |
|------|---------|
| `src/db/migrations/013-learning-engine.sql` | 5 new tables |
| `src/services/learning/conversation-harvester.js` | Watches conversations on X/IG/LI |
| `src/services/learning/pattern-extractor.js` | Runs convos through Ollama to find patterns |
| `src/services/learning/prompt-enricher.js` | Injects patterns into reply/DM prompts |
| `src/services/learning/learning-scheduler.js` | Cron loop: harvest → extract → retire |
| `src/routes/learning.js` | API endpoints for stats, patterns, manual triggers |

## Modified Files

| File | Change |
|------|--------|
| `src/services/brain/reply-generator.js` | Enriches system prompt with learned patterns before Ollama call |

## Deployment

```bash
cd /opt/ghostpost
git fetch origin
git checkout sprint-17-learning-engine

# Run migration
psql "$DATABASE_URL" -f src/db/migrations/013-learning-engine.sql

# Add to server.js — after the outreach routes line:
# const { registerLearningRoutes } = require('./routes/learning');
# const LearningScheduler = require('./services/learning/learning-scheduler');

# After registerOutreachRoutes(app):
# registerLearningRoutes(app);

# After server.listen():
# const learningScheduler = new LearningScheduler(io);
# app.set('learningScheduler', learningScheduler);
# learningScheduler.start();

# Restart
pm2 restart ghostpost
```

## API Endpoints

| Method | Path | What |
|--------|------|------|
| GET | /api/learning/stats | Overview: conversations, messages, patterns |
| GET | /api/learning/patterns | List learned patterns (filterable) |
| GET | /api/learning/patterns/summary | Grouped summary by platform/context |
| GET | /api/learning/conversations | List observed conversations |
| GET | /api/learning/conversations/:id/messages | Thread messages |
| GET | /api/learning/harvests | Harvest log |
| POST | /api/learning/harvest | Trigger manual harvest |
| POST | /api/learning/extract | Trigger manual extraction |
| GET | /api/learning/enrichment/preview | Preview what patterns would be injected |

## Verify

```bash
# Stats
curl http://localhost:3000/api/learning/stats

# Trigger a harvest
curl -X POST http://localhost:3000/api/learning/harvest -H "Content-Type: application/json" -d '{"platform": "x"}'

# Check patterns after extraction
curl http://localhost:3000/api/learning/patterns

# Preview enrichment
curl "http://localhost:3000/api/learning/enrichment/preview?platform=x&context=reply"
```
