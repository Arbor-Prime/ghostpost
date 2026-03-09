#!/usr/bin/env python3
"""Delete a user account and all associated data by email."""
import subprocess, sys

EMAIL = "ibbysj@gmail.com"

# Order matters — delete child records first to respect foreign keys
QUERIES = [
    f"DELETE FROM outreach_messages WHERE lead_id IN (SELECT id FROM leads WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}')));",
    f"DELETE FROM leads WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}'));",
    f"DELETE FROM campaigns WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM posted_replies WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM drafts WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM opportunities WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM observed_tweets WHERE author_handle IN (SELECT x_handle FROM tracked_profiles WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}'));",
    f"DELETE FROM observation_sessions WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM tracked_profiles WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM circadian_entries WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM browser_sessions WHERE account_id IN (SELECT id FROM platform_accounts WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}'));",
    f"DELETE FROM platform_accounts WHERE user_id IN (SELECT id FROM users WHERE email = '{EMAIL}');",
    f"DELETE FROM users WHERE email = '{EMAIL}';",
]

print(f"Deleting account: {EMAIL}")
for q in QUERIES:
    table = q.split("FROM ")[1].split(" ")[0]
    result = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", "ghostpost", "-t", "-A", "-c", q],
        capture_output=True, text=True
    )
    rows = result.stdout.strip()
    if rows and rows != "DELETE 0":
        print(f"  {table}: {rows}")

# Verify
check = subprocess.run(
    ["sudo", "-u", "postgres", "psql", "-d", "ghostpost", "-t", "-A", "-c",
     f"SELECT id FROM users WHERE email = '{EMAIL}';"],
    capture_output=True, text=True
)
if check.stdout.strip():
    print(f"\nERROR: User still exists!")
    sys.exit(1)
else:
    print(f"\nDone. Account {EMAIL} fully deleted.")
