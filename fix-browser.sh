#!/bin/bash
set -e
cd /opt/ghostpost

# Pull latest from GitHub
echo "=== Pulling latest code ==="
git fetch origin sprint-20-frontend-merge
git checkout origin/sprint-20-frontend-merge -- src/services/browser-session/manager.js src/services/browser-session/socket-handler.js

# Verify
echo "=== Verify startScreencast exists ==="
grep -c "startScreencast" src/services/browser-session/manager.js && echo "manager.js: OK" || echo "manager.js: MISSING"
grep -c "startScreencast" src/services/browser-session/socket-handler.js && echo "socket-handler.js: OK" || echo "socket-handler.js: MISSING"

# Kill orphaned chromium
pkill -f chromium 2>/dev/null; echo "Chromium: cleaned"

# Fresh restart
npx pm2 kill 2>/dev/null
killall -9 node 2>/dev/null; sleep 2
npx pm2 start src/server.js --name ghostpost
sleep 3

# Test
node -e "const M = require('./src/services/browser-session/manager'); const m = new M(); console.log('startScreencast:', typeof m.startScreencast);"
curl -s http://localhost:3000/api/health | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log('Health:', JSON.parse(d).status);"

echo "=== DONE ==="
