/**
 * Posting Delay
 *
 * Adds human-like delay before posting. Considers:
 * - Time since last post (avoid rapid-fire)
 * - Circadian energy (slower when tired)
 * - Random jitter (never exactly the same gap)
 */

const { logNormalRandom, randomBetween } = require('../../utils/humanise');
const db = require('../../config/database');

const MIN_GAP_MS = 3 * 60 * 1000;      // 3 minutes minimum between posts
const BASE_DELAY_MS = 45 * 1000;        // 45-second base thinking time
const MAX_DELAY_MS = 10 * 60 * 1000;    // 10 minutes max

/**
 * Calculate a human-like delay before posting.
 * Returns delay in milliseconds.
 */
async function calculatePostingDelay(userId) {
  const lastPost = await db.query(
    `SELECT posted_at FROM posted_replies
     WHERE user_id = $1 AND status = 'posted'
     ORDER BY posted_at DESC LIMIT 1`,
    [userId]
  );

  let gapDelay = 0;
  if (lastPost.rows.length > 0) {
    const elapsed = Date.now() - new Date(lastPost.rows[0].posted_at).getTime();
    if (elapsed < MIN_GAP_MS) {
      gapDelay = MIN_GAP_MS - elapsed + randomBetween(10000, 30000);
    }
  }

  const hour = new Date().getHours();
  let energyMultiplier = 1.0;

  const circadian = await db.query(
    'SELECT energy FROM circadian_tones WHERE user_id = $1 AND hour = $2',
    [userId, hour]
  );

  if (circadian.rows.length > 0) {
    const energy = circadian.rows[0].energy;
    // Low energy → longer delays (tired people are slower)
    energyMultiplier = energy < 0.3 ? 1.8 : energy < 0.5 ? 1.3 : energy > 0.8 ? 0.7 : 1.0;
  }

  const baseDelay = Math.round(logNormalRandom(BASE_DELAY_MS * energyMultiplier, 0.4));
  const totalDelay = Math.min(gapDelay + baseDelay, MAX_DELAY_MS);

  return Math.max(0, totalDelay);
}

module.exports = { calculatePostingDelay };
