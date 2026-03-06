/**
 * Instagram DM Automation
 * Searches for businesses by hashtag/location, visits profiles,
 * and sends personalised DMs with full human behavior simulation.
 * 
 * Safe limits: 20-40 DMs/day per aged account, 5-10/hour.
 * New accounts: 10-15/day max during warmup.
 */

const { humanType, humanClick, humanScroll, humanMouseMove, actionDelay, microBreak, macroBreak, gaussian, delay } = require('./humanise-multi');

const INSTAGRAM_URL = 'https://www.instagram.com';

class InstagramAutomation {
    constructor(page, db, accountId) {
        this.page = page;
        this.db = db;
        this.accountId = accountId;
        this.actionsThisSession = 0;
        this.dmsThisSession = 0;
    }

    /**
     * Check if logged in by looking for profile icon
     */
    async isLoggedIn() {
        try {
            await this.page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(2000);
            
            // Check for login page indicators
            const loginForm = await this.page.$('input[name="username"]');
            if (loginForm) return false;

            // Check for logged-in indicators
            const profileIcon = await this.page.$('svg[aria-label="Your activity"]') ||
                               await this.page.$('[aria-label="Profile"]') ||
                               await this.page.$('a[href*="/direct/"]');
            return !!profileIcon;
        } catch (err) {
            return false;
        }
    }

    /**
     * Navigate to Instagram home and do warmup browsing
     * Essential for account health — browse normally before taking actions
     */
    async warmupBrowse(durationMinutes = 5) {
        console.log(`[Instagram] Warmup browsing for ${durationMinutes} min`);
        
        await this.page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(gaussian(3000, 1000));

        const endTime = Date.now() + (durationMinutes * 60 * 1000);
        
        while (Date.now() < endTime) {
            // Scroll feed
            await humanScroll(this.page, { distance: gaussian(500, 200) });
            
            // Occasionally like a post (10% chance per scroll)
            if (Math.random() < 0.1) {
                const likeButton = await this.page.$('svg[aria-label="Like"]');
                if (likeButton) {
                    const box = await likeButton.boundingBox();
                    if (box) {
                        await humanMouseMove(this.page, box.x + box.width / 2, box.y + box.height / 2);
                        await delay(gaussian(200, 50));
                        // Only actually like ~50% of the time (hesitate and scroll past)
                        if (Math.random() < 0.5) {
                            await likeButton.click();
                            await delay(gaussian(500, 200));
                        }
                    }
                }
            }

            // View a story (5% chance)
            if (Math.random() < 0.05) {
                const storyAvatar = await this.page.$('button[aria-label*="Story"]');
                if (storyAvatar) {
                    await storyAvatar.click();
                    await delay(gaussian(4000, 1500));
                    // Close story
                    await this.page.keyboard.press('Escape');
                    await delay(gaussian(1000, 300));
                }
            }

            await delay(gaussian(3000, 1500));
            this.actionsThisSession++;
        }

        console.log(`[Instagram] Warmup complete. Actions: ${this.actionsThisSession}`);
    }

    /**
     * Search for businesses by keyword
     * Returns array of profile URLs found
     */
    async searchProfiles(query, maxResults = 20) {
        console.log(`[Instagram] Searching: "${query}"`);
        const profiles = [];

        try {
            // Navigate to explore/search
            await this.page.goto(`${INSTAGRAM_URL}/explore/`, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(gaussian(2000, 500));

            // Click search bar
            const searchInput = await this.page.$('input[aria-label="Search input"]') ||
                               await this.page.$('input[placeholder="Search"]');
            
            if (searchInput) {
                await humanClick(this.page, 'input[aria-label="Search input"], input[placeholder="Search"]');
                await delay(gaussian(500, 150));
                await humanType(this.page, null, query, { baseDelay: 120, delayVariance: 40 });
                await delay(gaussian(2000, 500)); // Wait for results

                // Click on accounts/people tab if available
                const accountsTab = await this.page.$('a[href*="search"][role="tab"]');
                if (accountsTab) {
                    await accountsTab.click();
                    await delay(gaussian(1500, 500));
                }

                // Collect profile links from search results
                const links = await this.page.$$eval('a[href^="/"]', anchors => 
                    anchors
                        .map(a => a.getAttribute('href'))
                        .filter(h => h && h.match(/^\/[a-zA-Z0-9_.]+\/?$/) && !h.includes('/explore'))
                        .map(h => h.replace(/\/$/, ''))
                );

                const uniqueLinks = [...new Set(links)].slice(0, maxResults);
                for (const link of uniqueLinks) {
                    profiles.push({
                        username: link.replace(/^\//, ''),
                        profileUrl: `${INSTAGRAM_URL}${link}`
                    });
                }
            }

            // Alternative: search via hashtag
            if (profiles.length < 5) {
                const hashtagQuery = query.replace(/\s+/g, '').toLowerCase();
                await this.page.goto(`${INSTAGRAM_URL}/explore/tags/${hashtagQuery}/`, { 
                    waitUntil: 'networkidle', timeout: 30000 
                });
                await delay(gaussian(2000, 500));

                // Click on top posts to find business accounts
                const postLinks = await this.page.$$eval('a[href*="/p/"]', anchors =>
                    anchors.slice(0, 9).map(a => a.getAttribute('href'))
                );

                for (const postLink of postLinks) {
                    if (profiles.length >= maxResults) break;
                    try {
                        await this.page.goto(`${INSTAGRAM_URL}${postLink}`, { waitUntil: 'networkidle', timeout: 15000 });
                        await delay(gaussian(1500, 500));
                        
                        const authorLink = await this.page.$eval('header a[href^="/"]', a => a.getAttribute('href'));
                        if (authorLink) {
                            const username = authorLink.replace(/\//g, '');
                            if (!profiles.find(p => p.username === username)) {
                                profiles.push({
                                    username,
                                    profileUrl: `${INSTAGRAM_URL}/${username}`
                                });
                            }
                        }
                    } catch (e) {}
                    await microBreak();
                }
            }
        } catch (err) {
            console.error(`[Instagram] Search error:`, err.message);
        }

        console.log(`[Instagram] Found ${profiles.length} profiles for "${query}"`);
        return profiles;
    }

    /**
     * Visit a profile and extract business info
     */
    async visitProfile(username) {
        console.log(`[Instagram] Visiting profile: @${username}`);
        
        try {
            await this.page.goto(`${INSTAGRAM_URL}/${username}/`, { 
                waitUntil: 'networkidle', timeout: 30000 
            });
            await delay(gaussian(2000, 600));

            // Scroll down slightly (human would look at posts)
            await humanScroll(this.page, { distance: gaussian(300, 100) });
            await delay(gaussian(2000, 800));

            // Extract profile info
            const profileData = await this.page.evaluate(() => {
                const getName = () => {
                    const el = document.querySelector('header section span') || 
                               document.querySelector('header h2');
                    return el ? el.textContent.trim() : '';
                };
                
                const getBio = () => {
                    const el = document.querySelector('header section > div > span') ||
                               document.querySelector('.-vDIg span');
                    return el ? el.textContent.trim() : '';
                };
                
                const getFollowers = () => {
                    const el = document.querySelector('a[href*="followers"] span') ||
                               document.querySelector('li:nth-child(2) span');
                    return el ? el.getAttribute('title') || el.textContent.trim() : '0';
                };

                const isBusinessAccount = () => {
                    const category = document.querySelector('div[class*="category"]');
                    const contactButton = document.querySelector('a[href*="mailto"]') || 
                                         document.querySelector('button:has-text("Contact")');
                    return !!(category || contactButton);
                };

                const getCategory = () => {
                    const el = document.querySelector('div[class*="category"]');
                    return el ? el.textContent.trim() : '';
                };

                return {
                    displayName: getName(),
                    bio: getBio(),
                    followers: getFollowers(),
                    isBusinessAccount: isBusinessAccount(),
                    category: getCategory()
                };
            });

            // Check for Message button (indicates DMs are open)
            const messageButton = await this.page.$('div[role="button"]:has-text("Message")') ||
                                  await this.page.$('button:has-text("Message")');
            profileData.canDM = !!messageButton;
            profileData.username = username;

            this.actionsThisSession++;
            await microBreak();

            return profileData;
        } catch (err) {
            console.error(`[Instagram] Profile visit error for @${username}:`, err.message);
            return null;
        }
    }

    /**
     * Send a DM to a user
     * CRITICAL: First message should NEVER contain a link
     */
    async sendDM(username, message) {
        console.log(`[Instagram] Sending DM to @${username}`);

        try {
            // Navigate to profile first (natural flow)
            await this.page.goto(`${INSTAGRAM_URL}/${username}/`, {
                waitUntil: 'networkidle', timeout: 30000
            });
            await delay(gaussian(2000, 600));

            // Look at their profile briefly (human would)
            await humanScroll(this.page, { distance: gaussian(200, 80) });
            await delay(gaussian(1500, 500));
            await humanScroll(this.page, { direction: 'up', distance: gaussian(200, 80) });
            await delay(gaussian(1000, 300));

            // Click Message button
            const messageButton = await this.page.$('div[role="button"]:has-text("Message")') ||
                                  await this.page.$('button:has-text("Message")');
            
            if (!messageButton) {
                console.warn(`[Instagram] No Message button found for @${username}`);
                return { success: false, error: 'no_message_button' };
            }

            await humanClick(this.page, 'div[role="button"]:has-text("Message"), button:has-text("Message")');
            await delay(gaussian(3000, 800));

            // Wait for message input
            const messageInput = await this.page.waitForSelector(
                'textarea[placeholder*="Message"], div[role="textbox"][aria-label*="Message"]',
                { timeout: 10000 }
            );

            if (!messageInput) {
                return { success: false, error: 'no_message_input' };
            }

            // Focus the input
            await messageInput.click();
            await delay(gaussian(500, 150));

            // Type the message with human-like behavior
            const typingStart = Date.now();
            await humanType(this.page, null, message, {
                baseDelay: 90,
                delayVariance: 25,
                typoRate: 0.04,
                thinkPause: 0.06
            });
            const typingDuration = Date.now() - typingStart;

            // Brief pause before sending (human would re-read)
            await delay(gaussian(1200, 400));

            // Press Enter to send
            await this.page.keyboard.press('Enter');
            await delay(gaussian(1500, 500));

            // Verify message appeared
            const sent = await this.page.$(`text="${message.substring(0, 20)}"`);

            this.dmsThisSession++;
            this.actionsThisSession++;

            console.log(`[Instagram] DM sent to @${username} (${typingDuration}ms typing)`);

            return {
                success: true,
                typingDurationMs: typingDuration,
                dmsThisSession: this.dmsThisSession
            };
        } catch (err) {
            console.error(`[Instagram] DM error for @${username}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Run a full outreach session for a campaign
     */
    async runOutreachSession(campaign, leads, options = {}) {
        const { maxDMs = 10, hourlyLimit = 5 } = options;
        const results = [];
        let dmsThisHour = 0;
        let hourStart = Date.now();

        console.log(`[Instagram] Starting outreach session. ${leads.length} leads, max ${maxDMs} DMs`);

        // Warmup browse first (2-3 minutes)
        await this.warmupBrowse(gaussian(2.5, 0.5));

        for (const lead of leads) {
            if (this.dmsThisSession >= maxDMs) {
                console.log(`[Instagram] Session limit reached (${maxDMs} DMs)`);
                break;
            }

            // Hourly limit check
            if (Date.now() - hourStart > 3600000) {
                dmsThisHour = 0;
                hourStart = Date.now();
            }
            if (dmsThisHour >= hourlyLimit) {
                console.log(`[Instagram] Hourly limit reached. Waiting...`);
                await delay(gaussian(600000, 120000)); // 8-12 min wait
                dmsThisHour = 0;
                hourStart = Date.now();
            }

            // Visit profile first
            const profileData = await this.visitProfile(lead.username);
            
            if (!profileData) {
                results.push({ username: lead.username, status: 'failed', error: 'profile_not_found' });
                continue;
            }

            if (!profileData.canDM) {
                results.push({ username: lead.username, status: 'skipped', error: 'dms_closed' });
                continue;
            }

            // Pick a message template and personalise
            const template = campaign.message_templates[
                Math.floor(Math.random() * campaign.message_templates.length)
            ];
            const personalisedMessage = this.personaliseMessage(template, profileData);

            // Send DM
            const dmResult = await this.sendDM(lead.username, personalisedMessage);
            
            results.push({
                username: lead.username,
                status: dmResult.success ? 'dm_sent' : 'failed',
                error: dmResult.error || null,
                message: personalisedMessage,
                typingDurationMs: dmResult.typingDurationMs
            });

            if (dmResult.success) {
                dmsThisHour++;
                // Update lead status in DB
                await this.db.query(
                    'UPDATE leads SET status = $1, dm_sent_at = NOW(), message_used = $2 WHERE id = $3',
                    ['dm_sent', personalisedMessage, lead.id]
                );
            }

            // Macro break every 5 DMs
            if (this.dmsThisSession % 5 === 0 && this.dmsThisSession > 0) {
                await macroBreak();
            } else {
                // Normal delay between DMs (30-120 seconds)
                await actionDelay(30, 120);
            }
        }

        console.log(`[Instagram] Session complete. ${this.dmsThisSession} DMs sent`);
        return results;
    }

    /**
     * Personalise a message template with profile data
     */
    personaliseMessage(template, profileData) {
        let message = template;
        
        message = message.replace(/\{name\}/g, profileData.displayName || profileData.username);
        message = message.replace(/\{username\}/g, profileData.username);
        message = message.replace(/\{category\}/g, profileData.category || 'your business');
        message = message.replace(/\{bio_snippet\}/g, 
            profileData.bio ? profileData.bio.substring(0, 50) : ''
        );

        return message;
    }
}

module.exports = InstagramAutomation;
