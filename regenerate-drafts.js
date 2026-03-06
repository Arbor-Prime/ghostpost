/**
 * Regenerate drafts for top opportunities using the API
 */

const http = require('http');

const opportunityIds = [5, 6, 7, 8, 4];

async function generateDraft(opportunityId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ userId: 1, opportunityId });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/drafts/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(body);
          console.log(`✓ Draft generated for opportunity ${opportunityId}: "${result.draft.reply_text.substring(0, 60)}..."`);
          resolve(result);
        } else {
          console.error(`✗ Failed for opportunity ${opportunityId}: ${res.statusCode} ${body}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('[Regenerate] Generating drafts for top 5 opportunities...\n');
  
  for (const oppId of opportunityIds) {
    try {
      await generateDraft(oppId);
      // Wait 2 seconds between requests to avoid overloading Ollama
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`Error for opportunity ${oppId}:`, err.message);
    }
  }
  
  console.log('\n[Done] Draft regeneration complete!');
  console.log('Check https://refhut.com/approvals - you should see drafts with your real voice.');
}

main();
