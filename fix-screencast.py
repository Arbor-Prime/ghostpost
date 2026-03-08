#!/usr/bin/env python3
"""
Fix: Ensure startScreencast exists in BrowserSessionManager.
Run on server: python3 fix-screencast.py
"""
import subprocess, sys

MANAGER = '/opt/ghostpost/src/services/browser-session/manager.js'

with open(MANAGER, 'r') as f:
    code = f.read()

# Check if startScreencast already exists as a method
if 'async startScreencast(socket)' in code:
    print("startScreencast: ALREADY EXISTS")
else:
    print("startScreencast: MISSING — adding it")
    
    # Find the right place to insert (before stopScreencast or before close method)
    insert_before = None
    for marker in ['async stopScreencast()', 'async close()', 'getStatus()']:
        if marker in code:
            insert_before = marker
            break
    
    if not insert_before:
        print("ERROR: Can't find insertion point")
        sys.exit(1)
    
    screencast_code = """
  async startScreencast(socket) {
    if (!this.page) throw new Error('No browser session active');
    if (this.cdpSession) {
      try { await this.cdpSession.detach(); } catch (_) {}
      this.cdpSession = null;
    }
    this.cdpSession = await this.page.context().newCDPSession(this.page);
    this.streamingSocket = socket;
    this.cdpSession.on('Page.screencastFrame', (params) => {
      this.cdpSession.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
      if (this.streamingSocket) {
        this.streamingSocket.emit('browser:frame', { data: params.data });
      }
    });
    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg', quality: 90, maxWidth: 1280, maxHeight: 900, everyNthFrame: 1,
    });
    this.isStreaming = true;
    console.log('[BrowserSession] Screencast started');
  }

  async stopScreencast() {
    if (this.cdpSession && this.isStreaming) {
      try { await this.cdpSession.send('Page.stopScreencast'); } catch (_) {}
      this.isStreaming = false;
      this.streamingSocket = null;
    }
  }

  """
    code = code.replace(insert_before, screencast_code + insert_before)
    with open(MANAGER, 'w') as f:
        f.write(code)
    print("startScreencast: ADDED")

# Also ensure cdpSession property exists in constructor
if 'this.cdpSession' not in code.split('constructor')[0] if 'constructor' in code else '':
    # Add to constructor if missing
    if 'this.cdpSession = null;' not in code:
        code_fresh = open(MANAGER).read()
        if 'this.isStreaming = false;' in code_fresh:
            if 'this.cdpSession = null;' not in code_fresh:
                code_fresh = code_fresh.replace(
                    'this.isStreaming = false;',
                    'this.cdpSession = null;\n    this.isStreaming = false;'
                )
                with open(MANAGER, 'w') as f:
                    f.write(code_fresh)
                print("cdpSession property: ADDED to constructor")
        else:
            print("cdpSession property: constructor pattern not found")

# Verify
with open(MANAGER, 'r') as f:
    final = f.read()
assert 'async startScreencast(socket)' in final, "FAILED: startScreencast not in file"
print("VERIFIED: startScreencast exists")

# Kill chromium and restart PM2
import os
os.system("pkill -f chromium 2>/dev/null")
os.system("cd /opt/ghostpost && npx pm2 kill 2>/dev/null; killall -9 node 2>/dev/null; sleep 2; npx pm2 start src/server.js --name ghostpost")
print("PM2: RESTARTED")

# Verify method is callable
result = os.popen('cd /opt/ghostpost && node -e "const M = require(\'./src/services/browser-session/manager\'); const m = new M(); console.log(typeof m.startScreencast);"').read().strip()
print(f"startScreencast type: {result}")
if result == 'function':
    print("=== ALL GOOD ===")
else:
    print("=== STILL BROKEN ===")
