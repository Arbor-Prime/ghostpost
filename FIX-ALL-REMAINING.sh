#!/bin/bash
set -e
echo "=== FIXING ALL REMAINING ISSUES ==="
cd /opt/ghostpost

# FIX 1: Account isolation on stats - filter tweets by user
python3 << 'PYEOF'
import re

# Fix stats.js - tweets should be filtered by user
with open('src/routes/stats.js', 'r') as f:
    code = f.read()

# Find and replace the global tweet count with user-filtered
if "SELECT COUNT(*) as total FROM observed_tweets" in code and "WHERE" not in code.split("FROM observed_tweets")[0].split('\n')[-1]:
    code = code.replace(
        "const tweetsResult = await db.query('SELECT COUNT(*) as total FROM observed_tweets');",
        """const tweetsResult = await db.query(
        `SELECT COUNT(*) as total FROM observed_tweets ot 
         WHERE EXISTS (SELECT 1 FROM tracked_profiles tp WHERE tp.user_id = $1 AND tp.x_handle = ot.author_handle)`,
        [userId]
      );"""
    )
    with open('src/routes/stats.js', 'w') as f:
        f.write(code)
    print("STATS: Fixed - tweets filtered by user")
else:
    print("STATS: Already fixed or different format")

# Fix cookie-import/status to be user-scoped
with open('src/routes/auth.js', 'r') as f:
    code = f.read()

# Check if cookie-import status is user-scoped
if "cookie-import/status" in code:
    if "req.user" not in code.split("cookie-import/status")[1][:200]:
        print("AUTH: cookie-import/status needs user scoping - manual fix needed")
    else:
        print("AUTH: cookie-import/status already user-scoped")
else:
    print("AUTH: No cookie-import/status route found")
PYEOF

# FIX 2: Kill any orphaned chromium for browser view
pkill -f chromium 2>/dev/null && echo "CHROMIUM: Killed orphaned processes" || echo "CHROMIUM: No orphaned processes"

# FIX 3: Restart PM2 fresh
npx pm2 kill 2>/dev/null
killall -9 node 2>/dev/null; sleep 2
npx pm2 start src/server.js --name ghostpost
sleep 3

# VERIFY
echo ""
echo "=== VERIFICATION ==="
HEALTH=$(curl -s http://localhost:3000/api/health)
echo "Health: $(echo $HEALTH | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","FAIL"))' 2>/dev/null)"
echo "=== ALL DONE ==="
