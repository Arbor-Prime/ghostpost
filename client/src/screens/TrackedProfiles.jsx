import React, { useState, useEffect, useCallback } from 'react';
import { getTrackedProfiles, addTrackedProfile, removeTrackedProfile, scanTrackedProfile } from '../api';
import { useSocket } from '../contexts/SocketContext';

const USER_ID = 1;

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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

function AddProfileModal({ onAdd, onClose }) {
  const [handle, setHandle] = useState('');
  const [priority, setPriority] = useState(5);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const h = handle.replace(/^@/, '').trim();
    if (!h) { setError('Handle is required'); return; }
    setLoading(true);
    setError('');
    try {
      await onAdd({ x_handle: h, priority, notes });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to add profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Track New Profile</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>Add a Twitter/X handle to monitor for reply opportunities.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Twitter Handle
            </label>
            <input
              className="input"
              type="text"
              placeholder="@username"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Priority <span className="font-mono">(1–10)</span>
            </label>
            <input
              className="input font-mono"
              type="number"
              min="1"
              max="10"
              value={priority}
              onChange={e => setPriority(Number(e.target.value))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
            <textarea
              className="input"
              placeholder="Why you're tracking this account..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--accent-red)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" />Adding…</> : <><i className="fa-solid fa-plus" />Add Profile</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileCard({ profile, onRemove, onScan, scanningId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isScanning = scanningId === profile.id;

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {(profile.x_handle || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>@{profile.x_handle}</span>
            <span className="badge badge-blue font-mono">P{profile.priority}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>
              <span className="font-mono">{profile.tweet_count || 0}</span> tweets observed
            </span>
            <span>
              <span className="font-mono">{profile.pending_opportunities || 0}</span> pending opps
            </span>
          </div>
        </div>

        {/* Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <i className="fa-solid fa-ellipsis-vertical" />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 99, background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: 10, boxShadow: 'var(--shadow-card)', overflow: 'hidden', minWidth: 140 }}>
                <button
                  onClick={() => { setMenuOpen(false); onRemove(profile.id, profile.x_handle); }}
                  style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--accent-red)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <i className="fa-solid fa-trash" />Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      {profile.notes && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          {profile.notes}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Last seen: <span className="font-mono">{timeAgo(profile.added_at)}</span>
        </span>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => onScan(profile.id, profile.x_handle)}
          disabled={isScanning}
        >
          {isScanning
            ? <><span className="spinner" />Scanning…</>
            : <><i className="fa-solid fa-radar" />Scan Profile</>}
        </button>
      </div>
    </div>
  );
}

export default function TrackedProfiles() {
  const { events } = useSocket() || {};
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const loadProfiles = useCallback(() => {
    getTrackedProfiles(USER_ID).then(r => setProfiles(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Socket: detect scan completion to update card
  useEffect(() => {
    if (!events || events.length === 0) return;
    const latest = events[0];
    if (latest.type === 'scan:completed') {
      setScanningId(null);
      loadProfiles();
      addToast('Scan complete', 'success');
    }
  }, [events, loadProfiles, addToast]);

  const handleAdd = async (data) => {
    const r = await addTrackedProfile(USER_ID, data);
    setProfiles(prev => [r.data, ...prev]);
    addToast(`@${data.x_handle} added`, 'success');
  };

  const handleRemove = (id, handle) => {
    setConfirmRemove({ id, handle });
  };

  const confirmRemoveAction = async () => {
    const { id, handle } = confirmRemove;
    setConfirmRemove(null);
    try {
      await removeTrackedProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
      addToast(`@${handle} removed`, 'info');
    } catch {
      addToast('Failed to remove profile', 'error');
    }
  };

  const handleScan = async (id, handle) => {
    setScanningId(id);
    try {
      await scanTrackedProfile(id);
      addToast(`Scan queued for @${handle}`, 'success');
    } catch {
      addToast('Failed to queue scan', 'error');
      setScanningId(null);
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px 64px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              <span className="font-mono">{profiles.length}</span> profile{profiles.length !== 1 ? 's' : ''} tracked
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <i className="fa-solid fa-plus" />Add Profile
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
            <div className="spinner spinner-dark" style={{ margin: '0 auto 12px' }} />
            Loading profiles...
          </div>
        ) : profiles.length === 0 ? (
          <div className="glass-card" style={{ padding: 64, textAlign: 'center' }}>
            <i className="fa-solid fa-users-viewfinder" style={{ fontSize: 36, color: 'var(--text-dim)', marginBottom: 16, display: 'block' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No Profiles Tracked</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Add Twitter handles to monitor for reply opportunities.
            </p>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <i className="fa-solid fa-plus" />Add Your First Profile
            </button>
          </div>
        ) : (
          <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {profiles.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onRemove={handleRemove}
                onScan={handleScan}
                scanningId={scanningId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAddModal && <AddProfileModal onAdd={handleAdd} onClose={() => setShowAddModal(false)} />}

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="modal-overlay" onClick={() => setConfirmRemove(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Remove Profile</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
              Remove <strong>@{confirmRemove.handle}</strong> from tracked profiles? Past observations will not be deleted.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button className="btn" onClick={confirmRemoveAction} style={{ background: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: 'var(--radius-button)', padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}>
                <i className="fa-solid fa-trash" />Remove
              </button>
            </div>
          </div>
        </div>
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
