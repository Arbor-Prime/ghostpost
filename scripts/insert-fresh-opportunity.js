#!/usr/bin/env node
/**
 * Manual insert: observed_tweet + opportunity for a fresh tweet.
 * Usage: node scripts/insert-fresh-opportunity.js
 * Run from /opt/ghostpost on server.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const db = require('../src/config/database');

const TWEET_ID = '2024412846566801521';
const AUTHOR = 'Web3_Jarin';
const TWEET_URL = `https://x.com/${AUTHOR}/status/${TWEET_ID}`;

async function main() {
  await db.query(
    `INSERT INTO observed_tweets (tweet_id, author_handle, content, tweet_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tweet_id) DO UPDATE SET tweet_url = EXCLUDED.tweet_url`,
    [TWEET_ID, AUTHOR, 'Tweet from ' + AUTHOR, TWEET_URL]
  );
  const r = await db.query(
    `INSERT INTO opportunities (user_id, tweet_id, status, source_type, relevance_score, engagement_score, recency_score, overall_score, created_at, scored_at)
     VALUES (1, $1, 'pending', 'manual', 0.8, 0.5, 1.0, 0.77, NOW(), NOW())
     RETURNING id`,
    [TWEET_ID]
  );
  console.log(JSON.stringify({ opportunityId: r.rows[0].id }));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
