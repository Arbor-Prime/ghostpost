import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getDrafts, getPostingStats, getObserverStats, getOpportunities, getPersona, getCircadian } from '../api';
import { useSocket } from '../contexts/SocketContext';

const USER_ID = 1;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getCurrentPersonaName(circadian) {
  if (!circadian || !Array.isArray(circadian)) return null;
  const hour = new Date().getHours();
  const entry = circadian.find(c => c.hour === hour);
  if (!entry) return null;
  const moodMap = {
    tired:   { name: 'Late Night Builder',  icon: 'fa-solid fa-code',     color: '#6366f1' },
    groggy:  { name: 'Early Bird',          icon: 'fa-solid fa-mug-hot',  color: '#f97316' },
    focused: { name: 'Deep Focus',          icon: 'fa-solid fa-briefcase',color: '#10b981' },
    relaxed: { name: 'Lunch Scroll',        icon: 'fa-solid fa-burger',   color: '#eab308' },
    playful: { name: 'Evening Wind-Down',   icon: 'fa-solid fa-couch',    color: '#8b5cf6' },
  };
  return { ...(moodMap[entry.mood] || moodMap.relaxed), energy: entry.energy, mood: entry.mood };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, connected } = useSocket() || {};

  const [drafts, setDrafts] = useState([]);
  const [stats, setStats] = useState(null);
  const [obsStats, setObsStats] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [persona, setPersona] = useState(null);
  const [circadian, setCircadian] = useState(null);
  const [flashTweets, setFlashTweets] = useState(false);
  const [flashCandidates, setFlashCandidates] = useState(false);
  const prevTweets = useRef(0);
  const prevCandidates = useRef(0);

  const loadData = () => {
    getDrafts(USER_ID).then(r => setDrafts(r.data || [])).catch(() => {});
    getPostingStats(USER_ID).then(r => setStats(r.data)).catch(() => {});
    getObserverStats().then(r => setObsStats(r.data)).catch(() => {});
    getOpportunities(USER_ID).then(r => setOpportunities(r.data || [])).catch(() => {});
    getPersona(USER_ID).then(r => setPersona(r.data)).catch(() => {});
    getCircadian(USER_ID).then(r => setCircadian(r.data?.curve || r.data)).catch(() => {});
  };

  useEffect(() => {
    loadData();
    // Polling fallback every 10s if socket disconnected
    const id = setInterval(() => {
      if (!connected) {
        getObserverStats().then(r => setObsStats(r.data)).catch(() => {});
        getDrafts(USER_ID).then(r => setDrafts(r.data || [])).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(id);
  }, [connected]);

  // React to socket events
  useEffect(() => {
    if (!events || events.length === 0) return;
    const latest = events[0];
    if (latest.type === 'scan:completed' || latest.type === 'scan:tweets_found') {
      getObserverStats().then(r => setObsStats(r.data)).catch(() => {});
      setFlashTweets(true);
      setTimeout(() => setFlashTweets(false), 600);
    }
    if (latest.type === 'opportunity:scored' || latest.type === 'draft:generated') {
      getOpportunities(USER_ID).then(r => setOpportunities(r.data || [])).catch(() => {});
      getDrafts(USER_ID).then(r => setDrafts(r.data || [])).catch(() => {});
      setFlashCandidates(true);
      setTimeout(() => setFlashCandidates(false), 600);
    }
  }, [events]);

  const pendingDrafts = drafts.filter(d => d.status === 'pending');
  const totalReplies = stats?.total_posted || 0;
  const tweetsScanned = Number(obsStats?.tweets_today) || 0;
  const sessionsToday = Number(obsStats?.sessions_today) || 0;
  const candidateCount = opportunities.length;
  const activePersona = getCurrentPersonaName(circadian);

  const chartData = circadian && Array.isArray(circadian)
    ? circadian.map(c => ({
        h: String(c.hour).padStart(2, '0'),
        energy: Math.round(c.energy * 100),
      }))
    : [];

  const topOpportunity = opportunities.length > 0
    ? opportunities.reduce((best, o) => (o.overall_score > (best?.overall_score || 0) ? o : best), null)
    : null;

  const statsCards = [
    { label: 'Posts Scanned',    value: tweetsScanned,       icon: 'fa-solid fa-eye',          color: 'var(--accent-blue)',   sub: `${sessionsToday} sessions today`, flash: flashTweets },
    { label: 'Candidates Found', value: candidateCount,      icon: 'fa-solid fa-bullseye',      color: 'var(--accent-purple)', sub: 'scored opportunities', flash: flashCandidates },
    { label: 'Pending Drafts',   value: pendingDrafts.length,icon: 'fa-solid fa-file-pen',      color: 'var(--accent-amber)',  sub: 'awaiting approval', flash: false },
    { label: 'Replies Posted',   value: totalReplies,        icon: 'fa-solid fa-paper-plane',   color: 'var(--accent-green)',  sub: totalReplies === 0 ? 'connect X to post' : 'lifetime', flash: false },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px 64px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Row 1: Stats Cards */}
        <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {statsCards.map(s => (
            <div key={s.label} className={`glass-card ${s.flash ? 'flash-value' : ''}`} style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>{s.label}</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `color-mix(in srgb, ${s.color} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={s.icon} style={{ color: s.color, fontSize: 14 }} />
                </div>
              </div>
              <div className="font-mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{s.value.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Row 2: Energy Chart + Active Persona */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          {/* Energy Chart */}
          <section className="glass-card" style={{ padding: 24, height: 300, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Circadian Energy Curve</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Your persona's energy throughout the day (hours 0–23)</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="h" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={3} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: 10, fontSize: 12, fontFamily: 'var(--font-sans)' }}
                      labelStyle={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                      formatter={(v) => [`${v}%`, 'Energy']}
                    />
                    <Area type="monotone" dataKey="energy" stroke="#3b82f6" strokeWidth={2.5} fill="url(#energyGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Loading circadian data...
                </div>
              )}
            </div>
          </section>

          {/* Active Persona */}
          <section className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div className="status-dot green pulse-dot" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Now</span>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{activePersona?.name || 'Loading...'}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{activePersona?.mood || '—'}</p>
              </div>
              {activePersona && (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${activePersona.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: activePersona.color, border: `1px solid ${activePersona.color}25`, fontSize: 17, flexShrink: 0 }}>
                  <i className={activePersona.icon} />
                </div>
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Energy Level</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {activePersona ? `${Math.round(activePersona.energy * 100)}%` : '—'}
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${activePersona ? activePersona.energy * 100 : 0}%`, borderRadius: 999, background: 'var(--gradient-brand)', transition: 'width 0.8s ease' }} />
                </div>
              </div>

              {persona?.persona && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px', paddingTop: 4 }}>
                  {[
                    { label: 'Chronotype',    value: persona.chronotype || '—', mono: false },
                    { label: 'Work Pattern',  value: (persona.work_pattern || '—').replace(/_/g, ' '), mono: false },
                    { label: 'Sessions/Day',  value: persona.persona.sessions_per_day?.mean || '—', mono: true },
                    { label: 'Typing Speed',  value: `${persona.persona.base_typing_wpm || '—'} WPM`, mono: true },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.label}</div>
                      <div className={item.mono ? 'font-mono' : ''} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Row 3: Pending Approvals + Live Scan */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Pending Approvals */}
          <section className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Pending Approvals</h3>
              <button
                onClick={() => navigate('/approvals')}
                style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                View all <span className="font-mono">({pendingDrafts.length})</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingDrafts.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                  <i className="fa-regular fa-circle-check" style={{ fontSize: 24, marginBottom: 8, display: 'block', color: 'var(--accent-green)' }} />
                  No pending drafts
                </div>
              ) : (
                pendingDrafts.slice(0, 4).map(draft => (
                  <div
                    key={draft.id}
                    onClick={() => navigate('/approvals')}
                    style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'border-color 0.15s ease' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                  >
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--gradient-brand)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>
                        {(draft.author_handle || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>@{draft.author_handle || 'unknown'}</span>
                          <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{timeAgo(draft.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                          {(draft.tweet_content || '').slice(0, 80)}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                          "{(draft.reply_text || '').slice(0, 80)}"
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Live Scan Stats */}
          <section className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-blue)', animation: 'pulse-dot 2s ease infinite', flexShrink: 0 }} />
              <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Live Scan Stats</h3>
              {!connected && (
                <span className="badge badge-grey" style={{ marginLeft: 'auto' }}>polling</span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Posts Scanned</div>
                <div className={`font-mono ${flashTweets ? 'flash-value' : ''}`} style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{tweetsScanned.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Candidates</div>
                <div className={`font-mono ${flashCandidates ? 'flash-value' : ''}`} style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{candidateCount.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Avg Session</div>
                <div className="font-mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {obsStats?.avg_duration_secs ? `${Math.round(Number(obsStats.avg_duration_secs))}s` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Sessions Today</div>
                <div className="font-mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {sessionsToday}
                </div>
              </div>
            </div>

            {topOpportunity && (
              <div style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <i className="fa-solid fa-bolt" style={{ color: 'var(--accent-blue)', fontSize: 11 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Top Opportunity</span>
                  <span className="font-mono" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {Math.round(topOpportunity.overall_score * 100)}%
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.5 }} className="line-clamp-2">
                  {topOpportunity.tweet_content}
                </p>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  @{topOpportunity.author_handle} · <span className="font-mono">{topOpportunity.likes_count?.toLocaleString()}</span> likes
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
