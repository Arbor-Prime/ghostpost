-- V2 Architecture: Per-customer isolated sessions
-- Run: psql -U ghostpost -d ghostpost -f 002-v2-schema.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(10) DEFAULT 'scout';
ALTER TABLE users ADD COLUMN IF NOT EXISTS proxy_host VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS proxy_port INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS proxy_user VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS proxy_pass_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint_mobile JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint_desktop JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_to_desktop_hour INTEGER DEFAULT 18;
ALTER TABLE users ADD COLUMN IF NOT EXISTS observation_frequency INTEGER DEFAULT 4;
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_cookies_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_observation_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'timeline';

CREATE TABLE IF NOT EXISTS observation_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  fingerprint_type VARCHAR(10),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  tweets_found INTEGER DEFAULT 0,
  opportunities_found INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'running',
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_obs_sessions_user ON observation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_obs_sessions_started ON observation_sessions(started_at);
