/**
 * Browser Session API Routes
 *
 * REST endpoints for checking session status and cookie state.
 * The actual browser control happens over Socket.io, not REST.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/status', (req, res) => {
  const manager = req.app.get('browserSessionManager');
  res.json(manager ? manager.getStatus() : { active: false, streaming: false, url: null });
});

router.get('/cookie-status', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT cookie_status, cookie_updated_at FROM users WHERE id = $1',
      [1]
    );

    if (!result.rows[0]) {
      return res.json({ status: 'none', updatedAt: null });
    }

    const { cookie_status, cookie_updated_at } = result.rows[0];

    const isStale = cookie_updated_at &&
      (Date.now() - new Date(cookie_updated_at).getTime()) > 24 * 60 * 60 * 1000;

    res.json({
      status: isStale ? 'stale' : (cookie_status || 'none'),
      updatedAt: cookie_updated_at,
      isStale,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
