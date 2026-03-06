import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const USER_ID = 1;

const STEPS = [
  'Transcribing your voice',
  'Analysing vocabulary and patterns',
  'Identifying topics and interests',
  'Mapping communication style',
  'Reading emotional range',
  'Building your voice profile',
];

export default function Processing() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [visibleSteps, setVisibleSteps] = useState([]);

  // Progressively reveal and complete steps (~1s each over 6s total
  useEffect(() => {
    const timers = [];
    STEPS.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleSteps((prev) => [...prev, i]);
          setActiveStep(i);
        }, i * 1000)
      );
      timers.push(
        setTimeout(() => {
          setCompletedSteps((prev) => [...prev, i]);
          if (i < STEPS.length - 1) {
            setActiveStep(i + 1);
          }
        }, (i + 1) * 1000)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  // Progress bar: 0 -> 100% over 6 seconds
  useEffect(() => {
    const start = Date.now();
    const duration = 6000;
    let raf;
    const frame = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-navigate after completion
  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(() => navigate('/voice-profile'), 800);
      return () => clearTimeout(t);
    }
  }, [progress, navigate]);

  const getStepState = (i) => {
    if (completedSteps.includes(i)) return 'done';
    if (activeStep === i && visibleSteps.includes(i)) return 'active';
    return 'pending';
  };

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
        {/* Ghost icon with animated pulse ring */}
        <div className="animate-float" style={styles.ghostWrap}>
          <div className="animate-pulse-glow" style={styles.glowRing} />
          <div style={styles.ghostCircle}>
            <i className="fa-solid fa-ghost" style={styles.ghostIcon} />
          </div>
        </div>

        {/* Heading */}
        <h1 style={styles.heading}>Getting to know you...</h1>

        {/* Checklist */}
        <div style={styles.checklist}>
          {STEPS.map((text, i) => {
            const state = getStepState(i);
            const visible = visibleSteps.includes(i);
            return (
              <div
                key={i}
                style={{
                  ...styles.stepRow,
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(10px)',
                  transition: 'opacity 0.5s ease, transform 0.5s ease',
                }}
              >
                <div
                  style={{
                    ...styles.stepCircle,
                    ...(state === 'done'
                      ? { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' }
                      : state === 'active'
                      ? { borderColor: 'var(--accent-blue)' }
                      : { borderColor: 'var(--bg-border)' }),
                  }}
                >
                  {state === 'done' && (
                    <i
                      className="fa-solid fa-check"
                      style={{ fontSize: 11, color: 'var(--success)' }}
                    />
                  )}
                  {state === 'active' && (
                    <div className="animate-spin" style={styles.spinner} />
                  )}
                </div>
                <span
                  style={{
                    ...styles.stepText,
                    color:
                      state === 'done' || state === 'active'
                        ? 'var(--text-primary)'
                        : '#6b7280',
                    fontWeight: state === 'done' || state === 'active' ? 500 : 400,
                  }}
                >
                  {text}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={styles.progressWrap}>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progress}%`,
              }}
            />
          </div>
          <div style={styles.progressInfo}>
            <span style={styles.progressSubtext}>Processing audio data...</span>
            <span className="font-mono" style={styles.progressPct}>{progress}%</span>
          </div>
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
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 24px',
    position: 'relative',
    zIndex: 10,
  },
  ghostWrap: {
    position: 'relative',
    marginBottom: 32,
    width: 96,
    height: 96,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    inset: -8,
    borderRadius: '50%',
    background: 'rgba(59,130,246,0.2)',
    filter: 'blur(16px)',
  },
  ghostCircle: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 40px rgba(59,130,246,0.4)',
    position: 'relative',
    zIndex: 1,
  },
  ghostIcon: {
    color: 'var(--text-primary)',
    fontSize: 40,
  },
  heading: {
    fontSize: '1.875rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 40,
    textAlign: 'center',
    letterSpacing: '-0.01em',
  },
  checklist: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginBottom: 48,
    paddingLeft: 16,
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '1.5px solid var(--bg-border)',
    background: 'rgba(42,43,50,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid transparent',
    borderTopColor: 'var(--accent-blue)',
    borderRadius: '50%',
  },
  stepText: {
    fontSize: 18,
    transition: 'color 0.3s ease',
  },
  progressWrap: {
    width: '100%',
    maxWidth: 400,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    background: 'var(--bg-border)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(to right, var(--accent-blue), var(--accent-purple))',
    borderRadius: 2,
    transition: 'width 0.1s linear',
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressSubtext: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
  },
  progressPct: {
    fontSize: 12,
    color: 'var(--text-primary)',
  },
};
