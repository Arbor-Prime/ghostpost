-- Migration 012b: Fix browser_sessions compatibility
-- The browser_sessions table already exists from Sprint 11 with different columns.
-- This adds the Sprint 16 columns without dropping the existing table.

-- Add account_id column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'account_id') THEN
    ALTER TABLE browser_sessions ADD COLUMN account_id INTEGER;
  END IF;
END $$;

-- Add session_type column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'session_type') THEN
    ALTER TABLE browser_sessions ADD COLUMN session_type VARCHAR(30) DEFAULT 'manual';
  END IF;
END $$;

-- Add vnc_port column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'vnc_port') THEN
    ALTER TABLE browser_sessions ADD COLUMN vnc_port INTEGER;
  END IF;
END $$;

-- Add actions_performed column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'actions_performed') THEN
    ALTER TABLE browser_sessions ADD COLUMN actions_performed INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add pages_visited column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'pages_visited') THEN
    ALTER TABLE browser_sessions ADD COLUMN pages_visited INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add dms_sent column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'dms_sent') THEN
    ALTER TABLE browser_sessions ADD COLUMN dms_sent INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add websocket_url column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'websocket_url') THEN
    ALTER TABLE browser_sessions ADD COLUMN websocket_url TEXT;
  END IF;
END $$;

-- Add duration_ms column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'duration_ms') THEN
    ALTER TABLE browser_sessions ADD COLUMN duration_ms INTEGER;
  END IF;
END $$;

-- Add last_screenshot_path column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'browser_sessions' AND column_name = 'last_screenshot_path') THEN
    ALTER TABLE browser_sessions ADD COLUMN last_screenshot_path TEXT;
  END IF;
END $$;

-- Now create the index that failed
CREATE INDEX IF NOT EXISTS idx_browser_sessions_account ON browser_sessions(account_id, status);
