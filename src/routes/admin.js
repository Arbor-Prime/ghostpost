/**
 * Admin/Diagnostic API Routes
 */

const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

// Get recent PM2 logs for voice processing diagnostics
router.get('/recent-logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const logs = execSync(`npx pm2 logs ghostpost --lines ${lines} --nostream`, { 
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    res.json({ logs, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr?.toString() });
  }
});

// Get PM2 process status
router.get('/pm2-status', async (req, res) => {
  try {
    const status = execSync('npx pm2 jlist', { 
      encoding: 'utf-8',
      timeout: 5000 
    });
    res.json({ processes: JSON.parse(status) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
