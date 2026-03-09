/**
 * Outreach Chat API Routes
 * 
 * POST /api/chat/message — send a message to GhostPost AI
 * GET /api/chat/drafts — get pending DM drafts
 * POST /api/chat/drafts/:id/approve — approve a draft
 * POST /api/chat/drafts/:id/reject — reject a draft
 */

const { processChat } = require('../services/outreach/ai-chat');
const db = require('../config/database');

function registerChatRoutes(app, authenticateToken) {

  // Send a chat message to GhostPost AI
  app.post('/api/chat/message', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message required' });
      }

      const result = await processChat(userId, message.trim());
      res.json(result);

    } catch (err) {
      console.error('[Chat API] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Get pending DM drafts for this user
  app.get('/api/chat/drafts', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await db.query(
        `SELECT id, platform, message_text, pitch_angle, status, created_at
         FROM outreach_messages
         WHERE user_id = $1 AND status = 'draft'
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );
      res.json({ drafts: result.rows });
    } catch (err) {
      console.error('[Chat API] Drafts error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Approve a draft
  app.post('/api/chat/drafts/:id/approve', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const draftId = parseInt(req.params.id);
      const result = await db.query(
        "UPDATE outreach_messages SET status = 'approved' WHERE id = $1 AND user_id = $2 RETURNING *",
        [draftId, userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Draft not found' });
      }
      res.json({ ok: true, draft: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reject a draft
  app.post('/api/chat/drafts/:id/reject', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const draftId = parseInt(req.params.id);
      await db.query(
        "UPDATE outreach_messages SET status = 'rejected' WHERE id = $1 AND user_id = $2",
        [draftId, userId]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get campaigns for this user
  app.get('/api/chat/campaigns', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await db.query(
        `SELECT id, platform, name, target_category, target_location, status, created_at
         FROM campaigns
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      res.json({ campaigns: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete account and all user data (GDPR right to erasure)
  app.delete('/api/account', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      console.log(`[Account] Deleting user ${userId} and all data`);

      await db.query('BEGIN');
      
      // Delete in dependency order
      const tables = [
        'outreach_messages', 'leads', 'campaigns',
        'posted_replies', 'drafts', 'opportunities',
        'observation_sessions', 'tracked_profiles',
        'browser_sessions', 'platform_accounts',
        'voice_recordings'
      ];
      
      for (const table of tables) {
        try {
          await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
        } catch (e) {
          // Table might not exist, skip
        }
      }
      
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
      await db.query('COMMIT');

      // Clear cookie
      res.clearCookie('token');
      res.json({ ok: true, message: 'Account deleted' });
      
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('[Account] Delete failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerChatRoutes };
