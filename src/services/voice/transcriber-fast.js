/**
 * Fast Voice Transcriber
 * 
 * Replaces whisper.cpp with faster-whisper (Python CTranslate2 backend).
 * 
 * Performance comparison on CPU (5-min audio):
 * - whisper.cpp small model: ~8-12 minutes
 * - faster-whisper base model: ~60-90 seconds
 * - faster-whisper small model: ~2-3 minutes
 * 
 * Uses base model by default — good enough for voice profiling.
 * The filler stripper handles the lower accuracy on filler words.
 * 
 * Install: pip install faster-whisper --break-system-packages
 */

const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';

// Check if faster-whisper is installed, fall back to whisper.cpp
let useFasterWhisper = false;
try {
  execSync('python3 -c "import faster_whisper"', { timeout: 5000, stdio: 'pipe' });
  useFasterWhisper = true;
  console.log('[Transcriber] Using faster-whisper (Python)');
} catch {
  console.log('[Transcriber] faster-whisper not found, using whisper.cpp fallback');
}

/**
 * Create a one-shot Python script for faster-whisper transcription.
 * Writing to a temp file avoids shell escaping issues.
 */
function createTranscriptScript(wavPath, outputPath) {
  return `
import sys
import json
from faster_whisper import WhisperModel

model = WhisperModel("${WHISPER_MODEL}", device="cpu", compute_type="int8")
segments, info = model.transcribe("${wavPath}", language="en", beam_size=1, best_of=1, vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500))

text_parts = []
for segment in segments:
    text_parts.append(segment.text.strip())

result = {
    "text": " ".join(text_parts),
    "duration": info.duration,
    "language": info.language,
}

with open("${outputPath}", "w") as f:
    json.dump(result, f)
`;
}

/**
 * Transcribe using faster-whisper (Python).
 */
async function transcribeFast(audioBuffer, userId) {
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const webmPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.webm`);
  const wavPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.wav`);
  const outputPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.json`);
  const scriptPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.py`);

  try {
    // Write WebM to temp file
    fs.writeFileSync(webmPath, audioBuffer);

    // Convert to 16kHz mono WAV
    execSync(`ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    // Get duration
    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${wavPath}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const duration = parseFloat(durationOutput.trim());

    console.log(`[Transcriber] Audio: ${Math.round(duration)}s, starting faster-whisper (${WHISPER_MODEL} model)...`);
    const startTime = Date.now();

    // Write and run Python script
    fs.writeFileSync(scriptPath, createTranscriptScript(wavPath, outputPath));

    // Timeout: 30s per minute of audio, minimum 60s
    const timeoutMs = Math.max(60000, Math.round(duration * 30) * 1000);

    await new Promise((resolve, reject) => {
      execFile('python3', [scriptPath], { timeout: timeoutMs, stdio: 'pipe' }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Transcriber] Transcription complete in ${elapsed}s (${Math.round(duration)}s audio → ${elapsed}s processing, ${(duration / elapsed).toFixed(1)}x realtime)`);

    // Read result
    const result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    return { text: result.text, duration: result.duration || duration };

  } finally {
    // ALWAYS delete all temp files
    [webmPath, wavPath, outputPath, scriptPath].forEach(f => {
      try { fs.unlinkSync(f); } catch {}
    });
  }
}

/**
 * Transcribe using whisper.cpp (fallback).
 */
async function transcribeWhisperCpp(audioBuffer, userId) {
  const WHISPER_PATH = '/opt/whisper.cpp/build/bin/whisper-cli';
  const WHISPER_MODEL_PATH = '/opt/whisper.cpp/models/ggml-small.bin';

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const webmPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.webm`);
  const wavPath = path.join(tmpDir, `gp-voice-${userId}-${ts}.wav`);
  const outputPath = path.join(tmpDir, `gp-voice-${userId}-${ts}`);

  try {
    fs.writeFileSync(webmPath, audioBuffer);
    execSync(`ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`, { timeout: 30000, stdio: 'pipe' });

    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${wavPath}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const duration = parseFloat(durationOutput.trim());

    console.log(`[Transcriber] Audio: ${Math.round(duration)}s, starting whisper.cpp (small model)...`);
    const startTime = Date.now();

    // Timeout: 60s per minute of audio, minimum 120s
    const timeoutMs = Math.max(120000, Math.round(duration * 60) * 1000);

    execSync(
      `${WHISPER_PATH} -m ${WHISPER_MODEL_PATH} -f "${wavPath}" -otxt -of "${outputPath}" --no-timestamps -l en`,
      { timeout: timeoutMs, stdio: 'pipe' }
    );

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Transcriber] whisper.cpp complete in ${elapsed}s`);

    const text = fs.readFileSync(`${outputPath}.txt`, 'utf-8').trim();
    return { text, duration };

  } finally {
    [webmPath, wavPath, `${outputPath}.txt`].forEach(f => {
      try { fs.unlinkSync(f); } catch {}
    });
  }
}

/**
 * Main transcribe function — picks the best available engine.
 */
async function transcribe(audioBuffer, userId) {
  if (useFasterWhisper) {
    return transcribeFast(audioBuffer, userId);
  }
  return transcribeWhisperCpp(audioBuffer, userId);
}

module.exports = { transcribe };
