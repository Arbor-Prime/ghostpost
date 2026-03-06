/**
 * Engagement Tracker
 *
 * Tracks engagement metrics on posted replies at 1h, 4h, and 24h intervals.
 * Uses Playwright to check reply engagement (since X API v2 rate limits are tight).
 * Results feed back into scoring to improve future opportunity selection.
 */

const { launchSession } = require('../observer/launcher');
const db = require('../../config/database');

const CHECK_INTERVALS = [
  { label: '1h', ms: 60 * 60 * 1000, column: 'engagement_1h' },
  { label: '4h', ms: 4 * 60 * 60 * 1000, column: 'engagement_4h' },
  { label: '24h', ms: 24 * 60 * 60 * 1000, column: 'engagement_24h' },
];

/**
 * Check a single posted reply for engagement.
 * Navigates to the reply URL and scrapes like/retweet/reply counts.
 */
async function checkEngagement(replyUrl, fingerprint) {
  let browser, context, page;
  try {
    ({ browser, context, page } = await launchSession(fingerprint));

    await page.goto(replyUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    const metrics = await page.evaluate(() => {
      const tweet = document.querySelector('[data-testid="tweet"]');
      if (!tweet) return null;

      const parseCount = (testId) => {
        const el = tweet.querySelector(`[data-testid="${testId}"]`);
        if (!el) return 0;
        const text = el.textContent.trim();
        if (!text) return 0;
        if (text.includes('K')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('M')) return Math.round(parseFloat(text) * 1000000);
        return parseInt(text.replace(/,/g, ''), 10) || 0;
      };

      return {
        likes: parseCount('like'),
        retweets: parseCount('retweet'),
        replies: parseCount('reply'),
      };
    });

    return metrics;
  } catch (err) {
    console.error(`[Tracker] Failed to check engagement for ${replyUrl}: ${err.message}`);
    return null;
  } finally {
    if (page) try { await page.close(); } catch (_) {}
    if (context) try { await context.close(); } catch (_) {}
    if (browser) try { await browser.close(); } catch (_) {}
  }
}

/**
 * Run engagement checks for all posted replies that are due.
 * Called periodically (every 30 minutes) by the cron.
 */
async function runEngagementChecks() {
  console.log('[Tracker] Running engagement checks...');

  for (const interval of CHECK_INTERVALS) {
    const windowStart = new Date(Date.now() - interval.ms - 30 * 60 * 1000);
    const windowEnd = new Date(Date.now() - interval.ms + 30 * 60 * 1000);

    const dueReplies = await db.query(
      `SELECT pr.id, pr.reply_url, pr.user_id, u.fingerprint_desktop
       FROM posted_replies pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.status = 'posted'
         AND pr.reply_url IS NOT NULL
         AND pr.${interval.column} IS NULL
         AND pr.posted_at BETWEEN $1 AND $2
       LIMIT 5`,
      [windowStart, windowEnd]
    );

    if (dueReplies.rows.length === 0) continue;

    console.log(`[Tracker] ${dueReplies.rows.length} replies due for ${interval.label} check`);

    for (const reply of dueReplies.rows) {
      const fingerprint = reply.fingerprint_desktop;
      if (!fingerprint) continue;

      const metrics = await checkEngagement(reply.reply_url, fingerprint);
      if (!metrics) continue;

      await db.query(
        `UPDATE posted_replies SET ${interval.column} = $1 WHERE id = $2`,
        [JSON.stringify(metrics), reply.id]
      );

      console.log(`[Tracker] ${interval.label} engagement for reply ${reply.id}: ${metrics.likes}L ${metrics.retweets}RT ${metrics.replies}R`);
    }
  }
}

let checkInterval = null;

function startTracker() {
  console.log('[Tracker] Starting engagement tracker (30-min interval)');
  runEngagementChecks().catch(err => console.error('[Tracker] Initial check failed:', err.message));

  checkInterval = setInterval(async () => {
    try {
      await runEngagementChecks();
    } catch (err) {
      console.error('[Tracker] Check failed:', err.message);
    }
  }, 30 * 60 * 1000);
}

function stopTracker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

module.exports = { checkEngagement, runEngagementChecks, startTracker, stopTracker };
