/**
 * Opportunity API Routes
 */

const db = require('../config/database');

function registerOpportunityRoutes(app) {

  // Get top opportunities for a user
  app.get('/api/opportunities/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit) || 20;
      const status = req.query.status || 'pending';

      const result = await db.query(
        `SELECT o.*, ot.content as tweet_content, ot.author_handle, ot.likes_count, ot.retweets_count, ot.replies_count, ot.tweet_url
         FROM opportunities o
         JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
         WHERE o.user_id = $1 AND o.status = $2
         ORDER BY o.overall_score DESC
         LIMIT $3`,
        [userId, status, limit]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Skip an opportunity
  app.post('/api/opportunities/:id/skip', async (req, res) => {
    try {
      await db.query("UPDATE opportunities SET status = 'skipped' WHERE id = $1", [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get opportunity stats for a user
  app.get('/api/opportunities/:userId/stats', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'pending') as pending,
           COUNT(*) FILTER (WHERE status = 'queued') as queued,
           COUNT(*) FILTER (WHERE status = 'drafted') as drafted,
           COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
           ROUND(AVG(overall_score)::numeric, 2) as avg_score,
           ROUND(MAX(overall_score)::numeric, 2) as max_score
         FROM opportunities WHERE user_id = $1`,
        [userId]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerOpportunityRoutes };
