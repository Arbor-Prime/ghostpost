/**
 * Multi-Platform Outreach API Routes
 * Wire into existing Express server: registerOutreachRoutes(app)
 * Follows same pattern as all other GhostPost route files.
 */

const express = require('express');
const db = require('../config/database');

function registerOutreachRoutes(app) {
    const router = express.Router();

    // ============================================================
    // PLATFORM ACCOUNTS
    // ============================================================

    /**
     * GET /api/outreach/accounts
     * List all platform accounts
     */
    router.get('/accounts', async (req, res) => {
        try {
            const accounts = await db.query(`
                SELECT id, user_id, platform, username, display_name, status, trust_score,
                       daily_actions, last_active_at, warmup_started_at, warmup_completed_at, created_at
                FROM platform_accounts
                ORDER BY platform, created_at DESC
            `).then(r => r.rows);
            res.json({ accounts });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/outreach/accounts
     * Add a new platform account
     */
    router.post('/accounts', async (req, res) => {
        const { userId = 1, platform, username, proxyServer, proxyUsername, proxyPassword } = req.body;

        if (!platform || !username) {
            return res.status(400).json({ error: 'platform and username required' });
        }

        try {
            const proxyConfig = proxyServer ? {
                server: proxyServer,
                username: proxyUsername || '',
                password: proxyPassword || ''
            } : {};

            const result = await db.query(`
                INSERT INTO platform_accounts (user_id, platform, username, proxy_config, warmup_started_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING *
            `, [userId, platform, username, JSON.stringify(proxyConfig)]);

            res.json({ account: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Account already exists' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * PATCH /api/outreach/accounts/:id/status
     * Update account status (active, paused, etc.)
     */
    router.patch('/accounts/:id/status', async (req, res) => {
        const { status } = req.body;
        try {
            await db.query(
                'UPDATE platform_accounts SET status = $1, updated_at = NOW() WHERE id = $2',
                [status, req.params.id]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // CAMPAIGNS
    // ============================================================

    /**
     * GET /api/outreach/campaigns
     * List all campaigns
     */
    router.get('/campaigns', async (req, res) => {
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
            `).then(r => r.rows);
            res.json({ campaigns });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/outreach/campaigns
     * Create a new campaign
     */
    router.post('/campaigns', async (req, res) => {
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

    /**
     * PATCH /api/outreach/campaigns/:id/status
     * Activate, pause, or complete a campaign
     */
    router.patch('/campaigns/:id/status', async (req, res) => {
        const { status } = req.body;
        try {
            const updates = { status, updated_at: 'NOW()' };
            if (status === 'active') updates.started_at = 'NOW()';
            if (status === 'completed') updates.completed_at = 'NOW()';

            await db.query(
                `UPDATE campaigns SET status = $1, 
                 started_at = CASE WHEN $1 = 'active' AND started_at IS NULL THEN NOW() ELSE started_at END,
                 completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
                 updated_at = NOW()
                 WHERE id = $2`,
                [status, req.params.id]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // LEADS
    // ============================================================

    /**
     * GET /api/outreach/campaigns/:id/leads
     * Get leads for a campaign
     */
    router.get('/campaigns/:id/leads', async (req, res) => {
        const { status } = req.query;
        try {
            let query = 'SELECT * FROM leads WHERE campaign_id = $1';
            const params = [req.params.id];
            
            if (status) {
                query += ' AND status = $2';
                params.push(status);
            }
            query += ' ORDER BY created_at DESC LIMIT 200';

            const leads = await db.query(query, params).then(r => r.rows);
            res.json({ leads });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/outreach/campaigns/:id/leads
     * Add leads to a campaign (bulk)
     */
    router.post('/campaigns/:id/leads', async (req, res) => {
        const { leads } = req.body; // Array of { username, platform, displayName, bio, businessCategory, dojoVertical, dojoStatus }
        
        if (!leads || !leads.length) {
            return res.status(400).json({ error: 'leads array required' });
        }

        try {
            const campaign = await db.query(
                'SELECT platform FROM campaigns WHERE id = $1', [req.params.id]
            ).then(r => r.rows[0]);

            let inserted = 0;
            for (const lead of leads) {
                try {
                    await db.query(`
                        INSERT INTO leads (campaign_id, platform, username, display_name, bio, business_category, dojo_vertical, dojo_status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (campaign_id, platform, username) DO NOTHING
                    `, [
                        req.params.id, campaign.platform, lead.username,
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

    /**
     * POST /api/outreach/campaigns/:id/search
     * Search for leads on a platform and add them to campaign
     */
    router.post('/campaigns/:id/search', async (req, res) => {
        const { query, maxResults = 20 } = req.body;

        try {
            const campaign = await db.query(`
                SELECT c.*, pa.id as account_id FROM campaigns c
                JOIN platform_accounts pa ON c.account_id = pa.id
                WHERE c.id = $1
            `, [req.params.id]).then(r => r.rows[0]);

            if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

            // Launch browser for search
            const session = await browserManager.launchBrowser(campaign.account_id, {
                sessionType: 'outreach'
            });

            let profiles = [];

            if (campaign.platform === 'instagram') {
                const InstagramAutomation = require('../services/platforms/instagram-automation');
                const ig = new InstagramAutomation(session.page, db, campaign.account_id);
                profiles = await ig.searchProfiles(query, maxResults);
            } else if (campaign.platform === 'linkedin') {
                const LinkedInAutomation = require('../services/platforms/linkedin-automation');
                const li = new LinkedInAutomation(session.page, db, campaign.account_id);
                profiles = await li.searchPeople(query, { maxResults });
            }

            // Add as leads
            let inserted = 0;
            for (const profile of profiles) {
                try {
                    await db.query(`
                        INSERT INTO leads (campaign_id, platform, username, display_name, profile_url)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (campaign_id, platform, username) DO NOTHING
                    `, [req.params.id, campaign.platform, profile.username, profile.displayName || null, profile.profileUrl || null]);
                    inserted++;
                } catch (e) {}
            }

            await browserManager.closeBrowser(campaign.account_id);

            res.json({ found: profiles.length, inserted, profiles });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // BROWSER SESSIONS (Live GUI)
    // ============================================================

    /**
     * POST /api/outreach/browser/launch/:accountId
     * Launch a visible browser for an account (Manus-style)
     */
    router.post('/browser/launch/:accountId', async (req, res) => {
        try {
            const session = await browserManager.launchBrowser(
                parseInt(req.params.accountId),
                { sessionType: req.body.sessionType || 'manual' }
            );
            res.json({
                success: true,
                display: session.display,
                platform: session.platform,
                sessionId: session.dbSessionId,
                websocketUrl: `/ws/browser/${req.params.accountId}`
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/outreach/browser/close/:accountId
     * Close a browser session
     */
    router.post('/browser/close/:accountId', async (req, res) => {
        try {
            await browserManager.closeBrowser(parseInt(req.params.accountId));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/outreach/browser/navigate/:accountId
     * Navigate the browser to a URL
     */
    router.post('/browser/navigate/:accountId', async (req, res) => {
        const { url } = req.body;
        try {
            await browserManager.relayInput(parseInt(req.params.accountId), {
                type: 'navigate', url
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/outreach/browser/input/:accountId
     * Send input to the browser (click, type, scroll)
     */
    router.post('/browser/input/:accountId', async (req, res) => {
        try {
            const success = await browserManager.relayInput(
                parseInt(req.params.accountId),
                req.body // { type: 'click', x, y } | { type: 'type', text } | { type: 'scroll', deltaY }
            );
            res.json({ success });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/outreach/browser/screenshot/:accountId
     * Get a screenshot of the current browser state
     */
    router.get('/browser/screenshot/:accountId', async (req, res) => {
        try {
            const path = await browserManager.takeScreenshot(parseInt(req.params.accountId));
            if (path) {
                res.sendFile(path);
            } else {
                res.status(404).json({ error: 'No active session' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/outreach/browser/sessions
     * Get all active browser sessions
     */
    router.get('/browser/sessions', async (req, res) => {
        try {
            const active = browserManager.getActiveSessions();
            const dbSessions = await db.query(`
                SELECT bs.*, pa.username, pa.platform 
                FROM browser_sessions bs
                JOIN platform_accounts pa ON bs.account_id = pa.id
                WHERE bs.status = 'running'
                ORDER BY bs.started_at DESC
            `).then(r => r.rows);

            res.json({ active, dbSessions });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // STATS
    // ============================================================

    /**
     * GET /api/outreach/stats
     * Dashboard stats for outreach
     */
    router.get('/stats', async (req, res) => {
        try {
            const stats = await db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM platform_accounts WHERE status = 'active') as active_accounts,
                    (SELECT COUNT(*) FROM campaigns WHERE status = 'active') as active_campaigns,
                    (SELECT COUNT(*) FROM leads WHERE status = 'dm_sent') as total_dms_sent,
                    (SELECT COUNT(*) FROM leads WHERE status = 'replied') as total_replies,
                    (SELECT COUNT(*) FROM leads WHERE status = 'converted') as total_conversions,
                    (SELECT COUNT(*) FROM leads WHERE dm_sent_at > NOW() - INTERVAL '24 hours') as dms_today,
                    (SELECT COUNT(*) FROM leads WHERE replied_at > NOW() - INTERVAL '7 days') as replies_this_week,
                    (SELECT COUNT(*) FROM browser_sessions WHERE status = 'running') as active_browsers
            `).then(r => r.rows[0]);

            // Per-platform breakdown
            const platformStats = await db.query(`
                SELECT platform,
                    COUNT(*) FILTER (WHERE status = 'dm_sent') as sent,
                    COUNT(*) FILTER (WHERE status = 'replied') as replied,
                    COUNT(*) FILTER (WHERE status = 'converted') as converted
                FROM leads
                GROUP BY platform
            `).then(r => r.rows);

            res.json({ stats, platformStats });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.use('/api/outreach', router);
}

module.exports = { registerOutreachRoutes };
