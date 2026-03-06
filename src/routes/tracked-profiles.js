/**
 * Tracked Profiles CRUD API
 * Sprint 10.5
 */

const db = require('../config/database');

function registerTrackedProfilesRoutes(app) {

  // List all tracked profiles for a user
  app.get('/api/tracked-profiles/:userId', async (req, res) => {
    try {
      const profiles = await db.query(
        `SELECT tp.*, 
                COUNT(DISTINCT ot.tweet_id) as tweet_count,
                COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending') as pending_opportunities
         FROM tracked_profiles tp
         LEFT JOIN observed_tweets ot ON ot.author_handle = tp.x_handle AND ot.user_id = tp.user_id
         LEFT JOIN opportunities o ON o.user_id = tp.user_id AND o.tweet_id IN (
           SELECT tweet_id FROM observed_tweets WHERE author_handle = tp.x_handle
         )
         WHERE tp.user_id = $1
         GROUP BY tp.id
         ORDER BY tp.added_at DESC`,
        [req.params.userId]
      );
      res.json(profiles.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add a new tracked profile
  app.post('/api/tracked-profiles/:userId', async (req, res) => {
    try {
      const { x_handle, priority = 5, notes = '' } = req.body;
      if (!x_handle) return res.status(400).json({ error: 'x_handle is required' });

      // Normalise handle — remove leading @
      const handle = x_handle.replace(/^@/, '');

      const result = await db.query(
        `INSERT INTO tracked_profiles (user_id, x_handle, priority, notes, added_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [req.params.userId, handle, priority, notes]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Profile already tracked' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a tracked profile
  app.delete('/api/tracked-profiles/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM tracked_profiles WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger scan for a specific profile
  app.post('/api/tracked-profiles/:id/scan', async (req, res) => {
    try {
      const profile = await db.query(
        'SELECT tp.*, u.fingerprint_desktop, u.fingerprint_mobile, u.proxy_host, u.proxy_port, u.proxy_user, u.proxy_pass_encrypted FROM tracked_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.id = $1',
        [req.params.id]
      );
      if (profile.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });

      const row = profile.rows[0];
      const { observationQueue } = require('../services/observer/scheduler');

      await observationQueue.add('observe', {
        userId: row.user_id,
        fingerprintType: 'desktop',
        targetHandles: [row.x_handle],
        proxy: row.proxy_host ? {
          host: row.proxy_host,
          port: row.proxy_port,
          user: row.proxy_user,
          pass: row.proxy_pass_encrypted,
        } : null,
        fingerprint: row.fingerprint_desktop || row.fingerprint_mobile,
      });

      // Emit scan:started event
      const io = req.app.get('io');
      if (io) io.emit('scan:started', { userId: row.user_id, handles: [row.x_handle], timestamp: new Date() });

      res.json({ status: 'scan_queued', handle: row.x_handle });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerTrackedProfilesRoutes };
