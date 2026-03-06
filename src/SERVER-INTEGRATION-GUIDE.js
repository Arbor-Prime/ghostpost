/**
 * Sprint 16 Server Integration
 * 
 * Add this to the EXISTING /opt/ghostpost/src/server.js
 * Don't replace server.js — ADD these lines in the right places.
 * 
 * This file is a GUIDE, not a standalone runnable file.
 */

// ============================================================
// 1. ADD THESE IMPORTS at the top of server.js
// ============================================================

const { WebSocketServer } = require('ws');
const PlatformBrowserManager = require('./services/browser-gui/platform-browser-manager');
const setupBrowserWebSocket = require('./services/browser-gui/browser-stream-ws');
const outreachRoutes = require('./routes/outreach');
const CampaignScheduler = require('./services/platforms/campaign-scheduler');


// ============================================================
// 2. AFTER your existing db/redis setup, ADD:
// ============================================================

// Multi-platform browser manager (Manus-style visible browsers)
const browserManager = new PlatformBrowserManager(db, redis);

// Campaign scheduler (orchestrates outreach across platforms)
const campaignScheduler = new CampaignScheduler(db, redis);


// ============================================================
// 3. AFTER your existing app.use() routes, ADD:
// ============================================================

// Outreach API routes
app.use('/api/outreach', outreachRoutes(db, redis, browserManager));


// ============================================================
// 4. AFTER your existing server.listen(), ADD WebSocket:
// ============================================================

// WebSocket server for live browser streaming (shares the HTTP server)
const wss = new WebSocketServer({ 
    server: httpServer, // Use the same HTTP server Express is on
    path: '/ws/browser'  // Only handle /ws/browser/* paths
});

setupBrowserWebSocket(wss, browserManager);
console.log('[Server] Browser WebSocket stream ready at /ws/browser/:accountId');


// ============================================================
// 5. START the campaign scheduler
// ============================================================

campaignScheduler.start();
console.log('[Server] Campaign scheduler started');


// ============================================================
// 6. GRACEFUL SHUTDOWN — add to your existing shutdown handler
// ============================================================

process.on('SIGTERM', async () => {
    console.log('[Server] Shutting down...');
    await campaignScheduler.stop();
    await browserManager.closeAll();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Server] Shutting down...');
    await campaignScheduler.stop();
    await browserManager.closeAll();
    process.exit(0);
});


// ============================================================
// 7. RUN THE MIGRATION
// ============================================================

// Execute this SQL against the existing PostgreSQL database:
// psql -U ghostpost -d ghostpost -f src/db/migrations/012-multi-platform.sql


// ============================================================
// 8. INSTALL NEW DEPENDENCIES
// ============================================================

// npm install ws
// (playwright-extra and puppeteer-extra-plugin-stealth should already be installed from Sprint 2)
// (bullmq should already be installed from Sprint 2)


// ============================================================
// 9. INSTALL SYSTEM DEPENDENCIES FOR HEADED BROWSERS
// ============================================================

// sudo apt-get install -y xvfb
// This enables running headed Chromium on a headless server
// Each browser session gets its own Xvfb display (:10, :11, :12, etc.)


// ============================================================
// 10. VERIFY
// ============================================================

// Test account creation:
// curl -X POST http://localhost:3000/api/outreach/accounts \
//   -H "Content-Type: application/json" \
//   -d '{"platform": "instagram", "username": "your_ig_handle"}'

// Test browser launch:
// curl -X POST http://localhost:3000/api/outreach/browser/launch/1

// Test browser stream (from browser console):
// const ws = new WebSocket('ws://localhost:3000/ws/browser/1');
// ws.onmessage = (e) => { /* e.data is JPEG buffer */ };

// Test campaign creation:
// curl -X POST http://localhost:3000/api/outreach/campaigns \
//   -H "Content-Type: application/json" \
//   -d '{
//     "name": "Dojo Cards - Restaurants Nottingham",
//     "platform": "instagram",
//     "accountId": 1,
//     "targetVerticals": ["Restaurants", "Cafes"],
//     "targetLocations": ["Nottingham"],
//     "searchQueries": ["restaurant nottingham", "cafe nottingham"],
//     "messageTemplates": [
//       "Hey {name}! Love what you\u0027re doing with your restaurant. Quick question — are you happy with what you\u0027re paying in card processing fees? We\u0027ve been helping places like yours save 30-40%. Happy to share how if you\u0027re interested!",
//       "Hi {name}, spotted your place and it looks class. We work with restaurants to cut their card processing costs — most save £200-400/month. Worth a chat?"
//     ],
//     "dailyLimit": 20,
//     "hourlyLimit": 5
//   }'
