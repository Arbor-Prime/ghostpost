const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function test() {
    console.log('Testing Ollama + Mistral 7B...\n');

    const tags = await (await fetch(OLLAMA_URL + '/api/tags')).json();
    const hasMistral = tags.models && tags.models.some(function(m) { return m.name && m.name.includes('mistral'); });
    if (!hasMistral) { console.error('FAIL: Mistral not found'); process.exit(1); }
    console.log('OK: Mistral model found');

    console.log('Sending test prompt...');
    const start = Date.now();
    const res = await fetch(OLLAMA_URL + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'mistral',
            prompt: 'Reply with exactly: GhostPost test OK',
            stream: false,
            options: { temperature: 0.1, num_predict: 30 },
        }),
    });
    const data = await res.json();
    var secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log('Response (' + secs + 's): ' + (data.response || '').trim());
    console.log('\nPASSED: Ollama + Mistral 7B');
}

test().catch(function(e) { console.error('FAILED: ' + e.message); process.exit(1); });
