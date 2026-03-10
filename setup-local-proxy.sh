#!/bin/bash
# Install proxy-chain (lightweight proxy forwarder by Apify)
cd /opt/ghostpost
npm install proxy-chain --save

# Create the local proxy script
cat > src/services/proxy-forwarder.js << 'PROXY'
const ProxyChain = require('proxy-chain');

const PROXY_USER = process.env.PROXY_USER || 'f3Iq2k8CqJhJkIG1';
const PROXY_PASS = process.env.PROXY_PASS || 'URdXIxSH9hqVvBtL';
const PROXY_HOST = process.env.PROXY_HOST || 'geo.iproyal.com';
const PROXY_PORT = process.env.PROXY_PORT || '12321';
const PROXY_COUNTRY = process.env.PROXY_COUNTRY || 'gb';
const LOCAL_PORT = 8899;

async function startProxy() {
  const sessionTag = `gp-${Date.now()}`;
  const upstreamUrl = `http://${PROXY_USER}_country-${PROXY_COUNTRY}_session-${sessionTag}_lifetime-30m:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;

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

// Run standalone if called directly
if (require.main === module) {
  startProxy().catch(console.error);
}
PROXY

echo "✅ proxy-chain installed, forwarder script created"
