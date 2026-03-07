/**
 * Conversation Harvester
 * 
 * Watches how real humans talk to each other across X, Instagram, and LinkedIn.
 * Doesn't participate — just observes and stores threaded conversations
 * with engagement metrics for later pattern extraction.
 * 
 * Uses the existing Playwright stealth infrastructure from Sprint 2.
 * Runs headless (no display needed) — this is read-only observation.
 */

const { launchSession } = require('../observer/launcher');
const { generateFingerprints } = require('../observer/fingerprints');
const { humanDelay, scrollDistance, sleep } = require('../../utils/humanise');
const db = require('../../config/database');

class ConversationHarvester {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRunning = false;
  }

  async launch() {
    if (this.browser) await this.close();
    const fp = generateFingerprints();
    const session = await launchSession(fp.desktop);
    this.browser = session.browser;
    this.context = session.context;
    this.page = session.page;
  }

  async close() {
    try { if (this.page) await this.page.close(); } catch (_) {}
    try { if (this.context) await this.context.close(); } catch (_) {}
    try { if (this.browser) await this.browser.close(); } catch (_) {}
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  // ============================================================
  // X (TWITTER) — Harvest reply chains from public tweets
  // ============================================================

  async harvestX(options = {}) {
    const {
      queries = ['restaurant owner', 'cafe business', 'small business payments'],
      hashtags = [],
      profiles = ['elonmusk', 'paulg', 'ycombinator'],
      maxThreads = 20
    } = options;

    console.log('[Harvester:X] Starting conversation harvest');
    await this.launch();

    const logId = await this.logHarvest('x', 'search', queries.join(', '));
    let totalThreads = 0;
    let totalMessages = 0;

    try {
      // Harvest from profile timelines
      for (const profile of profiles) {
        if (totalThreads >= maxThreads) break;

        await this.page.goto(`https://x.com/${profile}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await humanDelay(3000);

        // Scroll to load tweets
        for (let i = 0; i < 3; i++) {
          await this.page.mouse.wheel(0, scrollDistance(false));
          await humanDelay(2000);
        }

        // Extract tweet links with replies
        const tweetLinks = await this.page.evaluate(() => {
          const links = [];
          document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
            const replyCount = article.querySelector('[data-testid="reply"]');
            const replyText = replyCount?.textContent?.trim();
            const replies = parseInt(replyText) || 0;

            if (replies >= 3) {
              const linkEl = article.querySelector('a[href*="/status/"]');
              const timeEl = article.querySelector('time');
              const textEl = article.querySelector('[data-testid="tweetText"]');

              if (linkEl && textEl) {
                links.push({
                  url: linkEl.href,
                  tweetId: linkEl.href.match(/status\/(\d+)/)?.[1],
                  content: textEl.textContent.trim(),
                  replies,
                  time: timeEl?.getAttribute('datetime')
                });
              }
            }
          });
          return links.slice(0, 5);
        });

        // Visit each tweet and harvest the reply chain
        for (const tweet of tweetLinks) {
          if (totalThreads >= maxThreads) break;

          try {
            const result = await this.harvestXThread(tweet, profile);
            if (result) {
              totalThreads++;
              totalMessages += result.messageCount;
            }
          } catch (err) {
            console.warn(`[Harvester:X] Thread error: ${err.message}`);
          }

          await humanDelay(4000);
        }

        await humanDelay(5000);
      }

      // Harvest from search queries
      for (const query of queries) {
        if (totalThreads >= maxThreads) break;

        await this.page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&f=live`, {
          waitUntil: 'domcontentloaded', timeout: 30000
        });
        await humanDelay(3000);

        for (let i = 0; i < 2; i++) {
          await this.page.mouse.wheel(0, scrollDistance(false));
          await humanDelay(2000);
        }

        const searchTweets = await this.page.evaluate(() => {
          const links = [];
          document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
            const replyCount = article.querySelector('[data-testid="reply"]');
            const replies = parseInt(replyCount?.textContent?.trim()) || 0;

            if (replies >= 2) {
              const linkEl = article.querySelector('a[href*="/status/"]');
              const textEl = article.querySelector('[data-testid="tweetText"]');
              const authorEl = article.querySelector('[data-testid="User-Name"] a');

              if (linkEl && textEl) {
                links.push({
                  url: linkEl.href,
                  tweetId: linkEl.href.match(/status\/(\d+)/)?.[1],
                  content: textEl.textContent.trim(),
                  author: authorEl?.href?.split('/').pop() || '',
                  replies
                });
              }
            }
          });
          return links.slice(0, 5);
        });

        for (const tweet of searchTweets) {
          if (totalThreads >= maxThreads) break;
          try {
            const result = await this.harvestXThread(tweet, tweet.author);
            if (result) {
              totalThreads++;
              totalMessages += result.messageCount;
            }
          } catch (err) {}
          await humanDelay(3000);
        }
      }

      await this.finishHarvest(logId, totalThreads, totalMessages);
      console.log(`[Harvester:X] Done. ${totalThreads} threads, ${totalMessages} messages`);

    } catch (err) {
      console.error('[Harvester:X] Failed:', err.message);
      await this.errorHarvest(logId, err.message);
    } finally {
      await this.close();
    }

    return { threads: totalThreads, messages: totalMessages };
  }

  async harvestXThread(tweet, rootAuthor) {
    await this.page.goto(tweet.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(3000);

    // Scroll to load replies
    for (let i = 0; i < 4; i++) {
      await this.page.mouse.wheel(0, scrollDistance(false));
      await humanDelay(1500);
    }

    // Extract all replies
    const replies = await this.page.evaluate(() => {
      const messages = [];
      document.querySelectorAll('article[data-testid="tweet"]').forEach((article, idx) => {
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const authorEl = article.querySelector('[data-testid="User-Name"] a');
        const timeEl = article.querySelector('time');
        const likeEl = article.querySelector('[data-testid="like"]');

        if (textEl) {
          messages.push({
            content: textEl.textContent.trim(),
            author: authorEl?.href?.split('/').pop() || 'unknown',
            time: timeEl?.getAttribute('datetime'),
            likes: parseInt(likeEl?.textContent?.trim()) || 0,
            depth: idx === 0 ? 0 : 1
          });
        }
      });
      return messages;
    });

    if (replies.length < 2) return null;

    // Store the conversation
    const convResult = await db.query(`
      INSERT INTO observed_conversations (platform, thread_id, root_content, root_author, root_url, total_replies, total_participants, conversation_depth, thread_created_at)
      VALUES ('x', $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (platform, thread_id) DO UPDATE SET
        total_replies = EXCLUDED.total_replies,
        observed_at = NOW()
      RETURNING id
    `, [
      tweet.tweetId, tweet.content, rootAuthor, tweet.url,
      replies.length - 1,
      new Set(replies.map(r => r.author)).size,
      Math.max(...replies.map(r => r.depth)),
      tweet.time || new Date().toISOString()
    ]);

    const convId = convResult.rows[0].id;

    // Store each message
    let messageCount = 0;
    for (const reply of replies) {
      try {
        await db.query(`
          INSERT INTO observed_messages (conversation_id, platform, author, content, reply_depth, likes, word_count, has_question, has_emoji, has_link, posted_at)
          VALUES ($1, 'x', $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          convId, reply.author, reply.content, reply.depth,
          reply.likes,
          reply.content.split(/\s+/).length,
          /\?/.test(reply.content),
          /[\u{1F600}-\u{1F9FF}]/u.test(reply.content),
          /https?:\/\//.test(reply.content),
          reply.time || new Date().toISOString()
        ]);
        messageCount++;
      } catch (e) {}
    }

    return { convId, messageCount };
  }

  // ============================================================
  // INSTAGRAM — Harvest comment threads on business posts
  // ============================================================

  async harvestInstagram(options = {}) {
    const {
      hashtags = ['nottinghamfood', 'nottinghamrestaurants', 'independentcafe', 'smallbusinessuk'],
      profiles = [],
      maxThreads = 15
    } = options;

    console.log('[Harvester:IG] Starting conversation harvest');
    await this.launch();

    const logId = await this.logHarvest('instagram', 'hashtag', hashtags.join(', '));
    let totalThreads = 0;
    let totalMessages = 0;

    try {
      for (const hashtag of hashtags) {
        if (totalThreads >= maxThreads) break;

        await this.page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, {
          waitUntil: 'domcontentloaded', timeout: 30000
        });
        await humanDelay(3000);

        // Get top post links
        const postLinks = await this.page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href*="/p/"]'))
            .slice(0, 6)
            .map(a => a.getAttribute('href'));
        });

        for (const postLink of postLinks) {
          if (totalThreads >= maxThreads) break;

          try {
            await this.page.goto(`https://www.instagram.com${postLink}`, {
              waitUntil: 'domcontentloaded', timeout: 30000
            });
            await humanDelay(3000);

            // Extract post + comments
            const postData = await this.page.evaluate(() => {
              const getAuthor = () => {
                const el = document.querySelector('header a[href^="/"]');
                return el ? el.textContent.trim() || el.getAttribute('href').replace(/\//g, '') : 'unknown';
              };
              const getCaption = () => {
                const el = document.querySelector('h1') || document.querySelector('article span');
                return el ? el.textContent.trim() : '';
              };
              const getLikes = () => {
                const el = document.querySelector('section span') || document.querySelector('button[class*="like"] span');
                return parseInt(el?.textContent?.replace(/,/g, '')) || 0;
              };

              const comments = [];
              document.querySelectorAll('ul > div > li, ul ul > div > li').forEach(li => {
                const authorEl = li.querySelector('a[href^="/"]');
                const textEl = li.querySelector('span:not([class*="time"])');
                const likeEl = li.querySelector('button[class*="like"]');

                if (authorEl && textEl && textEl.textContent.trim().length > 3) {
                  comments.push({
                    author: authorEl.textContent.trim() || authorEl.getAttribute('href').replace(/\//g, ''),
                    content: textEl.textContent.trim(),
                    likes: parseInt(likeEl?.textContent?.trim()) || 0,
                    depth: li.closest('ul ul') ? 1 : 0
                  });
                }
              });

              return {
                author: getAuthor(),
                caption: getCaption(),
                likes: getLikes(),
                comments,
                postId: window.location.pathname.match(/\/p\/([^/]+)/)?.[1] || ''
              };
            });

            if (postData.comments.length >= 2) {
              const convResult = await db.query(`
                INSERT INTO observed_conversations (platform, thread_id, root_content, root_author, root_url, total_replies, total_participants, thread_type)
                VALUES ('instagram', $1, $2, $3, $4, $5, $6, 'organic')
                ON CONFLICT (platform, thread_id) DO UPDATE SET
                  total_replies = EXCLUDED.total_replies,
                  observed_at = NOW()
                RETURNING id
              `, [
                postData.postId, postData.caption, postData.author,
                `https://www.instagram.com/p/${postData.postId}/`,
                postData.comments.length,
                new Set(postData.comments.map(c => c.author)).size
              ]);

              const convId = convResult.rows[0].id;

              for (const comment of postData.comments) {
                try {
                  await db.query(`
                    INSERT INTO observed_messages (conversation_id, platform, author, content, reply_depth, likes, word_count, has_question, has_emoji, has_link)
                    VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9)
                  `, [
                    convId, comment.author, comment.content, comment.depth,
                    comment.likes,
                    comment.content.split(/\s+/).length,
                    /\?/.test(comment.content),
                    /[\u{1F600}-\u{1F9FF}]/u.test(comment.content),
                    /https?:\/\//.test(comment.content)
                  ]);
                  totalMessages++;
                } catch (e) {}
              }

              totalThreads++;
            }
          } catch (err) {
            console.warn(`[Harvester:IG] Post error: ${err.message}`);
          }

          await humanDelay(4000);
        }

        await humanDelay(5000);
      }

      await this.finishHarvest(logId, totalThreads, totalMessages);
      console.log(`[Harvester:IG] Done. ${totalThreads} threads, ${totalMessages} messages`);

    } catch (err) {
      console.error('[Harvester:IG] Failed:', err.message);
      await this.errorHarvest(logId, err.message);
    } finally {
      await this.close();
    }

    return { threads: totalThreads, messages: totalMessages };
  }

  // ============================================================
  // LINKEDIN — Harvest comment threads on public posts
  // ============================================================

  async harvestLinkedIn(options = {}) {
    const {
      queries = ['restaurant owner', 'small business payments', 'independent cafe'],
      maxThreads = 10
    } = options;

    console.log('[Harvester:LI] Starting conversation harvest');
    await this.launch();

    const logId = await this.logHarvest('linkedin', 'search', queries.join(', '));
    let totalThreads = 0;
    let totalMessages = 0;

    try {
      for (const query of queries) {
        if (totalThreads >= maxThreads) break;

        await this.page.goto(
          `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}`,
          { waitUntil: 'domcontentloaded', timeout: 30000 }
        );
        await humanDelay(4000);

        // Scroll to load posts
        for (let i = 0; i < 3; i++) {
          await this.page.mouse.wheel(0, scrollDistance(false));
          await humanDelay(2500);
        }

        // Extract posts with comments
        const posts = await this.page.evaluate(() => {
          const results = [];
          document.querySelectorAll('.feed-shared-update-v2').forEach(post => {
            const textEl = post.querySelector('.feed-shared-text__text-view, .break-words');
            const authorEl = post.querySelector('.update-components-actor__name');
            const commentCountEl = post.querySelector('button[aria-label*="comment"]');
            const likeCountEl = post.querySelector('.social-details-social-counts__reactions-count');

            const commentCount = parseInt(commentCountEl?.textContent?.trim()) || 0;

            if (textEl && commentCount >= 2) {
              results.push({
                content: textEl.textContent.trim().substring(0, 1000),
                author: authorEl?.textContent?.trim() || 'unknown',
                comments: commentCount,
                likes: parseInt(likeCountEl?.textContent?.trim()) || 0
              });
            }
          });
          return results.slice(0, 5);
        });

        for (const post of posts) {
          if (totalThreads >= maxThreads) break;

          // Click "show comments" and extract
          try {
            const commentButtons = await this.page.$$('button[aria-label*="comment"]');
            for (const btn of commentButtons) {
              const text = await btn.textContent();
              if (parseInt(text) >= 2) {
                await btn.click();
                await humanDelay(2000);
                break;
              }
            }

            const comments = await this.page.evaluate(() => {
              const msgs = [];
              document.querySelectorAll('.comments-comment-item, .comments-comment-entity').forEach(item => {
                const authorEl = item.querySelector('.comments-post-meta__name');
                const textEl = item.querySelector('.comments-comment-item__main-content, .update-components-text');
                const likeEl = item.querySelector('.comments-comment-social-bar__reactions-count');

                if (authorEl && textEl) {
                  msgs.push({
                    author: authorEl.textContent.trim(),
                    content: textEl.textContent.trim(),
                    likes: parseInt(likeEl?.textContent?.trim()) || 0
                  });
                }
              });
              return msgs;
            });

            if (comments.length >= 2) {
              const threadId = `li-${Date.now()}-${totalThreads}`;

              const convResult = await db.query(`
                INSERT INTO observed_conversations (platform, thread_id, root_content, root_author, total_replies, total_participants, thread_type)
                VALUES ('linkedin', $1, $2, $3, $4, $5, 'organic')
                ON CONFLICT (platform, thread_id) DO UPDATE SET observed_at = NOW()
                RETURNING id
              `, [
                threadId, post.content.substring(0, 500), post.author,
                comments.length,
                new Set(comments.map(c => c.author)).size
              ]);

              const convId = convResult.rows[0].id;

              for (const comment of comments) {
                try {
                  await db.query(`
                    INSERT INTO observed_messages (conversation_id, platform, author, content, reply_depth, likes, word_count, has_question, has_emoji)
                    VALUES ($1, 'linkedin', $2, $3, 0, $4, $5, $6, $7)
                  `, [
                    convId, comment.author, comment.content,
                    comment.likes,
                    comment.content.split(/\s+/).length,
                    /\?/.test(comment.content),
                    /[\u{1F600}-\u{1F9FF}]/u.test(comment.content)
                  ]);
                  totalMessages++;
                } catch (e) {}
              }

              totalThreads++;
            }
          } catch (err) {}

          await humanDelay(5000);
        }
      }

      await this.finishHarvest(logId, totalThreads, totalMessages);
      console.log(`[Harvester:LI] Done. ${totalThreads} threads, ${totalMessages} messages`);

    } catch (err) {
      console.error('[Harvester:LI] Failed:', err.message);
      await this.errorHarvest(logId, err.message);
    } finally {
      await this.close();
    }

    return { threads: totalThreads, messages: totalMessages };
  }

  // ============================================================
  // HARVEST LOGGING
  // ============================================================

  async logHarvest(platform, sourceType, sourceQuery) {
    const result = await db.query(
      'INSERT INTO harvest_log (platform, source_type, source_query) VALUES ($1, $2, $3) RETURNING id',
      [platform, sourceType, sourceQuery]
    );
    return result.rows[0].id;
  }

  async finishHarvest(logId, threads, messages) {
    await db.query(
      'UPDATE harvest_log SET threads_found = $1, messages_harvested = $2, completed_at = NOW(), next_harvest_at = NOW() + INTERVAL \'6 hours\' WHERE id = $3',
      [threads, messages, logId]
    );
  }

  async errorHarvest(logId, error) {
    await db.query(
      'UPDATE harvest_log SET error_message = $1, completed_at = NOW(), next_harvest_at = NOW() + INTERVAL \'1 hour\' WHERE id = $2',
      [error, logId]
    );
  }
}

module.exports = ConversationHarvester;
