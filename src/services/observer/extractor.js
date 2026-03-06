/**
 * Tweet Data Extractor
 * 
 * Extracts tweet data from X's DOM during observation sessions.
 * Runs inside Playwright page.evaluate() — no Node APIs available.
 * 
 * X's DOM structure changes frequently. If selectors break,
 * check data-testid attributes first — they're the most stable.
 */

/**
 * Extract all visible tweets from the current page state.
 * Call this AFTER each scroll in browser.js.
 * 
 * @param {Page} page - Playwright page object
 * @returns {Array<Object>} Array of tweet data objects
 */
async function extractTweets(page) {
  return await page.evaluate(() => {
    const tweets = [];
    const seen = new Set();

    // X uses article elements with data-testid="tweet"
    const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');

    for (const el of tweetElements) {
      try {
        // Extract tweet ID from link
        const tweetLink = el.querySelector('a[href*="/status/"]');
        if (!tweetLink) continue;
        
        const href = tweetLink.getAttribute('href');
        const tweetIdMatch = href.match(/\/status\/(\d+)/);
        if (!tweetIdMatch) continue;
        
        const tweetId = tweetIdMatch[1];
        if (seen.has(tweetId)) continue;
        seen.add(tweetId);

        // Author info
        const userLinks = el.querySelectorAll('a[role="link"]');
        let authorHandle = '';
        let authorDisplayName = '';
        for (const link of userLinks) {
          const h = link.getAttribute('href');
          if (h && h.startsWith('/') && !h.includes('/status/') && h.split('/').length === 2) {
            authorHandle = h.replace('/', '');
            const nameEl = link.querySelector('span');
            if (nameEl) authorDisplayName = nameEl.textContent.trim();
            break;
          }
        }

        // Tweet text content
        const textEl = el.querySelector('[data-testid="tweetText"]');
        const content = textEl ? textEl.textContent.trim() : '';
        if (!content) continue; // Skip tweets with no text

        // Engagement metrics
        const getMetric = (testId) => {
          const metricEl = el.querySelector(`[data-testid="${testId}"]`);
          if (!metricEl) return 0;
          const text = metricEl.getAttribute('aria-label') || metricEl.textContent || '0';
          const num = text.match(/[\d,]+/);
          return num ? parseInt(num[0].replace(/,/g, ''), 10) : 0;
        };

        const likes = getMetric('like');
        const retweets = getMetric('retweet');
        const replies = getMetric('reply');

        // Views (sometimes in a separate element)
        let views = 0;
        const analyticsLink = el.querySelector('a[href*="/analytics"]');
        if (analyticsLink) {
          const viewText = analyticsLink.getAttribute('aria-label') || analyticsLink.textContent || '0';
          const viewNum = viewText.match(/[\d,]+/);
          views = viewNum ? parseInt(viewNum[0].replace(/,/g, ''), 10) : 0;
        }

        // Time posted
        const timeEl = el.querySelector('time');
        const postedAt = timeEl ? timeEl.getAttribute('datetime') : null;

        // Is this a reply?
        const isReply = !!el.querySelector('[data-testid="tweet"] + [data-testid="tweet"]') ||
                        content.startsWith('@');
        
        // Reply to handle
        let replyToHandle = null;
        if (isReply) {
          const replyContext = el.querySelector('div[id^="id__"]');
          if (replyContext) {
            const replyLink = replyContext.querySelector('a[href^="/"]');
            if (replyLink) replyToHandle = replyLink.getAttribute('href').replace('/', '');
          }
        }

        // Has media (images, videos)
        const hasMedia = !!(
          el.querySelector('[data-testid="tweetPhoto"]') ||
          el.querySelector('[data-testid="videoPlayer"]') ||
          el.querySelector('[data-testid="card.wrapper"]')
        );

        tweets.push({
          tweetId,
          authorHandle,
          authorDisplayName,
          content,
          tweetUrl: `https://x.com${href}`,
          postedAt,
          likes,
          retweets,
          replies,
          views,
          isReply,
          replyToHandle,
          hasMedia,
        });
      } catch (err) {
        // Skip malformed tweets silently
        continue;
      }
    }

    return tweets;
  });
}

module.exports = { extractTweets };
