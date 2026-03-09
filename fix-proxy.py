#!/usr/bin/env python3
"""
Sprint 23 Phase 1: Wire UK proxy into GhostPost Computer browser sessions.

Fixes:
1. Adds IPRoyal UK proxy config to .env
2. Patches manager.js to use Playwright's authenticated proxy (not Chrome args)
3. Sets UK timezone and locale instead of US defaults
4. Adds proxy env var loading
"""
import re, os

BASE = '/opt/ghostpost'
ENV_PATH = os.path.join(BASE, '.env')
MANAGER_PATH = os.path.join(BASE, 'src/services/browser-session/manager.js')

# ── Step 1: Add proxy config to .env ──
print('[1/3] Adding proxy config to .env...')
env_content = open(ENV_PATH, 'r').read()

proxy_vars = """
# UK Residential Proxy (IPRoyal)
PROXY_HOST=geo.iproyal.com
PROXY_PORT=12321
PROXY_USER=f3Iq2k8CqJhJkIG1
PROXY_PASS=URdXIxSH9hqVvBtL
PROXY_COUNTRY=gb
"""

if 'PROXY_HOST' not in env_content:
    with open(ENV_PATH, 'a') as f:
        f.write(proxy_vars)
    print('  ✓ Proxy vars added to .env')
else:
    print('  ⊘ Proxy vars already in .env')

# ── Step 2: Patch manager.js — fix proxy config ──
print('[2/3] Patching manager.js proxy config...')
mgr = open(MANAGER_PATH, 'r').read()

# Replace the Chrome args proxy approach with Playwright's proper proxy config
# Find the launchOptions block and the proxy push
old_proxy = """      if (row?.proxy_host) {
        launchOptions.args.push(`--proxy-server=http://${row.proxy_host}:${row.proxy_port}`);
      }"""

new_proxy = """      // Proxy: use user-specific or fallback to env vars
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

if old_proxy in mgr:
    mgr = mgr.replace(old_proxy, new_proxy)
    print('  ✓ Proxy config replaced with Playwright authenticated proxy')
elif 'launchOptions.proxy' in mgr:
    print('  ⊘ Proxy already patched')
else:
    print('  ⚠ Could not find proxy block to patch — manual check needed')

# ── Step 3: Fix timezone and locale to UK ──
print('[3/3] Fixing timezone and locale to UK...')

old_locale = """        locale: fingerprint.locale || 'en-US',
        timezoneId: fingerprint.timezone || 'America/New_York',"""

new_locale = """        locale: fingerprint.locale || 'en-GB',
        timezoneId: fingerprint.timezone || 'Europe/London',
        geolocation: { longitude: -1.1581, latitude: 52.9548 },  // Nottingham"""

if old_locale in mgr:
    mgr = mgr.replace(old_locale, new_locale)
    print('  ✓ Timezone set to Europe/London, locale to en-GB, geolocation to Nottingham')
elif 'Europe/London' in mgr:
    print('  ⊘ Timezone already set to UK')
else:
    print('  ⚠ Could not find locale block to patch — manual check needed')

# Write patched manager.js
with open(MANAGER_PATH, 'w') as f:
    f.write(mgr)

print('\n✅ All patches applied. Restart PM2 to activate.')
print('Run: cd /opt/ghostpost && npx pm2 restart ghostpost')
