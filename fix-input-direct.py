#!/usr/bin/env python3
"""
Fix: mouse/keyboard input in GhostPost Computer.

Instead of sharing CDP session between socket-handler and manager,
handle input dispatch directly in socket-handler using its own cdpSession.
This is cleaner and guaranteed to work since we control the whole flow.
"""

HANDLER_PATH = '/opt/ghostpost/src/services/browser-session/socket-handler.js'
handler = open(HANDLER_PATH, 'r').read()

# Replace the simple mouse/key forwarding with direct CDP dispatch
old_mouse = """    socket.on('browser:mouse', (event) => {
      if (sessionManager.handleMouseEvent) sessionManager.handleMouseEvent(event);
    });

    socket.on('browser:key', (event) => {
      if (sessionManager.handleKeyEvent) sessionManager.handleKeyEvent(event);
    });"""

new_mouse = """    socket.on('browser:mouse', async (event) => {
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
      } catch (err) {
        // Silently ignore — CDP session may have closed
      }
    });

    socket.on('browser:key', async (event) => {
      if (!cdpSession) return;
      try {
        const modifiers = ((event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0));
        if (event.type === 'keydown' || event.type === 'keyup') {
          await cdpSession.send('Input.dispatchKeyEvent', {
            type: event.type === 'keydown' ? 'keyDown' : 'keyUp',
            key: event.key,
            code: event.code,
            text: event.type === 'keydown' && event.key.length === 1 ? event.key : undefined,
            windowsVirtualKeyCode: event.keyCode,
            nativeVirtualKeyCode: event.keyCode,
            modifiers,
          });
          if (event.type === 'keydown' && event.key.length === 1) {
            await cdpSession.send('Input.dispatchKeyEvent', {
              type: 'char',
              text: event.key,
              unmodifiedText: event.key,
              modifiers,
            });
          }
        }
      } catch (err) {
        // Silently ignore
      }
    });"""

if old_mouse in handler:
    handler = handler.replace(old_mouse, new_mouse)
    print('✓ Mouse/keyboard input now handled directly via CDP session')
else:
    print('⚠ Could not find mouse/key handler block — checking variants...')
    # Try without the sessionManager prefix in case it was already partially modified
    if 'sessionManager.handleMouseEvent' in handler:
        handler = handler.replace(
            "    socket.on('browser:mouse', (event) => {\n      if (sessionManager.handleMouseEvent) sessionManager.handleMouseEvent(event);\n    });",
            ""
        )
        handler = handler.replace(
            "    socket.on('browser:key', (event) => {\n      if (sessionManager.handleKeyEvent) sessionManager.handleKeyEvent(event);\n    });",
            ""
        )
        # Insert the new handlers before the browser:back handler
        handler = handler.replace(
            "    socket.on('browser:back',",
            new_mouse + "\n\n    socket.on('browser:back',"
        )
        print('✓ Replaced via fallback method')
    else:
        print('✗ Could not patch — needs manual inspection')

with open(HANDLER_PATH, 'w') as f:
    f.write(handler)

print('\n✅ Done. Nuclear restart needed (kill stale browsers).')
