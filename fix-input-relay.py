#!/usr/bin/env python3
"""
Fix: mouse/keyboard not working in GhostPost Computer.
Socket-handler creates its own CDP session for screencast but manager.cdpSession is null.
Input events dispatch through manager.cdpSession which doesn't exist.
Fix: socket-handler sets manager.cdpSession when it creates one.
"""

HANDLER_PATH = '/opt/ghostpost/src/services/browser-session/socket-handler.js'
handler = open(HANDLER_PATH, 'r').read()

# After the socket-handler creates its CDP session, share it with the manager
old = """      cdpSession = await page.context().newCDPSession(page);

      cdpSession.on('Page.screencastFrame', (params) => {"""

new = """      cdpSession = await page.context().newCDPSession(page);

      // Share CDP session with manager so mouse/keyboard input relay works
      sessionManager.cdpSession = cdpSession;

      cdpSession.on('Page.screencastFrame', (params) => {"""

if old in handler:
    handler = handler.replace(old, new)
    print('✓ CDP session shared with manager for input relay')
else:
    print('⚠ Could not find CDP session creation block')

# Also share on disconnect cleanup
old_stop = """      if (cdpSession && isStreaming) {
        try { await cdpSession.send('Page.stopScreencast'); } catch (_) {}
        try { await cdpSession.detach(); } catch (_) {}
        cdpSession = null;
        isStreaming = false;
        console.log('[BrowserSocket] CDP screencast stopped');
      }"""

new_stop = """      if (cdpSession && isStreaming) {
        try { await cdpSession.send('Page.stopScreencast'); } catch (_) {}
        try { await cdpSession.detach(); } catch (_) {}
        cdpSession = null;
        sessionManager.cdpSession = null;
        isStreaming = false;
        console.log('[BrowserSocket] CDP screencast stopped');
      }"""

if old_stop in handler:
    handler = handler.replace(old_stop, new_stop)
    print('✓ CDP session cleanup synced with manager')
else:
    print('⚠ Could not find stop block')

with open(HANDLER_PATH, 'w') as f:
    f.write(handler)

print('\n✅ Done. Restart PM2.')
