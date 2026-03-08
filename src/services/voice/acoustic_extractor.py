"""
GhostPost Acoustic Feature Extractor

Extracts HOW someone speaks from their audio:
- Pitch (F0) profile: range, variability, contour
- Voice quality: jitter, shimmer, HNR
- Rhythm: speaking rate, pace variation, pauses
- Timbre: MFCCs, spectral features
- Communication indicators: expressiveness, confidence, energy

Uses parselmouth (Praat) for pitch/voice quality and librosa for rhythm/timbre.

Usage: python3 acoustic_extractor.py /path/to/audio.wav
Output: JSON to stdout
"""

import sys
import json
import numpy as np

def extract_acoustic_features(wav_path):
    import parselmouth
    from parselmouth.praat import call
    import librosa

    sound = parselmouth.Sound(wav_path)
    duration = sound.get_total_duration()

    # PITCH
    pitch = sound.to_pitch(time_step=0.01)
    f0_values = pitch.selected_array['frequency']
    f0_voiced = f0_values[f0_values > 0]

    pitch_profile = {}
    if len(f0_voiced) > 0:
        pitch_profile = {
            'mean_f0': round(float(np.mean(f0_voiced)), 1),
            'median_f0': round(float(np.median(f0_voiced)), 1),
            'f0_min': round(float(np.min(f0_voiced)), 1),
            'f0_max': round(float(np.max(f0_voiced)), 1),
            'f0_range': round(float(np.max(f0_voiced) - np.min(f0_voiced)), 1),
            'f0_std': round(float(np.std(f0_voiced)), 1),
            'pitch_variability': round(float(np.std(f0_voiced) / np.mean(f0_voiced)), 3),
            'voiced_fraction': round(float(len(f0_voiced) / len(f0_values)), 3),
        }
    else:
        pitch_profile = {'mean_f0': 0, 'pitch_variability': 0, 'voiced_fraction': 0}

    # VOICE QUALITY
    try:
        pp = call(sound, "To PointProcess (periodic, cc)", 75, 500)
        voice_quality = {
            'jitter': round(float(call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)), 5),
            'shimmer': round(float(call([sound, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)), 5),
            'hnr': round(float(call(sound, "Get harmonicity (cc)", 0.01, 75, 0.1, 1.0)), 2),
        }
    except Exception:
        voice_quality = {'jitter': 0, 'shimmer': 0, 'hnr': 0}

    # INTENSITY
    intensity = sound.to_intensity()
    iv = intensity.values[0]
    energy_profile = {
        'mean_intensity': round(float(np.mean(iv)), 1),
        'intensity_range': round(float(np.max(iv) - np.min(iv)), 1),
        'intensity_std': round(float(np.std(iv)), 1),
    }

    # RHYTHM (librosa)
    y, sr = librosa.load(wav_path, sr=16000)
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=160)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=160)

    if len(onset_times) > 1:
        inter_onset = np.diff(onset_times)
        speaking_rate = round(float(len(onset_times) / duration), 2)
        rate_variability = round(float(np.std(inter_onset) / np.mean(inter_onset)), 3) if np.mean(inter_onset) > 0 else 0
    else:
        speaking_rate = 0
        rate_variability = 0

    rhythm_profile = {
        'speaking_rate': speaking_rate,
        'rate_variability': rate_variability,
        'onset_count': len(onset_times),
    }

    # TIMBRE (MFCCs + spectral)
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    sc = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    sr_feat = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(y)[0]

    timbre_profile = {
        'mfcc_means': [round(float(x), 2) for x in np.mean(mfccs, axis=1)],
        'spectral_centroid_mean': round(float(np.mean(sc)), 1),
        'spectral_centroid_std': round(float(np.std(sc)), 1),
        'spectral_rolloff_mean': round(float(np.mean(sr_feat)), 1),
        'zero_crossing_rate': round(float(np.mean(zcr)), 4),
    }

    # PAUSE ANALYSIS
    threshold = np.mean(iv) - np.std(iv)
    is_pause = iv < threshold
    pause_lengths = []
    in_pause = False
    pause_start = 0
    ts = intensity.get_time_step()

    for i, p in enumerate(is_pause):
        if p and not in_pause:
            pause_start = i
            in_pause = True
        elif not p and in_pause:
            pd = (i - pause_start) * ts
            if pd > 0.15:
                pause_lengths.append(pd)
            in_pause = False

    pause_profile = {
        'pause_count': len(pause_lengths),
        'pause_rate': round(float(len(pause_lengths) / duration), 2) if duration > 0 else 0,
        'mean_pause_duration': round(float(np.mean(pause_lengths)), 3) if pause_lengths else 0,
        'max_pause_duration': round(float(np.max(pause_lengths)), 3) if pause_lengths else 0,
    }

    # COMMUNICATION INDICATORS
    pv = pitch_profile.get('pitch_variability', 0)
    expressiveness_acoustic = min(1.0, (pv * 2 + (energy_profile['intensity_std'] / 15) + rate_variability * 0.5) / 3)
    confidence_acoustic = min(1.0, max(0, (1 - voice_quality['jitter'] * 50) * 0.4 + min(1, voice_quality['hnr'] / 20) * 0.3 + (1 - min(1, rate_variability)) * 0.3))
    energy_acoustic = min(1.0, min(1, speaking_rate / 8) * 0.5 + min(1, energy_profile['mean_intensity'] / 80) * 0.5)

    return {
        'duration': round(duration, 1),
        'pitch': pitch_profile,
        'voice_quality': voice_quality,
        'energy': energy_profile,
        'rhythm': rhythm_profile,
        'timbre': timbre_profile,
        'pauses': pause_profile,
        'communication': {
            'expressiveness_acoustic': round(expressiveness_acoustic, 3),
            'confidence_acoustic': round(confidence_acoustic, 3),
            'energy_acoustic': round(energy_acoustic, 3),
        },
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python3 acoustic_extractor.py <wav_path>'}))
        sys.exit(1)
    try:
        result = extract_acoustic_features(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
