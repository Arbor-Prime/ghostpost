#!/bin/bash
set -e
cd /opt/ghostpost

# Force-pull the correct files from GitHub
git fetch origin sprint-20-frontend-merge 2>/dev/null || true
git checkout origin/sprint-20-frontend-merge -- src/services/browser-session/manager.js 2>/dev/null || true
git checkout origin/sprint-20-frontend-merge -- src/services/browser-session/socket-handler.js 2>/dev/null || true
git checkout origin/sprint-20-frontend-merge -- src/server.js 2>/dev/null || true

# Kill EVERYTHING
npx pm2 kill 2>/dev/null || true
pkill -f chromium 2>/dev/null || true
pkill -f node 2>/dev/null || true
sleep 3

# Start fresh
npx pm2 start src/server.js --name ghostpost
sleep 4

# Verify
HEALTH=$(curl -s http://localhost:3000/api/health)
echo "Health: $HEALTH"

SCREENCAST=$(node -e "const M = require('./src/services/browser-session/manager'); const m = new M(); console.log(typeof m.startScreencast);")
echo "startScreencast: $SCREENCAST"

echo "DONE"
