/**
 * Multi-Platform Outreach API Routes (Sprint 16)
 * 
 * Same pattern as auth.js, voice.js, etc — direct app.get/app.post
 * No Express Router, no external dependencies beyond db.
 */

const db = require('../config/database');

function registerOutreachRoutes(app) {

  // ============================================================
  // PLATFORM ACCOUNTS
  // ============================================================

  app.get('/api/outreach/accounts', async (req, res) => {
    try {
      const accounts = await db.query(`
        SELECT id, user_id, platform, username, display_name, status, trust_score,
               daily_actions, last_active_at, warmup_started_at, warmup_completed_at, created_at
        FROM platform_accounts
        ORDER BY platform, created_at DESC
      `);
      res.json({ accounts: accounts.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/outreach/accounts', async (req, res) => {
    const { userId = 1, platform, username, proxyServer, proxyUsername, proxyPassword } = req.body;
    if (!platform || !username) {
      return res.status(400).json({ error: 'platform and username required' });
    }
    try {
      const proxyConfig = proxyServer ? { server: proxyServer, username: proxyUsername || '', password: proxyPassword || '' } : {};
      const result = await db.query(`
        INSERT INTO platform_accounts (user_id, platform, username, proxy_config, warmup_started_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *
      `, [userId, platform, username, JSON.stringify(proxyConfig)]);
      res.json({ account: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Account already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/outreach/accounts/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
      await db.query('UPDATE platform_accounts SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // CAMPAIGNS
  // ============================================================

  app.get('/api/outreach/campaigns', async (req, res) => {
    try {
      const campaigns = await db.query(`
        SELECT c.*, pa.username as account_username, pa.status as account_status,
               (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) as total_leads,
               (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status = 'queued') as queued_leads,
               (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status IN ('dm_sent', 'followup_sent')) as sent_leads,
               (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status = 'replied') as replied_leads
        FROM campaigns c
        LEFT JOIN platform_accounts pa ON c.account_id = pa.id
        ORDER BY c.created_at DESC
      `);
      res.json({ campaigns: campaigns.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/outreach/campaigns', async (req, res) => {
    const {
      userId = 1, name, platform, accountId,
      targetVerticals, targetLocations, searchQueries, hashtags,
      messageTemplates, followupTemplates,
      dailyLimit = 20, hourlyLimit = 5,
      activeHours, activeDays
    } = req.body;
    if (!name || !platform || !accountId) {
      return res.status(400).json({ error: 'name, platform, and accountId required' });
    }
    try {
      const result = await db.query(`
        INSERT INTO campaigns (
          user_id, name, platform, account_id,
          target_verticals, target_locations, search_queries, hashtags,
          message_templates, followup_templates,
          daily_limit, hourly_limit, active_hours, active_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        userId, name, platform, accountId,
        JSON.stringify(targetVerticals || []),
        JSON.stringify(targetLocations || []),
        JSON.stringify(searchQueries || []),
        JSON.stringify(hashtags || []),
        JSON.stringify(messageTemplates || []),
        JSON.stringify(followupTemplates || []),
        dailyLimit, hourlyLimit,
        JSON.stringify(activeHours || { start: 9, end: 18 }),
        JSON.stringify(activeDays || [1, 2, 3, 4, 5])
      ]);
      res.json({ campaign: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/outreach/campaigns/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
      await db.query(`
        UPDATE campaigns SET status = $1,
          started_at = CASE WHEN $1 = 'active' AND started_at IS NULL THEN NOW() ELSE started_at END,
          completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
          updated_at = NOW()
        WHERE id = $2
      `, [status, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // LEADS
  // ============================================================

  app.get('/api/outreach/campaigns/:id/leads', async (req, res) => {
    const { status } = req.query;
    try {
      let query = 'SELECT * FROM leads WHERE campaign_id = $1';
      const params = [req.params.id];
      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }
      query += ' ORDER BY created_at DESC LIMIT 200';
      const leads = await db.query(query, params);
      res.json({ leads: leads.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/outreach/campaigns/:id/leads', async (req, res) => {
    const { leads } = req.body;
    if (!leads || !leads.length) {
      return res.status(400).json({ error: 'leads array required' });
    }
    try {
      const campaign = await db.query('SELECT platform FROM campaigns WHERE id = $1', [req.params.id]);
      if (!campaign.rows[0]) return res.status(404).json({ error: 'Campaign not found' });

      let inserted = 0;
      for (const lead of leads) {
        try {
          await db.query(`
            INSERT INTO leads (campaign_id, platform, username, display_name, bio, business_category, dojo_vertical, dojo_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (campaign_id, platform, username) DO NOTHING
          `, [
            req.params.id, campaign.rows[0].platform, lead.username,
            lead.displayName || null, lead.bio || null,
            lead.businessCategory || null, lead.dojoVertical || null,
            lead.dojoStatus || null
          ]);
          inserted++;
        } catch (e) {}
      }
      res.json({ inserted, total: leads.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // STATS
  // ============================================================

  app.get('/api/outreach/stats', async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM platform_accounts WHERE status = 'active') as active_accounts,
          (SELECT COUNT(*) FROM campaigns WHERE status = 'active') as active_campaigns,
          (SELECT COUNT(*) FROM leads WHERE status = 'dm_sent') as total_dms_sent,
          (SELECT COUNT(*) FROM leads WHERE status = 'replied') as total_replies,
          (SELECT COUNT(*) FROM leads WHERE status = 'converted') as total_conversions,
          (SELECT COUNT(*) FROM leads WHERE dm_sent_at > NOW() - INTERVAL '24 hours') as dms_today,
          (SELECT COUNT(*) FROM leads WHERE replied_at > NOW() - INTERVAL '7 days') as replies_this_week
      `);

      const platformStats = await db.query(`
        SELECT platform,
          COUNT(*) FILTER (WHERE status = 'dm_sent') as sent,
          COUNT(*) FILTER (WHERE status = 'replied') as replied,
          COUNT(*) FILTER (WHERE status = 'converted') as converted
        FROM leads
        GROUP BY platform
      `);

      res.json({ stats: stats.rows[0], platformStats: platformStats.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[Server] Outreach routes registered (Sprint 16)');
}

module.exports = { registerOutreachRoutes };
