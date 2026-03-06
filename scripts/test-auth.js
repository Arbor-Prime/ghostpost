require('dotenv').config({ path: '/opt/ghostpost/.env' });
const http = require('http');

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== Test 1: Health check ===');
  const health = await makeRequest('GET', '/api/health');
  console.log('Status:', health.status);
  console.log('Services:', JSON.stringify(health.body.services, null, 2));

  console.log('\n=== Test 2: Auth status (before connecting) ===');
  const statusBefore = await makeRequest('GET', '/api/auth/status/1');
  console.log('Status:', statusBefore.status);
  console.log(JSON.stringify(statusBefore.body, null, 2));

  console.log('\n=== Test 3: Cookie import - missing cookies ===');
  const badImport = await makeRequest('POST', '/api/auth/cookies/1', { platform: 'x' });
  console.log('Status:', badImport.status);
  console.log(JSON.stringify(badImport.body, null, 2));

  console.log('\n=== Test 4: Cookie import - no auth cookie ===');
  const noAuth = await makeRequest('POST', '/api/auth/cookies/1', {
    platform: 'x',
    username: 'testuser',
    cookies: [
      { name: 'guest_id', value: 'test123', domain: '.x.com', path: '/' },
    ]
  });
  console.log('Status:', noAuth.status);
  console.log(JSON.stringify(noAuth.body, null, 2));

  console.log('\n=== Test 5: Cookie import - valid (simulated) ===');
  const validImport = await makeRequest('POST', '/api/auth/cookies/1', {
    platform: 'x',
    username: 'ghostpost_test',
    cookies: [
      { name: 'auth_token', value: 'fake_auth_token_for_testing_only', domain: '.x.com', path: '/', secure: true, httpOnly: true },
      { name: 'ct0', value: 'fake_ct0_csrf_token_for_testing', domain: '.x.com', path: '/', secure: true },
      { name: 'guest_id', value: 'v1:170000000000000000', domain: '.x.com', path: '/' },
      { name: 'kdt', value: 'fake_kdt_token', domain: '.x.com', path: '/', secure: true, httpOnly: true },
    ]
  });
  console.log('Status:', validImport.status);
  console.log(JSON.stringify(validImport.body, null, 2));

  console.log('\n=== Test 6: Auth status (after connecting) ===');
  const statusAfter = await makeRequest('GET', '/api/auth/status/1');
  console.log('Status:', statusAfter.status);
  console.log(JSON.stringify(statusAfter.body, null, 2));

  console.log('\n=== Test 7: Verify cookies are encrypted in DB ===');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dbResult = await pool.query('SELECT user_id, platform, is_valid, last_used_at, LEFT(cookies_encrypted, 80) as encrypted_preview FROM browser_sessions WHERE user_id = 1');
  if (dbResult.rows.length > 0) {
    const row = dbResult.rows[0];
    console.log('DB row found:');
    console.log('  user_id:', row.user_id);
    console.log('  platform:', row.platform);
    console.log('  is_valid:', row.is_valid);
    console.log('  encrypted_preview:', row.encrypted_preview + '...');
    console.log('  NOT plaintext:', !row.encrypted_preview.includes('auth_token') ? 'PASS' : 'FAIL');
  } else {
    console.log('FAIL - No browser_sessions row found');
  }

  console.log('\n=== Test 8: Disconnect ===');
  const disconnect = await makeRequest('POST', '/api/auth/disconnect/1', { platform: 'x' });
  console.log('Status:', disconnect.status);
  console.log(JSON.stringify(disconnect.body, null, 2));

  console.log('\n=== Test 9: Auth status (after disconnect) ===');
  const statusDisconnected = await makeRequest('GET', '/api/auth/status/1');
  console.log('Status:', statusDisconnected.status);
  console.log(JSON.stringify(statusDisconnected.body, null, 2));

  console.log('\n=== Test 10: Re-import cookies for future sprints ===');
  const reimport = await makeRequest('POST', '/api/auth/cookies/1', {
    platform: 'x',
    username: 'ghostpost_test',
    cookies: [
      { name: 'auth_token', value: 'fake_auth_token_reissued', domain: '.x.com', path: '/', secure: true, httpOnly: true },
      { name: 'ct0', value: 'fake_ct0_reissued', domain: '.x.com', path: '/', secure: true },
      { name: 'guest_id', value: 'v1:170000000000000000', domain: '.x.com', path: '/' },
    ]
  });
  console.log('Status:', reimport.status);
  console.log(JSON.stringify(reimport.body, null, 2));

  const statusReconnected = await makeRequest('GET', '/api/auth/status/1');
  console.log('Reconnected:', JSON.stringify(statusReconnected.body, null, 2));

  await pool.end();
  console.log('\n=== ALL TESTS COMPLETE ===');
}

run().catch(console.error);
