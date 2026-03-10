#!/usr/bin/env python3
"""
Fix proxy: use authenticated mode at context level.
Country-gb only works with authenticated credentials.
Whitelist mode gives random country IPs.
"""

MANAGER_PATH = '/opt/ghostpost/src/services/browser-session/manager.js'
mgr = open(MANAGER_PATH, 'r').read()

# Replace the current proxy block
old = """      // Proxy: IP whitelisted on IPRoyal, no auth needed
      const proxyHost = row?.proxy_host || process.env.PROXY_HOST;
      const proxyPort = row?.proxy_port || process.env.PROXY_PORT;
      const proxyCountry = process.env.PROXY_COUNTRY || 'gb';

      if (proxyHost) {
        launchOptions.args.push(`--proxy-server=http://${proxyHost}:${proxyPort}`);
        console.log(`[BrowserSession] Proxy: ${proxyHost}:${proxyPort} (${proxyCountry.toUpperCase()}, IP whitelisted)`);
      }"""

new = """      // Proxy: authenticated mode with country-gb
      const proxyHost = row?.proxy_host || process.env.PROXY_HOST;
      const proxyPort = row?.proxy_port || process.env.PROXY_PORT;
      const proxyUser = row?.proxy_user || process.env.PROXY_USER;
      const proxyPass = row?.proxy_pass_encrypted ? decrypt(row.proxy_pass_encrypted) : process.env.PROXY_PASS;
      const proxyCountry = process.env.PROXY_COUNTRY || 'gb';

      let proxyForContext = null;
      if (proxyHost) {
        const sessionTag = `gp${userId}-${Date.now()}`;
        proxyForContext = {
          server: `http://${proxyHost}:${proxyPort}`,
          username: `${proxyUser}_country-${proxyCountry}_session-${sessionTag}_lifetime-30m`,
          password: proxyPass,
        };
        console.log(`[BrowserSession] Proxy: ${proxyHost}:${proxyPort} (${proxyCountry.toUpperCase()}, session: ${sessionTag})`);
      }"""

if old in mgr:
    mgr = mgr.replace(old, new)
    print('✓ Proxy config updated to authenticated mode')
else:
    print('⚠ Could not find proxy block')

# Now set proxy on context, not on browser launch
old_ctx = """      this.context = await this.browser.newContext(contextOptions);"""

new_ctx = """      // Proxy auth goes on context level — Playwright handles CONNECT tunnel auth
      if (proxyForContext) {
        contextOptions.proxy = proxyForContext;
      }

      this.context = await this.browser.newContext(contextOptions);"""

if old_ctx in mgr:
    mgr = mgr.replace(old_ctx, new_ctx, 1)  # Only replace first occurrence
    print('✓ Proxy auth added to context level')
else:
    print('⚠ Could not find context creation')

with open(MANAGER_PATH, 'w') as f:
    f.write(mgr)

print('\n✅ Done. Nuclear restart needed.')
