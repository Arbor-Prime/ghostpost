/**
 * LinkedIn Outreach Automation
 * Search for business owners, send connection requests,
 * and follow-up with messages after connection accepted.
 * 
 * Safe limits: 15-25 connection requests/day, 50-100 messages/day to 1st degree.
 * Free accounts: only 5-20 personalised requests/month.
 * Sales Navigator recommended for serious outreach.
 */

const { humanType, humanClick, humanScroll, humanMouseMove, actionDelay, microBreak, macroBreak, gaussian, delay } = require('./humanise-multi');

const LINKEDIN_URL = 'https://www.linkedin.com';

class LinkedInAutomation {
    constructor(page, db, accountId) {
        this.page = page;
        this.db = db;
        this.accountId = accountId;
        this.actionsThisSession = 0;
        this.connectionsThisSession = 0;
        this.messagesThisSession = 0;
    }

    /**
     * Check if logged in
     */
    async isLoggedIn() {
        try {
            await this.page.goto(LINKEDIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(2000);
            
            const loginForm = await this.page.$('#session_key');
            if (loginForm) return false;

            const feedIndicator = await this.page.$('.feed-identity-module') ||
                                  await this.page.$('div[data-test-id="feed-sort"]') ||
                                  await this.page.$('.global-nav__me');
            return !!feedIndicator;
        } catch (err) {
            return false;
        }
    }

    /**
     * Warmup browsing on LinkedIn feed
     */
    async warmupBrowse(durationMinutes = 3) {
        console.log(`[LinkedIn] Warmup browsing for ${durationMinutes} min`);
        
        await this.page.goto(`${LINKEDIN_URL}/feed/`, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(gaussian(3000, 1000));

        const endTime = Date.now() + (durationMinutes * 60 * 1000);
        
        while (Date.now() < endTime) {
            await humanScroll(this.page, { distance: gaussian(400, 150) });
            
            // Occasionally like a post (8% chance)
            if (Math.random() < 0.08) {
                const likeButton = await this.page.$('button[aria-label*="Like"]');
                if (likeButton) {
                    const box = await likeButton.boundingBox();
                    if (box && box.y > 0 && box.y < 800) { // Only if visible
                        await humanClick(this.page, 'button[aria-label*="Like"]');
                        await delay(gaussian(800, 200));
                    }
                }
            }

            await delay(gaussian(3000, 1500));
            this.actionsThisSession++;
        }

        console.log(`[LinkedIn] Warmup complete`);
    }

    /**
     * Search for people by query (uses LinkedIn search)
     */
    async searchPeople(query, options = {}) {
        const { maxResults = 20, location = null } = options;
        const profiles = [];

        console.log(`[LinkedIn] Searching people: "${query}"`);

        try {
            // Build search URL
            let searchUrl = `${LINKEDIN_URL}/search/results/people/?keywords=${encodeURIComponent(query)}`;
            if (location) {
                searchUrl += `&geoUrn=${encodeURIComponent(location)}`;
            }

            await this.page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(gaussian(3000, 800));

            let collected = 0;
            let pageNum = 1;

            while (collected < maxResults && pageNum <= 3) {
                // Extract profiles from current page
                const pageProfiles = await this.page.evaluate(() => {
                    const results = [];
                    const cards = document.querySelectorAll('.entity-result__item, .reusable-search__result-container');
                    
                    cards.forEach(card => {
                        const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"]') ||
                                      card.querySelector('a.app-aware-link span[aria-hidden="true"]');
                        const linkEl = card.querySelector('a.app-aware-link[href*="/in/"]');
                        const headlineEl = card.querySelector('.entity-result__primary-subtitle') ||
                                          card.querySelector('.entity-result__summary');
                        const locationEl = card.querySelector('.entity-result__secondary-subtitle');

                        if (nameEl && linkEl) {
                            const href = linkEl.getAttribute('href');
                            const username = href.match(/\/in\/([^/?]+)/)?.[1] || '';
                            
                            results.push({
                                displayName: nameEl.textContent.trim(),
                                username,
                                profileUrl: `https://www.linkedin.com/in/${username}`,
                                headline: headlineEl ? headlineEl.textContent.trim() : '',
                                location: locationEl ? locationEl.textContent.trim() : ''
                            });
                        }
                    });

                    return results;
                });

                profiles.push(...pageProfiles);
                collected = profiles.length;

                // Scroll down naturally while reading results
                for (let i = 0; i < 3; i++) {
                    await humanScroll(this.page, { distance: gaussian(400, 100) });
                    await delay(gaussian(2000, 600));
                }

                // Go to next page if needed
                if (collected < maxResults) {
                    const nextButton = await this.page.$('button[aria-label="Next"]');
                    if (nextButton) {
                        await humanClick(this.page, 'button[aria-label="Next"]');
                        await delay(gaussian(3000, 800));
                        pageNum++;
                    } else {
                        break;
                    }
                }
            }
        } catch (err) {
            console.error(`[LinkedIn] Search error:`, err.message);
        }

        console.log(`[LinkedIn] Found ${profiles.length} profiles`);
        return profiles.slice(0, maxResults);
    }

    /**
     * Visit a profile and extract info
     */
    async visitProfile(username) {
        console.log(`[LinkedIn] Visiting: ${username}`);

        try {
            await this.page.goto(`${LINKEDIN_URL}/in/${username}/`, {
                waitUntil: 'networkidle', timeout: 30000
            });
            await delay(gaussian(2000, 600));

            // Scroll to see more of the profile
            await humanScroll(this.page, { distance: gaussian(400, 100) });
            await delay(gaussian(2000, 800));

            const profileData = await this.page.evaluate(() => {
                const getName = () => {
                    const el = document.querySelector('h1.text-heading-xlarge');
                    return el ? el.textContent.trim() : '';
                };

                const getHeadline = () => {
                    const el = document.querySelector('.text-body-medium.break-words');
                    return el ? el.textContent.trim() : '';
                };

                const getLocation = () => {
                    const el = document.querySelector('.text-body-small.inline.t-black--light.break-words');
                    return el ? el.textContent.trim() : '';
                };

                const getAbout = () => {
                    const aboutSection = document.querySelector('#about ~ div .inline-show-more-text');
                    return aboutSection ? aboutSection.textContent.trim() : '';
                };

                const getConnectionDegree = () => {
                    const el = document.querySelector('.dist-value');
                    return el ? el.textContent.trim() : '';
                };

                // Check for Connect vs Message button
                const hasConnectButton = !!document.querySelector('button[aria-label*="connect"], button[aria-label*="Connect"]');
                const hasMessageButton = !!document.querySelector('button[aria-label*="Message"]');

                return {
                    displayName: getName(),
                    headline: getHeadline(),
                    location: getLocation(),
                    about: getAbout(),
                    connectionDegree: getConnectionDegree(),
                    canConnect: hasConnectButton,
                    canMessage: hasMessageButton
                };
            });

            profileData.username = username;
            this.actionsThisSession++;

            // Scroll back up
            await humanScroll(this.page, { direction: 'up', distance: gaussian(300, 80) });
            await microBreak();

            return profileData;
        } catch (err) {
            console.error(`[LinkedIn] Profile visit error for ${username}:`, err.message);
            return null;
        }
    }

    /**
     * Send a connection request with a personalised note
     * NOTE: Free accounts limited to 5-20 personalised requests/month
     */
    async sendConnectionRequest(username, note) {
        console.log(`[LinkedIn] Sending connection request to ${username}`);

        try {
            // Navigate to profile
            await this.page.goto(`${LINKEDIN_URL}/in/${username}/`, {
                waitUntil: 'networkidle', timeout: 30000
            });
            await delay(gaussian(2000, 600));

            // Look at profile naturally
            await humanScroll(this.page, { distance: gaussian(200, 80) });
            await delay(gaussian(1500, 500));
            await humanScroll(this.page, { direction: 'up', distance: gaussian(200, 80) });
            await delay(gaussian(800, 200));

            // Find and click Connect button
            const connectButton = await this.page.$('button[aria-label*="connect" i], button[aria-label*="Connect" i]');
            
            if (!connectButton) {
                // Try the "More" dropdown
                const moreButton = await this.page.$('button[aria-label="More actions"]');
                if (moreButton) {
                    await humanClick(this.page, 'button[aria-label="More actions"]');
                    await delay(gaussian(800, 200));
                    
                    const connectOption = await this.page.$('div[role="option"]:has-text("Connect")') ||
                                         await this.page.$('li:has-text("Connect")');
                    if (!connectOption) {
                        return { success: false, error: 'no_connect_button' };
                    }
                    await connectOption.click();
                } else {
                    return { success: false, error: 'no_connect_button' };
                }
            } else {
                await humanClick(this.page, 'button[aria-label*="connect" i], button[aria-label*="Connect" i]');
            }

            await delay(gaussian(1500, 500));

            // Check if "Add a note" option appears
            if (note) {
                const addNoteButton = await this.page.$('button[aria-label="Add a note"]');
                if (addNoteButton) {
                    await humanClick(this.page, 'button[aria-label="Add a note"]');
                    await delay(gaussian(1000, 300));

                    // Type the personalised note
                    const noteInput = await this.page.waitForSelector('textarea[name="message"]', { timeout: 5000 });
                    if (noteInput) {
                        await noteInput.click();
                        await delay(gaussian(300, 100));
                        
                        const typingStart = Date.now();
                        await humanType(this.page, null, note.substring(0, 300), { // LinkedIn 300 char limit
                            baseDelay: 85,
                            delayVariance: 25,
                            typoRate: 0.03,
                            thinkPause: 0.05
                        });
                        const typingDuration = Date.now() - typingStart;

                        // Pause before sending (re-read)
                        await delay(gaussian(1500, 500));

                        // Click Send
                        const sendButton = await this.page.$('button[aria-label="Send invitation"]') ||
                                          await this.page.$('button:has-text("Send")');
                        if (sendButton) {
                            await sendButton.click();
                            await delay(gaussian(2000, 500));
                        }

                        this.connectionsThisSession++;
                        this.actionsThisSession++;

                        console.log(`[LinkedIn] Connection request sent to ${username} with note (${typingDuration}ms typing)`);
                        return { success: true, typingDurationMs: typingDuration, withNote: true };
                    }
                }
            }

            // Send without note (fallback)
            const sendButton = await this.page.$('button[aria-label="Send without a note"]') ||
                              await this.page.$('button[aria-label="Send invitation"]') ||
                              await this.page.$('button:has-text("Send")');
            if (sendButton) {
                await sendButton.click();
                await delay(gaussian(2000, 500));
                this.connectionsThisSession++;
                this.actionsThisSession++;
                return { success: true, withNote: false };
            }

            return { success: false, error: 'send_button_not_found' };
        } catch (err) {
            console.error(`[LinkedIn] Connection request error for ${username}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Send a direct message to a 1st-degree connection
     */
    async sendMessage(username, message) {
        console.log(`[LinkedIn] Sending message to ${username}`);

        try {
            await this.page.goto(`${LINKEDIN_URL}/in/${username}/`, {
                waitUntil: 'networkidle', timeout: 30000
            });
            await delay(gaussian(2000, 600));

            // Click Message button
            const messageButton = await this.page.$('button[aria-label*="Message"]');
            if (!messageButton) {
                return { success: false, error: 'no_message_button' };
            }

            await humanClick(this.page, 'button[aria-label*="Message"]');
            await delay(gaussian(2000, 600));

            // Wait for message compose box
            const messageInput = await this.page.waitForSelector(
                'div.msg-form__contenteditable[role="textbox"]',
                { timeout: 10000 }
            );

            if (!messageInput) {
                return { success: false, error: 'no_message_input' };
            }

            await messageInput.click();
            await delay(gaussian(500, 150));

            // Type message
            const typingStart = Date.now();
            await humanType(this.page, null, message, {
                baseDelay: 80,
                delayVariance: 20,
                typoRate: 0.03,
                thinkPause: 0.05
            });
            const typingDuration = Date.now() - typingStart;

            // Re-read pause
            await delay(gaussian(1200, 400));

            // Click Send
            const sendButton = await this.page.$('button.msg-form__send-button') ||
                              await this.page.$('button[type="submit"]:has-text("Send")');
            if (sendButton) {
                await sendButton.click();
                await delay(gaussian(1500, 500));
            } else {
                // Try Enter
                await this.page.keyboard.press('Enter');
                await delay(gaussian(1500, 500));
            }

            // Close the message window
            const closeButton = await this.page.$('button[data-test-modal-close]') ||
                               await this.page.$('button.msg-overlay-bubble-header__control--close-btn');
            if (closeButton) {
                await closeButton.click();
                await delay(gaussian(500, 150));
            }

            this.messagesThisSession++;
            this.actionsThisSession++;

            console.log(`[LinkedIn] Message sent to ${username} (${typingDuration}ms typing)`);
            return { success: true, typingDurationMs: typingDuration };
        } catch (err) {
            console.error(`[LinkedIn] Message error for ${username}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Run full outreach session
     */
    async runOutreachSession(campaign, leads, options = {}) {
        const { maxConnections = 15, hourlyLimit = 5 } = options;
        const results = [];
        let connectionsThisHour = 0;
        let hourStart = Date.now();

        console.log(`[LinkedIn] Starting outreach. ${leads.length} leads, max ${maxConnections} connections`);

        // Warmup
        await this.warmupBrowse(gaussian(3, 1));

        for (const lead of leads) {
            if (this.connectionsThisSession >= maxConnections) {
                console.log(`[LinkedIn] Session limit reached`);
                break;
            }

            // Hourly check
            if (Date.now() - hourStart > 3600000) {
                connectionsThisHour = 0;
                hourStart = Date.now();
            }
            if (connectionsThisHour >= hourlyLimit) {
                console.log(`[LinkedIn] Hourly limit reached. Waiting...`);
                await delay(gaussian(600000, 120000));
                connectionsThisHour = 0;
                hourStart = Date.now();
            }

            // Visit profile
            const profileData = await this.visitProfile(lead.username);
            if (!profileData) {
                results.push({ username: lead.username, status: 'failed', error: 'profile_not_found' });
                continue;
            }

            // Update lead in DB with profile data
            await this.db.query(`
                UPDATE leads SET display_name = $1, bio = $2, profile_viewed_at = NOW(), status = 'profile_viewed'
                WHERE id = $3
            `, [profileData.displayName, profileData.headline, lead.id]);

            if (profileData.canMessage) {
                // Already connected — send message
                const template = campaign.message_templates[
                    Math.floor(Math.random() * campaign.message_templates.length)
                ];
                const message = this.personaliseMessage(template, profileData);
                const result = await this.sendMessage(lead.username, message);
                
                results.push({
                    username: lead.username,
                    status: result.success ? 'dm_sent' : 'failed',
                    error: result.error,
                    message,
                    typingDurationMs: result.typingDurationMs
                });

                if (result.success) {
                    await this.db.query(
                        'UPDATE leads SET status = $1, dm_sent_at = NOW(), message_used = $2 WHERE id = $3',
                        ['dm_sent', message, lead.id]
                    );
                }
            } else if (profileData.canConnect) {
                // Not connected — send connection request
                const template = campaign.message_templates[0]; // Use first template for connection note
                const note = this.personaliseMessage(template, profileData).substring(0, 300);
                const result = await this.sendConnectionRequest(lead.username, note);
                
                results.push({
                    username: lead.username,
                    status: result.success ? 'connection_sent' : 'failed',
                    error: result.error,
                    message: note,
                    typingDurationMs: result.typingDurationMs
                });

                if (result.success) {
                    connectionsThisHour++;
                    await this.db.query(
                        'UPDATE leads SET status = $1, dm_sent_at = NOW(), message_used = $2 WHERE id = $3',
                        ['dm_sent', note, lead.id]
                    );
                }
            } else {
                results.push({ username: lead.username, status: 'skipped', error: 'cannot_connect_or_message' });
            }

            // Breaks
            if (this.actionsThisSession % 8 === 0 && this.actionsThisSession > 0) {
                await macroBreak();
            } else {
                await actionDelay(45, 150);
            }
        }

        console.log(`[LinkedIn] Session complete. ${this.connectionsThisSession} connections, ${this.messagesThisSession} messages`);
        return results;
    }

    personaliseMessage(template, profileData) {
        let message = template;
        message = message.replace(/\{name\}/g, profileData.displayName?.split(' ')[0] || profileData.username);
        message = message.replace(/\{full_name\}/g, profileData.displayName || '');
        message = message.replace(/\{headline\}/g, profileData.headline || '');
        message = message.replace(/\{location\}/g, profileData.location || '');
        message = message.replace(/\{about_snippet\}/g, 
            profileData.about ? profileData.about.substring(0, 80) : ''
        );
        return message;
    }
}

module.exports = LinkedInAutomation;
