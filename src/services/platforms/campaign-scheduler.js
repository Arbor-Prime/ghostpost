/**
 * Campaign Scheduler
 * Orchestrates multi-platform outreach via BullMQ.
 * Handles daily schedule, platform rotation, warmup sequences,
 * and daily limit enforcement.
 * 
 * Extends GhostPost's existing BullMQ scheduler pattern from Sprint 2.
 */

const { Queue, Worker } = require('bullmq');
const PlatformBrowserManager = require('../browser-gui/platform-browser-manager');
const InstagramAutomation = require('./instagram-automation');
const LinkedInAutomation = require('./linkedin-automation');
const { isActiveHour, delay, gaussian } = require('./humanise-multi');

class CampaignScheduler {
    constructor(io) {
        this.db = require('../../config/database');
        this.redis = require('../../config/redis');
        this.io = io;
        this.browserManager = new PlatformBrowserManager(io);

        // BullMQ queues
        this.outreachQueue = new Queue('outreach', {
            connection: redis,
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 300000 }, // 5 min backoff
                removeOnComplete: 100,
                removeOnFail: 50
            }
        });

        this.warmupQueue = new Queue('warmup', {
            connection: redis,
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: 50
            }
        });

        // Workers
        this.outreachWorker = null;
        this.warmupWorker = null;
        this.schedulerInterval = null;
    }

    /**
     * Start the scheduler — checks every 15 minutes for campaigns that need to run
     */
    start() {
        console.log('[Scheduler] Starting campaign scheduler');

        // Start workers
        this.startOutreachWorker();
        this.startWarmupWorker();

        // Schedule check every 15 minutes
        this.schedulerInterval = setInterval(() => this.checkAndQueue(), 15 * 60 * 1000);
        
        // Run immediately on start
        this.checkAndQueue();
    }

    /**
     * Check for campaigns that need outreach and queue jobs
     */
    async checkAndQueue() {
        try {
            // Get active campaigns
            const campaigns = await this.db.query(`
                SELECT c.*, pa.username as account_username, pa.status as account_status,
                       pa.daily_actions, pa.trust_score
                FROM campaigns c
                JOIN platform_accounts pa ON c.account_id = pa.id
                WHERE c.status = 'active' 
                AND pa.status IN ('active', 'warming')
            `).then(r => r.rows);

            for (const campaign of campaigns) {
                // Check active hours
                const activeHours = campaign.active_hours || { start: 9, end: 18 };
                if (!isActiveHour(activeHours)) continue;

                // Check active days
                const today = new Date().getDay(); // 0=Sun, 1=Mon, etc.
                const activeDays = campaign.active_days || [1, 2, 3, 4, 5];
                if (!activeDays.includes(today)) continue;

                // Check daily limits
                const dailyActions = campaign.daily_actions || {};
                const lastReset = dailyActions.last_reset ? new Date(dailyActions.last_reset) : null;
                const isNewDay = !lastReset || lastReset.toDateString() !== new Date().toDateString();
                
                if (isNewDay) {
                    // Reset daily counters
                    await this.db.query(`
                        UPDATE platform_accounts 
                        SET daily_actions = '{"dms_sent": 0, "connections_sent": 0, "profiles_viewed": 0, "last_reset": "${new Date().toISOString()}"}'
                        WHERE id = $1
                    `, [campaign.account_id]);
                }

                const dmsSent = isNewDay ? 0 : (dailyActions.dms_sent || 0);
                if (dmsSent >= campaign.daily_limit) continue;

                // Get queued leads for this campaign
                const leads = await this.db.query(`
                    SELECT * FROM leads 
                    WHERE campaign_id = $1 AND status = 'queued'
                    ORDER BY created_at ASC
                    LIMIT $2
                `, [campaign.id, Math.min(10, campaign.daily_limit - dmsSent)]).then(r => r.rows);

                if (leads.length === 0) continue;

                // Check if a job is already running for this campaign
                const existingJob = await this.outreachQueue.getJob(`campaign-${campaign.id}`);
                if (existingJob) {
                    const state = await existingJob.getState();
                    if (state === 'active' || state === 'waiting') continue;
                }

                // Queue outreach job
                if (campaign.account_status === 'warming') {
                    await this.warmupQueue.add('warmup-session', {
                        accountId: campaign.account_id,
                        platform: campaign.platform,
                        campaignId: campaign.id
                    }, { jobId: `warmup-${campaign.account_id}-${Date.now()}` });
                } else {
                    await this.outreachQueue.add('outreach-session', {
                        campaignId: campaign.id,
                        accountId: campaign.account_id,
                        platform: campaign.platform,
                        leads: leads.map(l => ({ id: l.id, username: l.username })),
                        messageTemplates: campaign.message_templates,
                        dailyLimit: campaign.daily_limit,
                        hourlyLimit: campaign.hourly_limit
                    }, { jobId: `campaign-${campaign.id}` });
                }

                console.log(`[Scheduler] Queued ${campaign.account_status === 'warming' ? 'warmup' : 'outreach'} for campaign ${campaign.id} (${campaign.platform})`);
            }
        } catch (err) {
            console.error('[Scheduler] Check error:', err.message);
        }
    }

    /**
     * Outreach worker — processes DM/connection campaigns
     */
    startOutreachWorker() {
        this.outreachWorker = new Worker('outreach', async (job) => {
            const { campaignId, accountId, platform, leads, messageTemplates, dailyLimit, hourlyLimit } = job.data;

            console.log(`[Worker] Starting outreach for campaign ${campaignId} on ${platform}`);

            let session;
            try {
                // Launch browser
                session = await this.browserManager.launchBrowser(accountId, {
                    sessionType: 'outreach'
                });

                // Get campaign data
                const campaign = await this.db.query(
                    'SELECT * FROM campaigns WHERE id = $1', [campaignId]
                ).then(r => r.rows[0]);

                // Get full lead data
                const fullLeads = await this.db.query(
                    'SELECT * FROM leads WHERE id = ANY($1)', [leads.map(l => l.id)]
                ).then(r => r.rows);

                let automation;
                let results;

                if (platform === 'instagram') {
                    automation = new InstagramAutomation(session.page, this.db, accountId);
                    
                    // Check login
                    const loggedIn = await automation.isLoggedIn();
                    if (!loggedIn) {
                        console.warn(`[Worker] Instagram not logged in for account ${accountId}. Skipping.`);
                        await this.db.query(
                            'UPDATE platform_accounts SET status = $1 WHERE id = $2',
                            ['paused', accountId]
                        );
                        return { error: 'not_logged_in' };
                    }

                    results = await automation.runOutreachSession(campaign, fullLeads, {
                        maxDMs: Math.min(dailyLimit, 20), // Cap per session
                        hourlyLimit: hourlyLimit || 5
                    });

                } else if (platform === 'linkedin') {
                    automation = new LinkedInAutomation(session.page, this.db, accountId);
                    
                    const loggedIn = await automation.isLoggedIn();
                    if (!loggedIn) {
                        console.warn(`[Worker] LinkedIn not logged in for account ${accountId}. Skipping.`);
                        await this.db.query(
                            'UPDATE platform_accounts SET status = $1 WHERE id = $2',
                            ['paused', accountId]
                        );
                        return { error: 'not_logged_in' };
                    }

                    results = await automation.runOutreachSession(campaign, fullLeads, {
                        maxConnections: Math.min(dailyLimit, 15),
                        hourlyLimit: hourlyLimit || 5
                    });
                }

                // Update campaign stats
                const successCount = results.filter(r => r.status === 'dm_sent' || r.status === 'connection_sent').length;
                await this.db.query(`
                    UPDATE campaigns SET total_sent = total_sent + $1, updated_at = NOW() WHERE id = $2
                `, [successCount, campaignId]);

                // Update account daily actions
                await this.db.query(`
                    UPDATE platform_accounts 
                    SET daily_actions = daily_actions || jsonb_build_object(
                        'dms_sent', COALESCE((daily_actions->>'dms_sent')::int, 0) + $1,
                        'last_reset', $2
                    ),
                    last_active_at = NOW()
                    WHERE id = $3
                `, [successCount, new Date().toISOString(), accountId]);

                // Log messages to outreach_messages table
                for (const result of results) {
                    if (result.status === 'dm_sent' || result.status === 'connection_sent') {
                        const lead = fullLeads.find(l => l.username === result.username);
                        await this.db.query(`
                            INSERT INTO outreach_messages (lead_id, campaign_id, account_id, platform, message_type, message_text, status, sent_at, typing_duration_ms)
                            VALUES ($1, $2, $3, $4, $5, $6, 'sent', NOW(), $7)
                        `, [
                            lead?.id, campaignId, accountId, platform,
                            result.status === 'connection_sent' ? 'connection_request' : 'dm',
                            result.message || '',
                            result.typingDurationMs || 0
                        ]);
                    }
                }

                console.log(`[Worker] Outreach complete. ${successCount}/${results.length} successful`);
                return { results, successCount };

            } catch (err) {
                console.error(`[Worker] Outreach failed:`, err.message);
                throw err;
            } finally {
                // Close browser
                if (session) {
                    await this.browserManager.closeBrowser(accountId);
                }
            }
        }, {
            connection: this.redis,
            concurrency: 2 // Max 2 browser sessions at once
        });

        this.outreachWorker.on('failed', (job, err) => {
            console.error(`[Worker] Job ${job.id} failed:`, err.message);
        });
    }

    /**
     * Warmup worker — runs account warming sessions
     */
    startWarmupWorker() {
        this.warmupWorker = new Worker('warmup', async (job) => {
            const { accountId, platform } = job.data;

            console.log(`[Worker] Starting warmup for account ${accountId} on ${platform}`);

            let session;
            try {
                session = await this.browserManager.launchBrowser(accountId, {
                    sessionType: 'warmup'
                });

                let automation;
                if (platform === 'instagram') {
                    automation = new InstagramAutomation(session.page, this.db, accountId);
                    const loggedIn = await automation.isLoggedIn();
                    if (!loggedIn) return { error: 'not_logged_in' };
                    await automation.warmupBrowse(gaussian(8, 2)); // 6-10 minutes
                } else if (platform === 'linkedin') {
                    automation = new LinkedInAutomation(session.page, this.db, accountId);
                    const loggedIn = await automation.isLoggedIn();
                    if (!loggedIn) return { error: 'not_logged_in' };
                    await automation.warmupBrowse(gaussian(5, 1.5)); // 3-7 minutes
                }

                // Update trust score
                await this.db.query(`
                    UPDATE platform_accounts 
                    SET trust_score = LEAST(trust_score + 2, 100),
                        last_active_at = NOW()
                    WHERE id = $1
                `, [accountId]);

                // Check if warmup is complete (trust score >= 50)
                const account = await this.db.query(
                    'SELECT trust_score, warmup_started_at FROM platform_accounts WHERE id = $1',
                    [accountId]
                ).then(r => r.rows[0]);

                if (account.trust_score >= 50) {
                    await this.db.query(`
                        UPDATE platform_accounts 
                        SET status = 'active', warmup_completed_at = NOW()
                        WHERE id = $1
                    `, [accountId]);
                    console.log(`[Worker] Account ${accountId} warmup complete! Now active.`);
                }

                return { trustScore: account.trust_score + 2 };
            } finally {
                if (session) {
                    await this.browserManager.closeBrowser(accountId);
                }
            }
        }, {
            connection: this.redis,
            concurrency: 3
        });
    }

    /**
     * Stop all workers and scheduler
     */
    async stop() {
        if (this.schedulerInterval) clearInterval(this.schedulerInterval);
        if (this.outreachWorker) await this.outreachWorker.close();
        if (this.warmupWorker) await this.warmupWorker.close();
        await this.browserManager.closeAll();
        console.log('[Scheduler] Stopped');
    }
}

module.exports = CampaignScheduler;
