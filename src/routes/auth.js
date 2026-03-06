/**
 * Authentication Routes
 * 
 * Two methods to connect an X account:
 * 
 * 1. Browser login capture (for local/VNC use)
 *    POST /api/auth/capture/:userId — opens browser, waits for login
 * 
 * 2. Manual cookie import (for headless VPS without display)
 *    POST /api/auth/cookies/:userId — paste exported cookies from your browser
 */

const { captureLogin } = require('../services/auth/login-capture');
const { restoreBrowserSession, invalidateSession, saveBrowserSession } = require('../services/auth/session-manager');
const { encrypt, decrypt } = require('../utils/crypto');
const db = require('../config/database');

function registerAuthRoutes(app) {

  // Method 1: Browser login capture (needs display/VNC)
  app.post('/api/auth/capture/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const platform = req.body.platform || 'x';

      res.json({ message: `Login capture started for ${platform}. Check server logs. Timeout: 5 minutes.` });

      captureLogin(userId, platform).then(result => {
        console.log(`[Auth] Capture result for user ${userId}:`, result);
      }).catch(err => {
        console.error(`[Auth] Capture failed for user ${userId}:`, err.message);
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Method 2: Manual cookie import (recommended for remote VPS)
  app.post('/api/auth/cookies/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { cookies, platform = 'x', username } = req.body;

      if (!cookies || !Array.isArray(cookies)) {
        return res.status(400).json({
          error: 'cookies must be a JSON array of cookie objects',
          hint: 'Use a browser extension like "Cookie-Editor" to export cookies from x.com as JSON, then paste the array here.'
        });
      }

      const validCookies = cookies.filter(c => c.name && c.domain);
      if (validCookies.length === 0) {
        return res.status(400).json({ error: 'No valid cookies found. Each cookie needs at least "name" and "domain" fields.' });
      }

      // Normalise cookie format for Playwright
      const playwrightCookies = validCookies.map(c => ({
        name: c.name,
        value: c.value || '',
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate || c.expires || -1,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
        sameSite: (c.sameSite || 'Lax'),
      }));

      // Check for essential X auth cookies
      const hasAuth = playwrightCookies.some(c => c.name === 'auth_token' || c.name === 'ct0');
      if (platform === 'x' && !hasAuth) {
        return res.status(400).json({
          error: 'Missing essential X auth cookies (auth_token or ct0). Make sure you are logged into x.com when exporting cookies.'
        });
      }

      // Store encrypted
      await db.query(
        `INSERT INTO browser_sessions (user_id, platform, cookies_encrypted, last_used_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, platform) DO UPDATE SET
           cookies_encrypted = EXCLUDED.cookies_encrypted,
           last_used_at = NOW(),
           is_valid = TRUE`,
        [userId, platform, encrypt(JSON.stringify(playwrightCookies))]
      );

      if (platform === 'x') {
        await db.query(
          "UPDATE users SET x_auth_status = 'connected', x_username = $1 WHERE id = $2",
          [username || '', userId]
        );
      }

      console.log(`[Auth] Manual cookies imported for user ${userId} on ${platform} (${playwrightCookies.length} cookies)`);
      res.json({ ok: true, cookiesStored: playwrightCookies.length, platform });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check auth status
  app.get('/api/auth/status/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query(
        'SELECT x_auth_status, x_username FROM users WHERE id = $1',
        [userId]
      );

      const sessions = await db.query(
        'SELECT platform, is_valid, last_used_at FROM browser_sessions WHERE user_id = $1',
        [userId]
      );

      res.json({
        ...result.rows[0],
        sessions: sessions.rows,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Validate stored cookies still work
  app.post('/api/auth/validate/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const platform = req.body.platform || 'x';

      const { launchSession } = require('../services/observer/launcher');

      const user = await db.query('SELECT fingerprint_desktop FROM users WHERE id = $1', [userId]);
      let fingerprint = user.rows[0]?.fingerprint_desktop;
      if (!fingerprint) {
        return res.json({ valid: false, reason: 'No fingerprint configured' });
      }

      const { browser, context, page } = await launchSession(
        typeof fingerprint === 'string' ? JSON.parse(fingerprint) : fingerprint,
        null
      );

      try {
        const restored = await restoreBrowserSession(userId, platform, context);
        if (!restored) {
          return res.json({ valid: false, reason: 'No stored session found' });
        }

        await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));

        const isLoggedIn = await page.evaluate(() => {
          return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        }).catch(() => false);

        if (isLoggedIn) {
          await saveBrowserSession(userId, platform, context);
          res.json({ valid: true });
        } else {
          await invalidateSession(userId, platform);
          res.json({ valid: false, reason: 'Cookies expired — X showed login page' });
        }

      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      }

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Disconnect (delete cookies)
  app.post('/api/auth/disconnect/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const platform = req.body.platform || 'x';

      await db.query(
        'DELETE FROM browser_sessions WHERE user_id = $1 AND platform = $2',
        [userId, platform]
      );

      if (platform === 'x') {
        await db.query(
          "UPDATE users SET x_auth_status = 'disconnected', x_username = NULL WHERE id = $1",
          [userId]
        );
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerAuthRoutes };
