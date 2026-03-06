require('dotenv').config();
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const healthRouter = require('./routes/health');
const { registerObserverRoutes, startScheduler, setIo: setSchedulerIo } = require('./services/observer/scheduler');
const { setIo: setReplyGeneratorIo } = require('./services/brain/reply-generator');
const { registerVoiceRoutes } = require('./routes/voice');
const { registerPersonaRoutes } = require('./routes/persona');
const { registerOpportunityRoutes } = require('./routes/opportunities');
const { registerDraftRoutes } = require('./routes/drafts');
const { registerAuthRoutes } = require('./routes/auth');
const { registerTrackedProfilesRoutes } = require('./routes/tracked-profiles');
const { registerPostingRoutes } = require('./routes/posting');
const { setIo: setPostingQueueIo } = require('./services/posting/queue');
const { startTracker } = require('./services/posting/tracker');
const { startCron } = require('./services/persona/schedule-cron');
const BrowserSessionManager = require('./services/browser-session/manager');
const setupBrowserSocket = require('./services/browser-session/socket-handler');
const browserSessionRoutes = require('./routes/browser-session');
const cookieImportRoutes = require('./routes/cookie-import');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(express.json());

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io available to all route handlers via req.app.get('io')
app.set('io', io);

// Pass io to the scheduler worker, reply generator, and posting queue
setSchedulerIo(io);
setReplyGeneratorIo(io);
setPostingQueueIo(io);

// Browser session manager (Sprint 11 — embedded browser)
const browserSessionManager = new BrowserSessionManager(io);
app.set('browserSessionManager', browserSessionManager);
setupBrowserSocket(io, browserSessionManager);

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

app.use('/api', healthRouter);

// Observer routes (Sprint 2)
registerObserverRoutes(app);

// Voice onboarding routes (Sprint 4)
registerVoiceRoutes(app);

// Persona routes (Sprint 5)
registerPersonaRoutes(app);

// Opportunity routes (Sprint 6)
registerOpportunityRoutes(app);

// Draft routes (Sprint 7)
registerDraftRoutes(app);

// Auth routes (Sprint 8)
registerAuthRoutes(app);

// Tracked Profiles routes (Sprint 10.5)
registerTrackedProfilesRoutes(app);

// Posting routes (Sprint 9)
registerPostingRoutes(app);

// Browser session routes (Sprint 11)
app.use('/api/browser-session', browserSessionRoutes);

// Cookie import routes (Sprint 12.5)
app.use('/api/cookie-import', cookieImportRoutes);

// Stub routes for future sprints
app.get('/api/analytics', (req, res) => res.json({ message: 'Sprint 10' }));

// Serve React build
const buildPath = path.join(__dirname, '../client/build');
if (fs.existsSync(path.join(buildPath, 'index.html'))) {
  app.use(express.static(buildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
  console.log('[Server] Serving React build from client/build');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`GhostPost server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Socket.io: enabled`);
});

// Start the observation scheduler after server is up
startScheduler().catch(err => console.error('Scheduler failed to start:', err));

// Start the midnight schedule cron
startCron();

// Start the engagement tracker (checks at 1h, 4h, 24h after posting)
startTracker();

// Graceful shutdown — close browser session
process.on('SIGTERM', async () => {
  await browserSessionManager.close();
  process.exit(0);
});
