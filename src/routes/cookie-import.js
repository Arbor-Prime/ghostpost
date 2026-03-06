const express = require('express');
const router = express.Router();
const { chromium } = require('playwright');
const { encrypt } = require('../utils/crypto');
const db = require('../config/database');

const VALID_SAME_SITE = ['Strict', 'Lax', 'None'];

// POST /api/cookie-import/validate
router.post('/validate', async (req, res) => {
  const { auth_token, ct0 } = req.body || {};

  if (!auth_token || !ct0) {
    return res.status(400).json({
      valid: false,
      error: 'Both auth_token and ct0 cookies are required.',
    });
  }

  // Strip quotes, whitespace, newlines that users may accidentally include
  const cleanAuthToken = auth_token.trim().replace(/^["']|["']$/g, '').trim();
  const cleanCt0 = ct0.trim().replace(/^["']|["']$/g, '').trim();

  console.log(`[CookieImport] Validating cookies — auth_token length: ${cleanAuthToken.length}, ct0 length: ${cleanCt0.length}`);

  if (cleanAuthToken.length < 10 || cleanCt0.length < 10) {
    return res.status(400).json({
      valid: false,
      error: 'Cookie values seem too short. Make sure you copied the full Value, not the cookie Name.',
    });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    // Use url-based format (more compatible across Playwright/Chromium versions)
    await context.addCookies([
      {
        name: 'auth_token',
        value: cleanAuthToken,
        url: 'https://x.com',
      },
      {
        name: 'ct0',
        value: cleanCt0,
        url: 'https://x.com',
      },
    ]);

    const page = await context.newPage();
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    const isLoggedIn = url.includes('/home') && !url.includes('/login') && !url.includes('/i/flow');

    if (!isLoggedIn) {
      await browser.close();
      return res.json({
        valid: false,
        error: 'Cookies appear to be expired or invalid. Make sure you\'re logged into X.com and copy fresh cookies.',
      });
    }

    let username = null;
    try {
      username = await page.evaluate(() => {
        const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
        if (profileLink) {
          const href = profileLink.getAttribute('href');
          return href ? href.replace('/', '') : null;
        }
        return null;
      });
    } catch (_) {}

    const allCookies = await context.cookies('https://x.com');
    await browser.close();
    browser = null;

    const sanitized = allCookies.map(c => ({
      ...c,
      sameSite: VALID_SAME_SITE.includes(c.sameSite) ? c.sameSite : 'Lax',
    }));

    const userId = 1;
    const encryptedCookies = encrypt(JSON.stringify(sanitized));

    await db.query(
      `INSERT INTO browser_sessions (user_id, platform, cookies_encrypted, last_used_at)
       VALUES ($1, 'x', $2, NOW())
       ON CONFLICT (user_id, platform) DO UPDATE SET
         cookies_encrypted = EXCLUDED.cookies_encrypted,
         last_used_at = NOW(),
         is_valid = TRUE`,
      [userId, encryptedCookies]
    );

    await db.query(
      "UPDATE users SET x_auth_status = 'connected', x_username = $1, cookie_status = 'valid', cookie_updated_at = NOW() WHERE id = $2",
      [username || '', userId]
    );

    console.log(`[CookieImport] Validated and stored ${sanitized.length} cookies for user ${userId} (username: ${username || 'unknown'})`);

    res.json({
      valid: true,
      username: username || null,
      message: 'X account connected successfully.',
      cookieCount: sanitized.length,
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[CookieImport] Validation error:', err.message);

    let userMessage = 'Failed to validate cookies. Try again or check server logs.';
    if (err.message.includes('Invalid cookie')) {
      userMessage = 'Cookie format error — make sure you pasted only the raw value strings, not JSON objects or quoted text.';
    } else if (err.message.includes('Timeout') || err.message.includes('timeout')) {
      userMessage = 'Timed out connecting to X.com. The server may have network issues — try again.';
    } else if (err.message.includes('net::')) {
      userMessage = 'Network error reaching X.com from the server.';
    }

    res.status(500).json({ valid: false, error: userMessage });
  }
});

// GET /api/cookie-import/status
router.get('/status', async (req, res) => {
  try {
    const userId = 1;
    const session = await db.query(
      'SELECT is_valid, last_used_at FROM browser_sessions WHERE user_id = $1 AND platform = $2',
      [userId, 'x']
    );

    const user = await db.query(
      'SELECT x_auth_status, x_username, cookie_status, cookie_updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (session.rows.length === 0) {
      return res.json({
        connected: false,
        status: 'none',
        username: user.rows[0]?.x_username || null,
      });
    }

    const row = session.rows[0];
    const userRow = user.rows[0] || {};
    const hoursSinceUpdate = row.last_used_at
      ? (Date.now() - new Date(row.last_used_at).getTime()) / (1000 * 60 * 60)
      : Infinity;

    res.json({
      connected: row.is_valid === true,
      status: row.is_valid ? 'valid' : 'expired',
      username: userRow.x_username || null,
      updatedAt: row.last_used_at,
      isStale: hoursSinceUpdate > 24,
    });
  } catch (err) {
    console.error('[CookieImport] Status check error:', err.message);
    res.status(500).json({ connected: false, error: err.message });
  }
});

// POST /api/cookie-import/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    const userId = 1;
    await db.query(
      'DELETE FROM browser_sessions WHERE user_id = $1 AND platform = $2',
      [userId, 'x']
    );
    await db.query(
      "UPDATE users SET x_auth_status = 'disconnected', x_username = NULL, cookie_status = 'none' WHERE id = $1",
      [userId]
    );
    console.log(`[CookieImport] Disconnected X account for user ${userId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
