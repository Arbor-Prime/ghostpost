# GHOSTPOST SPRINT 20 — CURSOR BUILD PLAYBOOK

> **READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.**
> You are building a unified web application. The UI code already exists in the `Ghostpostu` repo.
> The backend already exists at `/opt/ghostpost/`. You are wiring them together and filling gaps.
> Follow every step in order. Do not skip steps. Do not improvise.

---

## WHAT YOU ARE BUILDING

GhostPost is an AI-powered social media outreach tool. It has:
- A **marketing homepage** (public, at `/`)
- **Login + Signup** pages (public)
- **Onboarding flow** (authenticated — voice recording, processing, voice profile review, persona schedule)
- **Main app** with sidebar (authenticated — dashboard, browser view, approvals, tracked profiles, personas, AI composition, simulation, settings)

The **frontend UI** comes from Figma Make: https://github.com/Arbor-Prime/Ghostpostu.git
The **backend** is at `/opt/ghostpost/src/` on the server (78.111.89.140)

Your job is to:
1. Set up authentication (backend + frontend)
2. Replace the old broken frontend with the new Figma Make UI
3. Wire every screen to the real backend APIs
4. Build and deploy

---

## DESIGN RULES — DO NOT BREAK THESE

- **Font:** Figtree (loaded via Google Fonts in theme.css)
- **Background:** `#2b2b2b` (app), `#111111` (marketing)
- **Gold accent:** `#d4a853`
- **Card background:** `#383838` with `border: 1px solid #4a4a4a`, `border-radius: 16px`
- **Input fields:** `background: #3a3a3a`, `border: 1px solid #4a4a4a`, `border-radius: 10px`, `font-size: 12px`
- **Input focus:** `border-color: #d4a853`
- **Text colours:** `#e5e5e5` (primary), `#999999` (muted), `#cccccc` (secondary), `#aaaaaa` (descriptions)
- **Icons:** Lucide React, monochrome ONLY — never coloured icons, never emoji in the app UI
- **Buttons:** Always use the `GhostButton` component — never create raw `<button>` elements in the app
- **No localStorage/sessionStorage** — auth uses httpOnly cookies

---

## STEP 0 — SSH INTO SERVER

```bash
ssh root@78.111.89.140
# Password: IIi6gg4yHP6Fun7F
```

All commands in this playbook run on the server unless stated otherwise.

---

## STEP 1 — INSTALL BACKEND DEPENDENCIES

```bash
cd /opt/ghostpost
npm install bcryptjs jsonwebtoken cookie-parser
```

---

## STEP 2 — RUN DATABASE MIGRATION

Create the file:

```bash
cat > /opt/ghostpost/src/db/migrations/020-user-auth.sql << 'SQLEOF'
-- Sprint 20: User authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Backfill existing user 1 as onboarding complete
UPDATE users SET onboarding_complete = TRUE WHERE id = 1;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
SQLEOF
```

Run it:

```bash
psql -U ghostpost -d ghostpost -f /opt/ghostpost/src/db/migrations/020-user-auth.sql
```

---

## STEP 3 — CREATE AUTH MIDDLEWARE

Create `/opt/ghostpost/src/middleware/auth.js`:

```javascript
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
```

---

## STEP 4 — CREATE USER AUTH ROUTES

Create `/opt/ghostpost/src/routes/user-auth.js`:

```javascript
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { generateToken, JWT_SECRET } = require('../middleware/auth');

function registerUserAuthRoutes(app) {

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!email || !password || !name) return res.status(400).json({ error: 'Name, email, and password are required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await db.query(
        `INSERT INTO users (name, email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, name, email, onboarding_complete`,
        [name, email, passwordHash]
      );
      const user = result.rows[0];
      const token = generateToken(user);
      res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
      console.log(`[Auth] New user registered: ${email} (id: ${user.id})`);
      res.status(201).json({ user, token });
    } catch (err) {
      console.error('[Auth] Signup error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      const result = await db.query(
        'SELECT id, name, email, password_hash, onboarding_complete, x_auth_status, x_username FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

      const user = result.rows[0];
      if (!user.password_hash) return res.status(401).json({ error: 'Account not set up for password login' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      const token = generateToken(user);
      res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
      const { password_hash, ...safeUser } = user;
      console.log(`[Auth] User logged in: ${email} (id: ${user.id})`);
      res.json({ user: safeUser, token });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await db.query(
        'SELECT id, name, email, onboarding_complete, x_auth_status, x_username FROM users WHERE id = $1',
        [decoded.id]
      );
      if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
      res.json({ user: result.rows[0] });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.patch('/api/auth/onboarding-complete', async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      await db.query('UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1', [decoded.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/auth/profile', async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const { name, email } = req.body;
      const updates = []; const values = []; let idx = 1;
      if (name) { updates.push(`name = $${idx++}`); values.push(name); }
      if (email) { updates.push(`email = $${idx++}`); values.push(email); }
      if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
      updates.push(`updated_at = NOW()`);
      values.push(decoded.id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      const result = await db.query('SELECT id, name, email, onboarding_complete FROM users WHERE id = $1', [decoded.id]);
      res.json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerUserAuthRoutes };
```

---

## STEP 5 — CREATE DASHBOARD STATS ROUTE

Create `/opt/ghostpost/src/routes/stats.js`:

```javascript
const db = require('../config/database');

function registerStatsRoutes(app) {

  app.get('/api/stats/dashboard/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const tweets = await db.query('SELECT COUNT(*) as total FROM observed_tweets');
      const opps = await db.query('SELECT COUNT(*) as total FROM opportunities WHERE user_id = $1', [userId]);
      const drafts = await db.query("SELECT COUNT(*) as pending FROM drafts WHERE user_id = $1 AND status = 'pending'", [userId]);
      const posted = await db.query('SELECT COUNT(*) as total FROM posted_replies WHERE user_id = $1', [userId]);

      const weeklyScanned = await db.query(`
        SELECT date_trunc('day', observed_at)::date as day, COUNT(*) as scanned
        FROM observed_tweets WHERE observed_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1 ORDER BY 1
      `);
      const weeklyReplies = await db.query(`
        SELECT date_trunc('day', posted_at)::date as day, COUNT(*) as replies
        FROM posted_replies WHERE user_id = $1 AND posted_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1 ORDER BY 1
      `, [userId]);

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const chart = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        chart.push({
          day: dayNames[d.getDay()],
          scanned: parseInt(weeklyScanned.rows.find(r => r.day === dateStr)?.scanned || 0),
          replies: parseInt(weeklyReplies.rows.find(r => r.day === dateStr)?.replies || 0),
        });
      }

      res.json({
        stats: {
          tweets_scanned: parseInt(tweets.rows[0].total),
          opportunities_found: parseInt(opps.rows[0].total),
          drafts_pending: parseInt(drafts.rows[0].pending),
          replies_posted: parseInt(posted.rows[0].total),
        },
        chart,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerStatsRoutes };
```

---

## STEP 6 — FIX DRAFTS QUERY (ADD ENGAGEMENT DATA)

In `/opt/ghostpost/src/routes/drafts.js`, find this exact block:

```javascript
      const result = await db.query(
        `SELECT d.*, ot.content as tweet_content, ot.author_handle, ot.tweet_url
         FROM drafts d
         JOIN opportunities o ON o.id = d.opportunity_id
         JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
         WHERE d.user_id = $1 AND d.status = $2
         ORDER BY d.created_at DESC`,
        [userId, status]
      );
```

Replace it with:

```javascript
      const result = await db.query(
        `SELECT d.*, ot.content as tweet_content, ot.author_handle,
                ot.engagement_likes, ot.engagement_replies, ot.engagement_retweets,
                CASE WHEN ot.tweet_id IS NOT NULL
                  THEN 'https://x.com/' || ot.author_handle || '/status/' || ot.tweet_id
                  ELSE NULL END as tweet_url
         FROM drafts d
         LEFT JOIN opportunities o ON o.id = d.opportunity_id
         LEFT JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
         WHERE d.user_id = $1 AND d.status = $2
         ORDER BY d.created_at DESC`,
        [userId, status]
      );
```

The change: adds `engagement_likes`, `engagement_replies`, `engagement_retweets` columns, and changes `JOIN` to `LEFT JOIN` so drafts without tweets still show.

---

## STEP 7 — FIX TRACKED PROFILES QUERY (ADD LAST SCANNED)

In `/opt/ghostpost/src/routes/tracked-profiles.js`, find the GET handler query and replace it:

Find:
```javascript
      const profiles = await db.query(
        `SELECT tp.*, 
                COUNT(DISTINCT ot.tweet_id) as tweet_count,
                COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending') as pending_opportunities
         FROM tracked_profiles tp
         LEFT JOIN observed_tweets ot ON ot.author_handle = tp.x_handle AND ot.user_id = tp.user_id
         LEFT JOIN opportunities o ON o.user_id = tp.user_id AND o.tweet_id IN (
           SELECT tweet_id FROM observed_tweets WHERE author_handle = tp.x_handle
         )
         WHERE tp.user_id = $1
         GROUP BY tp.id
         ORDER BY tp.added_at DESC`,
        [req.params.userId]
      );
```

Replace with:
```javascript
      const profiles = await db.query(
        `SELECT tp.*,
                COUNT(DISTINCT ot.tweet_id) as tweet_count,
                COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('new', 'pending')) as pending_opportunities,
                MAX(os.started_at) as last_scanned_at
         FROM tracked_profiles tp
         LEFT JOIN observed_tweets ot ON LOWER(ot.author_handle) = LOWER(tp.x_handle)
         LEFT JOIN opportunities o ON o.user_id = tp.user_id AND o.tweet_id = ot.tweet_id
         LEFT JOIN observation_sessions os ON os.user_id = tp.user_id
         WHERE tp.user_id = $1
         GROUP BY tp.id
         ORDER BY tp.priority ASC, tp.added_at DESC`,
        [req.params.userId]
      );
```

The change: adds `last_scanned_at` from observation_sessions, fixes the opportunity join, and sorts by priority.

---

## STEP 8 — PATCH SERVER.JS

In `/opt/ghostpost/src/server.js`:

**8a.** After `const adminRoutes = require('./routes/admin');` (around line 24), add:

```javascript
const cookieParser = require('cookie-parser');
const { registerUserAuthRoutes } = require('./routes/user-auth');
const { registerStatsRoutes } = require('./routes/stats');
```

**8b.** After `app.use(express.json());` (line 27), add:

```javascript
app.use(cookieParser());
```

**8c.** After `registerPostingRoutes(app);` (around line 79), add:

```javascript
// User auth routes (Sprint 20)
registerUserAuthRoutes(app);

// Dashboard stats routes (Sprint 20)
registerStatsRoutes(app);
```

**8d.** Add JWT secret to `/opt/ghostpost/.env`:

```bash
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> /opt/ghostpost/.env
```

---

## STEP 9 — REPLACE THE FRONTEND

```bash
cd /opt/ghostpost

# Backup old client
mv client client-old-sprint10

# Clone new UI
git clone https://github.com/Arbor-Prime/Ghostpostu.git client

cd client
```

---

## STEP 10 — RENAME NEW FILES

The repo has `-new` suffix files that need to replace originals:

```bash
cd /opt/ghostpost/client
mv src/app/App-new.tsx src/app/App.tsx
mv src/app/routes-new.ts src/app/routes.ts
```

---

## STEP 11 — UPDATE CLIENT package.json

Replace `/opt/ghostpost/client/package.json` entirely with:

```json
{
  "name": "ghostpost-ui",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@novnc/novnc": "1.4.0",
    "socket.io-client": "4.8.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "tailwind-merge": "3.2.0",
    "lucide-react": "0.487.0",
    "react-router": "7.13.0",
    "recharts": "2.15.2",
    "tw-animate-css": "1.3.8",
    "motion": "12.23.24",
    "@radix-ui/react-accordion": "1.2.3",
    "@radix-ui/react-avatar": "1.1.3",
    "@radix-ui/react-checkbox": "1.1.4",
    "@radix-ui/react-dialog": "1.1.6",
    "@radix-ui/react-dropdown-menu": "2.1.6",
    "@radix-ui/react-label": "2.1.2",
    "@radix-ui/react-popover": "1.1.6",
    "@radix-ui/react-progress": "1.1.2",
    "@radix-ui/react-scroll-area": "1.2.3",
    "@radix-ui/react-select": "2.1.6",
    "@radix-ui/react-separator": "1.1.2",
    "@radix-ui/react-slot": "1.1.2",
    "@radix-ui/react-switch": "1.1.3",
    "@radix-ui/react-tabs": "1.1.3",
    "@radix-ui/react-toggle": "1.1.2",
    "@radix-ui/react-toggle-group": "1.1.2",
    "@radix-ui/react-tooltip": "1.1.8",
    "sonner": "2.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.1.12",
    "@types/react": "18.3.0",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.7.0",
    "tailwindcss": "4.1.12",
    "typescript": "5.5.0",
    "vite": "6.3.5"
  }
}
```

---

## STEP 12 — UPDATE vite.config.ts

Replace `/opt/ghostpost/client/vite.config.ts` with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/websockify': { target: 'http://localhost:6080', ws: true },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
});
```

---

## STEP 13 — WIRE EACH SCREEN TO THE BACKEND

Now you wire each screen. For each screen below, open the file and make the changes described.

### 13.1 — AppLayout.tsx — Add ProtectedRoute

Open `/opt/ghostpost/client/src/app/components/layout/AppLayout.tsx`.

Add this import at the top:
```typescript
import { ProtectedRoute } from '../../lib/ProtectedRoute';
```

Wrap the return JSX in `<ProtectedRoute>`:

```typescript
export function AppLayout() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'GhostPost';
  const isBrowserView = location.pathname === '/browser';

  return (
    <ProtectedRoute>
      <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#2b2b2b', padding: '10px 10px 10px 0' }}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#313131', borderRadius: 20, border: '1px solid #444444' }}>
          {!isBrowserView && <Header title={title} />}
          <main className={`flex-1 overflow-auto ${isBrowserView ? '' : 'px-7 pb-7'}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
```

### 13.2 — Header.tsx — Real User Initials + Logout

Open `/opt/ghostpost/client/src/app/components/layout/Header.tsx`.

Replace the entire file with:

```typescript
import { Search, Sparkles, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { GhostButton } from '../ui/GhostButton';
import { useAuth } from '../../lib/auth-context';

export function Header({ title }: { title: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex items-center justify-between px-7 pt-7 pb-4">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e5e5e5', letterSpacing: '-0.02em' }}>{title}</h1>
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 px-3.5 py-2 cursor-pointer hover:border-[#555555] transition-colors"
          style={{ background: '#3a3a3a', border: '1px solid #4a4a4a', borderRadius: 10, minWidth: 170 }}
        >
          <Search size={14} strokeWidth={1.5} className="text-[#888888]" />
          <span style={{ fontSize: 13, color: '#888888' }}>Search</span>
        </div>
        <GhostButton variant="gold" size="md" icon={<Sparkles size={13} strokeWidth={1.5} />}>
          Ask AI
        </GhostButton>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #d4a853, #c49a3e)' }}
          title={user?.name || 'User'}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{initials}</span>
        </div>
        <div
          onClick={handleLogout}
          className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#444444] transition-colors"
          style={{ background: '#3a3a3a', border: '1px solid #4a4a4a' }}
          title="Sign out"
        >
          <LogOut size={13} strokeWidth={1.5} className="text-[#999999]" />
        </div>
      </div>
    </div>
  );
}
```

### 13.3 — Dashboard.tsx — Real API Data

Open `/opt/ghostpost/client/src/app/components/screens/Dashboard.tsx`.

Add these imports at the top:
```typescript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
```

Replace the hardcoded `stats` array with state. Inside the `Dashboard` function, BEFORE the return, add:

```typescript
const { user } = useAuth();
const [dashData, setDashData] = useState<any>(null);
const [liveEvts, setLiveEvts] = useState<{ time: string; text: string }[]>([]);

useEffect(() => {
  if (!user) return;
  api.get(`/stats/dashboard/${user.id}`).then(setDashData).catch(console.error);
}, [user]);

useEffect(() => {
  const socket = io({ path: '/socket.io' });
  socket.on('observer:tweet_found', (e: any) => {
    setLiveEvts((prev) => [{ time: new Date().toLocaleTimeString('en-GB'), text: `Scanned tweet from @${e.author || 'unknown'}` }, ...prev].slice(0, 10));
  });
  socket.on('draft:generated', (e: any) => {
    setLiveEvts((prev) => [{ time: new Date().toLocaleTimeString('en-GB'), text: `Draft generated for opportunity #${e.opportunityId || '?'}` }, ...prev].slice(0, 10));
  });
  socket.on('reply:posted', (e: any) => {
    setLiveEvts((prev) => [{ time: new Date().toLocaleTimeString('en-GB'), text: `Reply posted to @${e.author || 'unknown'}` }, ...prev].slice(0, 10));
  });
  return () => { socket.disconnect(); };
}, []);
```

Then update the stat cards to use real data. Replace the hardcoded `stats` const with:

```typescript
const stats = dashData ? [
  { label: 'Tweets Scanned', value: dashData.stats.tweets_scanned.toLocaleString(), change: '', up: true },
  { label: 'Opportunities Found', value: dashData.stats.opportunities_found.toLocaleString(), change: '', up: true },
  { label: 'Drafts Pending', value: dashData.stats.drafts_pending.toLocaleString(), change: '', up: false },
  { label: 'Replies Posted', value: dashData.stats.replies_posted.toLocaleString(), change: '', up: true },
] : [
  { label: 'Tweets Scanned', value: '—', change: '', up: true },
  { label: 'Opportunities Found', value: '—', change: '', up: true },
  { label: 'Drafts Pending', value: '—', change: '', up: false },
  { label: 'Replies Posted', value: '—', change: '', up: true },
];
```

Replace the hardcoded `chartData` with:

```typescript
const chartData = dashData?.chart || [];
```

Replace the hardcoded `liveEvents` with:

```typescript
const liveEvents = liveEvts.length > 0 ? liveEvts : [
  { time: '—', text: 'Waiting for live events...' },
];
```

### 13.4 — BrowserView.tsx — Real noVNC

Open `/opt/ghostpost/client/src/app/components/screens/BrowserView.tsx`.

Add at the top:
```typescript
import { useEffect, useRef } from 'react';
import RFB from '@novnc/novnc/core/rfb.js';
```

Inside the `BrowserView` function, add:

```typescript
const vncRef = useRef<HTMLDivElement>(null);
const rfbRef = useRef<any>(null);

useEffect(() => {
  if (!vncRef.current) return;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.hostname}/websockify`;

  try {
    rfbRef.current = new RFB(vncRef.current, wsUrl, {
      scaleViewport: true,
      resizeSession: false,
      showDotCursor: true,
    });
    rfbRef.current.background = '#1a1a1a';
  } catch (err) {
    console.error('VNC connection failed:', err);
  }

  return () => {
    if (rfbRef.current) {
      rfbRef.current.disconnect();
      rfbRef.current = null;
    }
  };
}, []);
```

Then find the browser viewport section (the `<div className="flex-1 bg-white m-3 overflow-hidden"` that contains the static Instagram mockup) and replace the ENTIRE div and its children with:

```typescript
<div ref={vncRef} className="flex-1 m-3 overflow-hidden" style={{ borderRadius: 12, border: '1px solid #555555', background: '#1a1a1a' }} />
```

### 13.5 — Approvals.tsx — Real Drafts

Open `/opt/ghostpost/client/src/app/components/screens/Approvals.tsx`.

Add imports:
```typescript
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
```

Inside the `Approvals` function, add state and fetch:

```typescript
const { user } = useAuth();
const [drafts, setDrafts] = useState<any[]>([]);

const fetchDrafts = async () => {
  if (!user) return;
  try {
    const data = await api.get(`/drafts/${user.id}?status=${filter === 'all' ? 'pending' : filter}`);
    setDrafts(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('Failed to fetch drafts:', err);
  }
};

useEffect(() => { fetchDrafts(); }, [user, filter]);

const handleApprove = async (id: number) => {
  await api.post(`/drafts/${id}/approve`);
  fetchDrafts();
};

const handleReject = async (id: number) => {
  await api.post(`/drafts/${id}/reject`);
  fetchDrafts();
};

const handleRegenerate = async (id: number) => {
  await api.post(`/drafts/${id}/regenerate`);
  fetchDrafts();
};
```

Remove the hardcoded `drafts` const at the top. Update `filtered` to use the real drafts state:

```typescript
const filtered = filter === 'all' ? drafts : drafts.filter((d: any) => d.status === filter);
```

Map the real data fields to the card display:
- `draft.author_handle` → `@${draft.author_handle}`
- `draft.tweet_content` → tweet text
- `draft.reply_text` → reply text
- `draft.engagement_likes` → likes count (format with `.toLocaleString()` or show `'—'` if null)
- `draft.engagement_replies` → replies count
- `draft.engagement_retweets` → retweets count
- `draft.response_type` → Type badge
- `draft.actual_word_count` → word count
- `draft.circadian_mood` → Mood badge
- `draft.energy_level` → `Math.round(draft.energy_level * 100) + '%'`

Wire the action buttons:
- Approve → `onClick={() => handleApprove(draft.id)}`
- Reject → `onClick={() => handleReject(draft.id)}`
- Regenerate → `onClick={() => handleRegenerate(draft.id)}`

### 13.6 — TrackedProfiles.tsx — Real Profiles

Add imports:
```typescript
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
```

Replace hardcoded `profiles` with:

```typescript
const { user } = useAuth();
const [profiles, setProfiles] = useState<any[]>([]);

const fetchProfiles = async () => {
  if (!user) return;
  const data = await api.get(`/tracked-profiles/${user.id}`);
  setProfiles(Array.isArray(data) ? data : []);
};

useEffect(() => { fetchProfiles(); }, [user]);
```

Update the "Add Profile" button to call:
```typescript
const handleAdd = async () => {
  const handle = prompt('Enter X handle (without @):');
  if (!handle || !user) return;
  await api.post(`/tracked-profiles/${user.id}`, { x_handle: handle });
  fetchProfiles();
};
```

Update the "Scan" button to call:
```typescript
onClick={async () => {
  await api.post(`/tracked-profiles/${p.id}/scan`);
  fetchProfiles();
}}
```

Map fields:
- `p.x_handle` → `@${p.x_handle}`
- `p.tweet_count` → Scanned count
- `p.pending_opportunities` → Opportunities count
- `p.priority` → priority indicator (1-3 = gold, 4+ = grey)
- `p.last_scanned_at` → format as relative time ("2m ago", "1h ago", etc.) — use a helper:

```typescript
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```

### 13.7 — VoiceProfile.tsx — Real Profile Data

Add imports:
```typescript
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
```

Add fetch:
```typescript
const { user } = useAuth();
const [profile, setProfile] = useState<any>(null);

useEffect(() => {
  if (!user) return;
  api.get(`/voice/profile/${user.id}`).then((data) => {
    if (data.voice_profile) setProfile(data.voice_profile);
  });
}, [user]);
```

Map API data to UI (replace hardcoded values with profile data):
- `profile.formality` (0-1) → multiply by 100 for the Formal/Casual slider
- `profile.directness` (0-1) → multiply by 100 for the Reserved/Direct slider
- `profile.expressiveness` (0-1) → multiply by 100 for the Reserved/Expressive slider (fallback to `profile.emotional_range?.passion || 0.5`)
- `profile.primary_topics` → topics array
- `profile.signature_words` → signature words array
- `profile.anti_words` → anti-words array
- `profile.emotional_range` → emotional bars (multiply each value by 100)
- `profile.format_prefs` → format preferences grid
- `profile.off_limits` → off-limits topics array
- `profile.summary_quote` → the italic quote text

### 13.8 — PersonaSchedule.tsx — Complete Onboarding

Add imports:
```typescript
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
```

Fetch circadian data and map to personas:
```typescript
const { user } = useAuth();

useEffect(() => {
  if (!user) return;
  api.get(`/persona/circadian/${user.id}`).then((data) => {
    if (Array.isArray(data)) {
      // Map 24-hour data to 8 persona windows — average energy per window
      // The UI already has hardcoded personas matching these windows, so just update energy values
    }
  });
}, [user]);
```

Update the "Generate schedule" button to:
```typescript
onClick={async () => {
  if (!user) return;
  await api.post(`/persona/generate/${user.id}`);
  await api.patch('/auth/onboarding-complete');
  navigate('/dashboard');
}}
```

### 13.9 — Recording.tsx — Real Audio Capture

Add imports:
```typescript
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
```

Add real MediaRecorder logic. Add refs:
```typescript
const { user } = useAuth();
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const chunksRef = useRef<Blob[]>([]);
const streamRef = useRef<MediaStream | null>(null);
```

Replace the Record button onClick to start real recording:
```typescript
onClick={async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    setIsRecording(true);
  } catch (err) {
    console.error('Microphone access denied:', err);
  }
}}
```

Replace the Pause button to pause/resume real recording:
```typescript
onClick={() => {
  if (!mediaRecorderRef.current) return;
  if (isPaused) { mediaRecorderRef.current.resume(); }
  else { mediaRecorderRef.current.pause(); }
  setIsPaused(!isPaused);
}}
```

Replace the Stop button to stop real recording:
```typescript
onClick={() => {
  if (mediaRecorderRef.current) {
    mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }
  setIsRecording(false);
  setIsPaused(false);
}}
```

Replace the Done button to upload and navigate:
```typescript
onClick={async () => {
  if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
    mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }
  // Wait for chunks to finalize
  await new Promise(r => setTimeout(r, 200));
  
  const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  formData.append('userId', String(user?.id));
  
  navigate('/onboarding/processing');
  
  // Upload in background
  api.upload(`/voice/upload?userId=${user?.id}`, formData).catch(console.error);
}}
```

### 13.10 — Settings.tsx — Real Health Data

In the "system-health" section, replace the hardcoded `services` array with a fetch:

```typescript
const [healthData, setHealthData] = useState<any>(null);

useEffect(() => {
  if (activeCategory === 'system-health') {
    api.get('/health').then(setHealthData).catch(console.error);
  }
}, [activeCategory]);

const services = healthData ? [
  { name: 'Database', status: healthData.services.database === 'connected' ? 'running' : 'down' },
  { name: 'Redis', status: healthData.services.redis === 'connected' ? 'running' : 'down' },
  { name: 'Ollama', status: healthData.services.ollama?.includes('running') ? 'running' : 'down' },
  { name: 'Playwright', status: healthData.services.playwright === 'available' ? 'running' : 'down' },
] : [
  { name: 'Database', status: 'running' },
  { name: 'Redis', status: 'running' },
  { name: 'Ollama', status: 'running' },
  { name: 'Playwright', status: 'down' },
];
```

Add `import { api } from '../../lib/api';` at the top.

### 13.11 — Onboarding Screens — Add ProtectedRoute

For each of these files:
- `Recording.tsx`
- `Processing.tsx`
- `VoiceProfile.tsx`
- `PersonaSchedule.tsx`
- `Welcome.tsx`

Add import:
```typescript
import { ProtectedRoute } from '../../lib/ProtectedRoute';
```

Wrap the return in ProtectedRoute:
```typescript
return (
  <ProtectedRoute>
    {/* existing JSX */}
  </ProtectedRoute>
);
```

---

## STEP 14 — DELETE UNUSED FILES

```bash
cd /opt/ghostpost/client
rm -f src/app/components/screens/XAuth.tsx
rm -rf src/app/components/figma/
rm -rf src/imports/
rm -rf backend-additions/
rm -rf guidelines/
rm -f ATTRIBUTIONS.md
```

---

## STEP 15 — INSTALL AND BUILD

```bash
cd /opt/ghostpost/client
npm install
npm run build
```

If the build fails, fix errors one at a time. Common issues:
- TypeScript type errors: add `// @ts-ignore` above the line or fix the type
- Missing imports: check the import path
- RFB import: if noVNC types fail, add `declare module '@novnc/novnc/core/rfb.js';` in a `src/types.d.ts` file

---

## STEP 16 — UPDATE NGINX

Replace `/etc/nginx/sites-enabled/ghostpost` with:

```nginx
server {
    listen 80;
    server_name refhut.com 78.111.89.140;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /websockify {
        proxy_pass http://127.0.0.1:6080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Test and reload:
```bash
nginx -t && systemctl reload nginx
```

---

## STEP 17 — RESTART SERVER

```bash
cd /opt/ghostpost
pkill -9 -f node
node src/server.js 2>&1 | tee /tmp/gp.log &
```

---

## STEP 18 — TEST

1. Open `http://78.111.89.140` → Marketing page should load
2. Click "Get started" → Goes to `/signup`
3. Create account (any email/password) → Redirects to `/onboarding/recording`
4. Skip through onboarding or complete it → Lands on `/dashboard`
5. Check `/dashboard` shows real numbers
6. Check `/browser` shows noVNC
7. Check `/approvals` shows real drafts
8. Check `/tracked-profiles` shows real profiles
9. Check `/settings` → System Health shows green dots
10. Click logout → Back to `/login`
11. Log back in → Dashboard
12. Go to `http://78.111.89.140/dashboard` while logged out → Redirects to `/login`

---

## WHAT NOT TO DO

- DO NOT create new components that don't match the existing design language
- DO NOT use coloured icons — Lucide React monochrome only
- DO NOT use localStorage or sessionStorage
- DO NOT add console.log statements you don't clean up
- DO NOT change the gold accent colour from #d4a853
- DO NOT use emoji in the app UI (only allowed in MarketingHome marketing page)
- DO NOT create separate CSS files for app screens — use Tailwind + inline styles like every existing screen does
- DO NOT rename files unless this playbook tells you to
- DO NOT install packages this playbook doesn't list
