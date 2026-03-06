/**
 * Persona API Routes
 */

const { generatePersona } = require('../services/persona/profile-generator');
const { generateDailySchedule, storeSchedule, storeCircadianTones } = require('../services/persona/schedule-generator');
const db = require('../config/database');

function registerPersonaRoutes(app) {

  // Generate persona from voice profile
  app.post('/api/persona/generate/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const rawBody = req.body;

      console.log('[Persona] Generate request, raw body:', rawBody);

      // Get voice profile
      const user = await db.query('SELECT voice_profile FROM users WHERE id = $1', [userId]);
      if (!user.rows[0]?.voice_profile) {
        return res.status(400).json({ error: 'Voice profile required. Complete voice onboarding first.' });
      }

      const voiceProfile = user.rows[0].voice_profile;

      // Parse frontend boolean flags into backend enum values
      let chronotype, work_pattern;
      
      // Frontend sends: { work_9to5: true/false, night_owl: true/false }
      // Backend needs: chronotype: "night_owl"|"intermediate", work_pattern: "office_9to5"|"late_night_builder"
      if (rawBody.night_owl) {
        chronotype = 'night_owl';
        work_pattern = 'late_night_builder';
      } else if (rawBody.work_9to5) {
        chronotype = 'intermediate';
        work_pattern = 'office_9to5';
      } else {
        // Fallback to explicit values if provided
        chronotype = rawBody.chronotype || 'intermediate';
        work_pattern = rawBody.work_pattern || 'office_9to5';
      }

      const age_bracket = rawBody.age_bracket || '25-34';
      const gender = rawBody.gender || 'neutral';

      console.log('[Persona] Parsed values:', { chronotype, work_pattern, age_bracket, gender });

      // Generate persona
      const persona = generatePersona(voiceProfile, { chronotype, work_pattern, age_bracket, gender });

      // Store persona and demographics
      await db.query(
        `UPDATE users SET persona = $1, chronotype = $2, work_pattern = $3, age_bracket = $4, gender = $5 WHERE id = $6`,
        [JSON.stringify(persona), chronotype, work_pattern, age_bracket, gender, userId]
      );

      console.log('[Persona] ✓ Stored persona with:', { chronotype, work_pattern });

      // Store circadian tones
      await storeCircadianTones(userId, persona.circadian_curve);

      // Generate today's schedule
      const today = new Date();
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const schedule = generateDailySchedule(persona, dayOfWeek);
      const dateStr = today.toISOString().split('T')[0];
      await storeSchedule(userId, dateStr, schedule);

      res.json({ ok: true, persona, todaySchedule: schedule });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get persona
  app.get('/api/persona/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query(
        'SELECT persona, chronotype, work_pattern, age_bracket, gender FROM users WHERE id = $1',
        [userId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get today's schedule
  app.get('/api/persona/schedule/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const dateStr = req.query.date || new Date().toISOString().split('T')[0];
      const result = await db.query(
        'SELECT * FROM daily_schedules WHERE user_id = $1 AND schedule_date = $2',
        [userId, dateStr]
      );
      res.json(result.rows[0] || { sessions: [], totalSessions: 0, isZeroDay: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get circadian curve
  app.get('/api/persona/circadian/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const result = await db.query(
        'SELECT hour, energy, mood, length_modifier, emoji_boost FROM circadian_tones WHERE user_id = $1 ORDER BY hour',
        [userId]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerPersonaRoutes };
