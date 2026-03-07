/**
 * Browser Session Socket Handler
 *
 * Wires Socket.io events between the frontend canvas and
 * the BrowserSessionManager.
 *
 * Key behaviors:
 * - browser:launch  → launches new browser OR reconnects to existing one
 * - browser:close   → explicitly kills the browser session
 * - disconnect      → stops screencast but keeps browser alive
 * - 10-min timeout  → auto-kills abandoned sessions (in manager)
 */

function setupBrowserSocket(io, sessionManager) {
  io.on('connection', (socket) => {

    sessionManager.onClientConnected();

    socket.on('browser:launch', async (options = {}) => {
      try {
        const platform = options.platform || 'x';

        if (sessionManager.isActive()) {
          console.log('[BrowserSocket] Reconnecting to existing browser session');
          await sessionManager.startScreencast(socket);
          socket.emit('browser:launched', { success: true, reused: true, reconnected: true, platform: sessionManager.platform });
          socket.emit('browser:streaming', { active: true });
          return;
        }

        const result = await sessionManager.launch(1, platform);
        socket.emit('browser:launched', result);

        await sessionManager.startScreencast(socket);
        socket.emit('browser:streaming', { active: true });
      } catch (err) {
        socket.emit('browser:error', { message: err.message });
      }
    });

    socket.on('browser:mouse', (event) => {
      sessionManager.handleMouseEvent(event);
    });

    socket.on('browser:key', (event) => {
      sessionManager.handleKeyEvent(event);
    });

    socket.on('browser:back', async () => {
      if (!sessionManager.page) return;
      try { await sessionManager.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
    });

    socket.on('browser:forward', async () => {
      if (!sessionManager.page) return;
      try { await sessionManager.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
    });

    socket.on('browser:reload', async () => {
      if (!sessionManager.page) return;
      try { await sessionManager.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (_) {}
    });

    socket.on('browser:navigate', async (url) => {
      if (!sessionManager.page) return;
      try {
        const parsed = new URL(url);
        const ALLOWED_DOMAINS = ['x.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'accounts.google.com', 'facebook.com'];
        const allowed = ALLOWED_DOMAINS.some(d => parsed.hostname.endsWith(d));
        if (!allowed) {
          socket.emit('browser:error', { message: `Navigation restricted. Allowed: ${ALLOWED_DOMAINS.join(', ')}` });
          return;
        }
        await sessionManager.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (err) {
        socket.emit('browser:error', { message: `Navigation failed: ${err.message}` });
      }
    });

    socket.on('browser:status', () => {
      socket.emit('browser:status', sessionManager.getStatus());
    });

    socket.on('browser:close', async () => {
      console.log('[BrowserSocket] User requested browser close');
      await sessionManager.close();
      socket.emit('browser:closed');
    });

    socket.on('disconnect', async () => {
      console.log('[BrowserSocket] Client disconnected — keeping browser alive');
      await sessionManager.stopScreencast();
      sessionManager.onClientDisconnected();
    });
  });
}

module.exports = setupBrowserSocket;
