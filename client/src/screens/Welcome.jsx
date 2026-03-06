import React from 'react';
import { useNavigate } from 'react-router-dom';

const USER_ID = 1;

const listItems = [
  { title: 'What you do', desc: 'Your work, your side projects, or your craft.' },
  { title: 'What you care about', desc: 'Topics that get you excited or frustrated.' },
  { title: 'How you communicate', desc: 'Are you direct? Sarcastic? Enthusiastic?' },
];

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      {/* Background glows */}
      <div style={styles.glowTopRight} />
      <div style={styles.glowBottomLeft} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logoCircle}>
            <i className="fa-solid fa-ghost" style={styles.logoIcon} />
          </div>
          <span style={styles.logoText}>GhostPost</span>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Heading */}
        <h1 style={styles.h1}>
          Before we set anything up, I need to{' '}
          <span className="ghost-gradient-text">get to know you.</span>
        </h1>

        {/* Subtext */}
        <p style={styles.subtext}>
          GhostPost learns directly from your voice. I'll ask you to talk for about 2 minutes so I
          can analyze your tone, vocabulary, and personality.
        </p>

        {/* Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.micCircle}>
              <i className="fa-solid fa-microphone-lines" style={styles.micIcon} />
            </div>
            <span style={styles.cardTitle}>What we'll talk about</span>
          </div>

          <ul style={styles.list}>
            {listItems.map((item, i) => (
              <li key={i} style={styles.listItem}>
                <div style={styles.dotOuter}>
                  <div style={styles.bulletCircle} />
                </div>
                <div>
                  <span style={styles.itemTitle}>{item.title}</span>
                  <span style={styles.itemDesc}>{item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Button */}
        <button
          style={styles.button}
          onClick={() => navigate('/recording')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-blue-hover)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--accent-blue)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(59,130,246,0.2)';
          }}
        >
          <span>I'm ready</span>
          <i className="fa-solid fa-arrow-right" style={{ fontSize: 14 }} />
        </button>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <i className="fa-solid fa-lock" style={styles.lockIcon} />
        <span>Your recording stays on your machine and is never uploaded.</span>
      </footer>
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
    overflow: 'hidden',
  },
  glowTopRight: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'rgba(59,130,246,0.05)',
    filter: 'blur(100px)',
    pointerEvents: 'none',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -120,
    left: -120,
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'rgba(139,92,246,0.05)',
    filter: 'blur(100px)',
    pointerEvents: 'none',
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
    padding: '0 24px',
    position: 'relative',
    zIndex: 10,
  },
  h1: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
    lineHeight: 1.2,
    marginBottom: 16,
  },
  subtext: {
    fontSize: 18,
    color: 'var(--text-secondary)',
    textAlign: 'center',
    lineHeight: 1.6,
    marginBottom: 32,
    maxWidth: 480,
  },
  card: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
    borderRadius: 16,
    padding: 32,
    marginBottom: 32,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  micCircle: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'var(--bg-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  listItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
  },
  dotOuter: {
    marginTop: 6,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulletCircle: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'var(--accent-blue)',
    boxShadow: '0 0 8px rgba(59,130,246,0.3)',
  },
  itemTitle: {
    display: 'block',
    color: 'var(--text-primary)',
    fontWeight: 500,
    fontSize: 16,
    marginBottom: 4,
  },
  itemDesc: {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  button: {
    width: '100%',
    background: 'var(--accent-blue)',
    color: 'var(--text-primary)',
    fontSize: 18,
    fontWeight: 600,
    padding: '16px 0',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    boxShadow: '0 0 20px rgba(59,130,246,0.2)',
    transition: 'all 0.2s ease',
  },
  footer: {
    width: '100%',
    padding: '32px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 14,
    color: '#4b5563',
    position: 'relative',
    zIndex: 10,
  },
  lockIcon: {
    fontSize: 12,
    color: '#4b5563',
  },
};
