/**
 * Draft API Routes
 */

const db = require('../config/database');
const { generateReply } = require('../services/brain/reply-generator');
const { queueForPosting } = require('../services/posting/queue');

function registerDraftRoutes(app) {

  // Get pending drafts for approval
  app.get('/api/drafts/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const status = req.query.status || 'pending';
      const result = await db.query(
        `SELECT d.*, ot.content as tweet_content, ot.author_handle, ot.tweet_url
         FROM drafts d
         JOIN opportunities o ON o.id = d.opportunity_id
         JOIN observed_tweets ot ON ot.tweet_id = o.tweet_id
         WHERE d.user_id = $1 AND d.status = $2
         ORDER BY d.created_at DESC`,
        [userId, status]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manually generate a reply for an opportunity
  app.post('/api/drafts/generate', async (req, res) => {
    try {
      const { userId, opportunityId } = req.body;
      if (userId == null || opportunityId == null) return res.status(400).json({ error: 'userId and opportunityId required' });

      const draft = await generateReply(userId, opportunityId);
      res.json({ ok: true, draft });
    } catch (err) {
      console.error('[Drafts API] Generate failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Approve a draft and queue for posting
  app.post('/api/drafts/:id/approve', async (req, res) => {
    try {
      const draftId = parseInt(req.params.id);
      const r = await db.query("UPDATE drafts SET status = 'approved' WHERE id = $1 RETURNING user_id", [draftId]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Draft not found' });

      const userId = r.rows[0].user_id;
      const io = req.app.get('io');
      if (io) io.emit('draft:status_changed', { draftId, status: 'approved', userId });

      let jobId = null;
      try {
        jobId = await queueForPosting(userId, draftId);
      } catch (queueErr) {
        console.error(`[Drafts] Auto-queue failed for draft ${draftId}: ${queueErr.message}`);
      }

      res.json({ ok: true, queued: !!jobId, jobId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Edit and approve a draft, then queue for posting
  app.post('/api/drafts/:id/edit', async (req, res) => {
    try {
      const draftId = parseInt(req.params.id);
      const { editedText } = req.body;
      const r = await db.query(
        "UPDATE drafts SET reply_text = $1, actual_word_count = $2, status = 'edited' WHERE id = $3 RETURNING user_id",
        [editedText, editedText.split(/\s+/).length, draftId]
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Draft not found' });

      let jobId = null;
      try {
        jobId = await queueForPosting(r.rows[0].user_id, draftId);
      } catch (queueErr) {
        console.error(`[Drafts] Auto-queue failed for edited draft ${draftId}: ${queueErr.message}`);
      }

      res.json({ ok: true, queued: !!jobId, jobId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reject a draft
  app.post('/api/drafts/:id/reject', async (req, res) => {
    try {
      const r = await db.query("UPDATE drafts SET status = 'rejected' WHERE id = $1 RETURNING user_id", [req.params.id]);
      const io = req.app.get('io');
      if (io && r.rows[0]) io.emit('draft:status_changed', { draftId: parseInt(req.params.id), status: 'rejected', userId: r.rows[0].user_id });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Regenerate a draft
  app.post('/api/drafts/:id/regenerate', async (req, res) => {
    try {
      const draft = await db.query('SELECT opportunity_id, user_id FROM drafts WHERE id = $1', [req.params.id]);
      if (!draft.rows[0]) return res.status(404).json({ error: 'Draft not found' });

      // Reject old draft
      await db.query("UPDATE drafts SET status = 'rejected' WHERE id = $1", [req.params.id]);

      // Reset opportunity status so it can be drafted again
      await db.query("UPDATE opportunities SET status = 'pending' WHERE id = $1", [draft.rows[0].opportunity_id]);

      // Generate new one
      const newDraft = await generateReply(draft.rows[0].user_id, draft.rows[0].opportunity_id);
      res.json({ ok: true, draft: newDraft });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerDraftRoutes };
