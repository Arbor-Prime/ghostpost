import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generatePersona } from '../api';

const USER_ID = 1;

const PERSONAS = [
  { name: 'Early Bird', time: '06:00–08:30', desc: 'Scrolling in bed', energy: 'Low', tone: 'Relaxed, Warm, Brief', color: '#f472b6', startHour: 6, endHour: 8.5 },
  { name: 'Morning Commute', time: '08:30–09:30', desc: 'On the train', energy: 'Medium', tone: 'Engaged, Catching up', color: '#3b82f6', startHour: 8.5, endHour: 9.5 },
  { name: 'Work Break', time: '10:00–12:00', desc: 'Between tasks', energy: 'Medium', tone: 'Direct, Efficient, Punchy', color: '#22c55e', startHour: 10, endHour: 12 },
  { name: 'Lunch Scroll', time: '12:00–13:30', desc: 'Eating, relaxed', energy: 'High', tone: 'Conversational, Anecdotal', color: '#eab308', startHour: 12, endHour: 13.5 },
  { name: 'Afternoon Lull', time: '14:00–17:00', desc: 'Post-lunch dip', energy: 'Low', tone: 'Reactive, Likes only', color: '#a855f7', startHour: 14, endHour: 17 },
  { name: 'School Run', time: '15:00–17:30', desc: 'Mostly offline', energy: 'None', tone: 'Brief if anything', color: '#64748b', startHour: 15, endHour: 17.5 },
  { name: 'Evening Wind-Down', time: '19:30–21:00', desc: 'Your time', energy: 'High', tone: 'Relaxed, Opinionated, Humour', color: '#f97316', startHour: 19.5, endHour: 21 },
  { name: 'Late Night Builder', time: '22:00–02:00', desc: 'Deep work', energy: 'Variable', tone: 'Sharp, Intense, Passionate', color: '#ef4444', startHour: 22, endHour: 26 },
];

const QUICK_ADJUST = [
  { label: "I work 9-5", icon: 'fa-solid fa-clock' },
  { label: "I'm a night owl", icon: 'fa-solid fa-moon' },
  { label: "I don't have kids", icon: 'fa-solid fa-ban' },
];

function timeToPercent(hour) {
  return Math.min(100, Math.max(0, (hour / 24) * 100));
}

const sleepStripeCSS = `
  .sleep-pattern {
    background: repeating-linear-gradient(
      -45deg,
      rgba(100, 116, 139, 0.15),
      rgba(100, 116, 139, 0.15) 4px,
      transparent 4px,
      transparent 8px
    );
  }
`;

export default function PersonaSchedule() {
  const navigate = useNavigate();
  const [enabledPersonas, setEnabledPersonas] = useState(
    PERSONAS.reduce((acc, p) => ({ ...acc, [p.name]: p.energy !== 'None' }), {})
  );
  const [selectedPills, setSelectedPills] = useState([]);
  const [loading, setLoading] = useState(false);

  const togglePersona = (name) => {
    setEnabledPersonas((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const togglePill = (label) => {
    setSelectedPills((prev) => prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]);
  };

  const handleContinue = () => {
    setLoading(true);
    generatePersona(USER_ID, {
      work_9to5: selectedPills.includes("I work 9-5"),
      night_owl: selectedPills.includes("I'm a night owl"),
    })
      .then(() => navigate('/x-auth'))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#131316', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', position: 'relative', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{sleepStripeCSS}</style>

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
      <main style={{ width: '100%', maxWidth: 680, padding: '0 24px', paddingBottom: 80, position: 'relative', zIndex: 10 }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#ffffff', textAlign: 'center', marginBottom: 32, fontFamily: "'DM Sans', sans-serif" }}>
          Now let's map your day.
        </h1>

        {/* Timeline bar */}
        <div style={{ marginBottom: 32 }}>
          {/* Time labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            {['00:00', '06:00', '12:00', '18:00', '24:00'].map((t) => (
              <span key={t} className="font-mono" style={{ fontSize: 10, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t}</span>
            ))}
          </div>
          {/* Bar */}
          <div style={{ width: '100%', height: 48, background: '#0f0f11', border: '1px solid #2a2b32', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
            {/* Sleep pattern 2AM–6AM */}
            <div
              className="sleep-pattern"
              style={{
                position: 'absolute',
                left: `${timeToPercent(2)}%`,
                width: `${timeToPercent(6) - timeToPercent(2)}%`,
                top: 0,
                bottom: 0,
                borderRadius: 4,
              }}
            />
            {/* Persona segments */}
            {PERSONAS.map((p) => {
              const startPct = timeToPercent(p.startHour);
              const endHourClamped = Math.min(p.endHour, 24);
              const widthPct = timeToPercent(endHourClamped) - startPct;
              return (
                <div
                  key={p.name}
                  style={{
                    position: 'absolute',
                    left: `${startPct}%`,
                    width: `${Math.max(widthPct, 1)}%`,
                    top: 6,
                    bottom: 6,
                    background: `${p.color}33`,
                    borderLeft: `2px solid ${p.color}`,
                    borderRadius: 4,
                  }}
                  title={`${p.name} ${p.time}`}
                />
              );
            })}
            {/* Wrap-around for Late Night Builder (00:00-02:00) */}
            {PERSONAS.filter((p) => p.endHour > 24).map((p) => (
              <div
                key={`${p.name}-wrap`}
                style={{
                  position: 'absolute',
                  left: 0,
                  width: `${timeToPercent(p.endHour - 24)}%`,
                  top: 6,
                  bottom: 6,
                  background: `${p.color}33`,
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>

        {/* Quick adjust pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
          {QUICK_ADJUST.map((pill) => {
            const active = selectedPills.includes(pill.label);
            return (
              <button
                key={pill.label}
                onClick={() => togglePill(pill.label)}
                style={{
                  padding: '8px 16px',
                  background: active ? 'rgba(59,130,246,0.15)' : '#1c1d23',
                  border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : '#2a2b32'}`,
                  borderRadius: 100,
                  color: active ? '#3b82f6' : '#9ca3af',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s',
                }}
              >
                <i className={pill.icon} style={{ fontSize: 11 }} />
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Persona cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
          {PERSONAS.map((p) => {
            const enabled = enabledPersonas[p.name];
            const isDisabled = p.energy === 'None';
            return (
              <div
                key={p.name}
                style={{
                  background: '#1c1d23',
                  border: '1px solid #2a2b32',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  opacity: isDisabled && !enabled ? 0.5 : 1,
                  transition: 'border-color 0.2s, opacity 0.2s',
                }}
              >
                {/* Left side */}
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                  {/* Colour dot with glow */}
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, boxShadow: `0 0 8px ${p.color}66`, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#ffffff', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{p.name}</span>
                      <span className="font-mono" style={{ fontSize: 12, color: '#9ca3af', background: '#2a2b32', borderRadius: 6, padding: '2px 8px', fontFamily: "'JetBrains Mono', monospace" }}>{p.time}</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#9ca3af', fontStyle: 'italic', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                      "{p.desc}"
                    </p>
                  </div>
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>{p.energy}</span>
                    {/* Toggle switch */}
                    <div
                      onClick={() => togglePersona(p.name)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: enabled ? '#22c55e' : '#2a2b32',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#ffffff',
                        position: 'absolute',
                        top: 2,
                        left: enabled ? 18 : 2,
                        transition: 'left 0.2s',
                      }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                    {p.tone.split(', ').map((t) => (
                      <span key={t} style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif" }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleContinue}
            disabled={loading}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '16px 32px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 12,
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: '0 0 20px rgba(59,130,246,0.2)',
              transition: 'background 0.2s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Continue to connect X
            <i className="fa-brands fa-x-twitter" style={{ fontSize: 16 }} />
          </button>
        </div>
      </main>
    </div>
  );
}
