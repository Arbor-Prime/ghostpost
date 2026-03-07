# Sprint 20 — Gap Analysis
## What the UI Needs vs What the Backend Has

---

## SCREEN-BY-SCREEN AUDIT

### 1. MARKETING HOME (new screen needed)
**UI:** Marketing site HTML/CSS/JS from Vercel — needs converting to React component
**Backend needed:** Nothing — it's a public static page
**GAPS:**
- [ ] Convert HTML to JSX (MarketingHome.tsx)
- [ ] Port CSS to marketing.css (scoped under .marketing-page)
- [ ] Port JS animation to useEffect hooks
- [ ] Change CTAs: "Get early access" → /signup, add "Login" nav link

---

### 2. LOGIN (new screen needed)
**UI:** Doesn't exist yet — needs designing
**Backend needed:** `POST /api/auth/login` (email, password → JWT)
**GAPS:**
- [ ] **BACKEND: Create user-auth.js** — login, signup, logout, /me endpoints
- [ ] **BACKEND: Create middleware/auth.js** — JWT verification middleware
- [ ] **BACKEND: DB migration** — add email, password_hash, onboarding_complete to users table
- [ ] **BACKEND: Install** bcryptjs, jsonwebtoken, cookie-parser
- [ ] **BACKEND: Register** cookie-parser and user-auth routes in server.js
- [ ] **UI: Create Login.tsx** — dark theme, GhostPostLogo, email/password, GhostButton gold

---

### 3. SIGNUP (new screen needed)
**UI:** Doesn't exist yet — needs designing
**Backend needed:** `POST /api/auth/signup` (name, email, password → create user + JWT)
**GAPS:**
- [ ] **UI: Create Signup.tsx** — same style as Login, adds Name field + confirm password

---

### 4. WELCOME
**UI:** ✅ EXISTS — Welcome.tsx (info page, "Let's begin" → /onboarding/recording)
**Backend needed:** None
**GAPS:**
- [ ] Keep as-is but wrap in ProtectedRoute
- [ ] Decision: use as `/onboarding/welcome` instead of `/` (which becomes MarketingHome)

---

### 5. RECORDING
**UI:** ✅ EXISTS — Recording.tsx (fake timer + mic animation, prompts rotate)
**Backend needed:** `POST /api/voice/upload` (multipart form, field: `audio`, query: `userId`)
**GAPS:**
- [ ] **UI: Wire MediaRecorder API** — currently just a visual timer, no real audio capture
- [ ] **UI: On "Done"** → POST audio blob to `/api/voice/upload?userId={id}` then navigate to /onboarding/processing
- [ ] Audio format: `audio/webm` via MediaRecorder, endpoint accepts via multer

---

### 6. PROCESSING
**UI:** ✅ EXISTS — Processing.tsx (animated step list with progress bar)
**Backend needed:** Voice profiling happens server-side after upload. No polling endpoint exists.
**GAPS:**
- [ ] **BACKEND GAP: No processing status endpoint** — Whisper processing is synchronous in the upload handler. The UI animation is purely cosmetic (timer-based steps). This is actually fine — the Processing screen is a fake "AI is working" animation while the upload completes in the background. Just needs the upload to finish before auto-navigating.
- [ ] **UI: Poll or wait for upload response** from Recording screen, navigate to voice-profile when done

---

### 7. VOICE PROFILE
**UI:** ✅ EXISTS — VoiceProfile.tsx (sliders, topics, signature words, anti-words, emotional range, format prefs)
**Backend needed:** `GET /api/voice/profile/:userId`
**ACTUAL RESPONSE SHAPE:**
```json
{
  "voice_profile": {
    "formality": 0.5,
    "directness": 0.8,
    "primary_topics": ["SaaS", "AI Tools", ...],
    "signature_words": ["honestly", "mate", "ship it", ...],
    "anti_words": ["synergy", "leverage", ...],
    "emotional_range": { "humour": 0.7, "passion": 0.9, ... },
    "format_prefs": { "swearing": true, "hashtag_use": "never", ... },
    "summary_quote": "You sound like...",
    "off_limits": ["personal family details", ...]
  }
}
```
**GAPS:**
- [ ] **UI: Map real data to components:**
  - `formality` (0-1) → Style slider "Formal/Casual" (multiply by 100)
  - `directness` (0-1) → Style slider "Reserved/Direct" (multiply by 100)  
  - Need to derive "Reserved/Expressive" slider — use `emotional_range.passion` or `expressiveness`
  - `primary_topics` → Topics tags
  - `signature_words` → Signature Words tags
  - `anti_words` → Anti-Words tags
  - `emotional_range` → Emotional Range bars (values are 0-1, multiply by 100)
  - `format_prefs` → Format Preferences grid
  - `off_limits` → Off-Limits Topics tags
  - `summary_quote` → The italic quote block
- [ ] **UI: Save changes** via `PUT /api/voice/profile/:userId` when user adjusts sliders
- [ ] **UI: "Confirm and continue"** → navigate to /onboarding/persona-schedule

---

### 8. PERSONA SCHEDULE
**UI:** ✅ EXISTS — PersonaSchedule.tsx (8 personas with colour-coded timeline + energy bars)
**Backend needed:** `GET /api/persona/circadian/:userId`
**ACTUAL RESPONSE:** Array of 24 hourly entries: `{ hour, energy, mood, length_modifier, emoji_boost }`
**GAPS:**
- [ ] **UI: Map 24-hour circadian data to 8 persona cards** — the UI shows 8 named personas ("Early Riser", "Morning Drive", etc.) but the API returns raw hourly data. Need to GROUP hours into time windows and compute average energy per window.
  - Hours 0-4 → Night Owl (avg energy from hours 22-4)
  - Hours 5-6 → Early Riser
  - Hours 7-8 → Morning Drive
  - Hours 9-11 → Work Mode
  - Hours 12-13 → Midday Break
  - Hours 14-16 → Afternoon Push
  - Hours 17-19 → Wind Down
  - Hours 20-21 → Evening Social
- [ ] **UI: "Generate schedule"** → `POST /api/persona/generate/:userId` then mark onboarding complete
- [ ] **BACKEND GAP: No `PATCH /api/auth/onboarding-complete` exists** — need to create this

---

### 9. DASHBOARD
**UI:** ✅ EXISTS — Dashboard.tsx (4 stat cards, area chart, active persona, recent activity, live events)
**Backend needed:** Multiple endpoints
**ACTUAL RESPONSES:**
- `GET /api/observer/stats` → `{ sessions_today, tweets_today, opportunities_today, avg_duration_secs, failed_today, queue: {...} }`
- `GET /api/opportunities/1/stats` → `{ total: "368", pending: "337", queued: "0", drafted: "30", skipped: "1", avg_score, max_score }`
- `GET /api/posted/1/stats` → `{ total_posted: "0", total_failed: "18", posted_today: "0", posted_this_hour: "0" }`
**GAPS:**
- [ ] **UI: Map real data to stat cards:**
  - "Tweets Scanned" → `observer/stats.tweets_today` (or need a total count endpoint)
  - "Opportunities Found" → `opportunities/:userId/stats.total`
  - "Drafts Pending" → `opportunities/:userId/stats.drafted`
  - "Replies Posted" → `posted/:userId/stats.total_posted`
- [ ] **BACKEND GAP: No "all time tweets scanned" count** — `observer/stats` only returns today's count. Need either: query `SELECT COUNT(*) FROM observed_tweets`, or use the `queue.completed` number (68)
- [ ] **BACKEND GAP: No chart data endpoint** — Dashboard shows a 7-day chart. Need: `GET /api/stats/weekly` returning daily aggregates. Or compute client-side from existing data.
- [ ] **UI: Active Persona card** — needs to read current hour, find matching persona from circadian data
- [ ] **UI: Recent Activity** — needs Socket.io listener for `observer:event`, `reply:posted`, `draft:generated`
- [ ] **UI: Live Events** — same Socket.io events, formatted as timestamped log entries
- [ ] **BACKEND GAP: No weekly aggregation endpoint** — create `GET /api/stats/dashboard/:userId`

---

### 10. BROWSER VIEW
**UI:** ✅ EXISTS — BrowserView.tsx (left panel: action log + chat. Right panel: browser viewport)
**Backend needed:** noVNC WebSocket at `/websockify` (port 6080)
**ACTUAL STATE:** VNC manager running, websockify on 6080, Chromium on :99
**GAPS:**
- [ ] **UI: Replace static Instagram mockup** with real noVNC `<div ref={vncRef}>` using `@novnc/novnc` RFB client
- [ ] **UI: WebSocket URL** = `ws://${window.location.hostname}/websockify`
- [ ] **UI: Left panel action log** — connect to Socket.io for outreach events
- [ ] **UI: "Take Control" button** — RFB already supports mouse/keyboard, just needs `rfb.viewOnly = false`
- [ ] **UI: Chat input** — wire to a command interface or just use as display
- [ ] **DEPENDENCY: Install** `@novnc/novnc` and `socket.io-client` in client package.json

---

### 11. APPROVALS
**UI:** ✅ EXISTS — Approvals.tsx (filter pills, draft cards with tweet + reply + action buttons)
**Backend needed:** `GET /api/drafts/:userId`
**ACTUAL RESPONSE:** Array of drafts with: `id, reply_text, response_type, target_word_count, actual_word_count, circadian_mood, energy_level, tweet_content, author_handle, tweet_url, status`
**GAPS:**
- [ ] **UI: Map real data to draft cards:**
  - `author_handle` → "@paulg" label
  - `tweet_content` → Original tweet text
  - `reply_text` → The reply content
  - `response_type` → Type badge
  - `actual_word_count` → Word count
  - `circadian_mood` → Mood badge  
  - `energy_level` → Energy percentage (multiply by 100)
  - `status` → Filter state (pending/approved/rejected)
- [ ] **UI: Approve** → `POST /api/drafts/:id/approve` (EXISTS ✅)
- [ ] **UI: Reject** → `POST /api/drafts/:id/reject` (EXISTS ✅)
- [ ] **UI: Edit** → `POST /api/drafts/:id/edit` with `{ edited_content }` (EXISTS ✅)
- [ ] **UI: Regenerate** → `POST /api/drafts/:id/regenerate` (EXISTS ✅)
- [ ] **BACKEND GAP: No engagement stats (likes/replies/retweets)** on the tweet — the UI shows these but the drafts endpoint doesn't return them. The `observed_tweets` table HAS `engagement_likes`, `engagement_replies`, `engagement_retweets` but the drafts JOIN doesn't include them.
- [ ] **BACKEND FIX: Update drafts query** to JOIN observed_tweets and include engagement data

---

### 12. TRACKED PROFILES
**UI:** ✅ EXISTS — TrackedProfiles.tsx (grid of profile cards with scan stats)
**Backend needed:** `GET /api/tracked-profiles/:userId`
**ACTUAL RESPONSE:** Array: `{ id, x_handle, priority, notes, tweet_count, pending_opportunities }`
**GAPS:**
- [ ] **UI: Map real data to cards:**
  - `x_handle` → "@elonmusk" 
  - `tweet_count` → "Scanned" number
  - `pending_opportunities` → "Opportunities" number
  - `priority` → Priority dot (1-3 = high = gold, 4+ = normal = grey)
- [ ] **BACKEND GAP: No `lastScanned` field** — UI shows "Last: 2m ago" but API doesn't return this. Need to JOIN observation_sessions to get last scan timestamp.
- [ ] **UI: Add Profile** → `POST /api/tracked-profiles/:userId` with `{ x_handle }` (EXISTS ✅)
- [ ] **UI: Scan button** → `POST /api/tracked-profiles/:id/scan` (EXISTS ✅)
- [ ] **UI: Search/filter** — client-side filtering (already implemented in UI)

---

### 13. PERSONAS
**UI:** ✅ EXISTS — Personas.tsx (timeline bar + persona cards with energy bars)
**Backend needed:** `GET /api/persona/circadian/:userId`
**ACTUAL RESPONSE:** Array of 24: `{ hour, energy, mood, length_modifier, emoji_boost }`
**GAPS:**
- [ ] Same mapping as PersonaSchedule — group 24 hours into 8 time-window personas
- [ ] **UI: "Active now" badge** — compare current hour to persona time windows
- [ ] Data is all there, just needs the grouping logic

---

### 14. AI COMPOSITION
**UI:** ✅ EXISTS — AIComposition.tsx (topic breakdown, heatmap, generate draft form)
**Backend needed:** Multiple
**GAPS:**
- [ ] **UI: Topic Breakdown** — derive from `voice_profile.primary_topics`. The percentages are hardcoded. Need either: a `GET /api/stats/topic-breakdown/:userId` endpoint, or compute from opportunity/tweet topic matching data.
- [ ] **BACKEND GAP: No topic breakdown endpoint** — would need to aggregate `opportunities` by matched topic
- [ ] **UI: Heatmap** — the persona + posting data could generate this, but no single endpoint does. Could derive from `circadian_curve` energy values × day-of-week reduction.
- [ ] **UI: Generate Draft form** → `POST /api/drafts/generate` with `{ userId, tweetUrl }` (EXISTS ✅). The endpoint takes `userId` and `tweetUrl` or `opportunityId`.
- [ ] **BACKEND GAP: Generate endpoint doesn't take `targetProfile` or `responseType`** as shown in UI form — would need to be added as optional params

---

### 15. SIMULATION
**UI:** ✅ EXISTS — Simulation.tsx (empty state with "Run First Simulation" button + 3 score circles)
**Backend needed:** Sprint 14 (simulation) was never built
**GAPS:**
- [ ] **ENTIRE FEATURE NOT BUILT** — Simulation is spec-only. Leave as empty state for now. The UI already shows a "not yet active" state which is correct.

---

### 16. SETTINGS
**UI:** ✅ EXISTS — Settings.tsx (sidebar categories: General, Notifications, Voice Profile, Personas, Privacy, Integrations, System Health, Billing)
**Backend needed:** Various
**GAPS:**
- [ ] **General tab**: Display Name/Email — need `GET /api/auth/me` (to be created) and `PATCH /api/auth/profile` (to be created)
- [ ] **System Health tab**: needs `GET /api/health` (EXISTS ✅) — map `services.database`, `.redis`, `.ollama`, `.playwright` to the status list
- [ ] **Voice Profile tab**: `GET /api/voice/profile/:userId` (EXISTS ✅)
- [ ] **Voice Profile reset**: `DELETE /api/voice-profile/reset` (EXISTS ✅)
- [ ] **Integrations tab**: needs `GET /api/cookie-import/status` (EXISTS ✅) and `GET /api/auth/status/:userId` (EXISTS ✅) — show X connection status
- [ ] **Notifications tab**: No backend for notification preferences — leave as UI-only toggles for now
- [ ] **Billing tab**: No backend — leave as static display

---

## AUTH SYSTEM — NEW (doesn't exist at all)

**Everything below needs creating from scratch:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/signup` | POST | Create account (name, email, password) |
| `/api/auth/login` | POST | Login (email, password → JWT in httpOnly cookie) |
| `/api/auth/logout` | POST | Clear cookie |
| `/api/auth/me` | GET | Get current user from JWT |
| `/api/auth/onboarding-complete` | PATCH | Mark user onboarding done |
| `/api/auth/profile` | PATCH | Update name/email |

**DB migration needed:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
```

**NPM packages needed:**
- `bcryptjs`
- `jsonwebtoken`  
- `cookie-parser`

**Files to create:**
- `src/middleware/auth.js`
- `src/routes/user-auth.js`
- `src/db/migrations/020-user-auth.sql`

---

## CLIENT INFRASTRUCTURE — NEW

| File | Purpose |
|------|---------|
| `src/app/lib/api.ts` | Fetch wrapper with credentials: 'include', 401 redirect |
| `src/app/lib/auth-context.tsx` | React context for user state, login/signup/logout functions |
| `src/app/lib/ProtectedRoute.tsx` | Redirect to /login if not authed, /onboarding if not complete |
| `src/app/components/screens/Login.tsx` | Login form |
| `src/app/components/screens/Signup.tsx` | Signup form |
| `src/app/components/screens/MarketingHome.tsx` | Marketing page as React component |
| `src/styles/marketing.css` | Scoped marketing page styles |

---

## BACKEND FIXES NEEDED (existing endpoints)

| Issue | Fix | File |
|-------|-----|------|
| Drafts don't include tweet engagement stats | Add JOIN to observed_tweets in drafts query | `src/routes/drafts.js` |
| Tracked profiles no lastScanned timestamp | JOIN observation_sessions for latest scan time | `src/routes/tracked-profiles.js` or scheduler.js |
| No weekly stats for dashboard chart | Create `GET /api/stats/dashboard/:userId` | New file: `src/routes/stats.js` |
| No total tweets scanned count | Add total count query from observed_tweets | Add to observer stats or new stats route |
| Generate draft doesn't accept responseType | Add optional responseType param | `src/routes/drafts.js` |
| Results API routes are 404 | Sprint 18 routes exist on server branch but not in main git. Need to merge or check server code. | Check `/opt/ghostpost/src/routes/` on server |

---

## CLIENT DEPENDENCIES TO ADD

```json
{
  "react": "18.3.1",
  "react-dom": "18.3.1",
  "@novnc/novnc": "1.4.0",
  "socket.io-client": "^4.7.0"
}
```

(Move from peerDependencies to dependencies, add noVNC and socket.io-client)

---

## DEPLOYMENT ORDER

1. **DB migration** (020-user-auth.sql)
2. **Backend: auth system** (middleware, routes, server.js updates)
3. **Backend: fix existing endpoints** (drafts JOIN, tracked profiles lastScanned, stats route)
4. **Client: infrastructure** (api.ts, auth-context, ProtectedRoute)
5. **Client: new screens** (Login, Signup, MarketingHome)
6. **Client: wire existing screens** to real API calls (all 14 screens)
7. **Client: package.json + vite.config** updates
8. **Build + deploy**
9. **Nginx update**

---

## SUMMARY: What's Missing

### Must build from scratch:
- Auth system (backend + DB + 6 endpoints)
- Login screen
- Signup screen
- MarketingHome component
- API client library
- Auth context + ProtectedRoute

### Must wire (UI exists, API exists, just needs connecting):
- Dashboard → observer/stats + opportunities/stats + posted/stats + Socket.io
- BrowserView → noVNC WebSocket
- Approvals → drafts endpoint + approve/reject/edit/regenerate
- TrackedProfiles → tracked-profiles endpoint + add/scan
- VoiceProfile → voice/profile endpoint
- Personas → persona/circadian endpoint
- PersonaSchedule → persona/circadian + persona/generate
- Settings/Health → health endpoint
- Settings/Integrations → cookie-import/status + auth/status
- Recording → MediaRecorder + voice/upload
- AIComposition → drafts/generate

### Backend gaps to fill:
- Dashboard weekly chart data (new stats route)
- Drafts missing tweet engagement (fix JOIN)
- Tracked profiles missing lastScanned (fix JOIN)
- Total tweets scanned count
- Onboarding complete endpoint
- User profile update endpoint
