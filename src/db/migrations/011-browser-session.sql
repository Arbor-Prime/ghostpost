-- Sprint 11: Browser Session support columns

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cookie_status') THEN
    ALTER TABLE users ADD COLUMN cookie_status VARCHAR(20) DEFAULT 'none';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cookie_updated_at') THEN
    ALTER TABLE users ADD COLUMN cookie_updated_at TIMESTAMPTZ;
  END IF;
END $$;
