#!/usr/bin/env python3
"""
Fix proxy: remove auth credentials, rely on IP whitelist.
Server IP 78.111.89.140 is whitelisted on IPRoyal.
"""

MANAGER_PATH = '/opt/ghostpost/src/services/browser-session/manager.js'
mgr = open(MANAGER_PATH, 'r').read()

# Remove httpCredentials from context
mgr = mgr.replace("""      // Proxy auth on context level (playwright-extra stealth doesn't pass auth via launch)
      if (proxyConfig) {
        contextOptions.httpCredentials = {
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      this.context = await this.browser.newContext(contextOptions);""",
      """      this.context = await this.browser.newContext(contextOptions);""")

# Simplify proxy setup — no auth needed, just server address
mgr = mgr.replace("""      // Proxy: use user-specific or fallback to env vars
      const proxyHost = row?.proxy_host || process.env.PROXY_HOST;
      const proxyPort = row?.proxy_port || process.env.PROXY_PORT;
      const proxyUser = row?.proxy_user || process.env.PROXY_USER;
      const proxyPass = row?.proxy_pass_encrypted ? decrypt(row.proxy_pass_encrypted) : process.env.PROXY_PASS;
      const proxyCountry = process.env.PROXY_COUNTRY || 'gb';

      let proxyConfig = null;
      if (proxyHost) {
        const sessionTag = `session-gp${userId}-${Date.now()}`;
        // Proxy server goes on launch, auth goes on context
        launchOptions.args.push(`--proxy-server=http://${proxyHost}:${proxyPort}`);
        proxyConfig = {
          username: `${proxyUser}_country-${proxyCountry}_session-${sessionTag}`,
          password: proxyPass,
        };
        console.log(`[BrowserSession] Proxy: ${proxyHost}:${proxyPort} (${proxyCountry.toUpperCase()}, sticky: ${sessionTag})`);
      }""",
      """      // Proxy: IP whitelisted on IPRoyal, no auth needed
      const proxyHost = row?.proxy_host || process.env.PROXY_HOST;
      const proxyPort = row?.proxy_port || process.env.PROXY_PORT;
      const proxyCountry = process.env.PROXY_COUNTRY || 'gb';

      if (proxyHost) {
        launchOptions.args.push(`--proxy-server=http://${proxyHost}:${proxyPort}`);
        console.log(`[BrowserSession] Proxy: ${proxyHost}:${proxyPort} (${proxyCountry.toUpperCase()}, IP whitelisted)`);
      }""")

with open(MANAGER_PATH, 'w') as f:
    f.write(mgr)

print('✓ Proxy auth removed — using IP whitelist')
print('✅ Done. Restart PM2.')
