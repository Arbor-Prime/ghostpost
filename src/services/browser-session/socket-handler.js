/**
 * Browser Session Socket Handler — CDP Screencast + Input Relay + AI Chat
 * Self-contained: screencast AND mouse/keyboard through same CDP session
 */

const { processChat } = require('../outreach/ai-chat');

function setupBrowserSocket(io, sessionManager) {
  io.on('connection', (socket) => {
    console.log(`[BrowserSocket] Client connected: ${socket.id}`);

    let cdpSession = null;
    let isStreaming = false;

    async function startScreencast() {
      const page = sessionManager.page;
      if (!page) throw new Error('No browser page active');

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
      console.log('[BrowserSocket] CDP screencast + input relay active');
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

    socket.on('browser:mouse', async (event) => {
      if (!cdpSession) return;
      try {
        switch (event.type) {
          case 'mousemove':
            await cdpSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: event.x, y: event.y });
            break;
          case 'mousedown':
            await cdpSession.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: event.x, y: event.y, button: event.button === 2 ? 'right' : 'left', clickCount: event.clickCount || 1 });
            break;
          case 'mouseup':
            await cdpSession.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: event.x, y: event.y, button: event.button === 2 ? 'right' : 'left', clickCount: event.clickCount || 1 });
            break;
          case 'wheel':
            await cdpSession.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: event.x, y: event.y, deltaX: event.deltaX || 0, deltaY: event.deltaY || 0 });
            break;
        }
      } catch (_) {}
    });

    socket.on('browser:key', async (event) => {
      if (!cdpSession) return;
      try {
        const modifiers = ((event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0));
        if (event.type === 'keydown' || event.type === 'keyup') {
          await cdpSession.send('Input.dispatchKeyEvent', {
            type: event.type === 'keydown' ? 'keyDown' : 'keyUp',
            key: event.key, code: event.code,
            text: event.type === 'keydown' && event.key.length === 1 ? event.key : undefined,
            windowsVirtualKeyCode: event.keyCode, nativeVirtualKeyCode: event.keyCode, modifiers,
          });
          if (event.type === 'keydown' && event.key.length === 1) {
            await cdpSession.send('Input.dispatchKeyEvent', { type: 'char', text: event.key, unmodifiedText: event.key, modifiers });
          }
        }
      } catch (_) {}
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

    // ── Paste relay via CDP ──
    socket.on('browser:paste', async (data) => {
      if (!cdpSession || !data.text) return;
      try {
        await cdpSession.send('Input.insertText', { text: data.text });
      } catch (_) {}
    });

    // ── AI Chat ──
    socket.on('chat:message', async (data) => {
      const { message, userId } = data;
      if (!message || !userId) return;
      try {
        socket.emit('chat:thinking', { active: true });
        const result = await processChat(userId, message);
        socket.emit('chat:response', result);

        // Execute browser action if returned
        if (result.browserAction && sessionManager.page) {
          try {
            if (result.browserAction.type === 'navigate') {
              await sessionManager.page.goto(result.browserAction.url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
              });
            }
          } catch (navErr) {
            socket.emit('chat:response', {
              response: `Browser navigation failed: ${navErr.message}`,
              browserAction: null,
            });
          }
        }
      } catch (err) {
        socket.emit('chat:response', {
          response: `Error: ${err.message}`,
          browserAction: null,
        });
      } finally {
        socket.emit('chat:thinking', { active: false });
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
