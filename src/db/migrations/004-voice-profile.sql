-- V4: Voice profile storage

ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_profile JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_onboarding_status VARCHAR(20) DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS voice_recordings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  duration_seconds FLOAT,
  file_size_bytes INTEGER,
  transcription TEXT,
  word_count INTEGER,
  processing_status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON voice_recordings(user_id);

GRANT ALL ON TABLE voice_recordings TO ghostpost;
GRANT USAGE, SELECT ON SEQUENCE voice_recordings_id_seq TO ghostpost;
