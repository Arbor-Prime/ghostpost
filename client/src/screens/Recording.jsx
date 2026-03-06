import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadVoice } from '../api';

const USER_ID = 1;

const PROMPTS = [
  'Tell me about yourself...',
  'What topics could you talk about for hours?',
  'How would your friends describe you?',
];

export default function Recording() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [promptIdx, setPromptIdx] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Rotate prompts with fade
  useEffect(() => {
    const t = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setPromptIdx((i) => (i + 1) % PROMPTS.length);
        setFadeIn(true);
      }, 400);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Timer
  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording, paused]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
      };
      recorder.start();
      mediaRecorderRef.current = { recorder, stream };
      setRecording(true);
      setSeconds(0);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, []);

  const stopRecording = () => {
    const ref = mediaRecorderRef.current;
    if (ref && ref.recorder.state !== 'inactive') {
      sessionStorage.setItem('ghostpost-recording-duration', String(seconds));

      // Wait for onstop, then upload
      ref.recorder.addEventListener('stop', async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        try {
          await uploadVoice(USER_ID, blob);
        } catch (err) {
          console.warn('[Recording] Upload failed, continuing to processing:', err.message);
        }
        navigate('/processing');
      }, { once: true });

      ref.recorder.stop();
    } else {
      navigate('/processing');
    }
    setRecording(false);
  };

  const togglePause = () => {
    const ref = mediaRecorderRef.current;
    if (!ref) return;
    if (paused) {
      ref.recorder.resume();
    } else {
      ref.recorder.pause();
    }
    setPaused(!paused);
  };

  // Auto-start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      const ref = mediaRecorderRef.current;
      if (ref && ref.recorder.state !== 'inactive') {
        ref.recorder.stop();
      }
    };
  }, [startRecording]);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const progress = Math.min(100, (seconds / 180) * 100);
  const inSweetSpot = seconds >= 60 && seconds <= 180;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logoCircle}>
            <i className="fa-solid fa-ghost" style={styles.logoIcon} />
          </div>
          <span style={styles.logoText}>GhostPost</span>
        </div>
      </header>

      {/* Main */}
      <main style={styles.main}>
        {/* Prompt */}
        <div style={styles.promptWrap}>
          <p
            style={{
              ...styles.prompt,
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          >
            {PROMPTS[promptIdx]}
          </p>
        </div>

        {/* Waveform */}
        <div style={styles.waveWrap}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={recording && !paused ? 'bar animate-wave' : ''}
              style={{
                width: 8,
                borderRadius: 4,
                background: 'linear-gradient(to top, var(--accent-blue), var(--accent-purple))',
                height: recording && !paused ? undefined : 12,
                minHeight: 6,
              }}
            />
          ))}
        </div>

        {/* Timer */}
        <div className="font-mono" style={styles.timerText}>
          {m}:{String(s).padStart(2, '0')}
        </div>

        {/* Progress Bar */}
        <div style={styles.progressWrap}>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            {/* Sweet spot zone: 1min–3min = 33.3%–100% */}
            <div style={styles.sweetSpotZone} />
          </div>
          <div style={styles.progressLabels}>
            <span className="font-mono" style={styles.progressLabel}>0:00</span>
            <span
              className="font-mono"
              style={{
                ...styles.progressLabel,
                ...(inSweetSpot ? { color: 'var(--success)', fontWeight: 700 } : {}),
              }}
            >
              Sweet Spot (1-3m)
            </span>
            <span className="font-mono" style={styles.progressLabel}>3:00+</span>
          </div>
        </div>

        {/* Recording status */}
        <div style={styles.statusBadge}>
          <div style={styles.dotWrap}>
            <span style={styles.pulsingDot} />
            <span style={styles.redDot} />
          </div>
          <span style={styles.statusText}>Recording...</span>
        </div>

        {/* Buttons */}
        <div style={styles.btnRow}>
          <button
            style={styles.pauseBtn}
            onClick={togglePause}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--text-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--bg-border)')}
          >
            <i className={`fa-solid ${paused ? 'fa-play' : 'fa-pause'}`} style={{ fontSize: 14 }} />
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            style={styles.doneBtn}
            onClick={stopRecording}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-blue-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-blue)')}
          >
            <div style={styles.stopSquare} />
            <span>I'm done</span>
          </button>
        </div>
      </main>
    </div>
  );
}

const styles = {
  page: {
    width: '100%',
    minHeight: '100vh',
    background: 'var(--bg-app)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'var(--font-sans)',
    position: 'relative',
  },
  header: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 24,
    position: 'relative',
    zIndex: 10,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(59,130,246,0.3)',
  },
  logoIcon: {
    color: 'var(--text-primary)',
    fontSize: 18,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  main: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 24px',
    position: 'relative',
    zIndex: 10,
  },
  promptWrap: {
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    width: '100%',
    textAlign: 'center',
  },
  prompt: {
    fontSize: 22,
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  waveWrap: {
    height: 128,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 40,
    width: '100%',
    padding: '0 32px',
  },
  timerText: {
    fontSize: '3.75rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
    letterSpacing: '0.05em',
    marginBottom: 16,
    fontVariantNumeric: 'tabular-nums',
  },
  progressWrap: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 40,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    background: 'var(--bg-border)',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    background: 'var(--accent-blue)',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  sweetSpotZone: {
    position: 'absolute',
    left: '33.3%',
    right: 0,
    top: 0,
    height: '100%',
    background: 'rgba(34, 197, 94, 0.15)',
    pointerEvents: 'none',
  },
  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(42,43,50,0.5)',
    padding: '8px 16px',
    borderRadius: 50,
    border: '1px solid var(--bg-border)',
    marginBottom: 48,
  },
  dotWrap: {
    position: 'relative',
    display: 'flex',
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsingDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'var(--error)',
    animation: 'pulseGlow 1.5s cubic-bezier(0,0,0.2,1) infinite',
  },
  redDot: {
    position: 'relative',
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'var(--error)',
  },
  statusText: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  btnRow: {
    display: 'flex',
    gap: 16,
    width: '100%',
    maxWidth: 400,
  },
  pauseBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid var(--bg-border)',
    color: 'var(--text-primary)',
    fontSize: 16,
    fontWeight: 600,
    padding: '14px 0',
    borderRadius: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'border-color 0.2s ease',
  },
  doneBtn: {
    flex: 1,
    background: 'var(--accent-blue)',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 16,
    fontWeight: 600,
    padding: '14px 0',
    borderRadius: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 0 20px rgba(59,130,246,0.2)',
    transition: 'background 0.2s ease',
  },
  stopSquare: {
    width: 10,
    height: 10,
    background: 'var(--text-primary)',
    borderRadius: 2,
  },
};
