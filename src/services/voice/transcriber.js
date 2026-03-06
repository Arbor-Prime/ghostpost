/**
 * Voice Transcription Service
 * 
 * Converts WebM audio recordings to text using local whisper.cpp.
 * Audio flow: WebM (browser) -> WAV 16kHz mono (ffmpeg) -> Text (whisper)
 * Audio files are deleted immediately after transcription.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WHISPER_PATH = '/opt/whisper.cpp/build/bin/whisper-cli';
const WHISPER_MODEL = '/opt/whisper.cpp/models/ggml-small.bin';

/**
 * Transcribe a voice recording.
 * 
 * @param {Buffer} audioBuffer - Raw WebM/Opus audio data from browser
 * @param {number} userId - For temp file naming
 * @returns {{ text: string, duration: number }}
 */
async function transcribe(audioBuffer, userId) {
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const webmPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.webm`);
  const wavPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.wav`);
  const outputPath = path.join(tmpDir, `gp-voice-${userId}-${ts}`);

  try {
    // Write WebM to temp file
    fs.writeFileSync(webmPath, audioBuffer);

    // Convert to 16kHz mono WAV (whisper.cpp requirement)
    execSync(`ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`, {
      timeout: 30000,
    });

    // Get duration
    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${wavPath}"`,
      { encoding: 'utf-8' }
    );
    const duration = parseFloat(durationOutput.trim());

    // Run whisper.cpp
    execSync(
      `${WHISPER_PATH} -m ${WHISPER_MODEL} -f "${wavPath}" -otxt -of "${outputPath}" --no-timestamps -l en`,
      { timeout: 120000 }
    );

    // Read transcription output
    const text = fs.readFileSync(`${outputPath}.txt`, 'utf-8').trim();

    return { text, duration };

  } finally {
    // ALWAYS delete audio files — never store voice recordings
    [webmPath, wavPath, `${outputPath}.txt`].forEach(f => {
      try { fs.unlinkSync(f); } catch {}
    });
  }
}

module.exports = { transcribe };
