-- Sprint 23: Outreach Engine Tables
-- Run: sudo -u postgres psql ghostpost < /path/to/this/file.sql

-- Ensure campaigns table has the right columns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'instagram';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_category VARCHAR(100);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_location VARCHAR(200);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name VARCHAR(200);

-- Ensure outreach_messages table has the right columns
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'instagram';
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS pitch_angle VARCHAR(100);

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  platform VARCHAR(20) DEFAULT 'instagram',
  name VARCHAR(200),
  target_category VARCHAR(100),
  target_location VARCHAR(200),
  daily_limit INTEGER DEFAULT 20,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  user_id INTEGER REFERENCES users(id),
  platform VARCHAR(20) DEFAULT 'instagram',
  username VARCHAR(100),
  profile_url VARCHAR(500),
  bio TEXT,
  follower_count INTEGER,
  category_match VARCHAR(20) DEFAULT 'unknown',
  qualification_score INTEGER DEFAULT 0,
  recommended_pitch VARCHAR(100),
  last_active TIMESTAMP,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  lead_id INTEGER REFERENCES leads(id),
  platform VARCHAR(20) DEFAULT 'instagram',
  message_text TEXT,
  pitch_angle VARCHAR(100),
  personalisation_source TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  typing_duration_ms INTEGER,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_recordings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) UNIQUE,
  duration_seconds FLOAT,
  file_size_bytes INTEGER,
  transcription TEXT,
  word_count INTEGER,
  processing_status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_user ON outreach_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_messages(status);
