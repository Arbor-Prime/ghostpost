#!/usr/bin/env python3
"""
Fix proxy auth — move from browser.launch() to browser.newContext()
playwright-extra doesn't pass proxy auth through launch correctly.
"""
import os

MANAGER_PATH = '/opt/ghostpost/src/services/browser-session/manager.js'

mgr = open(MANAGER_PATH, 'r').read()

# Remove proxy from launchOptions — it should be on context
old_proxy = """      // Proxy: use user-specific or fallback to env vars
      const proxyHost = row?.proxy_host || process.env.PROXY_HOST;
      const proxyPort = row?.proxy_port || process.env.PROXY_PORT;
      const proxyUser = row?.proxy_user || process.env.PROXY_USER;
      const proxyPass = row?.proxy_pass_encrypted ? decrypt(row.proxy_pass_encrypted) : process.env.PROXY_PASS;
      const proxyCountry = process.env.PROXY_COUNTRY || 'gb';

      if (proxyHost) {
        const sessionTag = `session-gp${userId}-${Date.now()}`;
        launchOptions.proxy = {
          server: `http://${proxyHost}:${proxyPort}`,
          username: `${proxyUser}_country-${proxyCountry}_session-${sessionTag}`,
          password: proxyPass,
        };
        console.log(`[BrowserSession] Proxy: ${proxyHost}:${proxyPort} (${proxyCountry.toUpperCase()}, sticky: ${sessionTag})`);
      }"""

new_proxy = """      // Proxy: use user-specific or fallback to env vars
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
      }"""

if old_proxy in mgr:
    mgr = mgr.replace(old_proxy, new_proxy)
    print('✓ Proxy moved from launch to args + context split')
else:
    print('⚠ Could not find proxy block — checking if already fixed')

# Now add proxy auth to the context creation
old_context = """      this.context = await this.browser.newContext({
        viewport: { width: SCREENCAST_WIDTH, height: SCREENCAST_HEIGHT },
        userAgent: fingerprint.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: fingerprint.locale || 'en-GB',
        timezoneId: fingerprint.timezone || 'Europe/London',
        geolocation: { longitude: -1.1581, latitude: 52.9548 },  // Nottingham
      });"""

new_context = """      const contextOptions = {
        viewport: { width: SCREENCAST_WIDTH, height: SCREENCAST_HEIGHT },
        userAgent: fingerprint.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: fingerprint.locale || 'en-GB',
        timezoneId: fingerprint.timezone || 'Europe/London',
        geolocation: { longitude: -1.1581, latitude: 52.9548 },  // Nottingham
        permissions: ['geolocation'],
      };

      // Proxy auth on context level (playwright-extra stealth doesn't pass auth via launch)
      if (proxyConfig) {
        contextOptions.httpCredentials = {
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      this.context = await this.browser.newContext(contextOptions);"""

if old_context in mgr:
    mgr = mgr.replace(old_context, new_context)
    print('✓ Proxy auth added to context via httpCredentials')
else:
    print('⚠ Could not find context block')

with open(MANAGER_PATH, 'w') as f:
    f.write(mgr)

print('\n✅ Done. Restart PM2.')
