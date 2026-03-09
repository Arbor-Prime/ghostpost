#!/bin/bash
# Delete user by email - cleans all associated data
# Usage: bash delete-user.sh

EMAIL="ibbysj@gmail.com"

cd /opt/ghostpost

echo "Deleting user: $EMAIL"

sudo -u postgres psql ghostpost << EOSQL
BEGIN;

-- Get user ID
DO \$\$
DECLARE uid INTEGER;
BEGIN
  SELECT id INTO uid FROM users WHERE email = '$EMAIL';
  IF uid IS NULL THEN
    RAISE NOTICE 'User not found: $EMAIL';
    RETURN;
  END IF;

  RAISE NOTICE 'Found user ID: %', uid;

  -- Delete all user data in dependency order
  DELETE FROM posted_replies WHERE user_id = uid;
  DELETE FROM drafts WHERE user_id = uid;
  DELETE FROM opportunities WHERE user_id = uid;
  DELETE FROM observed_tweets WHERE id IN (
    SELECT ot.id FROM observed_tweets ot
    JOIN tracked_profiles tp ON ot.author_handle = tp.x_handle
    WHERE tp.user_id = uid
  );
  DELETE FROM observation_sessions WHERE user_id = uid;
  DELETE FROM circadian_entries WHERE user_id = uid;
  DELETE FROM outreach_messages WHERE lead_id IN (
    SELECT l.id FROM leads l JOIN campaigns c ON l.campaign_id = c.id WHERE c.user_id = uid
  );
  DELETE FROM leads WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = uid);
  DELETE FROM campaigns WHERE user_id = uid;
  DELETE FROM browser_sessions WHERE account_id IN (SELECT id FROM platform_accounts WHERE user_id = uid);
  DELETE FROM platform_accounts WHERE user_id = uid;
  DELETE FROM tracked_profiles WHERE user_id = uid;
  DELETE FROM users WHERE id = uid;

  RAISE NOTICE 'User % deleted successfully', uid;
END \$\$;

COMMIT;
EOSQL

echo "Done. User $EMAIL has been removed."
