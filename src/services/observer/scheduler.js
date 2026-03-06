/**
 * Observation Scheduler
 * 
 * BullMQ queue that:
 * - Checks every 15 minutes which sessions are due from daily_schedules
 * - Queues observation jobs with customer's proxy, fingerprint, and target handles
 * - Worker processes jobs: launch browser, browse targets, extract tweets, tear down
 * - Max 5 concurrent workers (protects RAM)
 * - Logs sessions to observation_sessions table
 * 
 * Sprint 5: Now reads from daily_schedules table instead of last_observation_at.
 */

const { Queue, Worker } = require('bullmq');
const { launchSession } = require('./launcher');
const { browseProfile } = require('./browser');
const { randomBetween } = require('../../utils/humanise');
const { scoreTweets, storeOpportunities } = require('../scoring/opportunity-scorer');

// DB pool — Sprint 1 exports the pool directly
const db = require('../../config/database');

const QUEUE_NAME = 'observation-queue';
const CONCURRENCY = 5;

// Socket.io instance — set by server.js after io is created
let _io = null;
function setIo(ioInstance) { _io = ioInstance; }
function emit(event, data) { if (_io) _io.emit(event, data); }

// Redis connection for BullMQ (separate from the ioredis singleton used elsewhere)
const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// --- Queue Setup ---
const observationQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

/**
 * Check daily_schedules for sessions due in the current 15-min window and queue them.
 */
async function scheduleObservations() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const dateStr = now.toISOString().split('T')[0];

  console.log(`[Scheduler] Checking schedules for ${dateStr} ${currentHour}:${String(currentMinute).padStart(2, '0')}`);

  // Find sessions due in the next 15-minute window
  const result = await db.query(
    `SELECT ds.user_id, ds.sessions, u.proxy_host, u.proxy_port, u.proxy_user, u.proxy_pass_encrypted,
            u.fingerprint_mobile, u.fingerprint_desktop, u.persona
     FROM daily_schedules ds
     JOIN users u ON u.id = ds.user_id
     WHERE ds.schedule_date = $1 AND u.status = 'active' AND ds.is_zero_day = FALSE`,
    [dateStr]
  );

  let queued = 0;

  for (const row of result.rows) {
    const sessions = row.sessions || [];

    for (const session of sessions) {
      // Check if this session falls in the current 15-min window
      const sessionMinutes = session.hour * 60 + session.minute;
      const currentMinutes = currentHour * 60 + currentMinute;

      if (sessionMinutes >= currentMinutes && sessionMinutes < currentMinutes + 15) {
        // Check it hasn't already been queued
        const existing = await db.query(
          `SELECT id FROM observation_sessions 
           WHERE user_id = $1 AND started_at > NOW() - INTERVAL '15 minutes' AND status != 'failed'`,
          [row.user_id]
        );
        if (existing.rows.length > 0) continue;

        const fingerprint = session.device === 'mobile'
          ? row.fingerprint_mobile
          : row.fingerprint_desktop;

        const profiles = await db.query(
          'SELECT x_handle FROM tracked_profiles WHERE user_id = $1',
          [row.user_id]
        );
        if (profiles.rows.length === 0) continue;

        await observationQueue.add('observe', {
          userId: row.user_id,
          fingerprintType: session.device,
          sessionType: session.type,
          targetHandles: profiles.rows.map(r => r.x_handle),
          proxy: row.proxy_host ? {
            host: row.proxy_host, port: row.proxy_port,
            user: row.proxy_user, pass: row.proxy_pass_encrypted,
          } : null,
          fingerprint,
        }, {
          removeOnComplete: 100, removeOnFail: 50,
          attempts: 2, backoff: { type: 'exponential', delay: 60000 },
        });

        queued++;
        console.log(`[Scheduler] Queued ${session.type} session for user ${row.user_id} (${session.device}, ${session.hour}:${String(session.minute).padStart(2, '0')})`);
      }
    }
  }

  if (queued === 0) {
    console.log(`[Scheduler] No sessions due in this window`);
  }
}

// --- Worker ---
const worker = new Worker(QUEUE_NAME, async (job) => {
  const { userId, fingerprintType, targetHandles, proxy, fingerprint } = job.data;
  const sessionStart = new Date();

  console.log(`[Worker] Starting observation for customer ${userId} (${fingerprintType})`);
  emit('scan:started', { userId, handles: targetHandles, timestamp: new Date() });

  // Log session start
  const sessionResult = await db.query(
    `INSERT INTO observation_sessions (user_id, fingerprint_type, started_at, status)
     VALUES ($1, $2, $3, 'running') RETURNING id`,
    [userId, fingerprintType, sessionStart]
  );
  const sessionId = sessionResult.rows[0].id;

  let browser, context, page;

  try {
    // Launch browser with customer's fingerprint and proxy
    ({ browser, context, page } = await launchSession(fingerprint, proxy));

    let totalScrolls = 0;
    const seenTweetIds = new Set();

    // Tweet storage callback — called by browser.js after each scroll extraction
    const onTweetsExtracted = async (tweets, authorHandle) => {
      let stored = 0;
      for (const tweet of tweets) {
        if (seenTweetIds.has(tweet.tweetId)) continue;
        seenTweetIds.add(tweet.tweetId);

        try {
          await db.query(`
            INSERT INTO observed_tweets 
              (session_id, user_id, tweet_id, author_handle, author_display_name,
               content, tweet_url, posted_at, likes_count, retweets_count,
               replies_count, views_count, is_reply, reply_to_handle, has_media)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (tweet_id) DO UPDATE SET
              likes_count = EXCLUDED.likes_count,
              retweets_count = EXCLUDED.retweets_count,
              replies_count = EXCLUDED.replies_count,
              views_count = EXCLUDED.views_count
          `, [
            sessionId, userId, tweet.tweetId, tweet.authorHandle,
            tweet.authorDisplayName, tweet.content, tweet.tweetUrl,
            tweet.postedAt, tweet.likes, tweet.retweets,
            tweet.replies, tweet.views, tweet.isReply,
            tweet.replyToHandle, tweet.hasMedia
          ]);
          stored++;
        } catch (err) {
          console.error(`[Worker] Failed to store tweet ${tweet.tweetId}: ${err.message}`);
        }
      }
      if (stored > 0) {
        console.log(`[Worker] Stored ${stored} new tweets from @${authorHandle} (${seenTweetIds.size} total this session)`);
        emit('scan:tweets_found', { userId, handle: authorHandle, count: stored, total: seenTweetIds.size });
      }
    };

    // Browse each target profile
    for (const handle of targetHandles) {
      const result = await browseProfile(page, handle, fingerprint, onTweetsExtracted);
      totalScrolls += result.scrollCount;

      if (result.hitLoginWall) {
        console.log(`[Worker] Login wall hit for ${handle}, stopping session`);
        break;
      }

      // Small pause between profiles (like switching tabs)
      if (targetHandles.indexOf(handle) < targetHandles.length - 1) {
        const pauseMs = randomBetween(3000, 8000);
        console.log(`[Worker] Pausing ${Math.round(pauseMs / 1000)}s before next profile`);
        await new Promise(r => setTimeout(r, pauseMs));
      }
    }

    // Update session as completed with actual tweet count
    await db.query(
      `UPDATE observation_sessions SET ended_at = NOW(), status = 'completed', tweets_found = $1
       WHERE id = $2`,
      [seenTweetIds.size, sessionId]
    );

    // Update customer's last observation timestamp
    await db.query(
      'UPDATE users SET last_observation_at = NOW() WHERE id = $1',
      [userId]
    );

    console.log(`[Worker] Session ${sessionId} completed: ${totalScrolls} total scrolls, ${seenTweetIds.size} tweets extracted across ${targetHandles.length} profiles`);
    emit('scan:completed', { userId, sessionId, tweetsExtracted: seenTweetIds.size, handles: targetHandles, duration: Date.now() - sessionStart.getTime() });

    // Score extracted tweets for opportunities (Sprint 6)
    if (seenTweetIds.size > 0) {
      try {
        const user = await db.query('SELECT voice_profile, persona FROM users WHERE id = $1', [userId]);
        if (user.rows[0]?.voice_profile && user.rows[0]?.persona) {
          const tweets = await db.query(
            'SELECT * FROM observed_tweets WHERE tweet_id = ANY($1)',
            [Array.from(seenTweetIds)]
          );
          const opportunities = await scoreTweets(userId, tweets.rows, user.rows[0].voice_profile, user.rows[0].persona);
          await storeOpportunities(opportunities);
          console.log(`[Worker] Scored ${opportunities.length} opportunities from ${seenTweetIds.size} tweets`);
          opportunities.forEach(opp => {
            emit('opportunity:scored', { userId, tweetId: opp.tweetId, score: opp.overall_score, handle: opp.authorHandle });
          });
        } else {
          console.log(`[Worker] Skipping scoring — user ${userId} missing voice profile or persona`);
        }
      } catch (err) {
        console.error(`[Worker] Scoring failed: ${err.message}`);
      }
    }

    // Sprint 7: If this is an engage session, generate replies for top opportunities
    if (job.data.sessionType === 'engage') {
      try {
        const { generateReply } = require('../brain/reply-generator');

        const topOpps = await db.query(
          `SELECT id FROM opportunities 
           WHERE user_id = $1 AND status = 'pending' 
           ORDER BY overall_score DESC LIMIT 3`,
          [userId]
        );

        for (const opp of topOpps.rows) {
          try {
            const draft = await generateReply(userId, opp.id);
            console.log(`[Worker] Generated draft: "${draft.replyText.substring(0, 50)}..."`);
          } catch (err) {
            console.error(`[Worker] Draft generation failed for opp ${opp.id}: ${err.message}`);
          }
        }
      } catch (err) {
        console.error(`[Worker] Reply generation failed: ${err.message}`);
      }
    }

  } catch (err) {
    console.error(`[Worker] Session ${sessionId} failed: ${err.message}`);
    await db.query(
      `UPDATE observation_sessions SET ended_at = NOW(), status = 'failed', error_message = $1
       WHERE id = $2`,
      [err.message.substring(0, 500), sessionId]
    );
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    console.log(`[Worker] Browser closed for session ${sessionId}`);
  }
}, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
});

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

// --- Scheduler Loop ---
async function startScheduler() {
  console.log('[Scheduler] Starting observation scheduler (15-min interval)');

  // Run immediately on start
  await scheduleObservations();

  // Then every 15 minutes
  setInterval(async () => {
    try {
      await scheduleObservations();
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  }, 15 * 60 * 1000);
}

// --- API Endpoints ---
function registerObserverRoutes(app) {
  // Get observation stats
  app.get('/api/observer/stats', async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') as sessions_today,
          SUM(tweets_found) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') as tweets_today,
          SUM(opportunities_found) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') as opportunities_today,
          AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) FILTER (WHERE status = 'completed' AND started_at > NOW() - INTERVAL '24 hours') as avg_duration_secs,
          COUNT(*) FILTER (WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours') as failed_today
        FROM observation_sessions
      `);

      const queueCounts = await observationQueue.getJobCounts();

      res.json({
        ...stats.rows[0],
        queue: queueCounts,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manually trigger observation for a customer
  app.post('/api/observer/trigger/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const customer = result.rows[0];
      const profiles = await db.query('SELECT x_handle FROM tracked_profiles WHERE user_id = $1', [userId]);

      if (profiles.rows.length === 0) return res.json({ error: 'No tracked profiles' });

      const fingerprintType = 'desktop';

      await observationQueue.add('observe', {
        userId,
        fingerprintType,
        targetHandles: profiles.rows.map(r => r.x_handle),
        proxy: customer.proxy_host ? {
          host: customer.proxy_host,
          port: customer.proxy_port,
          user: customer.proxy_user,
          pass: customer.proxy_pass_encrypted,
        } : null,
        fingerprint: customer.fingerprint_desktop || customer.fingerprint_mobile,
      });

      res.json({ ok: true, message: `Observation queued for user ${userId}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // List recent observation sessions
  app.get('/api/observer/sessions', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const result = await db.query(
        'SELECT * FROM observation_sessions ORDER BY started_at DESC LIMIT $1',
        [limit]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get extracted tweets for a user
  app.get('/api/observer/tweets/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit) || 50;
      const result = await db.query(
        `SELECT * FROM observed_tweets 
         WHERE user_id = $1 
         ORDER BY extracted_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// --- Startup ---
if (require.main === module) {
  require('dotenv').config();
  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    scheduleObservations().then(() => {
      console.log('[Scheduler] One-time check complete');
      setTimeout(() => process.exit(0), 5000);
    });
  } else {
    startScheduler();
  }
}

module.exports = { observationQueue, scheduleObservations, registerObserverRoutes, startScheduler, setIo };
