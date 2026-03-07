# SPRINT 21 — FIX EVERYTHING

## Server: 78.111.89.140 | SSH: root / IIi6gg4yHP6Fun7F
## Code: /opt/ghostpost/ | PM2: ghostpost
## GitHub: https://github.com/Arbor-Prime/ghostpost.git (branch: sprint-20-frontend-merge)
## Frontend repo: https://github.com/Arbor-Prime/Ghostpostu.git (main)

---

## OVERVIEW

This sprint has TWO phases:
1. **BACKEND** — Deploy auth system, add JWT protection to existing routes (Steps 1-8)
2. **FRONTEND** — Rewrite 4 hardcoded screens with real API data, rebuild and deploy (Steps 9-14)

DO NOT start Phase 2 until Phase 1 is fully tested.

---

# PHASE 1: BACKEND (Steps 1-8)

All work done on the server via SSH.

---

## Step 1: Install Dependencies

```bash
cd /opt/ghostpost
npm install bcryptjs jsonwebtoken cookie-parser
```

Verify:
```bash
node -e "require('bcryptjs'); require('jsonwebtoken'); require('cookie-parser'); console.log('OK')"
```

---

## Step 2: Run Database Migration

```bash
psql -U ghostpost -d ghostpost -f /dev/stdin << 'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE users SET onboarding_complete = TRUE WHERE id = 1;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
SQL
```

Verify:
```bash
psql -U ghostpost -d ghostpost -c "\d users" | grep email
```
Should show: `email | character varying(255)`

---

## Step 3: Add JWT_SECRET to .env

```bash
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "JWT_SECRET=$JWT_SECRET" >> /opt/ghostpost/.env
echo "Added JWT_SECRET: $JWT_SECRET"
```

Verify:
```bash
grep JWT_SECRET /opt/ghostpost/.env
```

---

## Step 4: Deploy Auth Middleware

Create file `/opt/ghostpost/src/middleware/auth.js`:

```bash
cat > /opt/ghostpost/src/middleware/auth.js << 'AUTHEOF'
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'ghostpost-jwt-secret-change-in-production';

function authenticateToken(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authenticateToken, generateToken, JWT_SECRET };
AUTHEOF
```

---

## Step 5: Deploy User Auth Routes

Create file `/opt/ghostpost/src/routes/user-auth.js`:

```bash
curl -L -o /opt/ghostpost/src/routes/user-auth.js \
  "https://raw.githubusercontent.com/Arbor-Prime/Ghostpostu/main/backend-additions/routes/user-auth.js"
```

FIX the require path in user-auth.js (it references relative paths from the Ghostpostu repo):

```bash
sed -i "s|require('../config/database')|require('../../config/database')|g" /opt/ghostpost/src/routes/user-auth.js
sed -i "s|require('../middleware/auth')|require('../../middleware/auth')|g" /opt/ghostpost/src/routes/user-auth.js
```

Wait — the file structure on the server is `/opt/ghostpost/src/routes/user-auth.js`, so `../config/database` would resolve to `/opt/ghostpost/src/config/database` which IS correct. Check:

```bash
ls /opt/ghostpost/src/config/database.js
```

If that file exists, the paths are fine. If not, check where database.js actually is and fix the require paths.

---

## Step 6: Deploy Stats Routes

Create file `/opt/ghostpost/src/routes/stats.js`:

```bash
curl -L -o /opt/ghostpost/src/routes/stats.js \
  "https://raw.githubusercontent.com/Arbor-Prime/Ghostpostu/main/backend-additions/routes/stats.js"
```

Same path check as Step 5.

---

## Step 7: Patch server.js

Add these three things to `/opt/ghostpost/src/server.js`:

### 7a: Add imports at the TOP (after existing requires)

Find the block of `require` statements near the top of server.js. Add:

```javascript
const cookieParser = require('cookie-parser');
const { registerUserAuthRoutes } = require('./routes/user-auth');
const { registerStatsRoutes } = require('./routes/stats');
```

### 7b: Add cookie-parser middleware

Find `app.use(express.json())` (or similar middleware setup). Add immediately after:

```javascript
app.use(cookieParser());
```

### 7c: Register auth + stats routes

Find where other routes are registered (look for lines like `require('./routes/health')(app)` or `registerHealthRoutes(app)` etc). Add:

```javascript
// User auth (Sprint 21)
registerUserAuthRoutes(app);
registerStatsRoutes(app);
```

### 7d: Restart and test

```bash
pm2 restart ghostpost
sleep 2
pm2 logs ghostpost --lines 5 --nostream
```

Should NOT show any errors. If there are require errors, check the file paths.

### 7e: Test auth endpoints

```bash
# Test signup
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"testpass123"}' \
  -c /tmp/cookies.txt

# Test me
curl -s http://localhost:3000/api/auth/me -b /tmp/cookies.txt

# Test login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpass123"}' \
  -c /tmp/cookies2.txt

# Test dashboard stats
curl -s http://localhost:3000/api/stats/dashboard/1

# Test logout
curl -s -X POST http://localhost:3000/api/auth/logout -b /tmp/cookies.txt

# Cleanup test user
psql -U ghostpost -d ghostpost -c "DELETE FROM users WHERE email = 'test@test.com'"
```

ALL of these must return valid JSON, not errors. If any fail, check pm2 logs and fix before proceeding.

---

## Step 8: Add JWT Protection to Existing Routes

This is the account isolation fix. For EACH existing route file, add the `authenticateToken` middleware and change `:userId` to `req.user.id`.

### 8a: Voice Routes — `/opt/ghostpost/src/routes/voice.js`

Add at top:
```javascript
const { authenticateToken } = require('../middleware/auth');
```

Change every route that has `:userId`:

**GET /api/voice/profile/:userId** → **GET /api/voice/profile**
```javascript
// BEFORE:
app.get('/api/voice/profile/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

// AFTER:
app.get('/api/voice/profile', authenticateToken, async (req, res) => {
  const userId = req.user.id;
```

Do the same pattern for ALL routes in this file that take `:userId`.

**IMPORTANT:** Keep the voice upload route working for onboarding. The upload doesn't need `:userId` in the URL — it can get userId from the JWT:

```javascript
// BEFORE:
app.post('/api/voice/upload', upload.single('audio'), async (req, res) => {
  const userId = req.body.userId || req.query.userId;

// AFTER:
app.post('/api/voice/upload', authenticateToken, upload.single('audio'), async (req, res) => {
  const userId = req.user.id;
```

### 8b: Drafts Routes — `/opt/ghostpost/src/routes/drafts.js`

Add at top:
```javascript
const { authenticateToken } = require('../middleware/auth');
```

**GET /api/drafts/:userId** → **GET /api/drafts**
```javascript
app.get('/api/drafts', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const status = req.query.status || 'pending';
```

**POST /api/drafts/:id/approve** — add auth + ownership:
```javascript
app.post('/api/drafts/:id/approve', authenticateToken, async (req, res) => {
  const draftId = parseInt(req.params.id);
  // Add WHERE user_id = req.user.id to the UPDATE query
```

Same for `/api/drafts/:id/reject`, `/api/drafts/:id/regenerate`, `/api/drafts/:id/edit`.

### 8c: Tracked Profiles — `/opt/ghostpost/src/routes/tracked-profiles.js`

```javascript
const { authenticateToken } = require('../middleware/auth');

// GET /api/tracked-profiles/:userId → GET /api/tracked-profiles
app.get('/api/tracked-profiles', authenticateToken, async (req, res) => {
  const userId = req.user.id;

// POST /api/tracked-profiles/:userId → POST /api/tracked-profiles
app.post('/api/tracked-profiles', authenticateToken, async (req, res) => {
  const userId = req.user.id;
```

### 8d: Persona Routes — `/opt/ghostpost/src/routes/persona.js`

```javascript
const { authenticateToken } = require('../middleware/auth');

// GET /api/persona/circadian/:userId → GET /api/persona/circadian
app.get('/api/persona/circadian', authenticateToken, async (req, res) => {
  const userId = req.user.id;
```

### 8e: Opportunities Routes — `/opt/ghostpost/src/routes/opportunities.js`

Same pattern for all `:userId` routes.

### 8f: Posting Routes — `/opt/ghostpost/src/routes/posting.js`

Same pattern for all `:userId` routes.

### 8g: Stats Routes — `/opt/ghostpost/src/routes/stats.js`

Already deployed in Step 6, but still takes `:userId`. Change:

```javascript
// BEFORE:
app.get('/api/stats/dashboard/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

// AFTER:
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
  const userId = req.user.id;
```

Same for `/api/stats/topic-breakdown/:userId`.

### 8h: Auth Routes (platform auth) — `/opt/ghostpost/src/routes/auth.js`

**BE CAREFUL HERE.** This file has the X/Instagram/LinkedIn cookie auth routes. Add `authenticateToken` to these routes but DO NOT break the new user-auth routes (those are in a separate file).

```javascript
const { authenticateToken } = require('../middleware/auth');

// GET /api/auth/status/:userId → GET /api/auth/status
// POST /api/auth/cookies/:userId → POST /api/auth/cookies
// etc.
```

### 8i: Restart and verify

```bash
pm2 restart ghostpost
sleep 2

# Test that unauthenticated requests are rejected
curl -s http://localhost:3000/api/drafts
# Should return: {"error":"Authentication required"}

curl -s http://localhost:3000/api/voice/profile
# Should return: {"error":"Authentication required"}

curl -s http://localhost:3000/api/tracked-profiles
# Should return: {"error":"Authentication required"}

# Test that authenticated requests work
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpass123"}' \
  -c /tmp/cookies.txt

curl -s http://localhost:3000/api/stats/dashboard -b /tmp/cookies.txt
# Should return real stats JSON
```

---

# PHASE 2: FRONTEND (Steps 9-14)

All work done in the Ghostpostu repo locally, then pushed to GitHub, then downloaded to server.

---

## Step 9: Update ALL API Calls — Remove userId from URLs

Every frontend file that calls `api.get('/something/${user.id}')` must change to `api.get('/something')`.

### Dashboard.tsx
```
api.get(`/stats/dashboard/${user.id}`)  →  api.get('/stats/dashboard')
api.get(`/opportunities/${user.id}/stats`)  →  api.get('/opportunities/stats')
api.get(`/posted/${user.id}/stats`)  →  api.get('/posted/stats')
```

### Approvals.tsx
```
api.get(`/drafts/${user.id}?status=${status}`)  →  api.get(`/drafts?status=${status}`)
```

### TrackedProfiles.tsx
```
api.get(`/tracked-profiles/${user.id}`)  →  api.get('/tracked-profiles')
api.post(`/tracked-profiles/${user.id}`, ...)  →  api.post('/tracked-profiles', ...)
```

### Recording.tsx
```
api.upload('/voice/upload?userId=' + user?.id, formData)  →  api.upload('/voice/upload', formData)
```

### Settings.tsx
Any `/${user.id}` references in API calls → remove.

---

## Step 10: Rewrite VoiceProfile.tsx

Replace the ENTIRE file. The current one is 100% hardcoded. The new one fetches from `/api/voice/profile`.

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, SlidersHorizontal, Loader2 } from 'lucide-react';
import { GhostPostLogo } from '../layout/GhostPostLogo';
import { GhostButton } from '../ui/GhostButton';
import { api } from '../../lib/api';

export function VoiceProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/voice/profile')
      .then(data => setProfile(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    try {
      await api.post('/voice/confirm');
    } catch (e) {}
    navigate('/onboarding/persona-schedule');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#2b2b2b' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="text-[#d4a853] animate-spin" />
          <p style={{ color: '#999', fontSize: 14 }}>Analysing your voice profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#2b2b2b' }}>
        <div className="text-center" style={{ maxWidth: 400 }}>
          <GhostPostLogo size={28} />
          <h2 className="mt-4 mb-2" style={{ fontSize: 20, fontWeight: 700, color: '#e5e5e5' }}>
            Profile Not Ready
          </h2>
          <p style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>
            {error || 'Your voice profile is still being generated. This usually takes 30-60 seconds.'}
          </p>
          <GhostButton variant="gold" size="md" onClick={() => { setLoading(true); setError(''); api.get('/voice/profile').then(setProfile).catch(e => setError(e.message)).finally(() => setLoading(false)); }}>
            Check again
          </GhostButton>
        </div>
      </div>
    );
  }

  // Extract data from the real voice profile
  const vp = profile.voice_profile || profile;
  const formality = Math.round((vp.formality || 0.5) * 100);
  const directness = Math.round((vp.directness || 0.5) * 100);
  const expressiveness = Math.round((vp.expressiveness || 0.5) * 100);
  const signatureWords = vp.signature_words || [];
  const antiWords = vp.anti_words || [];
  const primaryTopics = vp.primary_topics || [];
  const secondaryTopics = vp.secondary_topics || [];
  const emotionalRange = vp.emotional_range || {};
  const formatPrefs = vp.format_prefs || {};
  const offLimits = vp.off_limits || [];
  const summaryQuote = vp.summary_quote || '';

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: '#2b2b2b' }}>
      <div className="w-full max-w-[520px]" style={{ background: '#333333', borderRadius: 24, padding: '36px 32px', border: '1px solid #444444' }}>
        <div className="flex items-center gap-2.5 mb-6">
          <GhostPostLogo size={20} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e5e5e5' }}>GhostPost</span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5e5', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Your Voice Profile
        </h2>
        <p style={{ fontSize: 12, color: '#999999', marginBottom: 20 }}>
          Here's what we learned. Adjust anything that doesn't feel right.
        </p>

        {/* Summary Quote */}
        {summaryQuote && (
          <div style={{ background: '#3a3a3a', borderRadius: 12, padding: '14px 16px', marginBottom: 16, borderLeft: '3px solid #d4a853' }}>
            <p style={{ fontSize: 13, color: '#cccccc', fontStyle: 'italic', lineHeight: 1.6 }}>"{summaryQuote}"</p>
          </div>
        )}

        {/* Style Sliders */}
        <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 12 }}>Style</h3>
          {[
            { label: 'Formal', labelRight: 'Casual', value: 100 - formality },
            { label: 'Reserved', labelRight: 'Expressive', value: expressiveness },
            { label: 'Cautious', labelRight: 'Direct', value: directness },
          ].map((s) => (
            <div key={s.label} className="mb-3">
              <div className="flex justify-between mb-1">
                <span style={{ fontSize: 10, color: '#888' }}>{s.label}</span>
                <span style={{ fontSize: 10, color: '#888' }}>{s.labelRight}</span>
              </div>
              <div style={{ height: 6, background: '#555', borderRadius: 3, position: 'relative' }}>
                <div style={{ height: '100%', width: `${s.value}%`, background: '#d4a853', borderRadius: 3 }} />
                <div style={{ position: 'absolute', top: -4, left: `${s.value}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#d4a853', border: '2px solid #333' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Topics */}
        {(primaryTopics.length > 0 || secondaryTopics.length > 0) && (
          <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>Topics</h3>
            <div className="flex flex-wrap gap-2">
              {[...primaryTopics, ...secondaryTopics].map((t: string) => (
                <span key={t} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#4a4a4a', color: '#ccc' }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Signature Words */}
        {signatureWords.length > 0 && (
          <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>Signature Words</h3>
            <div className="flex flex-wrap gap-2">
              {signatureWords.map((w: string) => (
                <span key={w} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(212,168,83,0.12)', color: '#d4a853' }}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {/* Anti-Words */}
        {antiWords.length > 0 && (
          <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>Anti-Words</h3>
            <div className="flex flex-wrap gap-2">
              {antiWords.map((w: string) => (
                <span key={w} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.1)', color: '#ef4444', textDecoration: 'line-through' }}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {/* Emotional Range */}
        {Object.keys(emotionalRange).length > 0 && (
          <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 12 }}>Emotional Range</h3>
            {Object.entries(emotionalRange).map(([key, val]: [string, any]) => (
              <div key={key} className="mb-2.5">
                <div className="flex justify-between mb-1">
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#ccc', textTransform: 'capitalize' }}>{key}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{Math.round(val * 100)}%</span>
                </div>
                <div style={{ height: 5, background: '#555', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${val * 100}%`, background: '#d4a853', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Format Preferences */}
        {Object.keys(formatPrefs).length > 0 && (
          <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>Format Preferences</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(formatPrefs).map(([key, val]: [string, any]) => (
                <div key={key} style={{ background: '#444', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#999', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#e5e5e5', textTransform: 'capitalize' }}>{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Off-Limits Topics */}
        {offLimits.length > 0 && (
          <div style={{ background: '#3a3a3a', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>Off-Limits Topics</h3>
            <div className="flex flex-wrap gap-2">
              {offLimits.map((t: string) => (
                <span key={t} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#4a4a4a', color: '#999' }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <GhostButton variant="gold" size="lg" onClick={handleConfirm} icon={<ArrowRight size={14} strokeWidth={2} />}>
            Confirm and continue
          </GhostButton>
          <GhostButton variant="glass" size="lg" icon={<SlidersHorizontal size={14} strokeWidth={1.5} />}>
            Adjust manually
          </GhostButton>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 11: Rewrite Personas.tsx

Replace the ENTIRE file. Fetch from `/api/persona/circadian`.

```typescript
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

const PERSONA_WINDOWS = [
  { name: 'Early Riser', hours: [5, 6], time: '05:00 – 07:00', color: '#e89aad', traits: ['Calm', 'Brief'] },
  { name: 'Morning Drive', hours: [7, 8], time: '07:00 – 09:00', color: '#7ab4e0', traits: ['Focused', 'Direct'] },
  { name: 'Work Mode', hours: [9, 10, 11], time: '09:00 – 12:00', color: '#6dc992', traits: ['Professional', 'Articulate'] },
  { name: 'Midday Break', hours: [12, 13], time: '12:00 – 13:30', color: '#e0c064', traits: ['Casual', 'Warm'] },
  { name: 'Afternoon Push', hours: [14, 15, 16], time: '13:30 – 17:00', color: '#b48ad6', traits: ['Efficient', 'Helpful'] },
  { name: 'Wind Down', hours: [17, 18, 19], time: '17:00 – 19:30', color: '#a0a0b4', traits: ['Relaxed', 'Personal'] },
  { name: 'Evening Social', hours: [20, 21], time: '19:30 – 22:00', color: '#e09868', traits: ['Playful', 'Opinionated'] },
  { name: 'Night Owl', hours: [22, 23, 0, 1, 2, 3, 4], time: '22:00 – 05:00', color: '#d08080', traits: ['Sparse', 'Thoughtful'] },
];

export function Personas() {
  const [circadianData, setCircadianData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/persona/circadian')
      .then(data => setCircadianData(Array.isArray(data) ? data : []))
      .catch(() => setCircadianData([]))
      .finally(() => setLoading(false));
  }, []);

  const getWindowEnergy = (window: typeof PERSONA_WINDOWS[0]) => {
    if (circadianData.length === 0) return 0;
    const entries = circadianData.filter(d => window.hours.includes(d.hour));
    if (entries.length === 0) return 0;
    return Math.round(entries.reduce((sum, e) => sum + (Number(e.energy) || 0), 0) / entries.length * 100);
  };

  const getWindowMood = (window: typeof PERSONA_WINDOWS[0]) => {
    if (circadianData.length === 0) return 'unknown';
    const entries = circadianData.filter(d => window.hours.includes(d.hour));
    return entries[0]?.mood || 'relaxed';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 size={24} className="text-[#d4a853] animate-spin" />
      </div>
    );
  }

  if (circadianData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
        <p style={{ fontSize: 14, marginBottom: 8 }}>No persona data yet.</p>
        <p style={{ fontSize: 12 }}>Complete voice onboarding to generate your circadian personas.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Timeline bar */}
      <div className="flex mb-6" style={{ borderRadius: 10, overflow: 'hidden', height: 32 }}>
        {PERSONA_WINDOWS.map((w) => (
          <div key={w.name} style={{ flex: w.hours.length, background: w.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{w.time.split(' – ')[0]}</span>
          </div>
        ))}
      </div>

      {/* Persona cards */}
      <div className="grid grid-cols-2 gap-3">
        {PERSONA_WINDOWS.map((w) => {
          const energy = getWindowEnergy(w);
          const mood = getWindowMood(w);
          return (
            <div key={w.name} style={{ background: '#383838', borderRadius: 16, padding: '18px', border: '1px solid #4a4a4a' }}>
              <div className="flex items-center gap-2.5 mb-2">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: w.color }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5' }}>{w.name}</h3>
              </div>
              <p style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>{w.time}</p>
              <p style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>Mood: {mood}. Energy: {energy}%</p>
              <div style={{ height: 5, background: '#555', borderRadius: 3, marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${energy}%`, background: w.color, borderRadius: 3 }} />
              </div>
              <div className="flex gap-2">
                {w.traits.map(t => (
                  <span key={t} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 500, background: '#444', color: '#ccc', border: '1px solid #555' }}>{t}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Step 12: Rewrite AIComposition.tsx

Replace with a version that fetches from `/api/stats/topic-breakdown` and `/api/persona/circadian`:

```typescript
import { useState, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { GhostButton } from '../ui/GhostButton';
import { api } from '../../lib/api';

export function AIComposition() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    api.get('/stats/topic-breakdown')
      .then(data => setTopics(data.topics || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setDraft('');
    try {
      const result = await api.post('/drafts/generate', { prompt: prompt.trim() });
      setDraft(result.replyText || result.text || 'Draft generated — check Approvals.');
    } catch (err: any) {
      setDraft('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* Topic Breakdown */}
      <div style={{ background: '#383838', borderRadius: 16, padding: '22px 24px', marginBottom: 16, border: '1px solid #4a4a4a' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 14 }}>Topic Breakdown</h3>
        {loading ? (
          <Loader2 size={18} className="text-[#d4a853] animate-spin" />
        ) : topics.length === 0 ? (
          <p style={{ fontSize: 12, color: '#999' }}>No topic data yet. Generate some drafts first.</p>
        ) : (
          <div className="space-y-2.5">
            {topics.map((t: any) => (
              <div key={t.topic}>
                <div className="flex justify-between mb-1">
                  <span style={{ fontSize: 12, color: '#ccc' }}>{t.topic}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{t.percentage}%</span>
                </div>
                <div style={{ height: 5, background: '#555', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${t.percentage}%`, background: '#d4a853', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Draft Generator */}
      <div style={{ background: '#383838', borderRadius: 16, padding: '22px 24px', border: '1px solid #4a4a4a' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 14 }}>Generate Draft</h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the tweet you want to reply to, or paste a tweet URL..."
          rows={3}
          className="w-full placeholder:text-[#777] text-[#e5e5e5] focus:outline-none mb-3"
          style={{ background: '#3a3a3a', border: '1px solid #4a4a4a', borderRadius: 10, padding: '10px 14px', fontSize: 12, resize: 'vertical' }}
        />
        <GhostButton variant="gold" size="md" onClick={handleGenerate} disabled={generating} icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={2} />}>
          {generating ? 'Generating...' : 'Generate'}
        </GhostButton>

        {draft && (
          <div className="mt-4" style={{ background: '#3a3a3a', borderRadius: 10, padding: '14px 16px', border: '1px solid #4a4a4a' }}>
            <p style={{ fontSize: 13, color: '#e5e5e5', lineHeight: 1.6 }}>{draft}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Step 13: Fix PersonaSchedule.tsx

The current file mostly works but the "Generate schedule" button needs to call the real API:

Find the `onClick` handler for the generate button. Replace with:

```typescript
onClick={async () => {
  try {
    await api.post('/persona/generate');
    await api.patch('/auth/onboarding-complete');
  } catch(e) {}
  navigate('/dashboard');
}}
```

---

## Step 14: Build and Deploy Frontend

```bash
cd /path/to/local/Ghostpostu
npm run build

# Push to GitHub
git add -A
git commit -m "Sprint 21: Real API data on all screens, userId removed from URLs"
git push origin main

# Deploy to server
ssh root@78.111.89.140 << 'DEPLOY'
cd /opt/ghostpost/client/build
# Download new SPA files
curl -L -o app.html "https://raw.githubusercontent.com/Arbor-Prime/Ghostpostu/main/dist/app.html"
# Get the new JS and CSS filenames from dist/index.html
# (the exact filenames will be in the build output)
# Download them to assets/
pm2 restart ghostpost
DEPLOY
```

NOTE: The exact asset filenames will be shown in the Vite build output. Download those specific files.

---

## VERIFICATION CHECKLIST

After both phases are complete, test the FULL flow:

- [ ] Go to https://ghostpostu.app/ — see marketing page (white, Vercel design)
- [ ] Click "Get started" — redirects to /signup
- [ ] Create account with real email — no errors
- [ ] Redirected to /onboarding/welcome — see "Before we set anything up..."
- [ ] Click "Let's begin" — goes to /onboarding/recording
- [ ] Click Record — browser asks for mic permission
- [ ] Record 60+ seconds, click Done — goes to /onboarding/processing
- [ ] Processing finishes — goes to /onboarding/voice-profile
- [ ] Voice profile shows REAL data from YOUR recording (not hardcoded JFK data)
- [ ] Click "Confirm and continue" — goes to /onboarding/persona-schedule
- [ ] Click "Generate schedule" — goes to /dashboard
- [ ] Dashboard shows REAL stats (likely zeros for new account — that's correct)
- [ ] Approvals shows "No drafts found" (correct for new account)
- [ ] Tracked Profiles shows "No tracked profiles yet" (correct)
- [ ] Settings shows YOUR name and email
- [ ] Personas shows REAL circadian data
- [ ] Click logout button — redirected to /
- [ ] Try to access /dashboard directly — redirected to /login
- [ ] Log back in — goes to /dashboard
- [ ] Create a SECOND account — verify it sees ONLY its own data
- [ ] Try accessing /api/drafts without cookie — returns 401
- [ ] Try accessing /api/voice/profile without cookie — returns 401
