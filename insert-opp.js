const db = require('./src/config/database');
(async () => {
  await db.query(
    `INSERT INTO observed_tweets (tweet_id, author_handle, content, tweet_url) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tweet_id) DO UPDATE SET tweet_url = EXCLUDED.tweet_url`,
    ['2024412846566801521', 'Web3_Jarin', 'Tweet from Web3_Jarin', 'https://x.com/Web3_Jarin/status/2024412846566801521']
  );
  const r = await db.query(
    `INSERT INTO opportunities (user_id, tweet_id, status, source_type, relevance_score, engagement_score, recency_score, overall_score, created_at, scored_at)
     VALUES (1, $1, 'pending', 'manual', 0.8, 0.5, 1.0, 0.77, NOW(), NOW()) RETURNING id`,
    ['2024412846566801521']
  );
  console.log(r.rows[0].id);
})().catch(e => { console.error(e); process.exit(1); });
