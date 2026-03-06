const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = 'mistral';

async function generate(prompt, options = {}) {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: options.model || DEFAULT_MODEL,
            prompt,
            stream: false,
            options: {
                temperature: options.temperature || 0.7,
                num_predict: options.maxTokens || 500,
            },
        }),
    });
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    return data.response;
}

async function listModels() {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    return data.models || [];
}

module.exports = { generate, listModels, OLLAMA_URL, DEFAULT_MODEL };
