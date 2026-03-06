-- GhostPost Sprint 1 — 9 tables + 6 indexes

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    x_handle VARCHAR(100),
    oauth_token TEXT,
    oauth_refresh_token TEXT,
    oauth_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    profile_json JSONB NOT NULL,
    source VARCHAR(20) DEFAULT 'voice',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observer_accounts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100),
    password_encrypted TEXT,
    proxy_host VARCHAR(255),
    proxy_port INTEGER,
    proxy_user VARCHAR(100),
    proxy_pass_encrypted TEXT,
    status VARCHAR(20) DEFAULT 'inactive',
    last_active TIMESTAMP,
    cookies_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observed_tweets (
    id SERIAL PRIMARY KEY,
    tweet_id VARCHAR(50) UNIQUE,
    author_handle VARCHAR(100),
    author_display_name VARCHAR(200),
    content TEXT,
    tweet_type VARCHAR(20) DEFAULT 'original',
    media_type VARCHAR(20) DEFAULT 'text',
    engagement_likes INTEGER DEFAULT 0,
    engagement_replies INTEGER DEFAULT 0,
    engagement_retweets INTEGER DEFAULT 0,
    engagement_views INTEGER DEFAULT 0,
    thread_position INTEGER,
    observed_at TIMESTAMP DEFAULT NOW(),
    observed_by INTEGER REFERENCES observer_accounts(id)
);

CREATE TABLE IF NOT EXISTS opportunities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    tweet_id VARCHAR(50) REFERENCES observed_tweets(tweet_id),
    score INTEGER,
    persona VARCHAR(50),
    suggested_angle TEXT,
    suggested_tone TEXT,
    max_length INTEGER,
    status VARCHAR(20) DEFAULT 'new',
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drafts (
    id SERIAL PRIMARY KEY,
    opportunity_id INTEGER REFERENCES opportunities(id),
    user_id INTEGER REFERENCES users(id),
    content TEXT,
    llm_source VARCHAR(20) DEFAULT 'ollama',
    status VARCHAR(20) DEFAULT 'pending',
    edited_content TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posted_replies (
    id SERIAL PRIMARY KEY,
    draft_id INTEGER REFERENCES drafts(id),
    user_id INTEGER REFERENCES users(id),
    original_tweet_id VARCHAR(50),
    reply_tweet_id VARCHAR(50),
    engagement_1h JSONB,
    engagement_4h JSONB,
    engagement_24h JSONB,
    posted_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracked_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    x_handle VARCHAR(100),
    priority INTEGER DEFAULT 5,
    notes TEXT,
    added_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observer_logs (
    id SERIAL PRIMARY KEY,
    observer_id INTEGER REFERENCES observer_accounts(id),
    action VARCHAR(50),
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observed_tweets_author ON observed_tweets(author_handle);
CREATE INDEX IF NOT EXISTS idx_observed_tweets_observed_at ON observed_tweets(observed_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(score DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_tracked_profiles_handle ON tracked_profiles(x_handle);
