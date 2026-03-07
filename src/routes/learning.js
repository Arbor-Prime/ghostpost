/**
 * Learning Engine API Routes (Sprint 17)
 * Same pattern as all other route files.
 */

const db = require('../config/database');
const PromptEnricher = require('../services/learning/prompt-enricher');

const enricher = new PromptEnricher();

function registerLearningRoutes(app) {

  // Get learning stats overview
  app.get('/api/learning/stats', async (req, res) => {
    try {
      const scheduler = app.get('learningScheduler');
      if (scheduler) {
        const stats = await scheduler.getStats();
        return res.json(stats);
      }

      // Fallback if scheduler not initialised
      const totals = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM observed_conversations) as total_conversations,
          (SELECT COUNT(*) FROM observed_messages) as total_messages,
          (SELECT COUNT(*) FROM learned_patterns WHERE status = 'active') as active_patterns,
          (SELECT COUNT(*) FROM harvest_log) as total_harvests,
          (SELECT MAX(completed_at) FROM harvest_log) as last_harvest
      `);
      res.json({ totals: totals.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get learned patterns (optionally filtered)
  app.get('/api/learning/patterns', async (req, res) => {
    const { platform, context, vertical, status = 'active', limit = 50 } = req.query;
    try {
      let query = 'SELECT * FROM learned_patterns WHERE status = $1';
      const params = [status];
      let paramIdx = 2;

      if (platform) {
        query += ` AND platform = $${paramIdx++}`;
        params.push(platform);
      }
      if (context) {
        query += ` AND context = $${paramIdx++}`;
        params.push(context);
      }
      if (vertical) {
        query += ` AND vertical = $${paramIdx++}`;
        params.push(vertical);
      }

      query += ` ORDER BY confidence DESC, evidence_count DESC LIMIT $${paramIdx}`;
      params.push(parseInt(limit));

      const patterns = await db.query(query, params);
      res.json({ patterns: patterns.rows, count: patterns.rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get pattern summary (grouped by platform and context)
  app.get('/api/learning/patterns/summary', async (req, res) => {
    try {
      const summary = await enricher.getPatternSummary(req.query.platform || null);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get observed conversations
  app.get('/api/learning/conversations', async (req, res) => {
    const { platform, vertical, threadType, limit = 30 } = req.query;
    try {
      let query = 'SELECT * FROM observed_conversations WHERE 1=1';
      const params = [];
      let paramIdx = 1;

      if (platform) {
        query += ` AND platform = $${paramIdx++}`;
        params.push(platform);
      }
      if (vertical) {
        query += ` AND vertical = $${paramIdx++}`;
        params.push(vertical);
      }
      if (threadType) {
        query += ` AND thread_type = $${paramIdx++}`;
        params.push(threadType);
      }

      query += ` ORDER BY observed_at DESC LIMIT $${paramIdx}`;
      params.push(parseInt(limit));

      const conversations = await db.query(query, params);
      res.json({ conversations: conversations.rows, count: conversations.rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get messages in a conversation thread
  app.get('/api/learning/conversations/:id/messages', async (req, res) => {
    try {
      const conv = await db.query('SELECT * FROM observed_conversations WHERE id = $1', [req.params.id]);
      const messages = await db.query(
        'SELECT * FROM observed_messages WHERE conversation_id = $1 ORDER BY reply_depth, id',
        [req.params.id]
      );
      res.json({
        conversation: conv.rows[0] || null,
        messages: messages.rows
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get harvest log
  app.get('/api/learning/harvests', async (req, res) => {
    try {
      const harvests = await db.query(
        'SELECT * FROM harvest_log ORDER BY started_at DESC LIMIT 50'
      );
      res.json({ harvests: harvests.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger a manual harvest
  app.post('/api/learning/harvest', async (req, res) => {
    const { platform } = req.body;
    try {
      const scheduler = app.get('learningScheduler');
      if (!scheduler) {
        return res.status(500).json({ error: 'Learning scheduler not initialised' });
      }

      // Run async — don't block the response
      res.json({ ok: true, message: `Harvest started for ${platform || 'all platforms'}. Check /api/learning/stats for progress.` });

      if (platform) {
        const ConversationHarvester = require('../services/learning/conversation-harvester');
        const harvester = new ConversationHarvester();
        if (platform === 'x') await harvester.harvestX();
        else if (platform === 'instagram') await harvester.harvestInstagram();
        else if (platform === 'linkedin') await harvester.harvestLinkedIn();
      } else {
        await scheduler.runHarvest();
      }
    } catch (err) {
      // Already responded, just log
      console.error('[Learning API] Harvest error:', err.message);
    }
  });

  // Trigger manual pattern extraction
  app.post('/api/learning/extract', async (req, res) => {
    try {
      const scheduler = app.get('learningScheduler');
      if (!scheduler) {
        return res.status(500).json({ error: 'Learning scheduler not initialised' });
      }

      res.json({ ok: true, message: 'Pattern extraction started. Check /api/learning/patterns for results.' });
      await scheduler.runExtraction();
    } catch (err) {
      console.error('[Learning API] Extract error:', err.message);
    }
  });

  // Preview what enrichment would be added to a prompt
  app.get('/api/learning/enrichment/preview', async (req, res) => {
    const { platform, context = 'cold_dm', vertical } = req.query;
    try {
      const enrichment = await enricher.getEnrichment({ platform, context, vertical });
      res.json(enrichment);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[Server] Learning routes registered (Sprint 17)');
}

module.exports = { registerLearningRoutes };
