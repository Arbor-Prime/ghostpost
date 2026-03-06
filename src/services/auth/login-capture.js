/**
 * Login Capture
 * 
 * Opens a Playwright browser, navigates to X login, and waits
 * for the user to manually log in. Once logged in, captures cookies.
 * 
 * For headless server use: we detect successful login by checking
 * if the page redirects to the home feed after a timeout period.
 */

const { launchSession } = require('../observer/launcher');
const { saveBrowserSession } = require('./session-manager');
const { generateFingerprints } = require('../observer/fingerprints');
const db = require('../../config/database');

/**
 * Start a login capture session.
 * 
 * Opens a real browser on the server. For a remote VPS,
 * use VNC to see the browser window or use manual cookie import instead.
 */
async function captureLogin(userId, platform) {
  const loginUrls = {
    x: 'https://x.com/i/flow/login',
    tiktok: 'https://www.tiktok.com/login',
    instagram: 'https://www.instagram.com/accounts/login/',
  };

  const successPatterns = {
    x: /x\.com\/home/,
    tiktok: /tiktok\.com\/(foryou|following|upload)/,
    instagram: /instagram\.com\/$/,
  };

  if (!loginUrls[platform]) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const user = await db.query('SELECT fingerprint_desktop FROM users WHERE id = $1', [userId]);
  let fingerprint = user.rows[0]?.fingerprint_desktop;
  if (!fingerprint) {
    const fps = generateFingerprints();
    fingerprint = fps.desktop;
    await db.query('UPDATE users SET fingerprint_desktop = $1 WHERE id = $2', [JSON.stringify(fingerprint), userId]);
  }

  let browser, context, page;

  try {
    ({ browser, context, page } = await launchSession(
      typeof fingerprint === 'string' ? JSON.parse(fingerprint) : fingerprint,
      null
    ));

    await page.goto(loginUrls[platform], { waitUntil: 'domcontentloaded' });

    console.log(`[LoginCapture] Browser opened for ${platform} login. User ${userId}.`);
    console.log(`[LoginCapture] Waiting up to 5 minutes for login to complete...`);

    await page.waitForURL(successPatterns[platform], { timeout: 300000 });

    console.log(`[LoginCapture] Login detected for ${platform}!`);

    await new Promise(r => setTimeout(r, 3000));

    let username = '';
    if (platform === 'x') {
      username = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        if (el) {
          const spans = el.querySelectorAll('span');
          for (const span of spans) {
            if (span.textContent.startsWith('@')) return span.textContent.replace('@', '');
          }
        }
        return '';
      }).catch(() => '');
    }

    await saveBrowserSession(userId, platform, context);

    if (platform === 'x') {
      await db.query(
        "UPDATE users SET x_auth_status = 'connected', x_username = $1 WHERE id = $2",
        [username, userId]
      );
    }

    console.log(`[LoginCapture] ${platform} connected for user ${userId} as ${username || '(unknown)'}`);
    return { success: true, username };

  } catch (err) {
    if (err.message.includes('Timeout') || err.name === 'TimeoutError') {
      console.error(`[LoginCapture] Login timeout for user ${userId} on ${platform}`);
      return { success: false, error: 'Login timeout — 5 minutes elapsed without successful login' };
    }
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { captureLogin };
