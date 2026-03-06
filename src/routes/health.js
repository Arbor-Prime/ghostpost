const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const redis = require('../config/redis');
const { listModels } = require('../config/ollama');

router.get('/health', async (req, res) => {
    const results = {
        status: 'ok',
        services: {
            database: 'error',
            redis: 'error',
            ollama: 'error',
            playwright: 'error',
        },
        timestamp: new Date().toISOString(),
    };

    // PostgreSQL
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        results.services.database = 'connected';
    } catch (e) {
        results.services.database = 'error: ' + e.message;
    }

    // Redis
    try {
        await redis.connect().catch(() => {});
        const pong = await redis.ping();
        results.services.redis = pong === 'PONG' ? 'connected' : 'error';
    } catch (e) {
        results.services.redis = 'error: ' + e.message;
    }

    // Ollama
    try {
        const models = await listModels();
        const hasMistral = models.some(m => m.name && m.name.includes('mistral'));
        results.services.ollama = hasMistral ? 'running (mistral available)' : 'running (no mistral)';
    } catch (e) {
        results.services.ollama = 'error: ' + e.message;
    }

    // Playwright
    try {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: true });
        await browser.close();
        results.services.playwright = 'available';
    } catch (e) {
        results.services.playwright = 'error: ' + e.message;
    }

    const allGreen = Object.values(results.services).every(
        s => s === 'connected' || s.startsWith('running') || s === 'available'
    );
    results.status = allGreen ? 'ok' : 'degraded';
    res.status(allGreen ? 200 : 503).json(results);
});

module.exports = router;
