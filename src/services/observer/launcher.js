/**
 * Playwright Session Launcher
 * 
 * Accepts a job, reads customer's proxy + fingerprint from DB,
 * launches Chromium with stealth settings, returns page object.
 * 
 * No persistent storage — fresh context each session.
 * No login required — Tier 1 browses public profiles.
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Apply stealth plugin
chromium.use(StealthPlugin());

/**
 * Launch a stealthy Playwright browser + page for observation.
 * 
 * @param {Object} fingerprint - The customer's fingerprint profile (mobile or desktop)
 * @param {Object|null} proxy - { host, port, user, pass } or null for no proxy
 * @returns {{ browser, context, page }}
 */
async function launchSession(fingerprint, proxy = null) {
  const launchOptions = {
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };

  // Add proxy if provided
  if (proxy) {
    launchOptions.proxy = {
      server: `http://${proxy.host}:${proxy.port}`,
      username: proxy.user || undefined,
      password: proxy.pass || undefined,
    };
  }

  const browser = await chromium.launch(launchOptions);

  const contextOptions = {
    viewport: fingerprint.viewport,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezone,
    colorScheme: fingerprint.colorScheme,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    hasTouch: fingerprint.hasTouch,
    isMobile: fingerprint.isMobile,
    // Spoof permissions
    permissions: ['geolocation'],
    geolocation: fingerprint.geolocation || { latitude: 40.7128, longitude: -74.0060 },
  };

  const context = await browser.newContext(contextOptions);
  
  // Additional stealth: hide webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {} };
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  const page = await context.newPage();

  // Set reasonable timeouts
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  return { browser, context, page };
}

/**
 * Launch a logged-in session (for posting replies/content).
 * Uses stored encrypted cookies. Falls back to public browsing if session is invalid.
 */
async function launchLoggedInSession(userId, platform, fingerprint, proxy = null) {
  const { restoreBrowserSession, saveBrowserSession } = require('../auth/session-manager');

  const { browser, context, page } = await launchSession(fingerprint, proxy);

  const restored = await restoreBrowserSession(userId, platform, context);
  if (!restored) {
    console.log(`[Launcher] No valid ${platform} session for user ${userId}, running in public mode`);
    return { browser, context, page, isLoggedIn: false };
  }

  const homeUrls = {
    x: 'https://x.com/home',
    tiktok: 'https://www.tiktok.com',
    instagram: 'https://www.instagram.com/',
  };

  await page.goto(homeUrls[platform] || homeUrls.x, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  let isLoggedIn = false;
  if (platform === 'x') {
    isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    }).catch(() => false);
  } else {
    isLoggedIn = !page.url().includes('login');
  }

  if (!isLoggedIn) {
    console.log(`[Launcher] Cookies expired for user ${userId} on ${platform}`);
    return { browser, context, page, isLoggedIn: false };
  }

  await saveBrowserSession(userId, platform, context);

  console.log(`[Launcher] Logged-in ${platform} session active for user ${userId}`);
  return { browser, context, page, isLoggedIn: true };
}

module.exports = { launchSession, launchLoggedInSession };
