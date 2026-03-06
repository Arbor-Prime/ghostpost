/**
 * Opportunity Scorer
 * 
 * Scores each extracted tweet for reply potential based on:
 * 1. Topic relevance (does this match the persona's interests?)
 * 2. Engagement potential (is this tweet getting traction?)
 * 3. Recency (fresh tweets get higher scores)
 * 4. Reply naturalness (would a reply from this persona make sense?)
 * 
 * Uses keyword matching for fast scoring; Ollama reserved for draft generation.
 * 
 * Research backing:
 * - X algorithm weights replies 54x more than likes
 * - Replies that get responses back are weighted 150x
 * - Early replies on trending tweets get most visibility
 */

const db = require('../../config/database');

/**
 * Score a batch of tweets for a specific user/persona.
 * 
 * @param {number} userId
 * @param {Array} tweets - Array of observed_tweet rows
 * @param {Object} voiceProfile - User's voice profile
 * @param {Object} persona - User's persona
 * @returns {Array} Scored opportunities sorted by overall_score DESC
 */
async function scoreTweets(userId, tweets, voiceProfile, persona) {
  const opportunities = [];

  for (const tweet of tweets) {
    // Skip tweets that are already scored
    const existing = await db.query(
      'SELECT id FROM opportunities WHERE tweet_id = $1 AND user_id = $2',
      [tweet.tweet_id, userId]
    );
    if (existing.rows.length > 0) continue;

    // --- 1. Topic Relevance (0-1) ---
    const relevance = calculateRelevance(tweet, voiceProfile);

    // --- 2. Engagement Potential (0-1) ---
    const engagement = calculateEngagement(tweet);

    // --- 3. Recency (0-1) ---
    const recency = calculateRecency(tweet);

    // --- 4. Reply Naturalness (0-1) ---
    const naturalness = calculateNaturalness(tweet, voiceProfile, persona);

    // --- Overall Score (weighted) ---
    const overall = (
      relevance * 0.35 +
      engagement * 0.20 +
      recency * 0.25 +
      naturalness * 0.20
    );

    const reasons = {
      relevance: { score: relevance, detail: getRelevanceDetail(tweet, voiceProfile) },
      engagement: { score: engagement, detail: `${tweet.likes_count}L ${tweet.retweets_count}RT ${tweet.replies_count}R` },
      recency: { score: recency, detail: tweet.posted_at },
      naturalness: { score: naturalness },
    };

    // Only create opportunity if score is above threshold
    if (overall >= 0.3) {
      opportunities.push({
        userId,
        tweetId: tweet.tweet_id,
        relevanceScore: Math.round(relevance * 100) / 100,
        engagementScore: Math.round(engagement * 100) / 100,
        recencyScore: Math.round(recency * 100) / 100,
        overallScore: Math.round(overall * 100) / 100,
        reasons,
      });
    }
  }

  // Sort by overall score
  opportunities.sort((a, b) => b.overallScore - a.overallScore);

  return opportunities;
}

function calculateRelevance(tweet, voiceProfile) {
  const content = tweet.content.toLowerCase();
  const primaryTopics = (voiceProfile.primary_topics || []).map(t => t.toLowerCase());
  const secondaryTopics = (voiceProfile.secondary_topics || []).map(t => t.toLowerCase());

  let score = 0;

  // Check primary topic matches (high weight)
  for (const topic of primaryTopics) {
    const words = topic.split(/\s+/);
    if (words.some(w => w.length > 3 && content.includes(w))) {
      score += 0.4;
      break;
    }
  }

  // Check secondary topic matches (lower weight)
  for (const topic of secondaryTopics) {
    const words = topic.split(/\s+/);
    if (words.some(w => w.length > 3 && content.includes(w))) {
      score += 0.2;
      break;
    }
  }

  // Check signature word presence
  const sigWords = (voiceProfile.signature_words || []).map(w => w.toLowerCase());
  const sigMatches = sigWords.filter(w => content.includes(w)).length;
  score += Math.min(0.3, sigMatches * 0.1);

  // Check off-limits topics (penalty)
  const offLimits = (voiceProfile.off_limits || []).map(t => t.toLowerCase());
  for (const topic of offLimits) {
    if (content.includes(topic)) {
      score -= 0.5;
      break;
    }
  }

  return Math.max(0, Math.min(1, score));
}

function calculateEngagement(tweet) {
  const likes = tweet.likes_count || 0;
  const retweets = tweet.retweets_count || 0;
  const replies = tweet.replies_count || 0;

  // Weighted engagement metric
  const engagementTotal = likes + (retweets * 3) + (replies * 5);

  if (engagementTotal === 0) return 0.1;
  if (engagementTotal < 10) return 0.3;
  if (engagementTotal < 100) return 0.5;
  if (engagementTotal < 1000) return 0.7;
  if (engagementTotal < 10000) return 0.85;
  return 0.95;
}

function calculateRecency(tweet) {
  if (!tweet.posted_at) return 0.5;

  const ageMinutes = (Date.now() - new Date(tweet.posted_at).getTime()) / (1000 * 60);

  if (ageMinutes < 30) return 1.0;
  if (ageMinutes < 60) return 0.9;
  if (ageMinutes < 180) return 0.7;
  if (ageMinutes < 720) return 0.5;
  if (ageMinutes < 1440) return 0.3;
  return 0.1;
}

function calculateNaturalness(tweet, voiceProfile, persona) {
  let score = 0.5;

  // Questions are natural reply opportunities
  if (tweet.content.includes('?')) score += 0.2;

  // Controversial/debate topics boost if persona is direct
  if (persona.directness > 0.6 && tweet.content.match(/\b(agree|disagree|debate|opinion|thoughts)\b/i)) {
    score += 0.15;
  }

  // Short tweets are easier to reply to
  const wordCount = tweet.content.split(/\s+/).length;
  if (wordCount < 30) score += 0.1;

  // Tweets with lots of replies already — harder to stand out
  if (tweet.replies_count > 100) score -= 0.15;

  // Is a reply to someone else — less natural to jump in
  if (tweet.is_reply) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

function getRelevanceDetail(tweet, voiceProfile) {
  const content = tweet.content.toLowerCase();
  const matches = [];
  for (const topic of (voiceProfile.primary_topics || [])) {
    const words = topic.toLowerCase().split(/\s+/);
    if (words.some(w => w.length > 3 && content.includes(w))) matches.push(topic);
  }
  for (const topic of (voiceProfile.secondary_topics || [])) {
    const words = topic.toLowerCase().split(/\s+/);
    if (words.some(w => w.length > 3 && content.includes(w))) matches.push(topic);
  }
  return matches.length > 0 ? `Matches: ${matches.join(', ')}` : 'No direct topic match';
}

/**
 * Store scored opportunities in the database.
 */
async function storeOpportunities(opportunities) {
  let stored = 0;
  for (const opp of opportunities) {
    try {
      await db.query(
        `INSERT INTO opportunities (user_id, tweet_id, relevance_score, engagement_score, recency_score, overall_score, scoring_reasons, scored_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'pending')
         ON CONFLICT DO NOTHING`,
        [opp.userId, opp.tweetId, opp.relevanceScore, opp.engagementScore, opp.recencyScore, opp.overallScore, JSON.stringify(opp.reasons)]
      );
      stored++;
    } catch (err) {
      console.error(`[Scorer] Failed to store opportunity for tweet ${opp.tweetId}: ${err.message}`);
    }
  }
  return stored;
}

module.exports = { scoreTweets, storeOpportunities };
