/**
 * Reply Poster
 * 
 * Posts approved drafts to X using a logged-in Playwright session.
 * Full human simulation: navigate to tweet, click reply, type, submit.
 * 
 * CRITICAL: This ONLY posts drafts with status 'approved' or 'edited'.
 * NEVER auto-approves. NEVER posts 'pending' drafts.
 */

const { launchLoggedInSession } = require('../observer/launcher');
const { humanType, humanTypeMobile } = require('./typer');
const { humanDelay, sleep, randomBetween, curvedMousePath } = require('../../utils/humanise');
const { saveBrowserSession, invalidateSession } = require('../auth/session-manager');
const db = require('../../config/database');

/**
 * Post a single approved draft as a reply on X.
 */
async function postReply(userId, draftId) {
  // Get draft + opportunity + tweet data
  const draftResult = await db.query(
    `SELECT d.*, o.tweet_id, ot.tweet_url, ot.author_handle,
            u.persona, u.fingerprint_mobile, u.fingerprint_desktop,
            u.proxy_host, u.proxy_port, u.proxy_user, u.proxy_pass_encrypted
     FROM drafts d
     JOIN opportunities o ON o.id = d.opportunity_id
     JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
     JOIN users u ON u.id = d.user_id
     WHERE d.id = $1 AND d.user_id = $2 AND d.status IN ('approved', 'edited')`,
    [draftId, userId]
  );

  if (draftResult.rows.length === 0) {
    throw new Error(`Draft ${draftId} not found or not approved`);
  }

  const draft = draftResult.rows[0];
  const persona = draft.persona || {};

  // Check rate limits (max 5 replies per hour, 15 per day)
  await checkRateLimits(userId);

  // Determine device from persona mobile_hours
  const currentHour = new Date().getHours();
  const device = (persona.mobile_hours || []).includes(currentHour) ? 'mobile' : 'desktop';
  const fingerprint = device === 'mobile' ? draft.fingerprint_mobile : draft.fingerprint_desktop;
  const proxy = draft.proxy_host ? {
    host: draft.proxy_host, port: draft.proxy_port,
    user: draft.proxy_user, pass: draft.proxy_pass_encrypted,
  } : null;

  let browser, context, page;

  try {
    // Launch logged-in session (launcher expects userId, platform, fingerprint, proxy)
    ({ browser, context, page, isLoggedIn } = await launchLoggedInSession(userId, 'x', fingerprint, proxy));

    if (!isLoggedIn) {
      throw new Error('Not logged in — cookies expired. Customer needs to re-authenticate.');
    }

    // Navigate to the tweet
    console.log(`[Poster] Navigating to ${draft.tweet_url}`);
    await page.goto(draft.tweet_url, { waitUntil: 'domcontentloaded' });
    await humanDelay(2000, 0.3);

    // Wait for tweet to load
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
    await humanDelay(1500, 0.3);

    // Scroll tweet into view (like reading it)
    await page.evaluate(() => {
      const tweet = document.querySelector('[data-testid="tweet"]');
      if (tweet) tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await humanDelay(2000, 0.5);

    // Desktop: mouse movement to reply button area
    if (device === 'desktop') {
      const replyBtn = await page.$('[data-testid="reply"]');
      if (replyBtn) {
        const box = await replyBtn.boundingBox();
        if (box) {
          const path = curvedMousePath(
            randomBetween(300, 600), randomBetween(400, 600),
            box.x + box.width / 2, box.y + box.height / 2
          );
          for (const point of path) {
            await page.mouse.move(point.x, point.y);
            await sleep(randomBetween(10, 30));
          }
        }
      }
    }

    // Click reply button
    const replyButton = await page.$('[data-testid="reply"]');
    if (!replyButton) throw new Error('Reply button not found');
    await replyButton.click();
    await humanDelay(1000, 0.3);

    // Wait for reply input to appear
    const replyInput = '[data-testid="tweetTextarea_0"]';
    await page.waitForSelector(replyInput, { timeout: 10000 });
    await humanDelay(500, 0.2);

    // Type the reply with human simulation
    const replyText = draft.reply_text || draft.content;
    const typeFunc = device === 'mobile' ? humanTypeMobile : humanType;
    const { totalMs, corrections } = await typeFunc(page, replyInput, replyText, persona);
    console.log(`[Poster] Typed "${replyText.substring(0, 40)}..." in ${Math.round(totalMs / 1000)}s (${corrections} corrections)`);

    // Pause before clicking send (reading what we typed)
    await humanDelay(1500, 0.5);

    // Click the Reply/Post button
    let sendButton = await page.$('[data-testid="tweetButtonInline"]');
    if (!sendButton) {
      sendButton = await page.$('[data-testid="tweetButton"]');
    }
    if (!sendButton) throw new Error('Send button not found');

    // Desktop: mouse to send button
    if (device === 'desktop') {
      const box = await sendButton.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(randomBetween(100, 300));
      }
    }

    await sendButton.click();
    await humanDelay(3000, 0.3); // Wait for post to go through

    // Try to capture the reply tweet ID from the URL or response
    let replyTweetId = null;
    try {
      const currentUrl = page.url();
      const match = currentUrl.match(/\/status\/(\d+)/);
      if (match) replyTweetId = match[1];
    } catch (e) {
      // Non-fatal — URL capture failed
    }

    // Save refreshed cookies (with platform param)
    await saveBrowserSession(userId, 'x', context);

    // Store posted reply
    const postResult = await db.query(
      `INSERT INTO posted_replies (draft_id, user_id, tweet_id, reply_tweet_id, reply_url, typing_duration_ms, device_used, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'posted') RETURNING id`,
      [draftId, userId, draft.tweet_id, replyTweetId,
       replyTweetId ? `https://x.com/i/status/${replyTweetId}` : null,
       totalMs, device]
    );

    // Update draft status
    await db.query("UPDATE drafts SET status = 'posted' WHERE id = $1", [draftId]);
    await db.query("UPDATE opportunities SET status = 'posted' WHERE id = $1", [draft.opportunity_id]);

    // Update rate limits
    await incrementRateLimit(userId);

    console.log(`[Poster] Reply posted for draft ${draftId} (${totalMs}ms typing, ${device})`);
    return { postId: postResult.rows[0].id, replyTweetId, typingDurationMs: totalMs };

  } catch (err) {
    console.error(`[Poster] Failed to post draft ${draftId}: ${err.message}`);

    // Store failure
    try {
      await db.query(
        `INSERT INTO posted_replies (draft_id, user_id, tweet_id, typing_duration_ms, device_used, status, error_message)
         VALUES ($1, $2, $3, 0, $4, 'failed', $5)`,
        [draftId, userId, draft.tweet_id, device || 'desktop', err.message.substring(0, 500)]
      );
    } catch (dbErr) {
      console.error('[Poster] Failed to record failure:', dbErr.message);
    }

    // Check if it's an auth issue
    if (err.message.includes('Not logged in') || err.message.includes('expired')) {
      await invalidateSession(userId, 'x');
    }

    throw err;
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
    if (context) {
      try { await context.close(); } catch (e) { /* ignore */ }
    }
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
}

async function checkRateLimits(userId) {
  const hourAgo = new Date(Date.now() - 3600000);
  const dayAgo = new Date(Date.now() - 86400000);

  const hourCount = await db.query(
    `SELECT COUNT(*) as count FROM posted_replies
     WHERE user_id = $1 AND posted_at > $2 AND status = 'posted'`,
    [userId, hourAgo]
  );
  if (parseInt(hourCount.rows[0].count) >= 5) {
    throw new Error('Rate limit: max 5 replies per hour');
  }

  const dayCount = await db.query(
    `SELECT COUNT(*) as count FROM posted_replies
     WHERE user_id = $1 AND posted_at > $2 AND status = 'posted'`,
    [userId, dayAgo]
  );
  if (parseInt(dayCount.rows[0].count) >= 15) {
    throw new Error('Rate limit: max 15 replies per day');
  }
}

async function incrementRateLimit(userId) {
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0); // Round to hour

  await db.query(
    `INSERT INTO posting_rate_limits (user_id, window_start, replies_in_window)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, window_start) DO UPDATE SET
       replies_in_window = posting_rate_limits.replies_in_window + 1`,
    [userId, windowStart]
  );
}

module.exports = { postReply };
