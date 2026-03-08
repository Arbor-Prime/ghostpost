/**
 * Audio Compressor
 * 
 * Processes raw browser audio before transcription:
 * 1. Convert WebM/Opus → WAV 16kHz mono (Whisper requirement)
 * 2. Strip silence (pauses, dead air, thinking time)
 * 3. Normalise volume (quiet speakers don't get worse transcription)
 * 
 * A 10-minute recording with natural pauses typically compresses
 * to 5-7 minutes of actual speech. This directly reduces Whisper
 * processing time by 30-50%.
 * 
 * Silence detection uses -35dB threshold with 0.5s minimum duration.
 * This keeps natural speech pauses (0.1-0.3s) but removes the
 * "um... *thinks for 4 seconds*... so anyway" gaps.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Convert browser audio to clean WAV with silence removed.
 * 
 * @param {Buffer} audioBuffer - Raw WebM/Opus from browser
 * @param {number} userId - For temp file naming
 * @returns {{ wavPath: string, originalDuration: number, compressedDuration: number, compressionRatio: number }}
 */
function compressAudio(audioBuffer, userId) {
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const webmPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.webm`);
  const rawWavPath = path.join(tmpDir, `gp-voice-${userId}-${ts}-raw.wav`);
  const cleanWavPath = path.join(tmpDir, `gp-voice-${userId}-${ts}-clean.wav`);

  // Write browser audio to disk
  fs.writeFileSync(webmPath, audioBuffer);

  // Step 1: Convert to 16kHz mono WAV
  execSync(
    `ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${rawWavPath}" -y`,
    { timeout: 30000, stdio: 'pipe' }
  );

  // Get original duration
  const originalDuration = parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${rawWavPath}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim()
  );

  // Step 2: Remove silence + normalise volume
  // silenceremove: strip silence longer than 0.5s below -35dB
  // dynaudnorm: gentle volume normalisation (quiet speakers get boosted)
  try {
    execSync(
      `ffmpeg -i "${rawWavPath}" -af "` +
      `silenceremove=start_periods=1:start_duration=0.1:start_threshold=-35dB:` +
      `stop_periods=-1:stop_duration=0.5:stop_threshold=-35dB,` +
      `dynaudnorm=p=0.9:s=5" ` +
      `"${cleanWavPath}" -y`,
      { timeout: 60000, stdio: 'pipe' }
    );
  } catch (err) {
    // If advanced filter fails, fall back to just silence removal
    console.warn('[AudioCompressor] Advanced filter failed, using basic:', err.message);
    try {
      execSync(
        `ffmpeg -i "${rawWavPath}" -af "` +
        `silenceremove=start_periods=1:stop_periods=-1:stop_duration=0.5:stop_threshold=-35dB" ` +
        `"${cleanWavPath}" -y`,
        { timeout: 60000, stdio: 'pipe' }
      );
    } catch (err2) {
      // If even basic filter fails, just use the raw WAV
      console.warn('[AudioCompressor] Silence removal failed, using raw audio:', err2.message);
      fs.copyFileSync(rawWavPath, cleanWavPath);
    }
  }

  // Get compressed duration
  let compressedDuration = originalDuration;
  try {
    compressedDuration = parseFloat(
      execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${cleanWavPath}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim()
    );
  } catch {}

  const compressionRatio = originalDuration > 0
    ? Math.round((1 - compressedDuration / originalDuration) * 100)
    : 0;

  // Clean up source files (keep only the clean WAV)
  try { fs.unlinkSync(webmPath); } catch {}
  try { fs.unlinkSync(rawWavPath); } catch {}

  console.log(
    `[AudioCompressor] ${Math.round(originalDuration)}s → ${Math.round(compressedDuration)}s ` +
    `(${compressionRatio}% silence removed, ${Math.round(audioBuffer.length / 1024)}KB input)`
  );

  return {
    wavPath: cleanWavPath,
    originalDuration,
    compressedDuration,
    compressionRatio,
  };
}

/**
 * Clean up the WAV file after transcription.
 */
function cleanupWav(wavPath) {
  try { fs.unlinkSync(wavPath); } catch {}
}

module.exports = { compressAudio, cleanupWav };
