-- V9: Reply posting
-- Run: psql -U ghostpost -d ghostpost -f 009-reply-posting.sql

CREATE TABLE IF NOT EXISTS posted_replies (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER REFERENCES drafts(id),
  user_id INTEGER REFERENCES users(id),
  tweet_id VARCHAR(30),
  reply_tweet_id VARCHAR(30),
  reply_url VARCHAR(255),
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  typing_duration_ms INTEGER,
  device_used VARCHAR(10),
  status VARCHAR(20) DEFAULT 'posted',
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_posted_replies_user ON posted_replies(user_id, posted_at);
CREATE INDEX IF NOT EXISTS idx_posted_replies_draft ON posted_replies(draft_id);

CREATE TABLE IF NOT EXISTS posting_rate_limits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  window_start TIMESTAMPTZ NOT NULL,
  replies_in_window INTEGER DEFAULT 0,
  UNIQUE(user_id, window_start)
);
