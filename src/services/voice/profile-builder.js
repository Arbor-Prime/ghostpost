/**
 * Voice Profile Builder
 * 
 * Orchestrates the full pipeline:
 * 1. Receive audio buffer from API
 * 2. Transcribe with Whisper (faster-whisper or whisper.cpp)
 * 3. Strip filler words while preserving personality markers
 * 4. Extract NLP features from CLEAN transcript
 * 5. Calculate speech pace (from raw duration + raw word count)
 * 6. Store voice profile in database
 */

const { transcribe } = require('./transcriber-fast');
const { stripFillers } = require('./filler-stripper');
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
  console.log(`[Voice] Starting profile build for user ${userId}, audio size: ${Math.round(audioBuffer.length / 1024)}KB`);

  // Update status
  await db.query(
    "UPDATE users SET voice_onboarding_status = 'processing' WHERE id = $1",
    [userId]
  );

  // Step 1: Transcribe
  console.log(`[Voice] Transcribing audio...`);
  const { text: rawText, duration } = await transcribe(audioBuffer, userId);
  const rawWordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;
  console.log(`[Voice] Raw transcription: ${rawWordCount} words, ${Math.round(duration)}s`);

  // Step 2: Strip fillers
  console.log(`[Voice] Stripping fillers...`);
  const { cleaned: cleanText, stats: fillerStats } = stripFillers(rawText);
  console.log(`[Voice] Filler strip: ${fillerStats.original_words} → ${fillerStats.cleaned_words} words (${fillerStats.removed_percent}% removed, ${fillerStats.filler_density}% filler density)`);

  // Store transcription metadata (NOT the audio, NOT the full transcript)
  await db.query(
    `INSERT INTO voice_recordings (user_id, duration_seconds, file_size_bytes, transcription, word_count, processing_status, processed_at)
     VALUES ($1, $2, $3, $4, $5, 'complete', NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       duration_seconds = EXCLUDED.duration_seconds,
       file_size_bytes = EXCLUDED.file_size_bytes,
       transcription = EXCLUDED.transcription,
       word_count = EXCLUDED.word_count,
       processing_status = 'complete',
       processed_at = NOW()`,
    [userId, duration, audioBuffer.length, cleanText, fillerStats.cleaned_words]
  );

  // Step 3: NLP Extraction (on CLEAN text — no filler noise)
  console.log(`[Voice] Running NLP extraction on clean text...`);
  const voiceProfile = await extractVoiceProfile(cleanText);

  // Step 4: Calculate speech pace from RAW data (includes natural pauses)
  if (duration > 0) {
    voiceProfile.speech_pace_wpm = Math.round(rawWordCount / (duration / 60));
  }

  // Add filler stats to profile (useful for persona calibration)
  voiceProfile.filler_density = fillerStats.filler_density;
  voiceProfile.raw_word_count = fillerStats.original_words;
  voiceProfile.clean_word_count = fillerStats.cleaned_words;

  // Step 5: Store in database
  await db.query(
    "UPDATE users SET voice_profile = $1, voice_onboarding_status = 'review' WHERE id = $2",
    [JSON.stringify(voiceProfile), userId]
  );

  console.log(`[Voice] ✓ Profile complete for user ${userId}: "${voiceProfile.summary_quote}"`);
  console.log(`[Voice]   Topics: ${(voiceProfile.primary_topics || []).join(', ')}`);
  console.log(`[Voice]   Signature words: ${(voiceProfile.signature_words || []).slice(0, 5).join(', ')}`);
  console.log(`[Voice]   Formality: ${voiceProfile.formality}, Directness: ${voiceProfile.directness}`);
  console.log(`[Voice]   Filler density: ${fillerStats.filler_density}% (${fillerStats.removed_percent}% of words removed)`);

  return voiceProfile;
}

module.exports = { buildVoiceProfile };
