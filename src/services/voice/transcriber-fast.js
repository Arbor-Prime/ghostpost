/**
 * Fast Voice Transcriber
 * 
 * Pipeline: Browser WebM → Audio Compressor (silence removal) → Whisper
 * 
 * The audio compressor strips dead air BEFORE Whisper sees it.
 * A 10-minute recording with 40% silence becomes 6 minutes.
 * Whisper processes 6 minutes instead of 10. Direct speed win.
 * 
 * Engine priority:
 * 1. faster-whisper (Python, CTranslate2) — 5-10x faster than whisper.cpp
 * 2. whisper.cpp (C++) — fallback if Python not available
 */

const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { compressAudio, cleanupWav } = require('./audio-compressor');

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';

// Detect engine on startup
let useFasterWhisper = false;
try {
  execSync('python3 -c "import faster_whisper"', { timeout: 5000, stdio: 'pipe' });
  useFasterWhisper = true;
  console.log('[Transcriber] Engine: faster-whisper (Python)');
} catch {
  console.log('[Transcriber] Engine: whisper.cpp (fallback)');
}

/**
 * Main transcribe function.
 * 
 * 1. Compress audio (silence removal + normalisation)
 * 2. Transcribe with best available engine
 * 3. Return text + timing stats
 */
async function transcribe(audioBuffer, userId) {
  // Step 1: Compress
  const { wavPath, originalDuration, compressedDuration, compressionRatio } = compressAudio(audioBuffer, userId);

  try {
    // Step 2: Transcribe
    console.log(`[Transcriber] Transcribing ${Math.round(compressedDuration)}s of speech (${compressionRatio}% silence removed)...`);
    const startTime = Date.now();

    let text;
    if (useFasterWhisper) {
      text = await transcribeFasterWhisper(wavPath, compressedDuration);
    } else {
      text = await transcribeWhisperCpp(wavPath, compressedDuration);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    console.log(
      `[Transcriber] Done: ${wordCount} words in ${elapsed}s ` +
      `(${Math.round(compressedDuration)}s audio, ${(compressedDuration / Math.max(1, elapsed)).toFixed(1)}x realtime)`
    );

    return { text, duration: originalDuration };

  } finally {
    cleanupWav(wavPath);
  }
}

/**
 * faster-whisper engine (Python).
 */
async function transcribeFasterWhisper(wavPath, duration) {
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `gp-fw-${Date.now()}.json`);
  const scriptPath = path.join(tmpDir, `gp-fw-${Date.now()}.py`);

  const script = `
import json
from faster_whisper import WhisperModel

model = WhisperModel("${WHISPER_MODEL}", device="cpu", compute_type="int8")
segments, info = model.transcribe("${wavPath}", language="en", beam_size=1, best_of=1, vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500))

text_parts = []
for segment in segments:
    text_parts.append(segment.text.strip())

with open("${outputPath}", "w") as f:
    json.dump({"text": " ".join(text_parts)}, f)
`;

  fs.writeFileSync(scriptPath, script);

  try {
    const timeoutMs = Math.max(60000, Math.round(duration * 30) * 1000);
    await new Promise((resolve, reject) => {
      execFile('python3', [scriptPath], { timeout: timeoutMs, stdio: 'pipe' }, (err) => {
        if (err) reject(err); else resolve(undefined);
      });
    });

    const result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    return result.text || '';
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

/**
 * whisper.cpp engine (fallback).
 */
async function transcribeWhisperCpp(wavPath, duration) {
  const WHISPER_PATH = '/opt/whisper.cpp/build/bin/whisper-cli';
  const WHISPER_MODEL_PATH = '/opt/whisper.cpp/models/ggml-small.bin';
  const outputPath = wavPath.replace('.wav', '');

  const timeoutMs = Math.max(120000, Math.round(duration * 60) * 1000);

  execSync(
    `${WHISPER_PATH} -m ${WHISPER_MODEL_PATH} -f "${wavPath}" -otxt -of "${outputPath}" --no-timestamps -l en`,
    { timeout: timeoutMs, stdio: 'pipe' }
  );

  const text = fs.readFileSync(`${outputPath}.txt`, 'utf-8').trim();
  try { fs.unlinkSync(`${outputPath}.txt`); } catch {}
  return text;
}

module.exports = { transcribe };
