import React, { useState, useEffect, useCallback } from 'react';
import { getDrafts, approveDraft, rejectDraft, editDraft, regenerateDraft } from '../api';
import { useSocket } from '../contexts/SocketContext';

const USER_ID = 1;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const formatNum = (num) => {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
};

function Toast({ message, type = 'info', onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div className={`toast toast-${type}`}>
      <i className={type === 'success' ? 'fa-solid fa-check-circle' : type === 'error' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-info'} />
      {message}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Confirm</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={onConfirm} style={{ background: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: 'var(--radius-button)', padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftCard({ draft, onApprove, onReject, onEdit, onRegenerate }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(draft.reply_text || '');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [visible, setVisible] = useState(true);

  const charCount = editText.length;
  const twitterLimit = 280;
  const handle = draft.author_handle || 'unknown';
  const initials = handle.slice(0, 2).toUpperCase();
  const matchScore = draft.overall_score ? Math.round(draft.overall_score * 100) : null;
  const toneMatch = draft.tone_score ? Math.round(draft.tone_score * 100) : (matchScore ? Math.min(matchScore + 3, 99) : null);
  const relevanceScore = draft.relevance_score ? Math.round(draft.relevance_score * 100) : (matchScore ? Math.min(matchScore - 2, 99) : null);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove(draft.id);
      setFlash('green');
      setTimeout(() => setVisible(false), 600);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await onReject(draft.id);
      setFlash('red');
      setTimeout(() => setVisible(false), 600);
    } finally {
      setRejecting(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await onEdit(draft.id, editText);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const newDraft = await onRegenerate(draft.id);
      if (newDraft?.replyText) setEditText(newDraft.replyText);
    } finally {
      setRegenerating(false);
    }
  };

  if (!visible) return null;

  return (
    <article
      className={`glass-card ${flash === 'green' ? 'flash-green' : flash === 'red' ? 'flash-red' : ''}`}
      style={{ borderRadius: 16, padding: 24, transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)' }}
    >
      {/* Top: Original Tweet Context */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: 'white',
          border: '1px solid rgba(0,0,0,0.04)',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Author line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              {draft.author_display_name || handle}
            </span>
            <a
              href={`https://x.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => { e.target.style.color = 'var(--accent-blue)'; e.target.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.target.style.color = 'var(--text-secondary)'; e.target.style.textDecoration = 'none'; }}
            >
              @{handle}
            </a>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>·</span>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{timeAgo(draft.created_at)}</span>
          </div>

          {/* Tweet text */}
          <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 12 }}>
            {draft.tweet_content || '—'}
          </p>

          {/* Tags & engagement row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {draft.response_type && (
                <span style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: 'rgba(59,130,246,0.06)', color: 'var(--accent-blue)',
                  border: '1px solid rgba(59,130,246,0.1)', textTransform: 'capitalize',
                }}>{draft.response_type}</span>
              )}
              {draft.circadian_mood && (
                <span style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: 'rgba(139,92,246,0.06)', color: 'var(--accent-purple)',
                  border: '1px solid rgba(139,92,246,0.1)', textTransform: 'capitalize',
                }}>{draft.circadian_mood}</span>
              )}
            </div>
            <div className="font-mono" style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
              {[
                { icon: 'fa-regular fa-comment', value: draft.replies_count },
                { icon: 'fa-solid fa-retweet', value: draft.retweets_count },
                { icon: 'fa-regular fa-heart', value: draft.likes_count },
                { icon: 'fa-solid fa-chart-simple', value: draft.views_count },
              ].map((m, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className={m.icon} style={{ fontSize: 11 }} />
                  {formatNum(m.value)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Middle: AI Draft with purple left border */}
      <div style={{
        paddingLeft: 20, borderLeft: '3px solid var(--accent-purple)', marginBottom: 24,
      }}>
        {/* Persona & match badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {draft.circadian_mood && (
            <span style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: 'rgba(139,92,246,0.08)', color: 'var(--accent-purple)',
              border: '1px solid rgba(139,92,246,0.15)',
              boxShadow: '0 0 10px rgba(139,92,246,0.2)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <i className="fa-solid fa-wind" style={{ fontSize: 10 }} />
              {draft.circadian_mood}
            </span>
          )}
          {matchScore && (
            <span className="font-mono" style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: matchScore >= 80 ? 'rgba(34,197,94,0.06)' : 'rgba(234,179,8,0.06)',
              color: matchScore >= 80 ? 'var(--accent-green)' : 'var(--accent-amber)',
              border: `1px solid ${matchScore >= 80 ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)'}`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <i className="fa-solid fa-bolt" style={{ fontSize: 10 }} />
              {matchScore}% Match
            </span>
          )}
        </div>

        {/* Draft text area */}
        <div style={{
          background: 'rgba(243,244,246,0.5)', border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: 14, padding: 16, position: 'relative',
        }}>
          {editing ? (
            <>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 15, lineHeight: 1.55, color: 'var(--text-primary)', resize: 'none',
                  minHeight: 80, fontFamily: 'var(--font-sans)',
                }}
                spellCheck={false}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span className="font-mono" style={{
                  fontSize: 11, color: charCount > twitterLimit ? 'var(--accent-red)' : 'var(--text-dim)',
                }}>
                  {charCount}/{twitterLimit}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setEditing(false)}>Cancel</button>
                  <button className="btn btn-sm btn-success" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? <><span className="spinner" /> Saving...</> : 'Save Edit'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: 0 }}>
                {draft.reply_text || editText || '—'}
              </p>
              <div className="font-mono" style={{
                position: 'absolute', bottom: 12, right: 16,
                fontSize: 11, color: 'var(--text-dim)', opacity: 0.6,
              }}>
                {(draft.reply_text || editText || '').length}/{twitterLimit}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom: Analysis bars + Action buttons */}
      {!editing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
          {/* Analysis bars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {toneMatch && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 128 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <span>Tone Match</span>
                  <span className="font-mono" style={{ color: 'var(--accent-blue)' }}>{toneMatch}%</span>
                </div>
                <div style={{ height: 5, width: '100%', background: 'rgba(0,0,0,0.06)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${toneMatch}%`, background: 'linear-gradient(90deg, #60a5fa, #3b82f6)', borderRadius: 20, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}
            {relevanceScore && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 128 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <span>Relevance</span>
                  <span className="font-mono" style={{ color: 'var(--accent-blue)' }}>{relevanceScore}%</span>
                </div>
                <div style={{ height: 5, width: '100%', background: 'rgba(0,0,0,0.06)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${relevanceScore}%`, background: 'linear-gradient(90deg, #60a5fa, #3b82f6)', borderRadius: 20, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleReject}
              disabled={approving || rejecting || regenerating}
              style={{
                height: 40, padding: '0 16px', borderRadius: 12,
                border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)',
                background: 'transparent', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s ease', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,0.05)'; e.target.style.borderColor = 'rgba(239,68,68,0.3)'; }}
              onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'rgba(239,68,68,0.2)'; }}
            >
              {rejecting ? <span className="spinner" style={{ borderTopColor: 'var(--accent-red)' }} /> : 'Reject'}
            </button>

            <button
              onClick={() => { setEditing(true); setEditText(draft.reply_text || ''); }}
              disabled={approving || rejecting || regenerating}
              style={{
                height: 40, width: 40, borderRadius: 12,
                border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-blue)'; e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'rgba(59,130,246,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'transparent'; }}
              title="Edit"
            >
              <i className="fa-solid fa-pen" style={{ fontSize: 13 }} />
            </button>

            <button
              onClick={handleRegenerate}
              disabled={approving || rejecting || regenerating}
              style={{
                height: 40, width: 40, borderRadius: 12,
                border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-purple)'; e.currentTarget.style.borderColor = 'var(--accent-purple)'; e.currentTarget.style.background = 'rgba(139,92,246,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'transparent'; }}
              title="Regenerate"
            >
              {regenerating ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 13 }} />}
            </button>

            <button
              onClick={handleApprove}
              disabled={approving || rejecting || regenerating}
              style={{
                height: 40, padding: '0 20px', borderRadius: 12,
                background: 'var(--accent-green)', color: 'white',
                border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                transition: 'all 0.2s ease', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(34,197,94,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(34,197,94,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {approving
                ? <><span className="spinner" /> Approving...</>
                : <><i className="fa-solid fa-paper-plane" style={{ fontSize: 11 }} /> Approve & Send</>}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Approvals() {
  const { events } = useSocket() || {};
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [toasts, setToasts] = useState([]);
  const [confirmReject, setConfirmReject] = useState(null);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const loadDrafts = useCallback(async () => {
    try {
      const r = await getDrafts(USER_ID);
      setDrafts(r.data || []);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  useEffect(() => {
    if (!events || events.length === 0) return;
    const latest = events[0];
    if (latest.type === 'draft:generated') {
      loadDrafts();
      addToast('New draft generated', 'info');
    }
    if (latest.type === 'draft:status_changed') loadDrafts();
    if (latest.type === 'reply:posted') {
      loadDrafts();
      addToast('Reply posted to X successfully', 'success');
    }
    if (latest.type === 'reply:failed') {
      loadDrafts();
      addToast(latest.data?.error || 'Reply failed to post', 'error');
    }
  }, [events, loadDrafts, addToast]);

  const handleApprove = async (id) => {
    try {
      await approveDraft(id);
      addToast('Reply queued for posting', 'success');
      setTimeout(() => loadDrafts(), 700);
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to approve', 'error');
      throw err;
    }
  };

  const handleReject = async (id) => {
    return new Promise((resolve, reject) => {
      setConfirmReject({ id, resolve, reject });
    });
  };

  const confirmRejectAction = async () => {
    const { id, resolve } = confirmReject;
    setConfirmReject(null);
    try {
      await rejectDraft(id);
      addToast('Draft rejected', 'info');
      setTimeout(() => loadDrafts(), 700);
      resolve();
    } catch {
      addToast('Failed to reject', 'error');
    }
  };

  const handleEdit = async (id, text) => {
    try {
      await editDraft(id, text);
      addToast('Draft updated', 'success');
      loadDrafts();
    } catch {
      addToast('Failed to save', 'error');
      throw new Error('fail');
    }
  };

  const handleRegenerate = async (id) => {
    try {
      const r = await regenerateDraft(id);
      addToast('Draft regenerated', 'success');
      loadDrafts();
      return r.data?.draft;
    } catch {
      addToast('Regeneration failed', 'error');
    }
  };

  const tabs = ['all', 'pending', 'approved', 'rejected'];
  const filtered = activeTab === 'all' ? drafts : drafts.filter(d => d.status === activeTab);
  const pendingCount = drafts.filter(d => d.status === 'pending').length;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Sticky filter row */}
      <div style={{
        padding: '16px 40px',
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(226,226,234,0.95)', backdropFilter: 'blur(8px)',
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 20px', borderRadius: 24,
                border: isActive ? 'none' : '1px solid rgba(255,255,255,0.6)',
                background: isActive
                  ? (tab === 'pending' ? 'var(--accent-blue)' : 'var(--gradient-brand)')
                  : 'rgba(255,255,255,0.85)',
                backdropFilter: isActive ? 'none' : 'blur(20px)',
                color: isActive ? 'white' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s ease', fontFamily: 'var(--font-sans)',
                textTransform: 'capitalize',
                boxShadow: isActive ? '0 4px 14px rgba(59,130,246,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (!isActive) { e.target.style.background = 'white'; e.target.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={e => { if (!isActive) { e.target.style.background = 'rgba(255,255,255,0.85)'; e.target.style.color = 'var(--text-secondary)'; } }}
            >
              {tab}
              {tab === 'pending' && pendingCount > 0 && (
                <span className="font-mono" style={{
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.1)',
                  color: isActive ? 'white' : 'var(--accent-blue)',
                  padding: '1px 6px', borderRadius: 4, fontSize: 11,
                }}>{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable cards area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 64px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
              <div className="spinner spinner-dark" style={{ margin: '0 auto 12px' }} />
              Loading drafts...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="glass-card" style={{ padding: 64, textAlign: 'center', borderRadius: 16 }}>
              <i className="fa-regular fa-file" style={{ fontSize: 32, marginBottom: 12, display: 'block', color: 'var(--text-dim)' }} />
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                No {activeTab !== 'all' ? activeTab : ''} drafts
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTab === 'pending' ? 'Run a scan to generate new drafts' : 'Nothing here yet'}
              </div>
            </div>
          )}
          {!loading && filtered.map((draft, i) => (
            <div
              key={draft.id}
              style={{ animation: `card-enter 0.6s ease-out ${i * 0.15}s forwards`, opacity: 0 }}
            >
              <DraftCard
                draft={draft}
                onApprove={handleApprove}
                onReject={handleReject}
                onEdit={handleEdit}
                onRegenerate={handleRegenerate}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmReject && (
        <ConfirmModal
          message="Are you sure you want to reject this draft? It cannot be undone."
          onConfirm={confirmRejectAction}
          onCancel={() => { confirmReject.reject?.(); setConfirmReject(null); }}
        />
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
