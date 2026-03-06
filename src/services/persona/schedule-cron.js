/**
 * Midnight Schedule Generator
 * 
 * Runs at 00:00 local time for each customer.
 * Generates the next day's session schedule based on their persona.
 * 
 * Start with: node src/services/persona/schedule-cron.js
 * Or wire into the existing scheduler loop.
 */

const { generateDailySchedule, storeSchedule } = require('./schedule-generator');
const db = require('../../config/database');

async function generateAllSchedules() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  const dayOfWeek = tomorrow.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  console.log(`[ScheduleCron] Generating schedules for ${dateStr} (${dayOfWeek})`);

  const users = await db.query(
    "SELECT id, persona FROM users WHERE status = 'active' AND persona IS NOT NULL"
  );

  for (const user of users.rows) {
    try {
      const schedule = generateDailySchedule(user.persona, dayOfWeek);
      await storeSchedule(user.id, dateStr, schedule);
      console.log(`[ScheduleCron] User ${user.id}: ${schedule.totalSessions} sessions, ${schedule.totalActiveMinutes}min${schedule.isZeroDay ? ' (ZERO DAY)' : ''}`);
    } catch (err) {
      console.error(`[ScheduleCron] Failed for user ${user.id}: ${err.message}`);
    }
  }

  console.log(`[ScheduleCron] Done. Generated ${users.rows.length} schedules.`);
}

// Run at midnight
function startCron() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight - now;

  console.log(`[ScheduleCron] First run in ${Math.round(msUntilMidnight / 60000)} minutes`);

  setTimeout(() => {
    generateAllSchedules();
    setInterval(generateAllSchedules, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

if (require.main === module) {
  require('dotenv').config({ path: '/opt/ghostpost/.env' });
  generateAllSchedules().then(() => process.exit(0));
} else {
  module.exports = { generateAllSchedules, startCron };
}
