/**
 * Browser Session Manager
 * 
 * Captures and restores Playwright browser cookies for logged-in X sessions.
 * Cookies are encrypted at rest using AES-256-GCM.
 * Sessions are validated before each use and invalidated if expired.
 */

const { encrypt, decrypt } = require('../../utils/crypto');
const db = require('../../config/database');

/**
 * Save browser cookies after a successful login or session use.
 */
async function saveBrowserSession(userId, platform, context) {
  const cookies = await context.cookies();

  await db.query(
    `INSERT INTO browser_sessions (user_id, platform, cookies_encrypted, last_used_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, platform) DO UPDATE SET
       cookies_encrypted = EXCLUDED.cookies_encrypted,
       last_used_at = NOW(),
       is_valid = TRUE`,
    [userId, platform, encrypt(JSON.stringify(cookies))]
  );
}

/**
 * Restore browser session from stored cookies.
 * Returns false if no valid session exists.
 */
async function restoreBrowserSession(userId, platform, context) {
  const result = await db.query(
    'SELECT cookies_encrypted FROM browser_sessions WHERE user_id = $1 AND platform = $2 AND is_valid = TRUE',
    [userId, platform]
  );

  if (result.rows.length === 0) return false;

  try {
    const cookies = JSON.parse(decrypt(result.rows[0].cookies_encrypted));
    await context.addCookies(cookies);

    await db.query(
      'UPDATE browser_sessions SET last_used_at = NOW() WHERE user_id = $1 AND platform = $2',
      [userId, platform]
    );
    return true;
  } catch (err) {
    console.error(`[SessionManager] Failed to restore ${platform} session for user ${userId}: ${err.message}`);
    await db.query(
      'UPDATE browser_sessions SET is_valid = FALSE WHERE user_id = $1 AND platform = $2',
      [userId, platform]
    );
    return false;
  }
}

/**
 * Invalidate a session (e.g., after X logs us out).
 */
async function invalidateSession(userId, platform) {
  await db.query(
    'UPDATE browser_sessions SET is_valid = FALSE WHERE user_id = $1 AND platform = $2',
    [userId, platform]
  );
  if (platform === 'x') {
    await db.query("UPDATE users SET x_auth_status = 'expired' WHERE id = $1", [userId]);
  }
}

module.exports = { saveBrowserSession, restoreBrowserSession, invalidateSession };
