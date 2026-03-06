/**
 * Voice Onboarding API Routes
 */

const multer = require('multer');
const { buildVoiceProfile } = require('../services/voice/profile-builder');
const db = require('../config/database');

// Store in memory (we never save audio to disk permanently)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

function registerVoiceRoutes(app) {

  // Upload voice recording and process
  app.post('/api/voice/upload', upload.single('audio'), async (req, res) => {
    try {
      const userId = parseInt(req.body.userId || req.query.userId);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!req.file) return res.status(400).json({ error: 'audio file required' });

      const voiceProfile = await buildVoiceProfile(userId, req.file.buffer);
      res.json({ ok: true, voiceProfile });
    } catch (err) {
      console.error('[Voice API] Upload failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Get voice profile for a user
  app.get('/api/voice/profile/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query(
        'SELECT voice_profile, voice_onboarding_status FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update voice profile (customer adjusts sliders on review page)
  app.put('/api/voice/profile/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const updates = req.body;

      // Merge updates into existing profile
      const existing = await db.query('SELECT voice_profile FROM users WHERE id = $1', [userId]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const merged = { ...existing.rows[0].voice_profile, ...updates };
      await db.query(
        'UPDATE users SET voice_profile = $1 WHERE id = $2',
        [JSON.stringify(merged), userId]
      );

      res.json({ ok: true, voiceProfile: merged });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Confirm voice profile (move to complete)
  app.post('/api/voice/confirm/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await db.query(
        "UPDATE users SET voice_onboarding_status = 'complete' WHERE id = $1",
        [userId]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Onboarding status check — used by the frontend route guard
  app.get('/api/voice-profile/status', async (req, res) => {
    try {
      const userId = parseInt(req.query.userId || 1);
      const result = await db.query(
        'SELECT voice_onboarding_status, voice_profile FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length === 0) {
        return res.json({ complete: false, status: 'pending' });
      }
      const row = result.rows[0];
      const status = row.voice_onboarding_status || 'pending';
      res.json({
        complete: status === 'complete',
        status,
        hasProfile: !!row.voice_profile,
      });
    } catch (err) {
      res.json({ complete: false, status: 'error' });
    }
  });

  // Reset voice profile & persona — triggers re-onboarding
  app.delete('/api/voice-profile/reset', async (req, res) => {
    try {
      const userId = 1;
      await db.query(
        `UPDATE users SET
          voice_profile = NULL,
          voice_onboarding_status = 'pending',
          persona = NULL,
          chronotype = NULL,
          work_pattern = NULL
        WHERE id = $1`,
        [userId]
      );
      await db.query('DELETE FROM circadian_tones WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM daily_schedules WHERE user_id = $1', [userId]);
      res.json({ success: true, message: 'Voice profile reset. Please complete onboarding again.' });
    } catch (err) {
      console.error('[Voice Reset] Failed:', err.message);
      res.status(500).json({ error: 'Reset failed' });
    }
  });

  // Export voice profile and persona for backup
  app.get('/api/voice-profile/export', async (req, res) => {
    try {
      const userId = parseInt(req.query.userId || 1);
      const result = await db.query(
        `SELECT voice_profile, persona, chronotype, work_pattern, 
                voice_onboarding_status
         FROM users WHERE id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const user = result.rows[0];
      
      res.json({
        exportedAt: new Date().toISOString(),
        userId,
        voiceProfile: user.voice_profile,
        persona: user.persona,
        chronotype: user.chronotype,
        workPattern: user.work_pattern,
        onboardingStatus: user.voice_onboarding_status,
      });
    } catch (err) {
      console.error('[Voice Export] Failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Import/restore voice profile and persona from backup
  app.post('/api/voice-profile/import', async (req, res) => {
    try {
      const { voiceProfile, persona, chronotype, workPattern, userId } = req.body;
      const targetUserId = userId || 1;
      
      if (!voiceProfile) {
        return res.status(400).json({ error: 'No voice profile data provided' });
      }
      
      await db.query(
        `UPDATE users SET
          voice_profile = $1,
          persona = $2,
          chronotype = $3,
          work_pattern = $4,
          voice_onboarding_status = 'complete'
         WHERE id = $5`,
        [
          JSON.stringify(voiceProfile),
          persona ? JSON.stringify(persona) : null,
          chronotype || null,
          workPattern || null,
          targetUserId
        ]
      );
      
      res.json({ 
        success: true, 
        message: 'Voice profile and persona restored successfully' 
      });
    } catch (err) {
      console.error('[Voice Import] Failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerVoiceRoutes };
