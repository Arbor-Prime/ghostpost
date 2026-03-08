/**
 * Browser Session Socket Handler
 * Wires Socket.io events between the frontend and BrowserSessionManager.
 */

function setupBrowserSocket(io, sessionManager) {
  io.on('connection', (socket) => {

    if (sessionManager.onClientConnected) sessionManager.onClientConnected();

    socket.on('browser:launch', async () => {
      try {
        if (sessionManager.isActive()) {
          console.log('[BrowserSocket] Reconnecting to existing session');
          if (sessionManager.startScreencast) {
            await sessionManager.startScreencast(socket);
          }
          socket.emit('browser:launched', { success: true, reused: true });
          socket.emit('browser:streaming', { active: true });
          return;
        }

        console.log('[BrowserSocket] Launching new browser');
        const result = await sessionManager.launch(1);
        socket.emit('browser:launched', result);

        // Start CDP screencast — this sends frames to the client
        if (sessionManager.startScreencast) {
          await sessionManager.startScreencast(socket);
          socket.emit('browser:streaming', { active: true });
          console.log('[BrowserSocket] Screencast started');
        } else {
          socket.emit('browser:error', { message: 'Screencast not available' });
        }
      } catch (err) {
        console.error('[BrowserSocket] Launch error:', err.message);
        socket.emit('browser:error', { message: err.message });
      }
    });

    socket.on('browser:navigate', async (url) => {
      if (!sessionManager.page) return;
      try {
        const parsed = new URL(url);
        const allowed = ['x.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'google.com', 'google.co.uk'];
        const isAllowed = allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
        if (!isAllowed) {
          socket.emit('browser:error', { message: 'Navigation restricted to social platforms and Google' });
          return;
        }
        await sessionManager.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (err) {
        socket.emit('browser:error', { message: `Navigation failed: ${err.message}` });
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

    socket.on('browser:status', () => {
      socket.emit('browser:status', sessionManager.getStatus());
    });

    socket.on('browser:close', async () => {
      console.log('[BrowserSocket] User requested close');
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
