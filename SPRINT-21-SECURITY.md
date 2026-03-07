# Sprint 21 — Security & Data Integrity

## Priority: CRITICAL
## Status: Not started
## Prerequisite: Cursor needs Anthropic API key for Claude model access

---

## THE PROBLEM

Every API route accepts `:userId` in the URL with zero authentication. Any logged-in user can access, modify, or delete any other user's data by changing the number. The voice profile, personas, drafts, tracked profiles, and opportunities for User 1 are visible to User 2.

Additionally, 6 screens display hardcoded placeholder data instead of real API responses. New users see the test account's voice profile data regardless of their own recording.

---

## PART 1 — BACKEND: SECURE EVERY ROUTE

### 1.1 The Pattern

Every route currently looks like this:
```javascript
app.get('/api/drafts/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  // ... query using userId
});
```

Every route MUST change to this:
```javascript
app.get('/api/drafts', authenticateToken, async (req, res) => {
  const userId = req.user.id; // FROM JWT, not from URL
  // ... query using userId
});
```

The `authenticateToken` middleware (already exists at `src/middleware/auth.js`) verifies the JWT from the httpOnly cookie and sets `req.user = { id, email, name }`.

### 1.2 Files to Change

**Import the middleware in each file:**
```javascript
const { authenticateToken } = require('../middleware/auth');
```

**Route changes — exact find/replace for each file:**

---

#### `src/routes/voice.js`

| Old Route | New Route |
|-----------|-----------|
| `POST /api/voice/upload` (no auth) | `POST /api/voice/upload` + `authenticateToken` + get userId from `req.user.id` or `req.body.userId` |
| `GET /api/voice/profile/:userId` | `GET /api/voice/profile` + `authenticateToken` + `req.user.id` |
| `PUT /api/voice/profile/:userId` | `PUT /api/voice/profile` + `authenticateToken` + `req.user.id` |
| `POST /api/voice/confirm/:userId` | `POST /api/voice/confirm` + `authenticateToken` + `req.user.id` |
| `GET /api/voice-profile/status` | Keep as-is (already uses cookie/session) |
| `DELETE /api/voice-profile/reset` | `DELETE /api/voice-profile/reset` + `authenticateToken` + `req.user.id` |
| `GET /api/voice-profile/export` | `GET /api/voice-profile/export` + `authenticateToken` + `req.user.id` |
| `POST /api/voice-profile/import` | `POST /api/voice-profile/import` + `authenticateToken` + `req.user.id` |

Example change for `GET /api/voice/profile/:userId`:

**BEFORE:**
```javascript
app.get('/api/voice/profile/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
```

**AFTER:**
```javascript
app.get('/api/voice/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
```

---

#### `src/routes/drafts.js`

| Old Route | New Route |
|-----------|-----------|
| `GET /api/drafts/:userId` | `GET /api/drafts` + `authenticateToken` + `req.user.id` |
| `POST /api/drafts/generate` | `POST /api/drafts/generate` + `authenticateToken` (userId from body is OK but validate against req.user.id) |
| `POST /api/drafts/:id/approve` | `POST /api/drafts/:id/approve` + `authenticateToken` (verify draft belongs to user) |
| `POST /api/drafts/:id/edit` | `POST /api/drafts/:id/edit` + `authenticateToken` |
| `POST /api/drafts/:id/reject` | `POST /api/drafts/:id/reject` + `authenticateToken` |
| `POST /api/drafts/:id/regenerate` | `POST /api/drafts/:id/regenerate` + `authenticateToken` |

For approve/reject/edit/regenerate, add ownership check:
```javascript
app.post('/api/drafts/:id/approve', authenticateToken, async (req, res) => {
  const draftId = parseInt(req.params.id);
  const r = await db.query(
    "UPDATE drafts SET status = 'approved' WHERE id = $1 AND user_id = $2 RETURNING user_id",
    [draftId, req.user.id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Draft not found or not yours' });
  // ... rest
});
```

---

#### `src/routes/opportunities.js`

| Old Route | New Route |
|-----------|-----------|
| `GET /api/opportunities/:userId` | `GET /api/opportunities` + `authenticateToken` + `req.user.id` |
| `POST /api/opportunities/:id/skip` | `POST /api/opportunities/:id/skip` + `authenticateToken` + ownership check |
| `GET /api/opportunities/:userId/stats` | `GET /api/opportunities/stats` + `authenticateToken` + `req.user.id` |

---

#### `src/routes/persona.js`

| Old Route | New Route |
|-----------|-----------|
| `POST /api/persona/generate/:userId` | `POST /api/persona/generate` + `authenticateToken` + `req.user.id` |
| `GET /api/persona/:userId` | `GET /api/persona` + `authenticateToken` + `req.user.id` |
| `GET /api/persona/schedule/:userId` | `GET /api/persona/schedule` + `authenticateToken` + `req.user.id` |
| `GET /api/persona/circadian/:userId` | `GET /api/persona/circadian` + `authenticateToken` + `req.user.id` |

---

#### `src/routes/tracked-profiles.js`

| Old Route | New Route |
|-----------|-----------|
| `GET /api/tracked-profiles/:userId` | `GET /api/tracked-profiles` + `authenticateToken` + `req.user.id` |
| `POST /api/tracked-profiles/:userId` | `POST /api/tracked-profiles` + `authenticateToken` + `req.user.id` |
| `DELETE /api/tracked-profiles/:id` | `DELETE /api/tracked-profiles/:id` + `authenticateToken` + ownership check |
| `POST /api/tracked-profiles/:id/scan` | `POST /api/tracked-profiles/:id/scan` + `authenticateToken` + ownership check |

---

#### `src/routes/posting.js`

| Old Route | New Route |
|-----------|-----------|
| `POST /api/posting/queue` | `POST /api/posting/queue` + `authenticateToken` |
| `GET /api/posted/:userId` | `GET /api/posted` + `authenticateToken` + `req.user.id` |
| `GET /api/posted/:userId/stats` | `GET /api/posted/stats` + `authenticateToken` + `req.user.id` |
| `GET /api/posting/queue/stats` | Keep as-is (system-level) or add auth |
| `GET /api/posted/:userId/engagement/:postId` | `GET /api/posted/engagement/:postId` + `authenticateToken` + ownership check |

---

#### `src/routes/auth.js` (existing platform auth)

| Old Route | New Route |
|-----------|-----------|
| `POST /api/auth/capture/:userId` | `POST /api/auth/capture` + `authenticateToken` + `req.user.id` |
| `POST /api/auth/cookies/:userId` | `POST /api/auth/cookies` + `authenticateToken` + `req.user.id` |
| `GET /api/auth/status/:userId` | `GET /api/auth/status` + `authenticateToken` + `req.user.id` |
| `POST /api/auth/validate/:userId` | `POST /api/auth/validate` + `authenticateToken` + `req.user.id` |
| `POST /api/auth/disconnect/:userId` | `POST /api/auth/disconnect` + `authenticateToken` + `req.user.id` |

**NOTE:** Don't break `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout`, `/api/auth/me` — these are public/self-authenticating.

---

#### `src/routes/stats.js`

| Old Route | New Route |
|-----------|-----------|
| `GET /api/stats/dashboard/:userId` | `GET /api/stats/dashboard` + `authenticateToken` + `req.user.id` |
| `GET /api/stats/topic-breakdown/:userId` | `GET /api/stats/topic-breakdown` + `authenticateToken` + `req.user.id` |

---

#### `src/services/observer/scheduler.js` (has registered routes)

| Old Route | New Route |
|-----------|-----------|
| `GET /api/observer/stats` | Add `authenticateToken` (or keep public for admin) |
| `POST /api/observer/trigger/:userId` | `POST /api/observer/trigger` + `authenticateToken` + `req.user.id` |
| `GET /api/observer/sessions` | Add `authenticateToken` |
| `GET /api/observer/tweets/:userId` | `GET /api/observer/tweets` + `authenticateToken` + `req.user.id` |

---

### 1.3 server.js Changes

Add cookie-parser if not already present (it should be from Sprint 20):
```javascript
const cookieParser = require('cookie-parser');
app.use(cookieParser());
```

Ensure `src/middleware/auth.js` exists (created in Sprint 20).

---

## PART 2 — FRONTEND: UPDATE ALL API CALLS

Every frontend `api.get()` call that includes a userId in the URL must be changed to drop it — the backend now gets userId from the JWT.

### 2.1 Changes by Screen

#### Dashboard.tsx
```
BEFORE: api.get(`/stats/dashboard/${user.id}`)
AFTER:  api.get('/stats/dashboard')

BEFORE: api.get(`/opportunities/${user.id}/stats`)
AFTER:  api.get('/opportunities/stats')

BEFORE: api.get(`/posted/${user.id}/stats`)
AFTER:  api.get('/posted/stats')
```

#### Approvals.tsx
```
BEFORE: api.get(`/drafts/${user.id}?status=${status}`)
AFTER:  api.get(`/drafts?status=${status}`)
```

#### TrackedProfiles.tsx
```
BEFORE: api.get(`/tracked-profiles/${user.id}`)
AFTER:  api.get('/tracked-profiles')

BEFORE: api.post(`/tracked-profiles/${user.id}`, { x_handle })
AFTER:  api.post('/tracked-profiles', { x_handle })
```

#### VoiceProfile.tsx (needs full rewrite — see Part 3)
```
BEFORE: hardcoded data
AFTER:  api.get('/voice/profile')
```

#### PersonaSchedule.tsx
```
BEFORE: api.get(`/persona/circadian/${user.id}`)
AFTER:  api.get('/persona/circadian')

BEFORE: api.post(`/persona/generate/${user.id}`)
AFTER:  api.post('/persona/generate')
```

#### Personas.tsx (needs full rewrite — see Part 3)
```
BEFORE: hardcoded data
AFTER:  api.get('/persona/circadian')
```

#### Settings.tsx
```
BEFORE: api.get(`/voice/profile/${user.id}`) (if used)
AFTER:  api.get('/voice/profile')
```

#### Recording.tsx
```
BEFORE: api.upload('/voice/upload?userId=' + user?.id, formData)
AFTER:  api.upload('/voice/upload', formData)
        (backend gets userId from JWT)
```

---

## PART 3 — FIX HARDCODED SCREENS

### 3.1 VoiceProfile.tsx — FULL REWRITE

Currently shows hardcoded sliders, topics, signature words for EVERY user. Must fetch real data from `/api/voice/profile`.

**Data mapping (API response → UI):**
```
voice_profile.formality (0-1) → Formal/Casual slider (× 100)
voice_profile.directness (0-1) → Cautious/Direct slider (× 100)
voice_profile.expressiveness (0-1) → Reserved/Expressive slider (× 100)
  fallback: voice_profile.emotional_range.passion
voice_profile.primary_topics → Topics tag array
voice_profile.signature_words → Signature Words tag array
voice_profile.anti_words → Anti-Words tag array
voice_profile.emotional_range.humour (0-1) → Humour bar (× 100)
voice_profile.emotional_range.passion (0-1) → Passion bar (× 100)
voice_profile.emotional_range.sarcasm (0-1) → Sarcasm bar (× 100)
voice_profile.emotional_range.supportive (0-1) → Supportive bar (× 100)
voice_profile.emotional_range.vulnerability (0-1) → Vulnerability bar (× 100)
voice_profile.format_prefs → Format Preferences grid
voice_profile.off_limits → Off-Limits Topics tag array
voice_profile.summary_quote → Italic quote block
```

**If voice profile doesn't exist yet** (new user who just recorded), show a loading state or "Profile being generated..." message. Don't show fake data.

**"Adjust manually"** button should allow editing the sliders and saving via `PUT /api/voice/profile`.

**"Confirm and continue"** should save any changes, then call `POST /api/voice/confirm` and navigate to `/onboarding/persona-schedule`.

### 3.2 Personas.tsx — FULL REWRITE

Currently shows hardcoded 8 personas. Must fetch from `/api/persona/circadian`.

**Data mapping:** The API returns 24 hourly entries `{ hour, energy, mood, length_modifier, emoji_boost }`. Group into 8 time windows:

```javascript
const PERSONA_WINDOWS = [
  { name: 'Early Riser', hours: [5, 6], color: '#e89aad' },
  { name: 'Morning Drive', hours: [7, 8], color: '#7ab4e0' },
  { name: 'Work Mode', hours: [9, 10, 11], color: '#6dc992' },
  { name: 'Midday Break', hours: [12, 13], color: '#e0c064' },
  { name: 'Afternoon Push', hours: [14, 15, 16], color: '#b48ad6' },
  { name: 'Wind Down', hours: [17, 18, 19], color: '#a0a0b4' },
  { name: 'Evening Social', hours: [20, 21], color: '#e09868' },
  { name: 'Night Owl', hours: [22, 23, 0, 1, 2, 3, 4], color: '#d08080' },
];

// For each window, average the energy values from the API data:
const energy = Math.round(
  window.hours.reduce((sum, h) => sum + (circadianData[h]?.energy || 0), 0) 
  / window.hours.length * 100
);
```

**If persona data doesn't exist** (new user), show empty state with "Generate your persona schedule" button that calls `POST /api/persona/generate`.

### 3.3 PersonaSchedule.tsx — Wire to API

Same as Personas.tsx but in the onboarding flow. Fetch from `/api/persona/circadian`. If no data exists, show the default 8 windows from the hardcoded data (as a preview) with a note "These will be customised based on your voice profile."

The "Generate schedule" button should:
1. Call `POST /api/persona/generate`
2. Call `PATCH /api/auth/onboarding-complete`
3. Navigate to `/dashboard`

### 3.4 BrowserView.tsx — Wire noVNC

Replace the static Instagram mockup with a real noVNC connection:

```typescript
import RFB from '@novnc/novnc/core/rfb.js';

// In useEffect:
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${protocol}://${window.location.hostname}/websockify`;
rfbRef.current = new RFB(vncRef.current, wsUrl, {
  scaleViewport: true, resizeSession: false, showDotCursor: true
});
```

If VNC connection fails, show a fallback: "Browser not active. Start a campaign to see it in action."

### 3.5 AIComposition.tsx — Wire to API

Replace hardcoded topic breakdown with data from `/api/stats/topic-breakdown`.
Replace hardcoded heatmap with computed data from `/api/persona/circadian`.
Wire "Generate Draft" form to `POST /api/drafts/generate`.

### 3.6 Simulation.tsx — LEAVE AS EMPTY STATE

This feature (Sprint 14) was never built. The current empty state ("Simulation Not Yet Active") is correct. Leave it.

---

## PART 4 — VOICE RECORDING VALIDATION

The voice upload currently accepts any recording length and generates a profile. For a proper voice profile, we need at least 60 seconds of speech. 

### 4.1 Frontend: Enforce Minimum Recording Time

In `Recording.tsx`, the "Done" button currently appears after 10 seconds. Change to **60 seconds minimum** with a message explaining why:

```typescript
{seconds >= 60 ? (
  <GhostButton variant="success" onClick={handleDone}>Done</GhostButton>
) : isRecording ? (
  <span style={{ fontSize: 12, color: '#999' }}>
    {60 - seconds}s more for a quality profile
  </span>
) : null}
```

### 4.2 Backend: Validate Audio Quality

In the voice upload handler, check file size (minimum ~100KB for 60s of webm audio) before processing.

---

## PART 5 — DEPLOYMENT ORDER

1. **Backend security first** — add `authenticateToken` to all routes, change `:userId` to `req.user.id`
2. **Test backend** — verify all endpoints return 401 without cookie, return correct user data with cookie
3. **Frontend API calls** — remove userId from all URLs
4. **Rewrite VoiceProfile.tsx** — real API data with loading states
5. **Rewrite Personas.tsx** — real API data with grouping logic
6. **Wire BrowserView.tsx** — noVNC connection
7. **Wire AIComposition.tsx** — real topic data
8. **Update PersonaSchedule.tsx** — real API + onboarding complete
9. **Build and deploy**
10. **Test with two separate accounts** — verify complete data isolation

---

## VERIFICATION CHECKLIST

- [ ] Create Account A, complete onboarding with a recording
- [ ] Create Account B, complete onboarding with a different recording
- [ ] Account A sees ONLY Account A's voice profile, drafts, tracked profiles
- [ ] Account B sees ONLY Account B's data
- [ ] Account A cannot access Account B's data by modifying API URLs
- [ ] Unauthenticated requests to `/api/drafts` return 401
- [ ] Unauthenticated requests to `/api/voice/profile` return 401
- [ ] Voice profile shows "no profile yet" for users who haven't recorded
- [ ] Personas shows "not generated" for users without persona data
- [ ] Browser view connects to noVNC or shows appropriate fallback
- [ ] Logout works and clears the session cookie
- [ ] Login redirects to dashboard (if onboarding complete) or onboarding (if not)

---

## FILES CHANGED SUMMARY

### Backend (7 route files + 1 service file):
- `src/routes/voice.js` — add auth, remove :userId
- `src/routes/drafts.js` — add auth, remove :userId, ownership checks
- `src/routes/opportunities.js` — add auth, remove :userId
- `src/routes/persona.js` — add auth, remove :userId
- `src/routes/tracked-profiles.js` — add auth, remove :userId, ownership checks
- `src/routes/posting.js` — add auth, remove :userId
- `src/routes/auth.js` — add auth to platform auth routes, remove :userId
- `src/routes/stats.js` — add auth, remove :userId
- `src/services/observer/scheduler.js` — add auth to registered routes

### Frontend (7 screen files):
- `src/app/components/screens/VoiceProfile.tsx` — FULL REWRITE (real API)
- `src/app/components/screens/Personas.tsx` — FULL REWRITE (real API + grouping)
- `src/app/components/screens/PersonaSchedule.tsx` — Wire to real API
- `src/app/components/screens/BrowserView.tsx` — Wire noVNC
- `src/app/components/screens/AIComposition.tsx` — Wire to real API
- `src/app/components/screens/Dashboard.tsx` — Remove userId from URLs
- `src/app/components/screens/Approvals.tsx` — Remove userId from URLs
- `src/app/components/screens/TrackedProfiles.tsx` — Remove userId from URLs
- `src/app/components/screens/Recording.tsx` — Remove userId, enforce 60s minimum
- `src/app/components/screens/Settings.tsx` — Remove userId from URLs
