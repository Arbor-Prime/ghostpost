import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPersona, getCircadian, getSchedule } from '../api';

const USER_ID = 1;

const MOOD_CONFIG = {
  tired:   { name: 'Late Night Builder', icon: 'fa-solid fa-code',         color: '#6366f1', desc: 'Deep work mode, shipping and talking shop' },
  groggy:  { name: 'Early Bird',         icon: 'fa-solid fa-mug-hot',      color: '#f97316', desc: 'Scrolling in bed, half-awake thoughts' },
  focused: { name: 'Deep Focus',         icon: 'fa-solid fa-briefcase',    color: '#10b981', desc: 'Productive hours, sharp and direct' },
  relaxed: { name: 'Lunch Scroll',       icon: 'fa-solid fa-burger',       color: '#eab308', desc: 'Casual browsing, easy engagement' },
  playful: { name: 'Evening Wind-Down',  icon: 'fa-solid fa-couch',        color: '#8b5cf6', desc: 'Your time — relaxed, opinionated, humour' },
};

function buildPersonaBlocks(circadian) {
  if (!circadian || !Array.isArray(circadian) || circadian.length === 0) return [];
  const blocks = [];
  let currentMood = null;
  let startHour = 0;

  circadian.forEach((entry, i) => {
    if (entry.mood !== currentMood) {
      if (currentMood !== null) {
        blocks.push({ mood: currentMood, startHour, endHour: entry.hour, entries: circadian.slice(startHour, entry.hour) });
      }
      currentMood = entry.mood;
      startHour = entry.hour;
    }
    if (i === circadian.length - 1) {
      blocks.push({ mood: currentMood, startHour, endHour: entry.hour + 1, entries: circadian.slice(startHour) });
    }
  });

  return blocks.filter(b => b.mood).map(b => {
    const cfg = MOOD_CONFIG[b.mood] || MOOD_CONFIG.relaxed;
    const avgEnergy = b.entries.reduce((sum, e) => sum + (e.energy || 0), 0) / (b.entries.length || 1);
    return {
      ...cfg,
      mood: b.mood,
      time: `${String(b.startHour).padStart(2, '0')}:00–${String(b.endHour).padStart(2, '0')}:00`,
      startHour: b.startHour,
      endHour: b.endHour,
      energyPct: Math.round(avgEnergy * 100),
      energyLabel: avgEnergy > 0.6 ? 'High' : avgEnergy > 0.3 ? 'Medium' : 'Low',
      emojiBoost: b.entries.reduce((sum, e) => sum + (e.emoji_boost || 0), 0) / (b.entries.length || 1),
      lengthMod: b.entries.reduce((sum, e) => sum + (e.length_modifier || 0), 0) / (b.entries.length || 1),
    };
  });
}

export default function Personas() {
  const navigate = useNavigate();
  const [persona, setPersona] = useState(null);
  const [circadian, setCircadian] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    Promise.all([
      getPersona(USER_ID).then(r => setPersona(r.data)).catch(() => {}),
      getCircadian(USER_ID).then(r => setCircadian(r.data?.curve || r.data)).catch(() => {}),
      getSchedule(USER_ID).then(r => setSchedule(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(
      new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    ), 1000);
    return () => clearInterval(t);
  }, []);

  const blocks = buildPersonaBlocks(circadian);
  const currentHour = new Date().getHours();

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px 64px' }}>

      {/* Info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Current Time</span>
          <span className="font-mono" style={{ fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-card)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            {time}
          </span>
        </div>
        {persona?.persona?.chronotype && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Chronotype: <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{persona.chronotype}</strong>
          </div>
        )}
        {schedule && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Today:</span>
            <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{schedule.total_sessions}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>sessions ·</span>
            <span className="font-mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{schedule.total_active_minutes}m</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>active</span>
            {schedule.is_zero_day && <span className="badge badge-red">ZERO DAY</span>}
          </div>
        )}
        <button className="btn btn-sm btn-outline" onClick={() => navigate('/settings')}>
          <i className="fa-solid fa-gear" />Configure
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)' }}>
          <div className="spinner spinner-dark" style={{ margin: '0 auto 12px' }} />
          Loading persona data...
        </div>
      ) : blocks.length === 0 ? (
        <div className="glass-card" style={{ padding: 64, textAlign: 'center' }}>
          <i className="fa-solid fa-masks-theater" style={{ fontSize: 36, color: 'var(--text-dim)', marginBottom: 16, display: 'block' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No Persona Data</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Generate a persona first via the onboarding flow.</p>
        </div>
      ) : (
        <>
          {/* Persona summary stats */}
          {persona?.persona && (
            <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Formality',     value: `${Math.round((persona.persona.formality || 0) * 10)}/10` },
                { label: 'Directness',    value: `${Math.round((persona.persona.directness || 0) * 10)}/10` },
                { label: 'Emoji Rate',    value: `${Math.round((persona.persona.emoji_rate || 0) * 100)}%` },
                { label: 'Typing WPM',   value: persona.persona.base_typing_wpm || '—' },
                { label: 'Scroll-Only',  value: `${Math.round((persona.persona.scroll_only_ratio || 0) * 100)}%` },
                { label: 'Weekend Drop', value: `${Math.round((persona.persona.weekend_reduction || 0) * 100)}%` },
              ].map(s => (
                <div key={s.label} className="glass-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                  <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Persona Cards */}
          <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {blocks.map((p, i) => {
              const isActive = currentHour >= p.startHour && currentHour < p.endHour;
              const isDimmed = p.energyPct < 10;

              return (
                <div
                  key={i}
                  className={`glass-card ${isActive ? 'active' : ''}`}
                  style={{
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: isDimmed ? 0.45 : 1,
                    position: 'relative',
                    minHeight: 260,
                  }}
                >
                  {isActive && (
                    <div style={{ position: 'absolute', top: 12, right: 12 }}>
                      <span className="badge badge-green" style={{ animation: 'pulse-dot 2s ease infinite' }}>
                        <div className="status-dot green" style={{ width: 6, height: 6 }} />
                        ACTIVE
                      </span>
                    </div>
                  )}

                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${p.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, flexShrink: 0 }}>
                    <i className={p.icon} style={{ color: p.color, fontSize: 18 }} />
                  </div>

                  <span className="font-mono" style={{ fontSize: 11, color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
                    {p.time}
                  </span>

                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{p.name}</h3>

                  {isActive && (
                    <span style={{ fontSize: 10, color: 'var(--accent-blue)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                      Current Active Tone
                    </span>
                  )}

                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>{p.desc}</p>

                  {/* Energy bar */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Energy</span>
                      <span className="font-mono" style={{ fontSize: 11, color: p.color, fontWeight: 600 }}>
                        {p.energyLabel} <span>{p.energyPct}%</span>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 4, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${p.energyPct}%`, height: '100%', borderRadius: 4, background: p.color, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
                    <span>Emoji: <span className="font-mono">{Math.round(p.emojiBoost * 100)}%</span></span>
                    <span>Length: <span className="font-mono">{p.lengthMod.toFixed(1)}x</span></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today's scheduled sessions */}
          {schedule?.sessions && schedule.sessions.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Today's Scheduled Sessions</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {schedule.sessions.map((s, i) => {
                  const isPast = s.hour < currentHour || (s.hour === currentHour && s.minute < new Date().getMinutes());
                  return (
                    <div
                      key={i}
                      className="glass-card"
                      style={{
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        borderColor: isPast ? 'rgba(34,197,94,0.25)' : 'var(--border-card)',
                        background: isPast ? 'rgba(34,197,94,0.06)' : 'var(--bg-card)',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: isPast ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                        {String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.type?.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.device}</span>
                      <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{s.duration_min}m</span>
                      {isPast && <i className="fa-solid fa-check" style={{ fontSize: 10, color: 'var(--accent-green)' }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
