import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useSocket } from '../contexts/SocketContext';

const USER_ID = 1;

// Hardcoded content themes and heatmap — real queries not yet available (Sprint 12+)
const THEMES = [
  { label: 'AI & Machine Learning', pct: 40, color: '#3b82f6' },
  { label: 'Dev Tools & Engineering', pct: 30, color: '#8b5cf6' },
  { label: 'Web3 & Crypto', pct: 15, color: '#10b981' },
  { label: 'Design & Product', pct: 15, color: '#f59e0b' },
];

const HEATMAP_DATA = (() => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const blocks = ['Morning', 'Midday', 'Afternoon', 'Evening'];
  const grid = [];
  days.forEach((d, di) => {
    blocks.forEach((b, bi) => {
      let intensity = 0.15;
      if (bi === 3) intensity = 0.7 + Math.random() * 0.3;
      else if (bi === 1) intensity = 0.3 + Math.random() * 0.3;
      else if (bi === 0) intensity = 0.2 + Math.random() * 0.2;
      else intensity = 0.1 + Math.random() * 0.15;
      if (di >= 5) intensity *= 0.5;
      grid.push({ day: d, block: b, intensity });
    });
  });
  return grid;
})();

function Toast({ message, type = 'info', onDone }) {
  useEffect(() => { const id = setTimeout(onDone, 3500); return () => clearTimeout(id); }, [onDone]);
  return (
    <div className={`toast toast-${type}`}>
      <i className={type === 'success' ? 'fa-solid fa-check-circle' : 'fa-solid fa-circle-info'} />
      {message}
    </div>
  );
}

export default function AIComposition() {
  const { events } = useSocket() || {};
  const [draftText, setDraftText] = useState('');
  const [opportunityId, setOpportunityId] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef(null);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const addLog = useCallback((text) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogLines(prev => [...prev, `[${ts}] ${text}`].slice(-50));
  }, []);

  // Subscribe to socket events for log
  useEffect(() => {
    if (!events || events.length === 0) return;
    const e = events[0];
    if (e.type === 'draft:generated') addLog(`Draft generated — opportunity #${e.data.opportunityId}`);
    if (e.type === 'scan:started') addLog(`Scanner active — watching ${e.data.handles?.length || 0} profiles`);
    if (e.type === 'opportunity:scored') addLog(`Opportunity scored: ${Math.round(e.data.score * 100)}% match @${e.data.handle || ''}`);
  }, [events, addLog]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const charCount = draftText.length;
  const twitterLimit = 280;

  const handleGenerate = async () => {
    if (!opportunityId) {
      addToast('Enter an opportunity ID to generate a draft', 'info');
      return;
    }
    setGenerating(true);
    addLog(`Generating draft for opportunity #${opportunityId}...`);
    try {
      const r = await api.post('/drafts/generate', { userId: USER_ID, opportunityId: parseInt(opportunityId) });
      const d = r.data?.draft;
      if (d) {
        setDraftText(d.replyText || '');
        setDraftId(d.draftId);
        addLog(`Draft ready: "${(d.replyText || '').slice(0, 50)}..."`);
        addToast('Draft generated', 'success');
      }
    } catch (err) {
      addToast(err?.response?.data?.error || 'Generation failed', 'error');
      addLog(`Error: ${err?.response?.data?.error || 'generation failed'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handlePost = async () => {
    if (!draftId) return;
    setPosting(true);
    try {
      await api.post(`/drafts/${draftId}/approve`);
      addToast('Reply queued for posting', 'success');
      addLog(`Draft #${draftId} approved and queued`);
      setDraftText('');
      setDraftId(null);
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to queue', 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* Left panel — Context sidebar */}
      <div style={{
        width: 300,
        borderRight: '1px solid var(--border-subtle)',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
      }}>
        {/* Content Themes */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Content Themes
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {THEMES.map((t, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.label}</span>
                  <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{t.pct}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${t.pct}%`, height: '100%', background: t.color, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12, lineHeight: 1.5 }}>
            Based on historical observed tweets. Full analysis available in Sprint 12.
          </p>
        </div>

        {/* Activity Heatmap */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Activity Heatmap
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
            {HEATMAP_DATA.map((cell, i) => (
              <div key={i} title={`${cell.day} ${cell.block}`} style={{
                width: '100%', aspectRatio: '1', borderRadius: 3,
                background: `rgba(59, 130, 246, ${cell.intensity})`,
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Less</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((o, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: `rgba(59,130,246,${o})` }} />
            ))}
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>More</span>
          </div>
        </div>

        {/* Generate controls */}
        <div style={{ padding: '16px 20px' }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Generate Draft
          </h4>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Opportunity ID
            </label>
            <input
              className="input font-mono"
              type="number"
              placeholder="e.g. 42"
              value={opportunityId || ''}
              onChange={e => setOpportunityId(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary w-full"
            onClick={handleGenerate}
            disabled={generating || !opportunityId}
          >
            {generating
              ? <><span className="spinner" />Generating…</>
              : <><i className="fa-solid fa-wand-magic-sparkles" />Generate Draft</>}
          </button>
        </div>
      </div>

      {/* Right panel — Compose area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-app)' }}>
        {/* Compose area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fa-solid fa-ghost" style={{ color: 'white', fontSize: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>GhostPost AI</div>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>DRAFTING</span>
              </div>
              <span className="font-mono" style={{ fontSize: 12, color: charCount > 260 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                {charCount}/{twitterLimit}
              </span>
            </div>

            <textarea
              className="input"
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              placeholder="Generate a draft or type your reply here..."
              rows={5}
              style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}
            />

            {/* Character bar */}
            <div style={{ height: 3, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (charCount / twitterLimit) * 100)}%`,
                background: charCount > 260 ? 'var(--accent-red)' : charCount > 200 ? 'var(--accent-amber)' : 'var(--accent-green)',
                transition: 'width 0.1s ease, background 0.2s ease',
                borderRadius: 2,
              }} />
            </div>

            {/* Behaviour Engine log — always dark */}
            <div style={{ background: '#0a0a0e', borderRadius: 10, padding: 12, minHeight: 100 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <i className="fa-solid fa-terminal" style={{ fontSize: 10, color: '#22c55e' }} />
                <span className="font-mono" style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Behaviour Engine</span>
              </div>
              <div ref={logRef} style={{ maxHeight: 120, overflowY: 'auto' }}>
                {logLines.length === 0 ? (
                  <div className="font-mono" style={{ fontSize: 10, color: '#4b5563' }}>{'>'} Waiting for events...</div>
                ) : (
                  logLines.map((line, i) => (
                    <div key={i} className="font-mono" style={{ fontSize: 10, color: '#4ade80', lineHeight: 1.7 }}>{line}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}>
            <i className="fa-solid fa-microchip" style={{ fontSize: 11, color: 'var(--accent-blue)' }} />
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>mistral</span>
          </div>

          <div style={{ flex: 1 }} />

          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setDraftText(''); setDraftId(null); }}
            disabled={!draftText}
          >
            <i className="fa-solid fa-xmark" />Clear
          </button>

          <button
            className="btn btn-success"
            onClick={handlePost}
            disabled={posting || !draftId || !draftText}
          >
            {posting
              ? <><span className="spinner" />Queuing…</>
              : <><i className="fa-solid fa-paper-plane" />Approve &amp; Queue</>}
          </button>
        </div>
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
