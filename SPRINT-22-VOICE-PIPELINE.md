# Sprint 22 — Voice Processing Pipeline Upgrade

## Server: 78.111.89.140 | SSH: root / IIi6gg4yHP6Fun7F
## Code: /opt/ghostpost/

---

## What This Sprint Does

Upgrades voice processing from 10+ minutes to under 2 minutes:

1. **faster-whisper** replaces whisper.cpp (5-10x faster on CPU)
2. **Filler stripper** removes ums, ahs, false starts while keeping personality
3. **Updated profile builder** uses clean transcript for NLP extraction

---

## Step 1: Install faster-whisper

```bash
pip install faster-whisper --break-system-packages
```

Verify:
```bash
python3 -c "from faster_whisper import WhisperModel; print('OK')"
```

The first run will download the `base` model (~150MB). This happens automatically.

---

## Step 2: Deploy New Files

Copy these 3 files to the server:

```
src/services/voice/transcriber-fast.js   (NEW — replaces transcriber.js)
src/services/voice/filler-stripper.js    (NEW)
src/services/voice/profile-builder.js    (UPDATED)
```

The profile-builder now requires `transcriber-fast` instead of `transcriber`:
```javascript
const { transcribe } = require('./transcriber-fast');  // was ./transcriber
const { stripFillers } = require('./filler-stripper');  // NEW
```

Keep the old `transcriber.js` as backup. `transcriber-fast.js` auto-detects faster-whisper and falls back to whisper.cpp if not installed.

---

## Step 3: Ensure ffmpeg is available

```bash
ffmpeg -version
```

If not installed:
```bash
apt-get install -y ffmpeg
```

---

## Step 4: Restart

```bash
cd /opt/ghostpost && npx pm2 restart ghostpost
```

Check logs:
```bash
npx pm2 logs ghostpost --lines 10 --nostream
```

Should see: `[Transcriber] Using faster-whisper (Python)`

---

## Step 5: Test

```bash
# Record a 30-second test clip
ffmpeg -f lavfi -i "sine=frequency=440:duration=5" -ar 16000 -ac 1 /tmp/test.wav -y

# Run faster-whisper directly
python3 -c "
from faster_whisper import WhisperModel
m = WhisperModel('base', device='cpu', compute_type='int8')
segs, info = m.transcribe('/tmp/test.wav', language='en')
for s in segs:
    print(s.text)
print(f'Duration: {info.duration}s')
"
```

Then test the full pipeline via the UI — create account, record voice, check that:
1. Upload completes (button says "Uploading...")
2. Processing screen shows
3. Voice profile page shows REAL data within 2 minutes

---

## Pipeline Overview

```
Browser microphone (WebM/Opus)
    ↓
Upload to /api/voice/upload (multer, 25MB limit)
    ↓
ffmpeg converts WebM → 16kHz mono WAV
    ↓
faster-whisper transcribes (base model, int8, VAD filter)
    → 5 min audio ≈ 60-90s processing
    ↓
Filler stripper removes ums, ahs, false starts
    → Typically removes 20-40% of words
    → Preserves personality markers (mate, honestly, class)
    ↓
NLP extractor runs on CLEAN text
    → TF-IDF signature words
    → Sentence structure analysis
    → Formality/directness/expressiveness scores
    ↓
Ollama/Mistral extracts:
    → Anti-words, topics, emotional range, summary quote
    ↓
Voice profile stored in users.voice_profile (JSONB)
Status set to 'review'
```

---

## Expected Processing Times (CPU, no GPU)

| Recording Length | whisper.cpp (old) | faster-whisper (new) | Filler Strip | NLP + Ollama | Total |
|---|---|---|---|---|---|
| 30 seconds | 30-60s | 5-10s | <1s | 30-60s | ~45-70s |
| 2 minutes | 2-4 min | 15-30s | <1s | 30-60s | ~60-90s |
| 5 minutes | 8-12 min | 60-90s | <1s | 30-60s | ~2-3 min |
| 10 minutes | 15-20 min | 2-3 min | <1s | 30-60s | ~3-4 min |

---

## Files Changed

| File | Change |
|---|---|
| `src/services/voice/transcriber-fast.js` | NEW — faster-whisper with whisper.cpp fallback |
| `src/services/voice/filler-stripper.js` | NEW — strips filler, keeps personality |
| `src/services/voice/profile-builder.js` | UPDATED — uses new transcriber + filler strip |
| `src/services/voice/transcriber.js` | UNCHANGED — kept as fallback reference |
