/**
 * Posting API Routes
 *
 * Endpoints for queuing posts, viewing posting history, and stats.
 */

const db = require('../config/database');
const { queueForPosting, getQueueStats } = require('../services/posting/queue');
const { checkRateLimits } = require('../services/posting/publisher');

function registerPostingRoutes(app) {

  // Queue an approved draft for posting
  app.post('/api/posting/queue', async (req, res) => {
    try {
      const { userId, draftId } = req.body;
      if (!userId || !draftId) {
        return res.status(400).json({ error: 'userId and draftId are required' });
      }

      await checkRateLimits(userId);

      const jobId = await queueForPosting(userId, draftId);
      res.json({ ok: true, jobId, message: `Draft ${draftId} queued for posting` });
    } catch (err) {
      const status = err.message.includes('Rate limit') ? 429 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // Get posting history
  app.get('/api/posted/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit) || 20;
      const result = await db.query(
        `SELECT pr.*, d.reply_text, d.response_type,
                ot.content as original_tweet, ot.author_handle
         FROM posted_replies pr
         JOIN drafts d ON d.id = pr.draft_id
         JOIN opportunities o ON o.id = d.opportunity_id
         JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
         WHERE pr.user_id = $1
         ORDER BY pr.posted_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get posting stats
  app.get('/api/posted/:userId/stats', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'posted') as total_posted,
           COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
           COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '24 hours' AND status = 'posted') as posted_today,
           COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '1 hour' AND status = 'posted') as posted_this_hour,
           AVG(typing_duration_ms) FILTER (WHERE status = 'posted') as avg_typing_ms
         FROM posted_replies WHERE user_id = $1`,
        [userId]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get posting queue status
  app.get('/api/posting/queue/stats', async (req, res) => {
    try {
      const stats = await getQueueStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get engagement tracking data for a posted reply
  app.get('/api/posted/:userId/engagement/:postId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const postId = parseInt(req.params.postId);
      const result = await db.query(
        `SELECT id, reply_url, engagement_1h, engagement_4h, engagement_24h,
                typing_duration_ms, device_used, posted_at, status
         FROM posted_replies
         WHERE id = $1 AND user_id = $2`,
        [postId, userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Posted reply not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerPostingRoutes };
