/**
 * Daily Schedule Generator
 * 
 * Generates a day's worth of sessions based on the persona.
 * Called at midnight (local time) for each customer, or on-demand.
 * 
 * Each session has: time, type (scroll_only/engage), device, duration.
 * Sessions are distributed across the day following the circadian curve.
 * 
 * Research backing:
 * - Barabasi 2005: inter-event times follow power-law (bursty, not uniform)
 * - Oulasvirta 2012: sessions average 1.5 min, checking 34x/day
 * - Golder & Macy 2011: activity peaks mid-morning, dips afternoon, rises evening
 */

const { logNormalRandom, randomBetween, gaussianRandom } = require('../../utils/humanise');
const db = require('../../config/database');

/**
 * Generate a full day's schedule for a customer.
 * 
 * @param {Object} persona - The customer's persona object
 * @param {string} dayOfWeek - 'monday' through 'sunday'
 * @returns {Object} { sessions: [...], totalActiveMinutes, totalSessions, isZeroDay }
 */
function generateDailySchedule(persona, dayOfWeek) {
  const isWeekend = ['saturday', 'sunday'].includes(dayOfWeek);

  // Check for zero-activity day (1-4 per month)
  const zeroChance = (persona.zero_days_per_month || 2) / 30;
  if (Math.random() < zeroChance) {
    return { sessions: [], totalActiveMinutes: 0, totalSessions: 0, isZeroDay: true };
  }

  // Calculate today's session count
  let sessionCount = Math.round(gaussianRandom(
    persona.sessions_per_day.mean,
    persona.sessions_per_day.sigma
  ));
  sessionCount = Math.max(persona.sessions_per_day.min, Math.min(persona.sessions_per_day.max, sessionCount));

  // Weekend reduction
  if (isWeekend) {
    sessionCount = Math.max(2, Math.round(sessionCount * (1 - persona.weekend_reduction)));
  }

  // Generate session times using bursty distribution
  const sessionTimes = generateBurstyTimes(sessionCount, persona.circadian_curve, isWeekend, persona.chronotype);

  // Build sessions
  const sessions = sessionTimes.map(({ hour, minute }) => {
    const device = persona.mobile_hours.includes(hour) ? 'mobile' : 'desktop';
    const isScrollOnly = Math.random() < persona.scroll_only_ratio;
    const type = isScrollOnly ? 'scroll_only' : 'engage';

    let durationMin = logNormalRandom(persona.session_duration.median_seconds / 60, persona.session_duration.sigma);
    durationMin = Math.max(
      persona.session_duration.min_seconds / 60,
      Math.min(persona.session_duration.max_seconds / 60, durationMin)
    );
    durationMin = Math.round(durationMin * 10) / 10;

    return { hour, minute, type, device, duration_min: durationMin };
  });

  // Sort by time
  sessions.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  const totalActiveMinutes = Math.round(sessions.reduce((sum, s) => sum + s.duration_min, 0));

  return {
    sessions,
    totalActiveMinutes,
    totalSessions: sessions.length,
    isZeroDay: false,
  };
}

/**
 * Generate bursty session times following the circadian curve.
 * Uses rejection sampling: propose random times, accept based on energy level.
 */
function generateBurstyTimes(count, circadianCurve, isWeekend, chronotype) {
  const times = [];
  const maxAttempts = count * 20;
  let attempts = 0;

  const weekendShift = isWeekend ? 2 : 0;

  while (times.length < count && attempts < maxAttempts) {
    attempts++;

    const hour = randomBetween(0, 23);
    const minute = randomBetween(0, 59);

    // Weekend: skip early morning
    if (isWeekend && hour < (6 + weekendShift)) continue;

    // Get energy level for this hour
    const curveEntry = circadianCurve.find(c => c.hour === hour);
    const energy = curveEntry ? curveEntry.energy : 0.3;

    // Accept with probability proportional to energy
    if (Math.random() < energy) {
      // Enforce minimum gap between sessions (15 min)
      const proposedMinutes = hour * 60 + minute;
      const tooClose = times.some(t => Math.abs((t.hour * 60 + t.minute) - proposedMinutes) < 15);
      if (tooClose) continue;

      times.push({ hour, minute });
    }
  }

  return times;
}

/**
 * Store a generated schedule in the database.
 */
async function storeSchedule(userId, scheduleDate, schedule) {
  await db.query(
    `INSERT INTO daily_schedules (user_id, schedule_date, sessions, total_active_minutes, total_sessions, is_zero_day)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, schedule_date) DO UPDATE SET
       sessions = EXCLUDED.sessions,
       total_active_minutes = EXCLUDED.total_active_minutes,
       total_sessions = EXCLUDED.total_sessions,
       is_zero_day = EXCLUDED.is_zero_day`,
    [userId, scheduleDate, JSON.stringify(schedule.sessions), schedule.totalActiveMinutes, schedule.totalSessions, schedule.isZeroDay]
  );
}

/**
 * Store circadian tones for a user (call once when persona is created).
 */
async function storeCircadianTones(userId, circadianCurve) {
  for (const entry of circadianCurve) {
    await db.query(
      `INSERT INTO circadian_tones (user_id, hour, energy, mood, length_modifier, emoji_boost)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, hour) DO UPDATE SET
         energy = EXCLUDED.energy, mood = EXCLUDED.mood,
         length_modifier = EXCLUDED.length_modifier, emoji_boost = EXCLUDED.emoji_boost`,
      [userId, entry.hour, entry.energy, entry.mood, entry.length_modifier, entry.emoji_boost]
    );
  }
}

module.exports = { generateDailySchedule, storeSchedule, storeCircadianTones, generateBurstyTimes };
