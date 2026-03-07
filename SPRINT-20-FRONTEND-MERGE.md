# Sprint 20 — Frontend Merge & Authentication

## Objective
Replace the broken Sprint 10 frontend with the new Figma Make UI (from `Ghostpostu` repo), integrate the marketing homepage, add user authentication, and wire all screens to the live GhostPost backend.

**Result:** One unified React app served from the VPS. Marketing page is public. Everything else is behind login.

---

## Server Details
- **VPS:** 78.111.89.140
- **Code:** `/opt/ghostpost/`
- **Port:** 3000 (Node), 80 (nginx), 6080 (websockify/noVNC)
- **DB:** PostgreSQL `ghostpost` database
- **Process:** `node src/server.js` (currently managed via shell, not PM2)
- **GitHub:** https://github.com/Arbor-Prime/ghostpost.git
- **Branch:** Create `sprint-20-frontend-merge` from current `sprint-18-linkedin-content-and-results`

## Source Repos
- **New UI:** https://github.com/Arbor-Prime/Ghostpostu.git (Figma Make output — React/TS/Tailwind/shadcn)
- **Marketing site:** Fetch from https://ghostpost-marketing-website-design.vercel.app/ (static HTML/CSS/JS)
- **Current backend:** `/opt/ghostpost/src/` on the server

---

## Architecture

```
Route Map:
/                        → Marketing homepage (public)
/login                   → Login page (public)
/signup                  → Signup page (public)
/onboarding/recording    → Voice recording (authed, post-signup)
/onboarding/processing   → Processing animation (authed)
/onboarding/voice-profile → Voice profile review (authed)
/onboarding/persona-schedule → Persona schedule (authed)
/onboarding/x-auth       → REMOVED — replaced by /browser
/dashboard               → Dashboard (authed, AppLayout with sidebar)
/browser                 → Browser View with noVNC (authed)
/approvals               → Draft approvals (authed)
/tracked-profiles        → Tracked profiles (authed)
/personas                → Persona management (authed)
/ai-composition          → AI composition tools (authed)
/simulation              → Simulation (authed)
/settings                → Settings (authed)
```

---

## Part 1 — Database Migration (020-user-auth.sql)

The existing `users` table has no email/password. Add:

```sql
-- /opt/ghostpost/src/db/migrations/020-user-auth.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_auth_status VARCHAR(20) DEFAULT 'disconnected';
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

Run manually:
```bash
psql -U ghostpost -d ghostpost -f /opt/ghostpost/src/db/migrations/020-user-auth.sql
```

---

## Part 2 — Backend Auth System

### 2.1 Install dependencies

```bash
cd /opt/ghostpost
npm install bcryptjs jsonwebtoken cookie-parser
```

### 2.2 Create `/opt/ghostpost/src/middleware/auth.js`

JWT middleware that protects API routes. Uses httpOnly cookies for security.

```javascript
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'ghostpost-jwt-secret-change-in-production';

function authenticateToken(req, res, next) {
  // Check httpOnly cookie first, then Authorization header
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, name }
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

### 2.3 Create `/opt/ghostpost/src/routes/user-auth.js`

New auth routes for signup/login/logout/me:

```javascript
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { generateToken } = require('../middleware/auth');

function registerUserAuthRoutes(app) {

  // POST /api/auth/signup
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Check if email already exists
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      
      const result = await db.query(
        `INSERT INTO users (name, email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, name, email, onboarding_complete`,
        [name, email, passwordHash]
      );

      const user = result.rows[0];
      const token = generateToken(user);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(201).json({ user, token });
    } catch (err) {
      console.error('[Auth] Signup error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await db.query(
        'SELECT id, name, email, password_hash, onboarding_complete FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = generateToken(user);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const { password_hash, ...safeUser } = user;
      res.json({ user: safeUser, token });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
  });

  // GET /api/auth/me (protected)
  app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../middleware/auth');
      const decoded = jwt.verify(token, JWT_SECRET);
      
      const result = await db.query(
        'SELECT id, name, email, onboarding_complete, x_auth_status, x_username FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json({ user: result.rows[0] });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // PATCH /api/auth/onboarding-complete (protected)
  app.patch('/api/auth/onboarding-complete', async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../middleware/auth');
      const decoded = jwt.verify(token, JWT_SECRET);

      await db.query(
        'UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1',
        [decoded.id]
      );

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerUserAuthRoutes };
```

### 2.4 Update `server.js`

Add near the top imports:
```javascript
const cookieParser = require('cookie-parser');
const { registerUserAuthRoutes } = require('./routes/user-auth');
```

Add before route registrations:
```javascript
app.use(cookieParser());
```

Add after existing auth routes:
```javascript
// User auth routes (Sprint 20 — login/signup)
registerUserAuthRoutes(app);
```

Add to `.env`:
```
JWT_SECRET=generate-a-proper-random-secret-here
```

---

## Part 3 — Replace Client Frontend

### 3.1 Remove old client, install new

```bash
cd /opt/ghostpost
rm -rf client
```

Clone the Figma Make UI into `client/`:
```bash
git clone https://github.com/Arbor-Prime/Ghostpostu.git client-new
mv client-new client
cd client
```

### 3.2 Update `package.json`

The Figma Make `package.json` uses peerDependencies for React. Fix it:

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
    "socket.io-client": "^4.7.0",
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

### 3.3 Update `vite.config.ts`

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

### 3.4 Install and build

```bash
cd /opt/ghostpost/client
npm install
npm run build
```

---

## Part 4 — New Files to Create

### 4.1 API Client — `src/app/lib/api.ts`

Central API client with auth token handling:

```typescript
const API_BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // sends httpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Token expired — redirect to login
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return res;
}

export const api = {
  get: (path: string) => request(path).then(r => r.json()),
  post: (path: string, body?: any) =>
    request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }).then(r => r.json()),
  patch: (path: string, body?: any) =>
    request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }).then(r => r.json()),
  delete: (path: string) =>
    request(path, { method: 'DELETE' }).then(r => r.json()),
};
```

### 4.2 Auth Context — `src/app/lib/auth-context.tsx`

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';

interface User {
  id: number;
  name: string;
  email: string;
  onboarding_complete: boolean;
  x_auth_status?: string;
  x_username?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.post('/auth/login', { email, password });
    if (data.error) throw new Error(data.error);
    setUser(data.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    const data = await api.post('/auth/signup', { name, email, password });
    if (data.error) throw new Error(data.error);
    setUser(data.user);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
```

### 4.3 Protected Route Wrapper — `src/app/lib/ProtectedRoute.tsx`

```typescript
import { Navigate } from 'react-router';
import { useAuth } from './auth-context';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#2b2b2b' }}>
        <div className="animate-spin w-8 h-8 border-2 border-[#d4a853] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  
  // If onboarding not complete, redirect to onboarding
  if (!user.onboarding_complete && !window.location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/onboarding/recording" replace />;
  }

  return <>{children}</>;
}
```

### 4.4 Login Screen — `src/app/components/screens/Login.tsx`

Create a login page matching the GhostPost dark theme. Same visual style as XAuth screen but with email/password fields, a "Don't have an account? Sign up" link, and proper error handling. Use the `GhostButton` gold variant for the submit button. Include the GhostPostLogo at the top.

Fields: Email, Password. On success, redirect to `/dashboard` (if onboarding complete) or `/onboarding/recording` (if not).

### 4.5 Signup Screen — `src/app/components/screens/Signup.tsx`

Same dark theme. Fields: Full Name, Email, Password, Confirm Password. Client-side validation (password min 8 chars, passwords match). On success, redirect to `/onboarding/recording`.

### 4.6 Marketing Homepage — `src/app/components/screens/MarketingHome.tsx`

Convert the marketing site HTML into a React component. The full HTML source is at: https://ghostpost-marketing-website-design.vercel.app/

Key changes:
- Convert all the HTML to JSX (className instead of class, etc.)
- Keep the CSS as a separate file `src/styles/marketing.css` — import it
- Keep the JS animation logic (the Instagram DM demo) — convert to React useEffect hooks
- Change the nav CTA buttons: "Get early access" → navigates to `/signup`
- Add "Login" link to the nav bar
- The "Request early access →" CTA at the bottom → navigates to `/signup`
- Keep the Figtree font (already in the theme)

The CSS file for the marketing page is at: https://ghostpost-marketing-website-design.vercel.app/assets/index-Des3tyh1.css
The JS animation file is at: https://ghostpost-marketing-website-design.vercel.app/assets/index-Z5pTEf3C.js

**IMPORTANT:** Scope all marketing CSS classes under a `.marketing-page` wrapper so they don't conflict with the Tailwind-based app styles.

---

## Part 5 — Update Routes

Replace `src/app/routes.ts`:

```typescript
import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { MarketingHome } from './components/screens/MarketingHome';
import { Login } from './components/screens/Login';
import { Signup } from './components/screens/Signup';
import { Recording } from './components/screens/Recording';
import { Processing } from './components/screens/Processing';
import { VoiceProfile } from './components/screens/VoiceProfile';
import { PersonaSchedule } from './components/screens/PersonaSchedule';
import { Dashboard } from './components/screens/Dashboard';
import { BrowserView } from './components/screens/BrowserView';
import { Approvals } from './components/screens/Approvals';
import { TrackedProfiles } from './components/screens/TrackedProfiles';
import { Personas } from './components/screens/Personas';
import { AIComposition } from './components/screens/AIComposition';
import { Simulation } from './components/screens/Simulation';
import { Settings } from './components/screens/Settings';

export const router = createBrowserRouter([
  // Public routes
  { path: '/', Component: MarketingHome },
  { path: '/login', Component: Login },
  { path: '/signup', Component: Signup },

  // Onboarding (protected, no sidebar)
  { path: '/onboarding/recording', Component: Recording },
  { path: '/onboarding/processing', Component: Processing },
  { path: '/onboarding/voice-profile', Component: VoiceProfile },
  { path: '/onboarding/persona-schedule', Component: PersonaSchedule },

  // Main app (protected, with sidebar)
  {
    Component: AppLayout,
    children: [
      { path: '/dashboard', Component: Dashboard },
      { path: '/browser', Component: BrowserView },
      { path: '/approvals', Component: Approvals },
      { path: '/tracked-profiles', Component: TrackedProfiles },
      { path: '/personas', Component: Personas },
      { path: '/ai-composition', Component: AIComposition },
      { path: '/simulation', Component: Simulation },
      { path: '/settings', Component: Settings },
    ],
  },
]);
```

### 5.1 Update `App.tsx`

Wrap router in AuthProvider:

```typescript
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './lib/auth-context';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

### 5.2 Protect Routes

Wrap onboarding and AppLayout with ProtectedRoute. The `AppLayout` component should import and wrap its content:

```typescript
// In AppLayout.tsx — add at the top:
import { ProtectedRoute } from '../lib/ProtectedRoute';

// Wrap the return in ProtectedRoute:
return (
  <ProtectedRoute>
    <div className="flex h-screen w-screen overflow-hidden" ...>
      {/* existing content */}
    </div>
  </ProtectedRoute>
);
```

Do the same for each onboarding screen (Recording, Processing, VoiceProfile, PersonaSchedule).

---

## Part 6 — Wire Screens to Backend

### 6.1 Dashboard — Real Data

Replace hardcoded `stats`, `chartData`, `recentActivity`, and `liveEvents` with:

```typescript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

// In the component:
const { user } = useAuth();
const [stats, setStats] = useState(null);
const [liveEvents, setLiveEvents] = useState([]);

useEffect(() => {
  // Fetch initial stats
  api.get('/observer/stats').then(setStats).catch(console.error);
  
  // Socket.io for live events
  const socket = io({ path: '/socket.io' });
  socket.on('observer:event', (event) => {
    setLiveEvents(prev => [event, ...prev].slice(0, 20));
  });
  socket.on('reply:posted', (event) => {
    setLiveEvents(prev => [{ time: new Date().toLocaleTimeString(), text: `Reply posted to ${event.author}` }, ...prev].slice(0, 20));
  });
  
  return () => { socket.disconnect(); };
}, []);
```

Map the API response to the stat cards:
- `Tweets Scanned` → `stats.tweets_observed`
- `Opportunities Found` → `stats.opportunities_total`
- `Drafts Pending` → `stats.drafts_pending`
- `Replies Posted` → `stats.replies_posted`

### 6.2 BrowserView — noVNC Integration

Replace the static Instagram mockup in the right panel with a real noVNC connection:

```typescript
import { useEffect, useRef } from 'react';
import RFB from '@novnc/novnc/core/rfb.js';

// In BrowserView component, replace the browser viewport div:
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

// Replace the static browser viewport with:
<div ref={vncRef} className="flex-1 m-3 overflow-hidden" style={{ borderRadius: 12, border: '1px solid #555555' }} />
```

The left panel action log should connect to Socket.io for live events from the outreach engine.

### 6.3 Approvals — Real Drafts

```typescript
useEffect(() => {
  api.get('/drafts?status=pending').then(data => setDrafts(data)).catch(console.error);
}, []);

// Approve handler:
const handleApprove = async (draftId: number) => {
  await api.patch(`/drafts/${draftId}/approve`);
  // Refresh
};

// Reject handler:
const handleReject = async (draftId: number) => {
  await api.patch(`/drafts/${draftId}/reject`);
  // Refresh
};
```

### 6.4 TrackedProfiles — Real Profiles

```typescript
useEffect(() => {
  api.get('/observer/tracked-profiles').then(data => setProfiles(data)).catch(console.error);
}, []);

const handleAddProfile = async (handle: string) => {
  await api.post('/observer/tracked-profiles', { x_handle: handle });
  // Refresh
};
```

### 6.5 Recording — Real Audio Capture

Wire up the MediaRecorder API to capture audio, then POST to the voice profiling endpoint:

```typescript
// Start recording:
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  
  // Navigate to processing, upload in background
  navigate('/onboarding/processing');
  
  const res = await fetch(`/api/voice/upload/${user.id}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
};
```

### 6.6 VoiceProfile — Real Profile Data

```typescript
useEffect(() => {
  api.get(`/voice/profile/${user.id}`).then(data => {
    setProfile(data.profile);
    // Map profile fields to sliders, topics, signature words, etc.
  }).catch(console.error);
}, []);
```

### 6.7 Settings — System Health

The "System Health" tab should call `/api/health`:

```typescript
useEffect(() => {
  if (activeCategory === 'system-health') {
    api.get('/health').then(data => setHealthData(data)).catch(console.error);
  }
}, [activeCategory]);
```

Map response to the services list:
- Database → `data.services.database`
- Redis → `data.services.redis`
- Ollama → `data.services.ollama`
- Playwright → `data.services.playwright`

### 6.8 Header — User Info

Replace the hardcoded "JD" avatar with real user initials:

```typescript
import { useAuth } from '../lib/auth-context';

const { user } = useAuth();
const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

// In the avatar div:
<span>{initials}</span>
```

### 6.9 PersonaSchedule — Complete Onboarding

The "Generate schedule" button should mark onboarding as complete and redirect:

```typescript
const handleComplete = async () => {
  await api.patch('/auth/onboarding-complete');
  navigate('/dashboard');
};
```

---

## Part 7 — Remove XAuth Screen

The `XAuth.tsx` screen (manual cookie paste) is no longer needed. Users log into platforms via the Browser View (noVNC). Remove it from routes. The onboarding flow becomes:

```
Welcome → Recording → Processing → VoiceProfile → PersonaSchedule → Dashboard
```

Platform authentication happens via `/browser` after onboarding.

---

## Part 8 — Nginx Config

Update `/etc/nginx/sites-enabled/ghostpost`:

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

Then: `nginx -t && systemctl reload nginx`

---

## Part 9 — Build & Deploy

```bash
cd /opt/ghostpost/client
npm install
npm run build

cd /opt/ghostpost
# Restart server
pkill -9 -f node
node src/server.js 2>&1 | tee /tmp/gp.log &
```

---

## Part 10 — Verification Checklist

1. `http://refhut.com/` → Marketing homepage loads, animations play
2. Click "Get early access" → Goes to `/signup`
3. Create account → Redirects to `/onboarding/recording`
4. Complete onboarding flow → Lands on `/dashboard`
5. Dashboard shows real stats from API
6. `/browser` shows live noVNC stream
7. `/approvals` shows real pending drafts
8. `/tracked-profiles` shows real profiles
9. `/settings` → System Health shows live service status
10. Logout → Back to marketing page
11. Login → Back to dashboard
12. Direct URL `/dashboard` when not logged in → Redirects to `/login`

---

## Design Rules

- **Font:** Figtree (already loaded via Google Fonts in theme.css)
- **Theme:** Dark (#2b2b2b background, #d4a853 gold accent)
- **Icons:** Lucide React, monochrome only — NO emoji icons in the app
- **Buttons:** Use the existing GhostButton component (7 variants)
- **Border radius:** 14-16px for cards, 10px for inputs, 20px for pills
- **Borders:** 1px solid #444444 (standard), #4a4a4a (elevated)

---

## Files Changed Summary

### New Files
- `src/middleware/auth.js`
- `src/routes/user-auth.js`
- `src/db/migrations/020-user-auth.sql`
- `client/src/app/lib/api.ts`
- `client/src/app/lib/auth-context.tsx`
- `client/src/app/lib/ProtectedRoute.tsx`
- `client/src/app/components/screens/Login.tsx`
- `client/src/app/components/screens/Signup.tsx`
- `client/src/app/components/screens/MarketingHome.tsx`
- `client/src/styles/marketing.css`

### Modified Files
- `src/server.js` (add cookie-parser, user-auth routes)
- `client/src/app/App.tsx` (AuthProvider wrapper)
- `client/src/app/routes.ts` (new route map)
- `client/src/app/components/layout/AppLayout.tsx` (ProtectedRoute wrapper)
- `client/src/app/components/layout/Header.tsx` (real user initials + logout)
- `client/src/app/components/screens/Dashboard.tsx` (real API + Socket.io)
- `client/src/app/components/screens/BrowserView.tsx` (noVNC integration)
- `client/src/app/components/screens/Approvals.tsx` (real drafts API)
- `client/src/app/components/screens/TrackedProfiles.tsx` (real profiles API)
- `client/src/app/components/screens/Recording.tsx` (real MediaRecorder)
- `client/src/app/components/screens/VoiceProfile.tsx` (real profile data)
- `client/src/app/components/screens/PersonaSchedule.tsx` (complete onboarding)
- `client/src/app/components/screens/Settings.tsx` (real health API)
- `client/package.json` (add react, react-dom, socket.io-client, @novnc/novnc)
- `client/vite.config.ts` (proxy config + build output)

### Removed Files
- `client/src/app/components/screens/XAuth.tsx`
- `client/src/app/components/screens/Welcome.tsx` (replaced by MarketingHome at `/`)

### Nginx
- `/etc/nginx/sites-enabled/ghostpost` (updated config)

---

## ADDENDUM: All Missing Code Created

All missing files have been built and pushed to the Ghostpostu repo (https://github.com/Arbor-Prime/Ghostpostu.git).

### Frontend (in Ghostpostu repo):
- `src/app/components/screens/Login.tsx` — Login page (dark theme, matches XAuth design)
- `src/app/components/screens/Signup.tsx` — Registration page (password validation indicators)
- `src/app/components/screens/MarketingHome.tsx` — Full marketing page with live Instagram DM demo
- `src/styles/marketing.css` — Scoped CSS for marketing page
- `src/app/lib/api.ts` — API client (credentials, 401 redirect, upload support)
- `src/app/lib/auth-context.tsx` — React auth context (login/signup/logout/refreshUser)
- `src/app/lib/ProtectedRoute.tsx` — Route guard (redirects to login or onboarding)
- `src/app/routes-new.ts` — Updated route map (rename to routes.ts)
- `src/app/App-new.tsx` — Updated App with AuthProvider (rename to App.tsx)

### Backend (in Ghostpostu repo under backend-additions/):
- `middleware/auth.js` → copy to `/opt/ghostpost/src/middleware/auth.js`
- `routes/user-auth.js` → copy to `/opt/ghostpost/src/routes/user-auth.js`
- `routes/stats.js` → copy to `/opt/ghostpost/src/routes/stats.js`
- `routes/drafts-query-fix.js` → apply to `/opt/ghostpost/src/routes/drafts.js`
- `routes/tracked-profiles-query-fix.js` → apply to `/opt/ghostpost/src/routes/tracked-profiles.js`
- `db/migrations/020-user-auth.sql` → copy to `/opt/ghostpost/src/db/migrations/`
- `SERVER-PATCH-INSTRUCTIONS.js` → follow instructions to patch server.js
