#!/usr/bin/env python3
"""
Fix proxy: use local forwarder on port 8899.
Chromium connects to localhost (no auth needed).
Forwarder handles IPRoyal auth + country-gb.
"""

# 1. Update manager.js to use localhost proxy
MANAGER = '/opt/ghostpost/src/services/browser-session/manager.js'
mgr = open(MANAGER).read()

# Find the proxy block and replace with simple localhost
import re

# Remove any old proxy args from launch
old_proxy_patterns = [
    # Old whitelist proxy in launch args
    r"if \(proxyHost\) \{\s*launchOptions\.args\.push\(`--proxy-server=http://\$\{proxyHost\}:\$\{proxyPort\}`\);[^}]*\}",
    # Old context-level proxy
    r"if \(proxyForContext\) \{\s*contextOptions\.proxy = proxyForContext;\s*\}",
]

for pat in old_proxy_patterns:
    mgr = re.sub(pat, '', mgr, flags=re.DOTALL)

# Find where browser launches and add simple localhost proxy
if '--proxy-server=http://localhost:8899' not in mgr:
    # Add to launch args after the stealth/fingerprint args
    old = "launchOptions.args.push('--disable-blink-features=AutomationControlled');"
    new = """launchOptions.args.push('--disable-blink-features=AutomationControlled');

      // Proxy: connect to local forwarder (handles IPRoyal auth + country-gb)
      if (process.env.PROXY_HOST) {
        launchOptions.args.push('--proxy-server=http://localhost:8899');
        console.log('[BrowserSession] Proxy: localhost:8899 → IPRoyal (UK residential)');
      }"""
    if old in mgr:
        mgr = mgr.replace(old, new)
        print('✓ Browser proxy set to localhost:8899')
    else:
        print('⚠ Could not find launch args insertion point')
else:
    print('✓ Proxy already set to localhost:8899')

# Clean up any leftover proxy variable declarations that are now unused
# Remove old proxy config blocks that reference proxyForContext, proxyUser, proxyPass
old_blocks = [
    # The authenticated proxy block we added earlier
    r"\s*const proxyUser = .*?\n",
    r"\s*const proxyPass = .*?\n",
    r"\s*let proxyForContext = null;.*?\n",
    r"\s*if \(proxyHost\) \{\s*const sessionTag.*?console\.log.*?\}\n",
]

open(MANAGER, 'w').write(mgr)

# 2. Add proxy forwarder startup to server.js
SERVER = '/opt/ghostpost/src/server.js'
srv = open(SERVER).read()

if 'proxy-forwarder' not in srv:
    # Add after requires section
    old_line = "const app = express();"
    new_line = """// Start local proxy forwarder for UK residential IPs
if (process.env.PROXY_HOST) {
  const { startProxy } = require('./services/proxy-forwarder');
  startProxy().catch(err => console.error('[ProxyForwarder] Failed to start:', err.message));
}

const app = express();"""
    if old_line in srv:
        srv = srv.replace(old_line, new_line, 1)
        open(SERVER, 'w').write(srv)
        print('✓ Proxy forwarder added to server.js startup')
    else:
        print('⚠ Could not find server.js insertion point')
else:
    print('✓ Proxy forwarder already in server.js')

print('\n✅ Done. Run: npm install proxy-chain --save && pm2 restart ghostpost')
