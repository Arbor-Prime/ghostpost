/**
 * Browser Session Socket Handler — CDP Screencast
 * Self-contained: does NOT depend on manager.startScreencast
 */

function setupBrowserSocket(io, sessionManager) {
  io.on('connection', (socket) => {
    console.log(`[BrowserSocket] Client connected: ${socket.id}`);

    let cdpSession = null;
    let isStreaming = false;

    async function startScreencast() {
      const page = sessionManager.page;
      if (!page) throw new Error('No browser page active');

      // Stop any existing screencast
      if (cdpSession) {
        try { await cdpSession.send('Page.stopScreencast'); } catch (_) {}
        try { await cdpSession.detach(); } catch (_) {}
        cdpSession = null;
      }

      cdpSession = await page.context().newCDPSession(page);

      cdpSession.on('Page.screencastFrame', (params) => {
        cdpSession.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
        socket.emit('browser:frame', { data: params.data });
      });

      await cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 80,
        maxWidth: 1280,
        maxHeight: 900,
        everyNthFrame: 1,
      });

      isStreaming = true;
      console.log('[BrowserSocket] CDP screencast started');
    }

    async function stopScreencast() {
      if (cdpSession && isStreaming) {
        try { await cdpSession.send('Page.stopScreencast'); } catch (_) {}
        try { await cdpSession.detach(); } catch (_) {}
        cdpSession = null;
        isStreaming = false;
        console.log('[BrowserSocket] CDP screencast stopped');
      }
    }

    socket.on('browser:launch', async () => {
      try {
        if (sessionManager.isActive()) {
          console.log('[BrowserSocket] Reconnecting to existing session');
          socket.emit('browser:launched', { success: true, reused: true });
          await startScreencast();
          socket.emit('browser:streaming', { active: true });
          return;
        }

        const result = await sessionManager.launch(1);
        socket.emit('browser:launched', result);

        await startScreencast();
        socket.emit('browser:streaming', { active: true });
      } catch (err) {
        console.error('[BrowserSocket] Error:', err.message);
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
      console.log('[BrowserSocket] User requested browser close');
      await stopScreencast();
      await sessionManager.close();
      socket.emit('browser:closed');
    });

    socket.on('disconnect', async () => {
      console.log('[BrowserSocket] Client disconnected');
      await stopScreencast();
    });
  });
}

module.exports = setupBrowserSocket;
