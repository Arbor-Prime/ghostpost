/**
 * GhostPost Results Dashboard API (Sprint 18)
 * 
 * Lightweight endpoints designed for the Command Centre.
 * These return ONLY results and leads — not the full GP internals.
 * The CC polls these to show a "GhostPost" card/tab.
 */

const db = require('../config/database');

function registerResultsRoutes(app) {

  // CORS middleware for results endpoints — allows CC to call from different domain
  app.use('/api/results', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  /**
   * GET /api/results/overview
   * Single call that gives the CC everything it needs for the GhostPost card.
   */
  app.get('/api/results/overview', async (req, res) => {
    try {
      // Outreach stats
      const outreach = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM platform_accounts WHERE status = 'active') as active_accounts,
          (SELECT COUNT(*) FROM campaigns WHERE status = 'active') as active_campaigns,
          (SELECT COUNT(*) FROM leads) as total_leads,
          (SELECT COUNT(*) FROM leads WHERE status = 'dm_sent') as dms_sent,
          (SELECT COUNT(*) FROM leads WHERE status = 'replied') as replies_received,
          (SELECT COUNT(*) FROM leads WHERE status = 'converted') as conversions,
          (SELECT COUNT(*) FROM leads WHERE dm_sent_at > NOW() - INTERVAL '24 hours') as dms_today,
          (SELECT COUNT(*) FROM leads WHERE dm_sent_at > NOW() - INTERVAL '7 days') as dms_this_week,
          (SELECT COUNT(*) FROM leads WHERE replied_at > NOW() - INTERVAL '7 days') as replies_this_week
      `).catch(() => ({ rows: [{}] }));

      // LinkedIn content stats — placeholder until LinkedIn automation is live
      const linkedin = { rows: [{ total_posts: '0', drafts: '0', approved: '0', posted: '0', total_impressions: '0', total_likes: '0', total_linkedin_leads: '0' }] };

      // X/Twitter stats
      const twitter = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM drafts WHERE status = 'pending') as pending_drafts,
          (SELECT COUNT(*) FROM drafts WHERE status = 'approved') as approved_drafts,
          (SELECT COUNT(*) FROM posted_replies) as replies_posted,
          (SELECT COUNT(*) FROM observed_tweets) as tweets_scanned,
          (SELECT COUNT(*) FROM opportunities) as opportunities_found
      `).catch(() => ({ rows: [{}] }));

      // Learning engine stats
      const learning = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM observed_conversations) as conversations_watched,
          (SELECT COUNT(*) FROM observed_messages) as messages_observed,
          (SELECT COUNT(*) FROM learned_patterns WHERE status = 'active') as active_patterns
      `).catch(() => ({ rows: [{}] }));

      // Voice profile status
      const voice = await db.query(
        'SELECT voice_onboarding_status, voice_profile IS NOT NULL as has_profile FROM users WHERE id = 1'
      ).catch(() => ({ rows: [{}] }));

      res.json({
        outreach: outreach.rows[0] || {},
        linkedin: linkedin.rows[0] || {},
        twitter: twitter.rows[0] || {},
        learning: learning.rows[0] || {},
        voice: voice.rows[0] || {},
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/results/leads
   * Leads that need attention — replied, hot, or recent.
   */
  app.get('/api/results/leads', async (req, res) => {
    const { status, platform, limit = 50, offset = 0 } = req.query;
    try {
      let query = `
        SELECT l.*, c.name as campaign_name, c.platform as campaign_platform
        FROM leads l
        LEFT JOIN campaigns c ON l.campaign_id = c.id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;
      if (status) { query += ` AND l.status = $${idx++}`; params.push(status); }
      if (platform) { query += ` AND l.platform = $${idx++}`; params.push(platform); }
      query += ` ORDER BY l.updated_at DESC LIMIT $${idx++} OFFSET $${idx}`;
      params.push(parseInt(limit), parseInt(offset));

      const leads = await db.query(query, params);
      res.json({ leads: leads.rows, count: leads.rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/results/leads/hot
   * Leads that replied — need human follow-up.
   */
  app.get('/api/results/leads/hot', async (req, res) => {
    try {
      const leads = await db.query(`
        SELECT l.*, c.name as campaign_name
        FROM leads l
        LEFT JOIN campaigns c ON l.campaign_id = c.id
        WHERE l.status = 'replied'
        ORDER BY l.replied_at DESC
        LIMIT 20
      `);
      res.json({ leads: leads.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/results/activity
   * Recent activity feed — last 50 actions across all systems.
   */
  app.get('/api/results/activity', async (req, res) => {
    try {
      // Combine recent activity from multiple tables
      const activity = await db.query(`
        (
          SELECT 'dm_sent' as type, platform, username as target, dm_sent_at as timestamp, message_used as detail
          FROM leads WHERE dm_sent_at IS NOT NULL
          ORDER BY dm_sent_at DESC LIMIT 20
        )
        UNION ALL
        (
          SELECT 'reply_posted' as type, 'x' as platform, author_handle as target, posted_at as timestamp, reply_text as detail
          FROM posted_replies
          ORDER BY posted_at DESC LIMIT 15
        )
        UNION ALL
        (
          SELECT 'draft_generated' as type, 'x' as platform, 
            (SELECT author_handle FROM observed_tweets ot JOIN opportunities o ON o.tweet_id = ot.tweet_id WHERE o.id = d.opportunity_id LIMIT 1) as target,
            d.created_at as timestamp, d.reply_text as detail
          FROM drafts d WHERE d.status = 'pending'
          ORDER BY d.created_at DESC LIMIT 15
        )
        ORDER BY timestamp DESC
        LIMIT 50
      `);

      res.json({ activity: activity.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/results/campaigns
   * Campaign performance summary for CC dashboard.
   */
  app.get('/api/results/campaigns', async (req, res) => {
    try {
      const campaigns = await db.query(`
        SELECT c.id, c.name, c.platform, c.status, c.daily_limit,
          c.total_sent, c.total_replies, c.total_conversions,
          c.started_at, c.created_at,
          pa.username as account_username,
          (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) as total_leads,
          (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status = 'queued') as queued,
          (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status = 'dm_sent') as sent,
          (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status = 'replied') as replied,
          (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status = 'converted') as converted,
          CASE WHEN c.total_sent > 0 THEN ROUND(c.total_replies::numeric / c.total_sent * 100, 1) ELSE 0 END as reply_rate
        FROM campaigns c
        LEFT JOIN platform_accounts pa ON c.account_id = pa.id
        ORDER BY c.created_at DESC
      `);
      res.json({ campaigns: campaigns.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/results/conversion-funnel
   * Funnel: leads → contacted → replied → converted
   */
  app.get('/api/results/conversion-funnel', async (req, res) => {
    try {
      const funnel = await db.query(`
        SELECT
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status IN ('dm_sent', 'followup_sent', 'replied', 'converted')) as contacted,
          COUNT(*) FILTER (WHERE status IN ('replied', 'converted')) as replied,
          COUNT(*) FILTER (WHERE status = 'converted') as converted
        FROM leads
      `);
      const f = funnel.rows[0];
      res.json({
        funnel: {
          leads: parseInt(f.total_leads),
          contacted: parseInt(f.contacted),
          replied: parseInt(f.replied),
          converted: parseInt(f.converted),
          contactRate: f.total_leads > 0 ? Math.round(f.contacted / f.total_leads * 100) : 0,
          replyRate: f.contacted > 0 ? Math.round(f.replied / f.contacted * 100) : 0,
          conversionRate: f.replied > 0 ? Math.round(f.converted / f.replied * 100) : 0,
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[Server] Results dashboard routes registered (Sprint 18)');
}

module.exports = { registerResultsRoutes };
