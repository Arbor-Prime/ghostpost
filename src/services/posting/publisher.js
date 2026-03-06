/**
 * Reply Publisher
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

async function postReply(userId, draftId, io = null) {
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

  await checkRateLimits(userId);

  const currentHour = new Date().getHours();
  const device = (persona.mobile_hours || []).includes(currentHour) ? 'mobile' : 'desktop';
  const fingerprint = device === 'mobile' ? draft.fingerprint_mobile : draft.fingerprint_desktop;
  const proxy = draft.proxy_host ? {
    host: draft.proxy_host, port: draft.proxy_port,
    user: draft.proxy_user, pass: draft.proxy_pass_encrypted,
  } : null;

  let browser, context, page;

  const emit = (event, data) => {
    if (io) io.emit(event, data);
  };

  try {
    emit('reply:posting', { draftId, userId, status: 'launching_browser', device });

    ({ browser, context, page } = await launchLoggedInSession(userId, 'x', fingerprint, proxy));

    if (!page.__isLoggedIn && !(await checkLoggedIn(page))) {
      throw new Error('Not logged in — cookies expired. Re-authenticate required.');
    }

    emit('reply:posting', { draftId, userId, status: 'navigating' });

    await page.goto(draft.tweet_url, { waitUntil: 'domcontentloaded' });
    await humanDelay(2000, 0.3);

    await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
    await humanDelay(1500, 0.3);

    await page.evaluate(() => {
      const tweet = document.querySelector('[data-testid="tweet"]');
      if (tweet) tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await humanDelay(2000, 0.5);

    // Dismiss any overlay modals (Monetization, Premium prompts, etc.) that block the reply button
    try {
      const closed = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        for (const d of dialogs) {
          const closeBtn = d.querySelector('[data-testid="app-bar-close"], [aria-label="Close"], button[aria-label="Close"]');
          if (closeBtn) { closeBtn.click(); return true; }
        }
        return false;
      });
      if (closed) await humanDelay(1000, 0.3);
    } catch (_) {}

    // Scope to main tweet's reply button (avoids picking disabled/overlay elements)
    const replySelector = '[data-testid="tweet"] [data-testid="reply"]';

    if (device === 'desktop') {
      const replyBtn = await page.$(replySelector);
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

    // Wait for reply button to be enabled (X sometimes renders it disabled initially)
    await page.waitForSelector(replySelector, { state: 'visible', timeout: 15000 });
    await page.waitForSelector(replySelector, { state: 'enabled', timeout: 10000 }).catch(() => null);
    const replyButton = await page.$(replySelector);
    if (!replyButton) throw new Error('Reply button not found on tweet page');
    await page.screenshot({ path: '/tmp/before-click-reply.png' });
    console.log('[Publisher] Screenshot saved to /tmp/before-click-reply.png');
    await replyButton.click({ force: true });
    await humanDelay(1000, 0.3);

    const replyInput = '[data-testid="tweetTextarea_0"]';
    await page.waitForSelector(replyInput, { timeout: 10000 });
    await humanDelay(500, 0.2);

    emit('reply:posting', { draftId, userId, status: 'typing', device });

    const replyText = draft.reply_text || draft.content;
    const typeFunc = device === 'mobile' ? humanTypeMobile : humanType;
    const { totalMs, corrections } = await typeFunc(page, replyInput, replyText, persona);

    await humanDelay(1500, 0.5);

    emit('reply:posting', { draftId, userId, status: 'sending' });

    let sendButton = await page.$('[data-testid="tweetButtonInline"]');
    if (!sendButton) {
      sendButton = await page.$('[data-testid="tweetButton"]');
    }
    if (!sendButton) throw new Error('Send/Reply button not found');

    if (device === 'desktop') {
      const box = await sendButton.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(randomBetween(100, 300));
      }
    }

    await sendButton.click();
    await humanDelay(3000, 0.3);

    let replyTweetId = null;
    try {
      const currentUrl = page.url();
      const match = currentUrl.match(/\/status\/(\d+)/);
      if (match) replyTweetId = match[1];
    } catch (_) { /* non-fatal */ }

    await saveBrowserSession(userId, 'x', context);

    const postResult = await db.query(
      `INSERT INTO posted_replies (draft_id, user_id, tweet_id, reply_tweet_id, reply_url, typing_duration_ms, device_used, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'posted') RETURNING id`,
      [draftId, userId, draft.tweet_id, replyTweetId,
       replyTweetId ? `https://x.com/i/status/${replyTweetId}` : null,
       totalMs, device]
    );

    await db.query("UPDATE drafts SET status = 'posted' WHERE id = $1", [draftId]);
    await db.query("UPDATE opportunities SET status = 'posted' WHERE id = $1", [draft.opportunity_id]);

    emit('reply:posted', {
      draftId, userId, postId: postResult.rows[0].id,
      replyTweetId, typingMs: totalMs, corrections, device,
    });

    console.log(`[Publisher] Reply posted for draft ${draftId} (${Math.round(totalMs / 1000)}s typing, ${corrections} corrections, ${device})`);
    return { postId: postResult.rows[0].id, replyTweetId, typingDurationMs: totalMs, corrections };

  } catch (err) {
    console.error(`[Publisher] Failed to post draft ${draftId}: ${err.message}`);

    try {
      await db.query(
        `INSERT INTO posted_replies (draft_id, user_id, tweet_id, typing_duration_ms, device_used, status, error_message)
         VALUES ($1, $2, $3, 0, $4, 'failed', $5)`,
        [draftId, userId, draft?.tweet_id, device || 'desktop', err.message.substring(0, 500)]
      );
    } catch (dbErr) {
      console.error('[Publisher] Failed to record failure:', dbErr.message);
    }

    if (err.message.includes('Not logged in') || err.message.includes('expired')) {
      await invalidateSession(userId, 'x');
    }

    emit('reply:failed', { draftId, userId, error: err.message });
    throw err;

  } finally {
    if (page) try { await page.close(); } catch (_) {}
    if (context) try { await context.close(); } catch (_) {}
    if (browser) try { await browser.close(); } catch (_) {}
  }
}

async function checkLoggedIn(page) {
  try {
    return await page.evaluate(() =>
      !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
    );
  } catch {
    return false;
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

module.exports = { postReply, checkRateLimits };
