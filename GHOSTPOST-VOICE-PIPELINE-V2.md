# GhostPost Voice Pipeline V2 — Definitive Architecture

## The Problem With V1

V1 only analyses TEXT. We throw away the audio after transcription. But 55% of communication is non-verbal — pitch, rhythm, pace, volume, pauses. When someone says "that's class" with rising pitch and emphasis, that's DIFFERENT from saying it flat and monotone. V1 treats them identically because it only sees the words.

The result: profiles feel like personality quizzes, not voice DNA.

---

## V2: Two-Track Analysis

V2 runs two parallel tracks on the same recording:

**Track 1: Acoustic (the audio itself)**
Extracts HOW they speak — pitch range, pace variation, rhythm patterns, emphasis habits, pause behaviour, volume dynamics.

**Track 2: Linguistic (the transcript)**
Extracts WHAT they say — vocabulary, sentence structure, topics, emotional triggers, formality, directness.

Both tracks feed into a unified Voice Profile that captures the complete communication fingerprint.

---

## The Optimal Open Source Stack

### Audio Processing Layer

| Component | Library | Purpose | Why This One |
|---|---|---|---|
| Silence removal | ffmpeg `silenceremove` | Strip dead air before transcription | Built into ffmpeg, no extra dependency |
| VAD (Voice Activity Detection) | Silero VAD | Detect speech vs non-speech segments | Built into faster-whisper, proven accuracy |
| Volume normalisation | ffmpeg `dynaudnorm` | Boost quiet speakers for better transcription | Single ffmpeg pass with silence removal |

### Transcription Layer

| Component | Library | Purpose | Why This One |
|---|---|---|---|
| Primary transcriber | `faster-whisper` (base model, int8) | Speech to text, fast | 5-10x faster than whisper.cpp on CPU, VAD built in |
| Filler detection | `faster-whisper` word-level timestamps | Mark filler positions in audio | Built into the transcription pass, no extra cost |
| Fallback transcriber | whisper.cpp (small model) | Backup if Python deps fail | Already installed on server |

### Acoustic Feature Extraction Layer

| Component | Library | Purpose | Why This One |
|---|---|---|---|
| Pitch analysis | `parselmouth` (Praat wrapper) | F0, pitch range, pitch variability, intonation | Gold standard in phonetics research, used in peer-reviewed studies |
| Rhythm / tempo | `librosa` | Speaking rate variation, rhythmic patterns | Best Python audio analysis library, excellent documentation |
| Voice quality | `parselmouth` | Jitter, shimmer, HNR (harmonics-to-noise ratio) | Clinical-grade voice quality metrics |
| Energy contour | `parselmouth` | Volume patterns, emphasis detection | Praat's intensity analysis is the research standard |
| MFCCs | `librosa` | Voice timbre fingerprint (13 coefficients) | The acoustic equivalent of a facial fingerprint |
| Spectral features | `librosa` | Spectral centroid, bandwidth, rolloff | Captures voice "brightness" and "warmth" |

### Linguistic Analysis Layer

| Component | Library | Purpose | Why This One |
|---|---|---|---|
| Tokenisation | `natural` (Node.js) | Word splitting, frequency analysis | Already in the codebase |
| TF-IDF | `natural` (Node.js) | Signature word detection | Already working |
| Sentence parsing | `compromise` (Node.js) | Sentence splitting, POS tagging | Already working |
| Filler stripping | Custom (Node.js) | Remove ums, keep personality markers | Built for GhostPost specifically |
| Semantic extraction | Ollama/Mistral | Topics, anti-words, emotional range, summary | Local LLM, no API costs |

### Personality Extraction Layer

| Component | Library | Purpose | Why This One |
|---|---|---|---|
| Big Five traits | `openSMILE` or custom | Map acoustic + linguistic features to personality | Research standard, used in the 2025 Nature paper |
| Communication style | Custom + Ollama | Formality, directness, expressiveness scoring | Combines acoustic evidence with linguistic analysis |

---

## Pipeline Architecture

```
Browser Microphone (WebM/Opus, 5-10 minutes)
    │
    ▼
UPLOAD (multer, 25MB limit, "Uploading..." on button)
    │
    ▼
┌─────────────────────────────────────────────────┐
│ STAGE 1: Audio Preparation (~2-3 seconds)       │
│                                                  │
│ ffmpeg: WebM → WAV 16kHz mono                   │
│ ffmpeg: silence removal (>0.5s below -35dB)     │
│ ffmpeg: volume normalisation                     │
│                                                  │
│ Output: clean.wav (typically 40-60% of original) │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌─────────────────────┐  ┌─────────────────────────┐
│ TRACK 1: ACOUSTIC   │  │ TRACK 2: LINGUISTIC     │
│ (runs in parallel)  │  │ (runs in sequence)       │
│                     │  │                          │
│ Python process:     │  │ 2a. faster-whisper       │
│                     │  │     transcribe           │
│ parselmouth:        │  │     (60-90s for 5min)    │
│ - F0 (pitch)        │  │                          │
│ - Pitch range       │  │ 2b. Filler stripper      │
│ - Pitch variability │  │     (strips ums/ahs)     │
│ - Jitter            │  │                          │
│ - Shimmer           │  │ 2c. NLP extraction       │
│ - HNR               │  │     (natural + compromise)│
│ - Intensity contour │  │                          │
│ - Formants          │  │ 2d. Ollama/Mistral       │
│                     │  │     semantic extraction   │
│ librosa:            │  │     (4 prompts, ~60s)    │
│ - MFCCs (13 coeff)  │  │                          │
│ - Speaking rate      │  │ Output:                  │
│ - Rhythm regularity │  │ - Signature words        │
│ - Spectral centroid │  │ - Anti-words             │
│ - Spectral rolloff  │  │ - Topics                 │
│ - Zero crossing rate│  │ - Emotional triggers     │
│                     │  │ - Formality score        │
│ Output:             │  │ - Directness score       │
│ - Acoustic profile  │  │ - Expressiveness score   │
│   (JSON blob)       │  │ - Summary quote          │
│                     │  │ - Sentence patterns      │
└────────┬────────────┘  └────────────┬─────────────┘
         │                            │
         └──────────┬─────────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│ STAGE 3: Profile Merge (~1 second)              │
│                                                  │
│ Combine acoustic + linguistic into unified       │
│ voice profile. Acoustic features VALIDATE and    │
│ ENRICH the linguistic analysis:                  │
│                                                  │
│ - High pitch variability + lots of intensifiers  │
│   → HIGH expressiveness (confirmed by both)      │
│                                                  │
│ - Monotone pitch + short sentences               │
│   → HIGH directness (deadpan communicator)       │
│                                                  │
│ - Fast tempo + frequent pauses                   │
│   → Bursty thinker (talks fast, stops to think)  │
│                                                  │
│ - Smooth pitch contour + long sentences          │
│   → Storyteller (measured, flowing delivery)     │
│                                                  │
│ Output: Complete Voice Profile (stored as JSONB) │
└──────────────────────┬──────────────────────────┘
                       ▼
              Database (users.voice_profile)
              Status → 'review'
```

---

## What V2 Captures That V1 Doesn't

### Acoustic Features (NEW in V2)

**Pitch Profile:**
- Mean F0 (fundamental frequency) — how deep/high their voice is
- F0 range — how much their pitch varies (monotone vs animated)
- F0 standard deviation — consistency of pitch variation
- Pitch contour pattern — do they end sentences going up (questions) or down (statements)?

**Rhythm Profile:**
- Speaking rate (syllables/second) — how fast they talk
- Rate variability — do they speed up when excited, slow down when thinking?
- Pause frequency — how often they pause
- Pause duration distribution — quick breath pauses vs long thinking pauses
- Rhythm regularity — machine-like consistency vs natural irregularity

**Voice Quality:**
- Jitter (pitch perturbation) — voice stability, confidence indicator
- Shimmer (amplitude perturbation) — voice smoothness
- HNR (harmonics-to-noise ratio) — voice clarity vs breathiness
- Spectral centroid — "brightness" of voice

**Energy Profile:**
- Mean intensity — how loud they naturally speak
- Intensity range — dynamic range (whisper to shout)
- Emphasis patterns — which types of words get emphasised

### What This Enables

**Better persona calibration:**
Someone with high pitch variability and fast speaking rate → their "Work Mode" persona should have more dynamic, energetic posts. V1 couldn't detect this from text alone.

**Cadence matching in replies:**
If the user naturally speaks in short bursts with pauses between thoughts, their generated replies should be short punchy sentences. If they flow in long continuous streams, replies should be longer and more flowing.

**Emotional state detection from voice check-ins (mobile app):**
When the user does their daily voice check-in ("hey, rough day today"), the acoustic features detect tiredness (lower pitch, less variation, slower rate) BEFORE the words are even transcribed. The system knows their mood from their VOICE, not just their words.

**Authenticity scoring:**
Compare the acoustic profile of the original recording against the generated text. If the text sounds like something the person would say based on their voice patterns, score it high. If it sounds too formal for someone with high expressiveness and fast tempo, flag it.

---

## Processing Time Targets

| Recording Length | V1 (current) | V2 (target) |
|---|---|---|
| 30 seconds | 30-90s | 20-40s |
| 2 minutes | 2-5 min | 45-90s |
| 5 minutes | 8-15 min | 90-120s |
| 10 minutes | 15-25 min | 2-3 min |

The acoustic track (parselmouth + librosa) runs in 5-15 seconds regardless of recording length — it's just signal processing, not neural network inference. It runs in PARALLEL with the linguistic track, so it adds zero time to the pipeline.

---

## Dependencies to Install

```bash
# Python audio analysis
pip install faster-whisper parselmouth librosa --break-system-packages

# Already available
# ffmpeg, Node.js, natural, compromise, Ollama/Mistral
```

Total new dependencies: 3 Python packages (~200MB including models).

---

## Acoustic Extractor (Python Script)

The acoustic analysis runs as a Python subprocess called from Node.js. It takes a WAV file path and returns a JSON blob.

```python
# /opt/ghostpost/src/services/voice/acoustic_extractor.py

import sys
import json
import numpy as np
import parselmouth
from parselmouth.praat import call
import librosa

def extract_acoustic_features(wav_path):
    """Extract comprehensive acoustic features from a WAV file."""
    
    # Load with parselmouth (Praat)
    sound = parselmouth.Sound(wav_path)
    duration = sound.get_total_duration()
    
    # === PITCH ===
    pitch = sound.to_pitch(time_step=0.01)
    f0_values = pitch.selected_array['frequency']
    f0_voiced = f0_values[f0_values > 0]  # Only voiced frames
    
    pitch_profile = {
        'mean_f0': float(np.mean(f0_voiced)) if len(f0_voiced) > 0 else 0,
        'median_f0': float(np.median(f0_voiced)) if len(f0_voiced) > 0 else 0,
        'f0_min': float(np.min(f0_voiced)) if len(f0_voiced) > 0 else 0,
        'f0_max': float(np.max(f0_voiced)) if len(f0_voiced) > 0 else 0,
        'f0_range': float(np.max(f0_voiced) - np.min(f0_voiced)) if len(f0_voiced) > 0 else 0,
        'f0_std': float(np.std(f0_voiced)) if len(f0_voiced) > 0 else 0,
        'pitch_variability': float(np.std(f0_voiced) / np.mean(f0_voiced)) if len(f0_voiced) > 0 and np.mean(f0_voiced) > 0 else 0,
        'voiced_fraction': float(len(f0_voiced) / len(f0_values)) if len(f0_values) > 0 else 0,
    }
    
    # === VOICE QUALITY ===
    point_process = call(sound, "To PointProcess (periodic, cc)", 75, 500)
    
    voice_quality = {
        'jitter': float(call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)),
        'shimmer': float(call([sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)),
        'hnr': float(call(sound, "Get harmonicity (cc)", 0.01, 75, 0.1, 1.0)),
    }
    
    # === INTENSITY (VOLUME) ===
    intensity = sound.to_intensity()
    intensity_values = intensity.values[0]
    
    energy_profile = {
        'mean_intensity': float(np.mean(intensity_values)),
        'intensity_range': float(np.max(intensity_values) - np.min(intensity_values)),
        'intensity_std': float(np.std(intensity_values)),
    }
    
    # === RHYTHM & TEMPO ===
    # Load with librosa for rhythm analysis
    y, sr = librosa.load(wav_path, sr=16000)
    
    # Speaking rate via onset detection (syllable-like events)
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=160)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=160)
    
    if len(onset_times) > 1:
        inter_onset = np.diff(onset_times)
        speaking_rate = float(len(onset_times) / duration)  # onsets per second
        rate_variability = float(np.std(inter_onset) / np.mean(inter_onset)) if np.mean(inter_onset) > 0 else 0
    else:
        speaking_rate = 0
        rate_variability = 0
    
    rhythm_profile = {
        'speaking_rate': speaking_rate,
        'rate_variability': rate_variability,
        'onset_count': len(onset_times),
    }
    
    # === SPECTRAL FEATURES (voice timbre) ===
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    
    timbre_profile = {
        'mfcc_means': [float(x) for x in np.mean(mfccs, axis=1)],
        'spectral_centroid_mean': float(np.mean(spectral_centroid)),
        'spectral_centroid_std': float(np.std(spectral_centroid)),
        'spectral_rolloff_mean': float(np.mean(spectral_rolloff)),
        'zero_crossing_rate': float(np.mean(zcr)),
    }
    
    # === PAUSE ANALYSIS ===
    # Use intensity to detect pauses (low energy segments)
    threshold = np.mean(intensity_values) - np.std(intensity_values)
    is_pause = intensity_values < threshold
    
    # Find pause durations
    pause_lengths = []
    in_pause = False
    pause_start = 0
    time_step = intensity.get_time_step()
    
    for i, p in enumerate(is_pause):
        if p and not in_pause:
            pause_start = i
            in_pause = True
        elif not p and in_pause:
            pause_dur = (i - pause_start) * time_step
            if pause_dur > 0.15:  # Only count pauses > 150ms
                pause_lengths.append(pause_dur)
            in_pause = False
    
    pause_profile = {
        'pause_count': len(pause_lengths),
        'pause_rate': float(len(pause_lengths) / duration) if duration > 0 else 0,
        'mean_pause_duration': float(np.mean(pause_lengths)) if pause_lengths else 0,
        'max_pause_duration': float(np.max(pause_lengths)) if pause_lengths else 0,
        'pause_variability': float(np.std(pause_lengths) / np.mean(pause_lengths)) if pause_lengths and np.mean(pause_lengths) > 0 else 0,
    }
    
    # === DERIVED COMMUNICATION INDICATORS ===
    # These map acoustic features to communication style dimensions
    
    # Expressiveness (0-1): high pitch variation + high intensity range + high rate variability
    expressiveness_acoustic = min(1.0, (
        pitch_profile['pitch_variability'] * 2 +
        (energy_profile['intensity_std'] / 15) +
        rhythm_profile['rate_variability'] * 0.5
    ) / 3)
    
    # Confidence (0-1): low jitter + high HNR + consistent pace
    confidence_acoustic = min(1.0, max(0, (
        (1 - voice_quality['jitter'] * 50) * 0.4 +
        min(1, voice_quality['hnr'] / 20) * 0.3 +
        (1 - min(1, rhythm_profile['rate_variability'])) * 0.3
    )))
    
    # Energy level (0-1): speaking rate + intensity
    energy_acoustic = min(1.0, (
        min(1, rhythm_profile['speaking_rate'] / 8) * 0.5 +
        min(1, energy_profile['mean_intensity'] / 80) * 0.5
    ))
    
    communication_indicators = {
        'expressiveness_acoustic': round(expressiveness_acoustic, 3),
        'confidence_acoustic': round(confidence_acoustic, 3),
        'energy_acoustic': round(energy_acoustic, 3),
    }
    
    return {
        'duration': duration,
        'pitch': pitch_profile,
        'voice_quality': voice_quality,
        'energy': energy_profile,
        'rhythm': rhythm_profile,
        'timbre': timbre_profile,
        'pauses': pause_profile,
        'communication': communication_indicators,
    }


if __name__ == '__main__':
    wav_path = sys.argv[1]
    result = extract_acoustic_features(wav_path)
    print(json.dumps(result))
```

---

## Profile Merge Logic

The merge combines acoustic and linguistic scores:

```javascript
// Expressiveness = average of acoustic and linguistic scores
// If acoustic says 0.8 and linguistic says 0.6, merged = 0.7
// But acoustic is weighted higher because it's harder to fake

const mergedProfile = {
  ...linguisticProfile,
  
  // Acoustic data (stored raw for future analysis)
  acoustic: acousticProfile,
  
  // Merged scores (acoustic weighted 60%, linguistic 40%)
  formality: round(linguistic.formality * 0.4 + (1 - acoustic.communication.energy_acoustic) * 0.6),
  directness: round(linguistic.directness * 0.4 + acoustic.communication.confidence_acoustic * 0.6),
  expressiveness: round(linguistic.expressiveness * 0.4 + acoustic.communication.expressiveness_acoustic * 0.6),
  
  // Acoustic-only features (V2 additions)
  pitch_variability: acoustic.pitch.pitch_variability,
  speaking_rate: acoustic.rhythm.speaking_rate,
  pause_behaviour: acoustic.pauses.pause_rate > 0.5 ? 'frequent_pauser' : 'continuous_speaker',
  voice_confidence: acoustic.communication.confidence_acoustic,
  voice_energy: acoustic.communication.energy_acoustic,
};
```

---

## Daily Voice Check-in (Mobile App Integration)

The V2 pipeline isn't just for onboarding. The mobile app's daily voice check-in runs a LIGHTWEIGHT version:

```
Hold orb → Talk for 30-60 seconds
    │
    ▼
FAST acoustic extraction only (5 seconds)
    │
    ├── Pitch: lower than baseline? → mood: low
    ├── Rate: faster than baseline? → mood: excited
    ├── Pauses: more than usual? → mood: thoughtful/tired
    ├── Intensity: louder than usual? → mood: energetic
    │
    ▼
Update today's emotional state modifier
    │
    ▼
Adjust circadian persona for rest of day
```

The mobile check-in doesn't need full transcription. Just 5 seconds of acoustic analysis against the user's BASELINE (from onboarding) tells the system their current mood. This feeds the emotional state layer that makes Sally's Tuesday post grumpier than her Thursday post.

---

## Implementation Priority

### Phase 1: Get V1 working properly (THIS SPRINT)
- Fix upload timing bug ✅
- Fix cookie secure flag
- Deploy faster-whisper + filler stripper + audio compression
- Test full onboarding flow end to end

### Phase 2: Add acoustic track (Sprint 23)
- Install parselmouth + librosa on server
- Create acoustic_extractor.py
- Update profile-builder.js to run acoustic extraction in parallel
- Add acoustic data to voice profile JSONB
- Update VoiceProfile screen to show acoustic insights

### Phase 3: Profile merge + validation (Sprint 24)
- Merge acoustic + linguistic scores
- A/B test merged profiles vs linguistic-only
- Adjust weighting based on real user feedback
- Add acoustic baseline comparison for daily check-ins

### Phase 4: Mobile voice check-ins (Sprint 25+)
- Lightweight acoustic-only pipeline for daily mood
- Compare against onboarding baseline
- Feed into emotional state layer
- Modulate circadian personas in real-time
