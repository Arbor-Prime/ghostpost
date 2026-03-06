import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVoiceProfile, updateVoiceProfile, confirmVoiceProfile } from '../api';

const USER_ID = 1;

const SLIDER_DATA = [
  { left: 'Formal', right: 'Casual', key: 'formal', initial: 80 },
  { left: 'Reserved', right: 'Expressive', key: 'expressive', initial: 65 },
  { left: 'Cautious', right: 'Direct', key: 'direct', initial: 75 },
];

const TOPICS_LARGE = ['SaaS', 'AI Tools', 'Building Products'];
const TOPICS_MEDIUM = ['Design', 'Startups', 'Automation'];
const TOPICS_SMALL = ['Family', 'Late Nights'];

const SIGNATURE_WORDS = ['honestly', 'mate', 'ship it', 'solid', 'bang on', 'reckon'];
const ANTI_WORDS = ['synergy', 'leverage', 'circle back', 'deep dive'];

const EMOTIONS = [
  { label: 'Humour', value: 72, highlight: false },
  { label: 'Passion', value: 85, highlight: true },
  { label: 'Supportive', value: 60, highlight: false },
  { label: 'Sarcasm', value: 45, highlight: false },
  { label: 'Vulnerability', value: 30, highlight: false },
];

const FORMAT_ROWS = [
  { label: 'Line breaks', value: 'Frequent' },
  { label: 'Emojis', value: 'Moderate' },
  { label: 'Sentence length', value: 'Short to medium' },
  { label: 'Hashtags', value: 'Rarely' },
  { label: 'Swearing', value: 'Occasionally' },
  { label: 'Caps', value: 'For EMPHASIS' },
];

const OFF_LIMITS = ['Politics', 'Religion', 'Personal family', 'Health'];

const cardStyle = {
  background: '#1c1d23',
  border: '1px solid #2a2b32',
  borderRadius: 16,
  padding: 20,
};

const cardTitleRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 16,
};

const cardTitleText = {
  fontSize: 12,
  fontWeight: 700,
  color: '#ffffff',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontFamily: "'DM Sans', sans-serif",
};

const iconStyle = {
  color: '#9ca3af',
  fontSize: 14,
};

export default function VoiceProfile() {
  const navigate = useNavigate();
  const [sliders, setSliders] = useState({ formal: 80, expressive: 65, direct: 75 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    getVoiceProfile(USER_ID)
      .then((r) => {
        const vp = r.data?.voice_profile || r.data;
        setProfile(vp);
        if (vp?.tone_sliders) {
          setSliders({
            formal: vp.tone_sliders.formal ?? 80,
            expressive: vp.tone_sliders.expressive ?? 65,
            direct: vp.tone_sliders.direct ?? 75,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = () => {
    updateVoiceProfile(USER_ID, { tone_sliders: sliders })
      .then(() => confirmVoiceProfile(USER_ID))
      .then(() => navigate('/persona-schedule'))
      .catch(console.error);
  };

  const topics = profile?.topics || [...TOPICS_LARGE, ...TOPICS_MEDIUM, ...TOPICS_SMALL];
  const signature = profile?.signature_words || SIGNATURE_WORDS;
  const antiWords = profile?.anti_words || ANTI_WORDS;
  const emotions = profile?.emotional_range || null;

  const emotionData = emotions
    ? EMOTIONS.map((e) => ({ ...e, value: emotions[e.label.toLowerCase()] ?? e.value }))
    : EMOTIONS;

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#131316', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', position: 'relative', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 600, background: 'rgba(59,130,246,0.05)', borderRadius: '50%', filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'rgba(139,92,246,0.05)', borderRadius: '50%', filter: 'blur(100px)' }} />
      </div>

      {/* Ghost logo + GhostPost centred */}
      <header style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingTop: 48, paddingBottom: 24, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}>
            <i className="fa-solid fa-ghost" style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', fontFamily: "'DM Sans', sans-serif" }}>GhostPost</span>
        </div>
      </header>

      {/* Main content */}
      <main style={{ width: '100%', maxWidth: 640, padding: '0 24px', paddingBottom: 80, position: 'relative', zIndex: 10 }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#ffffff', textAlign: 'center', marginBottom: 32, fontFamily: "'DM Sans', sans-serif" }}>
          Here's what I learned about you.
        </h1>

        {/* 2-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>

          {/* Card 1: How You Talk */}
          <div style={cardStyle}>
            <div style={cardTitleRow}>
              <i className="fa-solid fa-microphone-lines" style={iconStyle} />
              <span style={cardTitleText}>How You Talk</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SLIDER_DATA.map((s) => (
                <div key={s.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>{s.left}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>{s.right}</span>
                  </div>
                  <div style={{ width: '100%', height: 8, background: '#2a2b32', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${sliders[s.key]}%`, height: '100%', background: '#3b82f6', borderRadius: 4, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #2a2b32' }}>
              <p style={{ fontSize: 13, color: '#ffffff', fontStyle: 'italic', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                "You're direct and casual, with natural warmth."
              </p>
            </div>
          </div>

          {/* Card 2: What You Talk About */}
          <div style={cardStyle}>
            <div style={cardTitleRow}>
              <i className="fa-solid fa-hashtag" style={iconStyle} />
              <span style={cardTitleText}>What You Talk About</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TOPICS_LARGE.map((t) => (
                <span key={t} style={{ padding: '6px 14px', background: '#2a2b32', color: '#ffffff', borderRadius: 20, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{t}</span>
              ))}
              {TOPICS_MEDIUM.map((t) => (
                <span key={t} style={{ padding: '5px 12px', background: '#2a2b32', color: '#9ca3af', borderRadius: 20, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{t}</span>
              ))}
              {TOPICS_SMALL.map((t) => (
                <span key={t} style={{ padding: '4px 10px', background: '#2a2b32', color: '#6b7280', borderRadius: 20, fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Card 3: Words You Reach For */}
          <div style={cardStyle}>
            <div style={cardTitleRow}>
              <i className="fa-solid fa-quote-left" style={iconStyle} />
              <span style={cardTitleText}>Words You Reach For</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {signature.map((w) => (
                <span key={w} style={{ padding: '3px 10px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 12, borderRadius: 6, border: '1px solid rgba(34,197,94,0.2)', fontFamily: "'DM Sans', sans-serif" }}>{w}</span>
              ))}
            </div>
            <div style={{ height: 1, background: '#2a2b32', marginBottom: 12 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {antiWords.map((w) => (
                <span key={w} style={{ padding: '3px 10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12, borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', textDecoration: 'line-through', fontFamily: "'DM Sans', sans-serif" }}>{w}</span>
              ))}
            </div>
          </div>

          {/* Card 4: Emotional Range */}
          <div style={cardStyle}>
            <div style={cardTitleRow}>
              <i className="fa-solid fa-heart-pulse" style={iconStyle} />
              <span style={cardTitleText}>Emotional Range</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {emotionData.map((e) => (
                <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 80, fontSize: 12, color: e.highlight ? '#ffffff' : '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>{e.label}</span>
                  <div style={{ flex: 1, height: 6, background: '#2a2b32', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${e.value}%`,
                      height: '100%',
                      background: '#8b5cf6',
                      borderRadius: 3,
                      boxShadow: e.highlight ? '0 0 12px rgba(139,92,246,0.5)' : 'none',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span className="font-mono" style={{ width: 32, textAlign: 'right', fontSize: 12, color: e.highlight ? '#ffffff' : '#9ca3af', fontFamily: "'JetBrains Mono', monospace" }}>{e.value}%</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #2a2b32' }}>
              <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                "You lead with passion and humour."
              </p>
            </div>
          </div>

          {/* Card 5: How You Format */}
          <div style={cardStyle}>
            <div style={cardTitleRow}>
              <i className="fa-solid fa-align-left" style={iconStyle} />
              <span style={cardTitleText}>How You Format</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FORMAT_ROWS.map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: '#ffffff', fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 6: Off Limits */}
          <div style={cardStyle}>
            <div style={cardTitleRow}>
              <i className="fa-solid fa-ban" style={{ color: '#ef4444', fontSize: 14 }} />
              <span style={cardTitleText}>Off Limits</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {OFF_LIMITS.map((item) => (
                <span key={item} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                  fontSize: 12,
                  borderRadius: 20,
                  border: '1px solid rgba(239,68,68,0.2)',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <i className="fa-solid fa-xmark" style={{ fontSize: 10 }} />
                  {item}
                </span>
              ))}
            </div>
            <button style={{
              width: '100%',
              padding: '8px 0',
              background: 'transparent',
              border: '1px dashed #2a2b32',
              borderRadius: 8,
              color: '#9ca3af',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              + Add boundary
            </button>
          </div>
        </div>

        {/* Summary text */}
        <p style={{ fontSize: 16, color: '#9ca3af', textAlign: 'center', marginBottom: 32, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
          You sound like a <strong style={{ color: '#ffffff', fontWeight: 700 }}>straight-talking British founder</strong> who builds things at night and cares about <strong style={{ color: '#ffffff', fontWeight: 700 }}>good design</strong>.
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          <button
            onClick={() => navigate('/recording')}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid #2a2b32',
              borderRadius: 12,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: "'DM Sans', sans-serif",
              transition: 'border-color 0.2s',
            }}
          >
            <i className="fa-solid fa-microphone" style={{ fontSize: 13 }} />
            Record more
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: '12px 32px',
              background: '#22c55e',
              border: 'none',
              borderRadius: 12,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: '0 0 20px rgba(34,197,94,0.3)',
              transition: 'background 0.2s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            That's me — continue
            <i className="fa-solid fa-arrow-right" style={{ fontSize: 12 }} />
          </button>
        </div>
      </main>
    </div>
  );
}
