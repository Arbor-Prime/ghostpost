const http = require('http');

const data = JSON.stringify({ directness: 0.8, formality: 0.3 });

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/voice/profile/1',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      console.log('directness:', parsed.voiceProfile?.directness);
      console.log('formality:', parsed.voiceProfile?.formality);
      console.log('OK:', parsed.ok);
    } catch {
      console.log('Response:', body);
    }
  });
});

req.write(data);
req.end();
