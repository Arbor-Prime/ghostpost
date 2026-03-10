/**
 * Local Proxy Forwarder
 * 
 * Chromium can't handle authenticated HTTPS proxies.
 * This runs a local proxy on port 8899 that:
 * - Accepts unauthenticated connections from Chromium
 * - Forwards to IPRoyal with country-gb credentials
 * - Maintains sticky sessions (30min lifetime)
 * 
 * Chromium → localhost:8899 (no auth) → IPRoyal (auth + country-gb) → UK residential IP
 */

const ProxyChain = require('proxy-chain');

const PROXY_USER = process.env.PROXY_USER || 'f3Iq2k8CqJhJkIG1';
const PROXY_PASS = process.env.PROXY_PASS || 'URdXIxSH9hqVvBtL';
const PROXY_HOST = process.env.PROXY_HOST || 'geo.iproyal.com';
const PROXY_PORT = process.env.PROXY_PORT || '12321';
const PROXY_COUNTRY = process.env.PROXY_COUNTRY || 'gb';
const LOCAL_PORT = 8899;

async function startProxy() {
  const sessionTag = `gp-${Date.now()}`;
  const authPass = `${PROXY_PASS}_country-${PROXY_COUNTRY}_session-${sessionTag}_lifetime-30m`;
  const upstreamUrl = `http://${PROXY_USER}:${authPass}@${PROXY_HOST}:${PROXY_PORT}`;

  const server = new ProxyChain.Server({
    port: LOCAL_PORT,
    prepareRequestFunction: () => ({
      upstreamProxyUrl: upstreamUrl,
    }),
  });

  await server.listen();
  console.log(`[ProxyForwarder] Local proxy on :${LOCAL_PORT} → ${PROXY_HOST}:${PROXY_PORT} (country: ${PROXY_COUNTRY.toUpperCase()}, session: ${sessionTag})`);
  return server;
}

module.exports = { startProxy };

if (require.main === module) {
  startProxy().catch(console.error);
}
