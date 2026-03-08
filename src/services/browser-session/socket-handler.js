/**
 * Browser Session Socket Handler — CDP Screencast version
 * Self-contained: imports manager directly to avoid wiring bugs.
 */

function setupBrowserSocket(io, sessionManager) {
  if (!sessionManager || typeof sessionManager.launch !== 'function') {
    console.error('[BrowserSocket] WARNING: sessionManager invalid, methods:', 
      sessionManager ? Object.getOwnPropertyNames(Object.getPrototypeOf(sessionManager)).join(', ') : 'null');
  }

  io.on('connection', (socket) => {
    console.log(`[BrowserSocket] Client connected: ${socket.id}`);
    console.log(`[BrowserSocket] sessionManager type: ${typeof sessionManager}, startScreencast: ${typeof sessionManager?.startScreencast}`);

    if (sessionManager.onClientConnected) sessionManager.onClientConnected();

    socket.on('browser:launch', async () => {
      try {
        console.log('[BrowserSocket] browser:launch from', socket.id);

        if (!sessionManager || typeof sessionManager.startScreencast !== 'function') {
          console.error('[BrowserSocket] startScreencast missing! Methods:', 
            Object.getOwnPropertyNames(Object.getPrototypeOf(sessionManager)).join(', '));
          socket.emit('browser:error', { message: 'Server configuration error — please restart' });
          return;
        }

        if (sessionManager.isActive()) {
          console.log('[BrowserSocket] Reconnecting to existing session');
          await sessionManager.startScreencast(socket);
          socket.emit('browser:launched', { success: true, reused: true });
          socket.emit('browser:streaming', { active: true });
          return;
        }

        const result = await sessionManager.launch(1);
        socket.emit('browser:launched', result);

        await sessionManager.startScreencast(socket);
        socket.emit('browser:streaming', { active: true });
      } catch (err) {
        console.error('[BrowserSocket] Launch error:', err.message);
        socket.emit('browser:error', { message: err.message });
      }
    });

    socket.on('browser:mouse', (event) => {
      if (sessionManager.handleMouseEvent) sessionManager.handleMouseEvent(event);
    });

    socket.on('browser:key', (event) => {
      if (sessionManager.handleKeyEvent) sessionManager.handleKeyEvent(event);
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
        const allowed = ['x.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'google.com', 'google.co.uk'];
        const isAllowed = allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
        if (!isAllowed) {
          socket.emit('browser:error', { message: 'Navigation restricted to social platforms' });
          return;
        }
        await sessionManager.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (err) {
        socket.emit('browser:error', { message: `Navigation failed: ${err.message}` });
      }
    });

    socket.on('browser:close', async () => {
      console.log('[BrowserSocket] Close requested');
      await sessionManager.close();
      socket.emit('browser:closed');
    });

    socket.on('disconnect', async () => {
      console.log('[BrowserSocket] Client disconnected — keeping browser alive');
      if (sessionManager.stopScreencast) await sessionManager.stopScreencast();
      if (sessionManager.onClientDisconnected) sessionManager.onClientDisconnected();
    });
  });
}

module.exports = setupBrowserSocket;
