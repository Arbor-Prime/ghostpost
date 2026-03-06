/**
 * Browser Session Manager
 *
 * Launches and controls a persistent Chromium instance for the embedded
 * browser view. Uses Playwright with stealth plugins and CDP screencast
 * to stream frames to the frontend.
 *
 * Only ONE browser session runs at a time (single-user system).
 * The browser survives socket disconnects and resumes screencast
 * when a new client connects. Killed only on explicit close or
 * after 10 minutes of no connected clients.
 *
 * Cookie storage is compatible with Sprint 8's browser_sessions table
 * so the Sprint 9 posting pipeline picks them up automatically.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const { generateFingerprints } = require('../observer/fingerprints');
const { encrypt, decrypt } = require('../../utils/crypto');
const db = require('../../config/database');

const SCREENCAST_WIDTH = 1920;
const SCREENCAST_HEIGHT = 1080;
const CLEANUP_TIMEOUT_MS = 10 * 60 * 1000;

class BrowserSessionManager {
  constructor(io) {
    this.io = io;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.cdpSession = null;
    this.isStreaming = false;
    this.streamingSocket = null;
    this.cookieWatchInterval = null;
    this.lastCookieHash = null;
    this.cleanupTimer = null;
  }

  isActive() {
    return this.browser !== null && this.browser.isConnected();
  }

  async launch(userId = 1) {
    if (this.isActive()) {
      console.log('[BrowserSession] Already running, reusing existing session');
      return { success: true, reused: true };
    }

    if (this.browser) {
      await this.close();
    }

    try {
      const user = await db.query(
        'SELECT fingerprint_desktop, proxy_host, proxy_port, proxy_user, proxy_pass_encrypted FROM users WHERE id = $1',
        [userId]
      );
      const row = user.rows[0];
      const fingerprint = row?.fingerprint_desktop || generateFingerprints().desktop;

      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          `--window-size=${SCREENCAST_WIDTH},${SCREENCAST_HEIGHT}`,
        ],
      };

      if (row?.proxy_host) {
        launchOptions.args.push(`--proxy-server=http://${row.proxy_host}:${row.proxy_port}`);
      }

      this.browser = await chromium.launch(launchOptions);

      this.context = await this.browser.newContext({
        viewport: { width: SCREENCAST_WIDTH, height: SCREENCAST_HEIGHT },
        userAgent: fingerprint.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: fingerprint.locale || 'en-US',
        timezoneId: fingerprint.timezone || 'America/New_York',
      });

      const existing = await db.query(
        "SELECT cookies_encrypted FROM browser_sessions WHERE user_id = $1 AND platform = 'x' AND is_valid = TRUE",
        [userId]
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
            console.log(`[BrowserSession] Loaded ${sanitized.length} existing cookies`);
          }
        } catch (e) {
          console.log(`[BrowserSession] No valid existing cookies, starting fresh: ${e.message}`);
        }
      }

      this.page = await this.context.newPage();
      await this.page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

      this.startCookieWatcher(userId);

      console.log('[BrowserSession] Browser launched successfully');
      return { success: true, reused: false };

    } catch (err) {
      console.error('[BrowserSession] Launch failed:', err.message);
      await this.close();
      throw err;
    }
  }

  /**
   * Start (or resume) screencast for a specific socket.
   * Creates a fresh CDP session each time to bind frame events to the new socket.
   */
  async startScreencast(socket) {
    if (!this.page) throw new Error('No browser session active');

    await this.stopScreencast();

    if (this.cdpSession) {
      try { await this.cdpSession.detach(); } catch (_) {}
      this.cdpSession = null;
    }

    this.cdpSession = await this.page.context().newCDPSession(this.page);
    this.streamingSocket = socket;

    this.cdpSession.on('Page.screencastFrame', (params) => {
      // ACK immediately so CDP sends the next frame without waiting
      this.cdpSession.send('Page.screencastFrameAck', {
        sessionId: params.sessionId,
      }).catch(() => {});

      if (this.streamingSocket) {
        this.streamingSocket.emit('browser:frame', { data: params.data });
      }
    });

    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 90,
      maxWidth: SCREENCAST_WIDTH,
      maxHeight: SCREENCAST_HEIGHT,
      everyNthFrame: 1,
    });

    this.isStreaming = true;
    console.log('[BrowserSession] Screencast started');
  }

  async stopScreencast() {
    if (this.cdpSession && this.isStreaming) {
      try {
        await this.cdpSession.send('Page.stopScreencast');
      } catch (_) {}
      this.isStreaming = false;
      this.streamingSocket = null;
      console.log('[BrowserSession] Screencast stopped');
    }
  }

  onClientConnected() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[BrowserSession] Cleanup timer cancelled — client reconnected');
    }
  }

  onClientDisconnected() {
    this.cleanupTimer = setTimeout(async () => {
      if (this.isActive() && !this.streamingSocket) {
        console.log(`[BrowserSession] No clients for ${CLEANUP_TIMEOUT_MS / 60000} min — closing browser`);
        await this.close();
      }
    }, CLEANUP_TIMEOUT_MS);
    console.log(`[BrowserSession] Cleanup timer started (${CLEANUP_TIMEOUT_MS / 60000} min)`);
  }

  async handleMouseEvent(event) {
    if (!this.cdpSession) return;

    try {
      switch (event.type) {
        case 'mousemove':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: event.x,
            y: event.y,
          });
          break;

        case 'mousedown':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: event.x,
            y: event.y,
            button: event.button === 2 ? 'right' : 'left',
            clickCount: event.clickCount || 1,
          });
          break;

        case 'mouseup':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: event.x,
            y: event.y,
            button: event.button === 2 ? 'right' : 'left',
            clickCount: event.clickCount || 1,
          });
          break;

        case 'wheel':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: event.x,
            y: event.y,
            deltaX: event.deltaX || 0,
            deltaY: event.deltaY || 0,
          });
          break;

        default:
          console.log(`[BrowserSession] Unknown mouse event type: ${event.type}`);
      }
    } catch (err) {
      console.error(`[BrowserSession] CDP mouse dispatch error: ${err.message}`);
    }
  }

  async handleKeyEvent(event) {
    if (!this.cdpSession) return;

    try {
      if (event.type === 'keydown' || event.type === 'keyup') {
        const cdpType = event.type === 'keydown' ? 'keyDown' : 'keyUp';

        await this.cdpSession.send('Input.dispatchKeyEvent', {
          type: cdpType,
          key: event.key,
          code: event.code,
          text: event.type === 'keydown' && event.key.length === 1 ? event.key : undefined,
          windowsVirtualKeyCode: event.keyCode,
          nativeVirtualKeyCode: event.keyCode,
          modifiers: this.getModifiers(event),
        });
      }

      if (event.type === 'keydown' && event.key.length === 1) {
        await this.cdpSession.send('Input.dispatchKeyEvent', {
          type: 'char',
          text: event.key,
          unmodifiedText: event.key,
          modifiers: this.getModifiers(event),
        });
      }
    } catch (err) {
      console.error(`[BrowserSession] CDP key dispatch error: ${err.message}`);
    }
  }

  getModifiers(event) {
    let modifiers = 0;
    if (event.altKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.metaKey) modifiers |= 4;
    if (event.shiftKey) modifiers |= 8;
    return modifiers;
  }

  startCookieWatcher(userId) {
    if (this.cookieWatchInterval) return;

    this.cookieWatchInterval = setInterval(async () => {
      if (!this.context) return;

      try {
        const cookies = await this.context.cookies('https://x.com');

        const authCookies = cookies.filter(c =>
          c.name === 'auth_token' ||
          c.name === 'ct0' ||
          c.name === 'twid' ||
          c.name === 'kdt'
        );

        if (authCookies.length >= 2) {
          const cookieHash = JSON.stringify(authCookies.map(c => c.value).sort());

          if (cookieHash !== this.lastCookieHash) {
            this.lastCookieHash = cookieHash;

            const allXCookies = cookies.filter(c =>
              c.domain.includes('x.com') || c.domain.includes('twitter.com')
            );

            const encrypted = encrypt(JSON.stringify(allXCookies));

            await db.query(
              `INSERT INTO browser_sessions (user_id, platform, cookies_encrypted, last_used_at, is_valid)
               VALUES ($1, 'x', $2, NOW(), TRUE)
               ON CONFLICT (user_id, platform) DO UPDATE SET
                 cookies_encrypted = EXCLUDED.cookies_encrypted,
                 last_used_at = NOW(),
                 is_valid = TRUE`,
              [userId, encrypted]
            );

            await db.query(
              "UPDATE users SET cookie_status = 'valid', cookie_updated_at = NOW(), x_auth_status = 'active' WHERE id = $1",
              [userId]
            );

            this.io.emit('browser:cookies-captured', {
              count: allXCookies.length,
              hasAuth: true,
              timestamp: new Date().toISOString(),
            });

            console.log(`[BrowserSession] Captured ${allXCookies.length} X cookies (${authCookies.length} auth)`);
          }
        }
      } catch (_) {}
    }, 3000);
  }

  getStatus() {
    return {
      active: this.isActive(),
      streaming: this.isStreaming,
      url: this.page?.url() || null,
    };
  }

  async close() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.cookieWatchInterval) {
      clearInterval(this.cookieWatchInterval);
      this.cookieWatchInterval = null;
    }

    await this.stopScreencast();

    if (this.cdpSession) {
      try { await this.cdpSession.detach(); } catch (_) {}
      this.cdpSession = null;
    }

    if (this.page) {
      try { await this.page.close(); } catch (_) {}
      this.page = null;
    }

    if (this.context) {
      try { await this.context.close(); } catch (_) {}
      this.context = null;
    }

    if (this.browser) {
      try { await this.browser.close(); } catch (_) {}
      this.browser = null;
    }

    this.isStreaming = false;
    this.streamingSocket = null;
    this.lastCookieHash = null;
    console.log('[BrowserSession] Session closed');
  }
}

module.exports = BrowserSessionManager;
