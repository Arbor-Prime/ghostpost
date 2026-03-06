-- V5: Persona engine tables

ALTER TABLE users ADD COLUMN IF NOT EXISTS persona JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chronotype VARCHAR(20) DEFAULT 'intermediate';
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_pattern VARCHAR(20) DEFAULT 'office_9to5';
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_bracket VARCHAR(20) DEFAULT '25-34';
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'neutral';

CREATE TABLE IF NOT EXISTS daily_schedules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  schedule_date DATE NOT NULL,
  sessions JSONB NOT NULL,
  total_active_minutes INTEGER,
  total_sessions INTEGER,
  is_zero_day BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, schedule_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_user_date ON daily_schedules(user_id, schedule_date);

CREATE TABLE IF NOT EXISTS circadian_tones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  hour INTEGER NOT NULL,
  energy FLOAT NOT NULL,
  mood VARCHAR(20) NOT NULL,
  length_modifier FLOAT NOT NULL,
  emoji_boost FLOAT DEFAULT 0.0,
  UNIQUE(user_id, hour)
);
CREATE INDEX IF NOT EXISTS idx_circadian_user ON circadian_tones(user_id);

GRANT ALL ON TABLE daily_schedules TO ghostpost;
GRANT USAGE, SELECT ON SEQUENCE daily_schedules_id_seq TO ghostpost;
GRANT ALL ON TABLE circadian_tones TO ghostpost;
GRANT USAGE, SELECT ON SEQUENCE circadian_tones_id_seq TO ghostpost;
