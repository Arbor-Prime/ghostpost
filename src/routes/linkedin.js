/**
 * LinkedIn Content API Routes (Sprint 18)
 * Same pattern as all other route files.
 */

const db = require('../config/database');
const LinkedInContentEngine = require('../services/linkedin/content-engine');

const engine = new LinkedInContentEngine();

function registerLinkedInRoutes(app) {

  // Generate a single post
  app.post('/api/linkedin/generate', async (req, res) => {
    const { userId = 1, pillar, framework, topic, tone, customPrompt } = req.body;
    try {
      const result = await engine.generatePost(userId, { pillar, framework, topic, tone, customPrompt });
      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate weekly calendar (4 posts)
  app.post('/api/linkedin/generate-week', async (req, res) => {
    const { userId = 1, weekOf, customTopics, customPrompt } = req.body;
    try {
      const result = await engine.generateWeek(userId, { weekOf, customTopics, customPrompt });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trend-jack a topic
  app.post('/api/linkedin/trend-jack', async (req, res) => {
    const { userId = 1, trendTopic, newsUrl, angle, customPrompt } = req.body;
    if (!trendTopic) return res.status(400).json({ error: 'trendTopic required' });
    try {
      const result = await engine.trendJack(userId, { trendTopic, newsUrl, angle, customPrompt });
      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Scan for trends
  app.post('/api/linkedin/scan-trends', async (req, res) => {
    const { userId = 1 } = req.body;
    try {
      const trends = await engine.scanTrends(userId);
      res.json({ trends });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rewrite a post
  app.post('/api/linkedin/rewrite', async (req, res) => {
    const { userId = 1, originalPost, instructions } = req.body;
    if (!originalPost) return res.status(400).json({ error: 'originalPost required' });
    try {
      const result = await engine.rewrite(userId, originalPost, instructions);
      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate edu-sell post (no CTA, pure education — Cleo method)
  app.post('/api/linkedin/edu-sell', async (req, res) => {
    const { userId = 1, pillar, framework, topic, tone, customPrompt } = req.body;
    try {
      const result = await engine.generateEduSell(userId, { pillar, framework, topic, tone, customPrompt });
      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate launch post (scarcity, urgency, FOMO)
  app.post('/api/linkedin/launch-post', async (req, res) => {
    const { userId = 1, topic, customPrompt } = req.body;
    try {
      const result = await engine.generateLaunchPost(userId, { topic, customPrompt });
      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate waitlist post (curiosity, exclusivity)
  app.post('/api/linkedin/waitlist-post', async (req, res) => {
    const { userId = 1, topic, customPrompt } = req.body;
    try {
      const result = await engine.generateWaitlistPost(userId, { topic, customPrompt });
      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate waitlist nurture email sequence (10 emails, Cleo method)
  app.post('/api/linkedin/nurture-sequence', async (req, res) => {
    const { userId = 1, productName, launchDate, problemStatement, customPrompt } = req.body;
    try {
      const result = await engine.generateNurtureSequence(userId, { productName, launchDate, problemStatement, customPrompt });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate webinar / LinkedIn Live prep pack
  app.post('/api/linkedin/webinar-prep', async (req, res) => {
    const { userId = 1, topic, productName, webinarDate, customPrompt } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic required' });
    try {
      const result = await engine.generateWebinarPrep(userId, { topic, productName, webinarDate, customPrompt });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // List posts
  app.get('/api/linkedin/posts', async (req, res) => {
    const { status, pillar, weekOf, limit = 20, offset = 0 } = req.query;
    try {
      let query = 'SELECT * FROM linkedin_posts WHERE 1=1';
      const params = [];
      let idx = 1;
      if (status) { query += ` AND status = $${idx++}`; params.push(status); }
      if (pillar) { query += ` AND pillar = $${idx++}`; params.push(pillar); }
      if (weekOf) { query += ` AND week_of = $${idx++}`; params.push(weekOf); }
      query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
      params.push(parseInt(limit), parseInt(offset));

      const posts = await db.query(query, params);
      const total = await db.query('SELECT COUNT(*) FROM linkedin_posts');
      res.json({ posts: posts.rows, total: parseInt(total.rows[0].count) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single post
  app.get('/api/linkedin/posts/:id', async (req, res) => {
    try {
      const post = await db.query('SELECT * FROM linkedin_posts WHERE id = $1', [req.params.id]);
      if (!post.rows[0]) return res.status(404).json({ error: 'Post not found' });
      res.json(post.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update post
  app.put('/api/linkedin/posts/:id', async (req, res) => {
    const { fullPost, status, scheduledFor, notes } = req.body;
    try {
      const sets = ['updated_at = NOW()'];
      const params = [];
      let idx = 1;
      if (fullPost !== undefined) { sets.push(`full_post = $${idx++}`); params.push(fullPost); }
      if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
      if (scheduledFor !== undefined) { sets.push(`scheduled_for = $${idx++}`); params.push(scheduledFor); }
      if (notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(notes); }
      params.push(req.params.id);
      await db.query(`UPDATE linkedin_posts SET ${sets.join(', ')} WHERE id = $${idx}`, params);
      res.json({ status: 'updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete post
  app.delete('/api/linkedin/posts/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM linkedin_posts WHERE id = $1', [req.params.id]);
      res.json({ status: 'deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Regenerate post
  app.post('/api/linkedin/posts/:id/regenerate', async (req, res) => {
    try {
      const post = await db.query('SELECT * FROM linkedin_posts WHERE id = $1', [req.params.id]);
      if (!post.rows[0]) return res.status(404).json({ error: 'Post not found' });
      const old = post.rows[0];

      const result = await engine.generatePost(old.user_id, {
        pillar: old.pillar, framework: old.framework, tone: old.tone
      });

      await db.query(
        'UPDATE linkedin_posts SET status = $1, regeneration_count = regeneration_count + 1 WHERE id = $2',
        ['rejected', req.params.id]
      );

      res.json({ post: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Track performance
  app.post('/api/linkedin/posts/:id/track', async (req, res) => {
    const { impressions = 0, likes = 0, comments = 0, leads = 0 } = req.body;
    try {
      await db.query(`
        UPDATE linkedin_posts SET impressions = $1, likes = $2, comments = $3, leads_generated = $4,
          status = 'posted', posted_at = NOW(), updated_at = NOW()
        WHERE id = $5
      `, [impressions, likes, comments, leads, req.params.id]);
      res.json({ status: 'tracked' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Analytics
  app.get('/api/linkedin/analytics', async (req, res) => {
    try {
      const statusCounts = await db.query(`
        SELECT status, COUNT(*) as count FROM linkedin_posts GROUP BY status
      `);

      const performance = await db.query(`
        SELECT
          SUM(impressions) as total_impressions, SUM(likes) as total_likes,
          SUM(comments) as total_comments, SUM(leads_generated) as total_leads,
          AVG(impressions) as avg_impressions, AVG(likes) as avg_likes,
          COUNT(*) as posts_tracked
        FROM linkedin_posts WHERE status = 'posted'
      `);

      const pillarPerf = await db.query(`
        SELECT pillar, AVG(impressions) as avg_impressions, AVG(likes) as avg_likes, COUNT(*) as total_posts
        FROM linkedin_posts WHERE status = 'posted' GROUP BY pillar
      `);

      const bestPosts = await db.query(`
        SELECT id, hook, pillar, framework, impressions, likes, comments, leads_generated
        FROM linkedin_posts WHERE status = 'posted' ORDER BY impressions DESC LIMIT 5
      `);

      res.json({
        statusCounts: Object.fromEntries(statusCounts.rows.map(r => [r.status, parseInt(r.count)])),
        performance: performance.rows[0] || {},
        pillarPerformance: Object.fromEntries(pillarPerf.rows.map(r => [r.pillar, r])),
        bestPosts: bestPosts.rows
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[Server] LinkedIn content routes registered (Sprint 18)');
}

module.exports = { registerLinkedInRoutes };
