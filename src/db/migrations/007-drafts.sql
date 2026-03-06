-- V7: Draft replies
-- Run: psql -U ghostpost -d ghostpost -f 007-drafts.sql

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS reply_text TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS response_type VARCHAR(30);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS target_word_count INTEGER;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS actual_word_count INTEGER;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS circadian_mood VARCHAR(20);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS energy_level FLOAT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS raw_ollama_response TEXT;

-- Update status default
ALTER TABLE drafts ALTER COLUMN status SET DEFAULT 'pending';

-- Better indexes
DROP INDEX IF EXISTS idx_drafts_status;
CREATE INDEX IF NOT EXISTS idx_drafts_user_status ON drafts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_drafts_opportunity ON drafts(opportunity_id);

-- Ensure permissions
GRANT ALL ON TABLE drafts TO ghostpost;
GRANT USAGE, SELECT ON SEQUENCE drafts_id_seq TO ghostpost;
