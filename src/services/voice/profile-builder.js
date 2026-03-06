/**
 * Voice Profile Builder
 * 
 * Orchestrates the full pipeline:
 * 1. Receive audio buffer from API
 * 2. Transcribe with Whisper
 * 3. Extract NLP features
 * 4. Calculate speech pace
 * 5. Store voice profile in database
 */

const { transcribe } = require('./transcriber');
const { extractVoiceProfile } = require('./extractor');
const db = require('../../config/database');

/**
 * Process a voice recording into a complete voice profile.
 * 
 * @param {number} userId
 * @param {Buffer} audioBuffer - Raw WebM audio from browser
 * @returns {Object} The completed voice profile
 */
async function buildVoiceProfile(userId, audioBuffer) {
  console.log(`[Voice] Starting profile build for user ${userId}`);

  // Update status
  await db.query(
    "UPDATE users SET voice_onboarding_status = 'processing' WHERE id = $1",
    [userId]
  );

  // Step 1: Transcribe
  console.log(`[Voice] Transcribing audio...`);
  const { text, duration } = await transcribe(audioBuffer, userId);
  console.log(`[Voice] Transcription complete: ${text.split(' ').length} words, ${Math.round(duration)}s`);

  // Store transcription metadata (NOT the audio)
  const wordCount = text.split(/\s+/).length;
  await db.query(
    `INSERT INTO voice_recordings (user_id, duration_seconds, file_size_bytes, transcription, word_count, processing_status, processed_at)
     VALUES ($1, $2, $3, $4, $5, 'complete', NOW())`,
    [userId, duration, audioBuffer.length, text, wordCount]
  );

  // Step 2: NLP Extraction
  console.log(`[Voice] Running NLP extraction...`);
  const voiceProfile = await extractVoiceProfile(text);

  // Step 3: Calculate speech pace
  if (duration > 0) {
    voiceProfile.speech_pace_wpm = Math.round(wordCount / (duration / 60));
  }

  // Step 4: Store in database
  await db.query(
    "UPDATE users SET voice_profile = $1, voice_onboarding_status = 'review' WHERE id = $2",
    [JSON.stringify(voiceProfile), userId]
  );

  console.log(`[Voice] Profile complete for user ${userId}: ${voiceProfile.summary_quote}`);
  return voiceProfile;
}

module.exports = { buildVoiceProfile };
