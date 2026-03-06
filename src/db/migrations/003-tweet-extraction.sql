-- Sprint 3: Evolve observed_tweets for tweet extraction

-- Add new columns needed by Sprint 3 extractor
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES observation_sessions(id);
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS tweet_url VARCHAR(255);
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS retweets_count INTEGER DEFAULT 0;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS replies_count INTEGER DEFAULT 0;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS is_reply BOOLEAN DEFAULT FALSE;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS reply_to_handle VARCHAR(50);
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS has_media BOOLEAN DEFAULT FALSE;
ALTER TABLE observed_tweets ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ DEFAULT NOW();

-- Widen author_handle to match extractor output if needed
ALTER TABLE observed_tweets ALTER COLUMN author_handle TYPE VARCHAR(100);

-- Make content NOT NULL with a default for existing rows
UPDATE observed_tweets SET content = '' WHERE content IS NULL;

-- New indexes for Sprint 3 queries
CREATE INDEX IF NOT EXISTS idx_observed_tweets_user ON observed_tweets(user_id, extracted_at);
CREATE INDEX IF NOT EXISTS idx_observed_tweets_session ON observed_tweets(session_id);
CREATE INDEX IF NOT EXISTS idx_observed_tweets_tweet_id ON observed_tweets(tweet_id);

-- Grant permissions to ghostpost user
GRANT ALL ON TABLE observed_tweets TO ghostpost;
GRANT USAGE, SELECT ON SEQUENCE observed_tweets_id_seq TO ghostpost;
GRANT ALL ON TABLE observation_sessions TO ghostpost;
GRANT USAGE, SELECT ON SEQUENCE observation_sessions_id_seq TO ghostpost;
