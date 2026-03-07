# GhostPost Sprint 19 — Replace CDP Screencast with noVNC

## READ THIS FIRST

You are working on GhostPost. Server access below. SSH in and explore the existing codebase before making any changes.

## Server Access

- **IP:** 78.111.89.140
- **SSH:** `ssh root@78.111.89.140`
- **Password:** `IIi6gg4yHP6Fun7F`
- **OS:** Ubuntu 24.04.4 LTS
- **Node:** v20.20.0
- **App dir:** `/opt/ghostpost/`
- **Frontend:** `/opt/ghostpost/client/`

---

## THE PROBLEM

The embedded browser uses CDP (Chrome DevTools Protocol) screencast to stream the browser view to the frontend. It captures full JPEG frames at 1920x1080 and sends every single one over WebSocket. The result is:

- **Unusably slow.** Multiple seconds of lag between clicking and seeing a response.
- **Input feels broken.** Clicks and keystrokes work on the server side (CDP Input.dispatch) but the visual feedback is so delayed that users think nothing is happening.
- **Bandwidth hog.** Every frame is a full 1920x1080 JPEG regardless of what changed.
- **Not how production tools do this.** Manus, Abasus, Gitpod, GitHub Codespaces — they all use VNC-based streaming because it only sends pixels that changed.

## THE FIX

Replace CDP screencast with noVNC. This is the industry standard stack:

```
Xvfb (virtual display :99, 1280x800)
  ↓
Chromium renders to the virtual display (NOT headless)
  ↓
x11vnc captures the display and serves VNC protocol
  ↓
websockify proxies VNC → WebSocket
  ↓
noVNC client in the frontend connects via WebSocket
  ↓
User sees responsive browser, clicks/types work natively through VNC
```

Mouse and keyboard input is handled by VNC natively — no more CDP Input.dispatch. Clicks feel instant because VNC only sends the changed region, not the entire screen.

---

## STEP 1: Install System Packages

```bash
apt update
apt install -y xvfb x11vnc websockify novnc
```

Verify:
```bash
which Xvfb x11vnc websockify
ls /usr/share/novnc/
```

---

## STEP 2: Create the VNC Browser Manager

### File: `src/services/browser-session/vnc-manager.js`

This replaces the screencast parts of `manager.js`. Keep the cookie watcher, platform support, and launch logic — just swap how the browser renders and streams.

```javascript
/**
 * VNC Browser Manager
 *
 * Launches Chromium on a virtual display (Xvfb), captures it with x11vnc,
 * and proxies to WebSocket via websockify. Frontend connects with noVNC.
 *
 * Replaces CDP screencast with responsive VNC streaming.
 */

const { execSync, spawn } = require('child_process');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const { generateFingerprints } = require('../observer/fingerprints');
const { encrypt, decrypt } = require('../../utils/crypto');
const db = require('../../config/database');

const DISPLAY = ':99';
const DISPLAY_WIDTH = 1280;
const DISPLAY_HEIGHT = 800;
const VNC_PORT = 5900;        // x11vnc listens here
const WEBSOCKET_PORT = 6080;  // websockify proxies VNC → WebSocket here
const CLEANUP_TIMEOUT_MS = 10 * 60 * 1000;

const PLATFORM_URLS = {
  x: 'https://x.com',
  instagram: 'https://www.instagram.com',
  linkedin: 'https://www.linkedin.com',
};

const PLATFORM_COOKIE_CONFIG = {
  x: {
    cookieUrl: 'https://x.com',
    authCookieNames: ['auth_token', 'ct0', 'twid', 'kdt'],
    minAuthCookies: 2,
    domainFilters: ['x.com', 'twitter.com'],
  },
  instagram: {
    cookieUrl: 'https://www.instagram.com',
    authCookieNames: ['sessionid', 'csrftoken', 'ds_user_id', 'ig_did'],
    minAuthCookies: 2,
    domainFilters: ['instagram.com'],
  },
  linkedin: {
    cookieUrl: 'https://www.linkedin.com',
    authCookieNames: ['li_at', 'JSESSIONID', 'lidc', 'bcookie'],
    minAuthCookies: 1,
    domainFilters: ['linkedin.com'],
  },
};

class VNCBrowserManager {
  constructor(io) {
    this.io = io;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.platform = 'x';
    this.xvfbProcess = null;
    this.vncProcess = null;
    this.websockifyProcess = null;
    this.cookieWatchInterval = null;
    this.lastCookieHash = null;
    this.cleanupTimer = null;
  }

  isActive() {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Start the Xvfb virtual display
   */
  startXvfb() {
    try {
      // Kill any existing Xvfb on this display
      try { execSync(`pkill -f "Xvfb ${DISPLAY}"`, { stdio: 'ignore' }); } catch (_) {}

      this.xvfbProcess = spawn('Xvfb', [
        DISPLAY,
        '-screen', '0', `${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}x24`,
        '-ac',       // disable access control
        '-nolisten', 'tcp',
      ], { stdio: 'ignore', detached: true });

      this.xvfbProcess.unref();

      // Give Xvfb a moment to start
      execSync('sleep 1');

      console.log(`[VNC] Xvfb started on ${DISPLAY} (${DISPLAY_WIDTH}x${DISPLAY_HEIGHT})`);
    } catch (err) {
      console.error('[VNC] Failed to start Xvfb:', err.message);
      throw err;
    }
  }

  /**
   * Start x11vnc to capture the virtual display
   */
  startVNC() {
    try {
      // Kill any existing x11vnc
      try { execSync('pkill -f x11vnc', { stdio: 'ignore' }); } catch (_) {}

      this.vncProcess = spawn('x11vnc', [
        '-display', DISPLAY,
        '-nopw',           // no password (internal only)
        '-listen', '127.0.0.1',  // only local connections
        '-rfbport', String(VNC_PORT),
        '-shared',         // allow multiple viewers
        '-forever',        // don't exit after first client disconnects
        '-noxdamage',      // more compatible
        '-cursor', 'arrow',
        '-ncache', '10',   // cache tiles for better performance
        '-nowf',           // no wireframe
        '-xkb',            // proper keyboard support
      ], { stdio: 'ignore', detached: true });

      this.vncProcess.unref();
      execSync('sleep 1');

      console.log(`[VNC] x11vnc started on 127.0.0.1:${VNC_PORT}`);
    } catch (err) {
      console.error('[VNC] Failed to start x11vnc:', err.message);
      throw err;
    }
  }

  /**
   * Start websockify to proxy VNC → WebSocket
   */
  startWebsockify() {
    try {
      // Kill any existing websockify
      try { execSync('pkill -f websockify', { stdio: 'ignore' }); } catch (_) {}

      // websockify proxies WebSocket connections on WEBSOCKET_PORT to VNC on VNC_PORT
      this.websockifyProcess = spawn('websockify', [
        '--web', '/usr/share/novnc/',   // serve noVNC static files
        String(WEBSOCKET_PORT),
        `127.0.0.1:${VNC_PORT}`,
      ], { stdio: 'ignore', detached: true });

      this.websockifyProcess.unref();
      execSync('sleep 1');

      console.log(`[VNC] websockify started — WebSocket on port ${WEBSOCKET_PORT}`);
    } catch (err) {
      console.error('[VNC] Failed to start websockify:', err.message);
      throw err;
    }
  }

  /**
   * Launch the full stack: Xvfb → Chromium → x11vnc → websockify
   */
  async launch(userId = 1, platform = 'x') {
    if (this.isActive()) {
      console.log('[VNC] Already running, reusing existing session');
      return { success: true, reused: true, platform: this.platform, websocketPort: WEBSOCKET_PORT };
    }

    await this.close();
    this.platform = platform;

    const startUrl = PLATFORM_URLS[platform] || PLATFORM_URLS.x;

    try {
      // 1. Start virtual display
      this.startXvfb();

      // 2. Get user fingerprint
      const user = await db.query(
        'SELECT fingerprint_desktop, proxy_host, proxy_port, proxy_user, proxy_pass_encrypted FROM users WHERE id = $1',
        [userId]
      );
      const row = user.rows[0];
      const fingerprint = row?.fingerprint_desktop || generateFingerprints().desktop;

      // 3. Launch Chromium on the virtual display (NOT headless)
      const launchOptions = {
        headless: false,    // ← KEY CHANGE: visible browser on Xvfb
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          `--window-size=${DISPLAY_WIDTH},${DISPLAY_HEIGHT}`,
          '--start-maximized',
          '--disable-infobars',
          '--disable-notifications',
        ],
      };

      if (row?.proxy_host) {
        launchOptions.args.push(`--proxy-server=http://${row.proxy_host}:${row.proxy_port}`);
      }

      // Set DISPLAY so Chromium renders to Xvfb
      process.env.DISPLAY = DISPLAY;

      this.browser = await chromium.launch(launchOptions);

      this.context = await this.browser.newContext({
        viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
        userAgent: fingerprint.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: fingerprint.locale || 'en-US',
        timezoneId: fingerprint.timezone || 'America/New_York',
      });

      // Load existing cookies for this platform
      const existing = await db.query(
        'SELECT cookies_encrypted FROM browser_sessions WHERE user_id = $1 AND platform = $2 AND is_valid = TRUE',
        [userId, platform]
      );
      if (existing.rows[0]?.cookies_encrypted) {
        try {
          const cookies = JSON.parse(decrypt(existing.rows[0].cookies_encrypted));
          if (cookies && cookies.length > 0) {
            const VALID_SAME_SITE = ['Strict', 'Lax', 'None'];
            const sanitized = cookies.map(c => ({
              ...c,
              sameSite: VALID_SAME_SITE.includes(c.sameSite) ? c.sameSite : 'Lax',
            }));
            await this.context.addCookies(sanitized);
            console.log(`[VNC] Loaded ${sanitized.length} existing ${platform} cookies`);
          }
        } catch (e) {
          console.log(`[VNC] No valid ${platform} cookies, starting fresh`);
        }
      }

      this.page = await this.context.newPage();
      await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 4. Start VNC capture
      this.startVNC();

      // 5. Start WebSocket proxy
      this.startWebsockify();

      // 6. Start cookie watcher
      this.startCookieWatcher(userId, platform);

      console.log(`[VNC] Full stack launched for ${platform}: Xvfb → Chromium → x11vnc → websockify`);
      console.log(`[VNC] Connect noVNC client to ws://78.111.89.140:${WEBSOCKET_PORT}`);

      return {
        success: true,
        reused: false,
        platform,
        websocketPort: WEBSOCKET_PORT,
        websocketUrl: `ws://78.111.89.140:${WEBSOCKET_PORT}`,
      };

    } catch (err) {
      console.error('[VNC] Launch failed:', err.message);
      await this.close();
      throw err;
    }
  }

  /**
   * Navigate to a URL (called from socket handler)
   */
  async navigate(url) {
    if (!this.page) return;
    const ALLOWED_DOMAINS = ['x.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'accounts.google.com', 'facebook.com'];
    const parsed = new URL(url);
    if (!ALLOWED_DOMAINS.some(d => parsed.hostname.endsWith(d))) {
      throw new Error(`Navigation restricted. Allowed: ${ALLOWED_DOMAINS.join(', ')}`);
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  /**
   * Cookie watcher — platform-aware, auto-captures auth cookies
   * Identical to the one in manager.js
   */
  startCookieWatcher(userId, platform = 'x') {
    if (this.cookieWatchInterval) return;
    const config = PLATFORM_COOKIE_CONFIG[platform] || PLATFORM_COOKIE_CONFIG.x;

    this.cookieWatchInterval = setInterval(async () => {
      if (!this.context) return;
      try {
        const cookies = await this.context.cookies(config.cookieUrl);
        const authCookies = cookies.filter(c => config.authCookieNames.includes(c.name));

        if (authCookies.length >= config.minAuthCookies) {
          const cookieHash = JSON.stringify(authCookies.map(c => c.value).sort());
          if (cookieHash !== this.lastCookieHash) {
            this.lastCookieHash = cookieHash;
            const platformCookies = cookies.filter(c =>
              config.domainFilters.some(d => c.domain.includes(d))
            );
            const encrypted = encrypt(JSON.stringify(platformCookies));

            await db.query(
              `INSERT INTO browser_sessions (user_id, platform, cookies_encrypted, last_used_at, is_valid)
               VALUES ($1, $2, $3, NOW(), TRUE)
               ON CONFLICT (user_id, platform) DO UPDATE SET
                 cookies_encrypted = EXCLUDED.cookies_encrypted, last_used_at = NOW(), is_valid = TRUE`,
              [userId, platform, encrypted]
            );

            if (platform === 'x') {
              await db.query(
                "UPDATE users SET cookie_status = 'valid', cookie_updated_at = NOW(), x_auth_status = 'active' WHERE id = $1",
                [userId]
              );
            }

            // Update platform_accounts
            await db.query(
              `UPDATE platform_accounts SET status = 'active', last_used = NOW() WHERE platform = $1`,
              [platform]
            ).catch(() => {});

            this.io.emit('browser:cookies-captured', {
              platform, count: platformCookies.length, hasAuth: true,
              timestamp: new Date().toISOString(),
            });

            console.log(`[VNC] Captured ${platformCookies.length} ${platform} cookies (${authCookies.length} auth)`);
          }
        }
      } catch (_) {}
    }, 3000);
  }

  getStatus() {
    return {
      active: this.isActive(),
      platform: this.platform,
      url: this.page?.url() || null,
      websocketPort: WEBSOCKET_PORT,
    };
  }

  onClientConnected() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  onClientDisconnected() {
    this.cleanupTimer = setTimeout(async () => {
      if (this.isActive()) {
        console.log(`[VNC] No clients for ${CLEANUP_TIMEOUT_MS / 60000} min — closing`);
        await this.close();
      }
    }, CLEANUP_TIMEOUT_MS);
  }

  async close() {
    if (this.cleanupTimer) { clearTimeout(this.cleanupTimer); this.cleanupTimer = null; }
    if (this.cookieWatchInterval) { clearInterval(this.cookieWatchInterval); this.cookieWatchInterval = null; }

    this.lastCookieHash = null;

    // Kill processes in reverse order
    try { if (this.websockifyProcess) this.websockifyProcess.kill(); } catch (_) {}
    try { if (this.vncProcess) this.vncProcess.kill(); } catch (_) {}
    try { if (this.page) await this.page.close(); } catch (_) {}
    try { if (this.context) await this.context.close(); } catch (_) {}
    try { if (this.browser) await this.browser.close(); } catch (_) {}
    try { if (this.xvfbProcess) this.xvfbProcess.kill(); } catch (_) {}

    // Belt and braces — kill by name
    try { execSync('pkill -f websockify', { stdio: 'ignore' }); } catch (_) {}
    try { execSync('pkill -f x11vnc', { stdio: 'ignore' }); } catch (_) {}
    try { execSync(`pkill -f "Xvfb ${DISPLAY}"`, { stdio: 'ignore' }); } catch (_) {}

    this.browser = null;
    this.context = null;
    this.page = null;
    this.xvfbProcess = null;
    this.vncProcess = null;
    this.websockifyProcess = null;

    console.log('[VNC] All processes closed');
  }
}

module.exports = VNCBrowserManager;
```

---

## STEP 3: Update Socket Handler

### File: `src/services/browser-session/socket-handler.js`

Replace the current file. The noVNC client handles mouse/keyboard natively — we don't need to relay input events through Socket.io anymore.

```javascript
/**
 * Browser Session Socket Handler (noVNC version)
 *
 * Much simpler than the CDP version. noVNC handles all mouse/keyboard
 * natively through the VNC protocol. We only need socket events for:
 * - Launch/close browser
 * - Navigate to URL
 * - Status queries
 * - Cookie capture notifications (emitted by cookie watcher)
 */

function setupBrowserSocket(io, sessionManager) {
  io.on('connection', (socket) => {
    sessionManager.onClientConnected();

    socket.on('browser:launch', async (options = {}) => {
      try {
        const platform = options.platform || 'x';
        const result = await sessionManager.launch(1, platform);
        socket.emit('browser:launched', result);
      } catch (err) {
        socket.emit('browser:error', { message: err.message });
      }
    });

    socket.on('browser:navigate', async (url) => {
      try {
        await sessionManager.navigate(url);
      } catch (err) {
        socket.emit('browser:error', { message: err.message });
      }
    });

    socket.on('browser:back', async () => {
      if (!sessionManager.page) return;
      try { await sessionManager.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
    });

    socket.on('browser:forward', async () => {
      if (!sessionManager.page) return;
      try { await sessionManager.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
    });

    socket.on('browser:reload', async () => {
      if (!sessionManager.page) return;
      try { await sessionManager.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (_) {}
    });

    socket.on('browser:status', () => {
      socket.emit('browser:status', sessionManager.getStatus());
    });

    socket.on('browser:close', async () => {
      await sessionManager.close();
      socket.emit('browser:closed');
    });

    socket.on('disconnect', () => {
      sessionManager.onClientDisconnected();
    });
  });
}

module.exports = setupBrowserSocket;
```

---

## STEP 4: Update server.js

Find where the BrowserSessionManager is imported and replace with VNCBrowserManager:

```javascript
// OLD:
// const BrowserSessionManager = require('./services/browser-session/manager');
// const sessionManager = new BrowserSessionManager(io);

// NEW:
const VNCBrowserManager = require('./services/browser-session/vnc-manager');
const sessionManager = new VNCBrowserManager(io);
```

Everything else stays the same — `setupBrowserSocket(io, sessionManager)` still works.

---

## STEP 5: Update Frontend — BrowserView.jsx

The frontend needs to embed a noVNC client instead of a canvas that receives JPEG frames.

### Install noVNC client:

```bash
cd /opt/ghostpost/client
npm install @novnc/novnc
```

### Replace the canvas section in `client/src/screens/BrowserView.jsx`:

Remove:
- The canvas element and all canvas refs
- All `handleMouseMove`, `handleMouseDown`, `handleMouseUp`, `handleKeyDown`, `handleKeyUp` functions
- The `getCanvasCoords` function
- The wheel event listener
- The `browser:frame` socket listener
- The `ImageBitmap` / `createImageBitmap` frame decoder

Replace with a noVNC connection. The key change:

```jsx
import { useRef, useState, useEffect, useCallback } from 'react';
import RFB from '@novnc/novnc/core/rfb';

// Inside the component:
const vncRef = useRef(null);
const rfbRef = useRef(null);

// When browser:launched fires with websocketPort:
useEffect(() => {
  if (!browserActive || !vncRef.current) return;

  // Connect noVNC to the websockify WebSocket
  const wsUrl = `ws://${window.location.hostname}:6080`;

  const rfb = new RFB(vncRef.current, wsUrl, {
    scaleViewport: true,
    resizeSession: false,
    showDotCursor: true,
  });

  rfb.background = '#f8f8fa';
  rfb.qualityLevel = 6;
  rfb.compressionLevel = 2;

  rfb.addEventListener('connect', () => {
    console.log('[noVNC] Connected');
  });

  rfb.addEventListener('disconnect', () => {
    console.log('[noVNC] Disconnected');
  });

  rfbRef.current = rfb;

  return () => {
    rfb.disconnect();
    rfbRef.current = null;
  };
}, [browserActive]);

// In the JSX, replace the <canvas> with:
<div
  ref={vncRef}
  style={{
    width: '100%',
    height: '100%',
    display: browserActive ? 'block' : 'none',
  }}
/>
```

The noVNC RFB component handles ALL mouse and keyboard input internally. No more relaying events through Socket.io. Clicks, typing, scrolling — all handled by VNC protocol directly.

---

## STEP 6: Open Port 6080

websockify serves on port 6080. The frontend needs to reach it.

```bash
# If using UFW:
ufw allow 6080/tcp

# If using iptables:
iptables -A INPUT -p tcp --dport 6080 -j ACCEPT
```

Also update nginx if it's proxying. Add to the nginx config:

```nginx
# WebSocket proxy for noVNC
location /websockify {
    proxy_pass http://127.0.0.1:6080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

If using nginx proxy, the frontend connects to `ws://{hostname}/websockify` instead of `ws://{hostname}:6080`.

---

## STEP 7: Test

```bash
# 1. Install packages
apt update && apt install -y xvfb x11vnc websockify

# 2. Restart server
cd /opt/ghostpost
pkill -9 -f node
sleep 2
node src/server.js 2>&1 | tee /tmp/gp.log &
sleep 4

# 3. Check health
curl -s http://localhost:3000/api/health

# 4. Open frontend in your browser
# Go to http://78.111.89.140:3000
# Click Browser View
# Click Launch
# Wait for noVNC to connect

# 5. You should see X.com (or Instagram/LinkedIn)
# Click on the page — it should respond INSTANTLY
# Type in a text field — characters should appear in real time
# Scroll — should be smooth

# 6. Check logs
tail -f /tmp/gp.log | grep VNC
```

Expected log output:
```
[VNC] Xvfb started on :99 (1280x800)
[VNC] x11vnc started on 127.0.0.1:5900
[VNC] websockify started — WebSocket on port 6080
[VNC] Full stack launched for x: Xvfb → Chromium → x11vnc → websockify
[VNC] Connect noVNC client to ws://78.111.89.140:6080
```

---

## WHAT NOT TO CHANGE

- Do NOT change any API routes or business logic
- Do NOT change the cookie watcher logic (it's been ported into vnc-manager.js)
- Do NOT change the outreach, learning, or results systems
- Do NOT remove manager.js — keep it as a fallback, just don't import it in server.js
- Do NOT change the platform account or campaign systems

## WHAT TO REMOVE FROM BROWSERVIEW.JSX

- ALL `browser:frame` socket listeners
- ALL `handleMouseMove`, `handleMouseDown`, `handleMouseUp`, `handleKeyDown`, `handleKeyUp`
- ALL `getCanvasCoords` and wheel event listeners
- ALL `createImageBitmap` frame processing
- The `<canvas>` element itself

Replace with the noVNC `<div ref={vncRef}>` and the RFB connection code above.

## KEEP IN BROWSERVIEW.JSX

- Platform selector (socket emits `browser:launch` with `{ platform: 'x' | 'instagram' | 'linkedin' }`)
- URL bar and navigation buttons (back, forward, reload still work via socket)
- Scan log / activity panel on the right side
- Launch/close buttons
- Status indicators

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/services/browser-session/vnc-manager.js` | CREATE | Xvfb + Chromium + x11vnc + websockify manager |
| `src/services/browser-session/socket-handler.js` | REPLACE | Simplified — no input relay needed |
| `src/server.js` | MODIFY | Import VNCBrowserManager instead of BrowserSessionManager |
| `client/src/screens/BrowserView.jsx` | MODIFY | Replace canvas with noVNC client |
| `client/package.json` | MODIFY | Add @novnc/novnc dependency |
| nginx config | MODIFY | Add WebSocket proxy for port 6080 |

## VERIFY CHECKLIST

- [ ] `apt install xvfb x11vnc websockify` succeeded
- [ ] `npm install @novnc/novnc` in client/ succeeded
- [ ] Server starts without errors
- [ ] Browser View shows Launch button
- [ ] Clicking Launch opens X.com in the noVNC viewer
- [ ] Clicks on the page respond instantly
- [ ] Typing in text fields works
- [ ] Scrolling works
- [ ] Logging into X captures cookies (check logs for "Captured X cookies")
- [ ] Port 6080 is open
- [ ] Platform selector works (can launch Instagram and LinkedIn too)
