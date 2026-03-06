/**
 * Human-Like Browse Controller
 * 
 * Scrolls a public X profile timeline with research-backed behaviour:
 * - Log-normal scroll distances (short common, long rare)
 * - Variable pauses between scrolls (reading simulation)
 * - Mobile: faster scroll, shorter pauses, swipe-like
 * - Desktop: mouse movements, occasional hover
 * - Handles "Sign in" modal, rate limits, content warnings
 * - Extracts tweet data after each scroll (Sprint 3)
 */

const { humanDelay, scrollDistance, randomBetween, curvedMousePath, sleep } = require('../../utils/humanise');
const { extractTweets } = require('./extractor');

/**
 * Browse a single X profile's timeline.
 * 
 * @param {Page} page - Playwright page object
 * @param {string} handle - X handle to browse (without @)
 * @param {Object} fingerprint - Customer's fingerprint (for mobile/desktop behaviour)
 * @param {Function|null} onTweetsExtracted - Callback(tweets, handle) called after each extraction
 * @returns {{ scrollCount, timeSpentMs, hitLoginWall }}
 */
async function browseProfile(page, handle, fingerprint, onTweetsExtracted = null) {
  const isMobile = fingerprint.isMobile;
  const startTime = Date.now();
  let scrollCount = 0;
  let hitLoginWall = false;

  // Navigate to profile
  console.log(`[Observer] Navigating to x.com/${handle}`);
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    console.error(`[Observer] Navigation failed for ${handle}: ${err.message}`);
    return { scrollCount: 0, timeSpentMs: Date.now() - startTime, hitLoginWall: false };
  }

  // Wait for content to appear
  await humanDelay(2000, 0.3);

  // Check if we hit a login wall immediately
  if (await checkLoginWall(page)) {
    console.log(`[Observer] Hit login wall immediately for ${handle}`);
    return { scrollCount: 0, timeSpentMs: Date.now() - startTime, hitLoginWall: true };
  }

  // Determine session length: 2-5 minutes per target (log-normal)
  const targetDurationMs = randomBetween(120000, 300000);
  const maxScrolls = randomBetween(8, 20);

  console.log(`[Observer] Browsing ${handle} for ~${Math.round(targetDurationMs / 1000)}s, up to ${maxScrolls} scrolls`);

  // Main scroll loop
  while (scrollCount < maxScrolls && (Date.now() - startTime) < targetDurationMs) {
    // Scroll
    const distance = scrollDistance(isMobile);
    await page.evaluate((d) => window.scrollBy(0, d), distance);
    scrollCount++;

    // Desktop: occasional mouse movement
    if (!isMobile && Math.random() < 0.4) {
      const fromX = randomBetween(200, 800);
      const fromY = randomBetween(200, 600);
      const toX = randomBetween(300, 900);
      const toY = randomBetween(100, 500);
      const path = curvedMousePath(fromX, fromY, toX, toY);
      for (const point of path) {
        await page.mouse.move(point.x, point.y);
        await sleep(randomBetween(10, 30));
      }
    }

    // Pause between scrolls
    const pauseMedian = isMobile ? 2000 : 3500;
    await humanDelay(pauseMedian, 0.5);

    // 25% chance of a longer "reading" pause (5-15 seconds)
    if (Math.random() < 0.25) {
      const readTime = randomBetween(5000, 15000);
      console.log(`[Observer] Reading pause: ${Math.round(readTime / 1000)}s`);
      await sleep(readTime);
    }

    // Extract tweets from currently visible content
    if (onTweetsExtracted) {
      try {
        const tweets = await extractTweets(page);
        if (tweets.length > 0) {
          await onTweetsExtracted(tweets, handle);
        }
      } catch (err) {
        console.error(`[Observer] Tweet extraction failed: ${err.message}`);
      }
    }

    // Check for login wall after scrolling
    if (await checkLoginWall(page)) {
      console.log(`[Observer] Hit login wall after ${scrollCount} scrolls`);
      hitLoginWall = true;
      break;
    }

    // Dismiss any content warnings
    await dismissContentWarnings(page);
  }

  const timeSpentMs = Date.now() - startTime;
  console.log(`[Observer] Finished ${handle}: ${scrollCount} scrolls in ${Math.round(timeSpentMs / 1000)}s, loginWall=${hitLoginWall}`);

  return { scrollCount, timeSpentMs, hitLoginWall };
}

/**
 * Check if X is showing a "Sign in" / "Log in" overlay
 */
async function checkLoginWall(page) {
  try {
    const loginSelectors = [
      '[data-testid="sheetDialog"]',
      '[role="dialog"][aria-modal="true"]',
    ];
    for (const selector of loginSelectors) {
      const el = await page.$(selector);
      if (el) {
        const text = await el.textContent().catch(() => '');
        if (text && (text.includes('Sign in') || text.includes('Log in') || text.includes('Create an account'))) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Dismiss content warnings / sensitive content overlays
 */
async function dismissContentWarnings(page) {
  try {
    const viewButton = await page.$('text="View"');
    if (viewButton) {
      await viewButton.click();
      await sleep(500);
    }
  } catch {
    // Ignore
  }
}

module.exports = { browseProfile };
