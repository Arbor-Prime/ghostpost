/**
 * Seed a test customer with fingerprints and tracked profiles.
 * Run: node scripts/seed-test-user.js
 */
require('dotenv').config();
const db = require('../src/config/database');
const { generateFingerprints } = require('../src/services/observer/fingerprints');

async function seed() {
  console.log('Seeding test user...');

  // Insert test user
  const userResult = await db.query(`
    INSERT INTO users (name, x_handle, status, observation_frequency, mobile_to_desktop_hour)
    VALUES ('test-user', 'ambassador', 'active', 4, 18)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  let userId;
  if (userResult.rows.length > 0) {
    userId = userResult.rows[0].id;
    console.log('Created user with id:', userId);
  } else {
    // User already exists, find them
    const existing = await db.query("SELECT id FROM users WHERE x_handle = 'ambassador'");
    userId = existing.rows[0].id;
    console.log('User already exists with id:', userId);
  }

  // Generate and save fingerprints
  const { mobile, desktop } = generateFingerprints();
  await db.query(
    'UPDATE users SET fingerprint_mobile = $1, fingerprint_desktop = $2 WHERE id = $3',
    [JSON.stringify(mobile), JSON.stringify(desktop), userId]
  );
  console.log('Fingerprints saved');
  console.log('  Mobile:', JSON.stringify(mobile.viewport), mobile.userAgent.substring(0, 60) + '...');
  console.log('  Desktop:', JSON.stringify(desktop.viewport), desktop.userAgent.substring(0, 60) + '...');

  // Add tracked profiles
  const profiles = [
    { handle: 'elonmusk', priority: 1 },
    { handle: 'ycombinator', priority: 2 },
    { handle: 'paulg', priority: 3 },
  ];

  for (const p of profiles) {
    await db.query(`
      INSERT INTO tracked_profiles (user_id, x_handle, priority)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [userId, p.handle, p.priority]);
    console.log(`  Tracked: @${p.handle} (priority ${p.priority})`);
  }

  console.log('\nDone. Test user id:', userId);
  console.log('Trigger observation with:');
  console.log(`  curl -X POST http://localhost:3000/api/observer/trigger/${userId}`);

  await db.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
