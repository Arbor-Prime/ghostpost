import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthStatus, validateAuth, disconnectAuth, getHealth, getVoiceProfile, updateVoiceProfile, getPersona, importCookies, resetVoiceProfile } from '../api';

const USER_ID = 1;

const CATEGORIES = [
  { group: 'Account',         items: ['General', 'Notifications'] },
  { group: 'AI Configuration', items: ['Voice Profile', 'Personas', 'Privacy & Data'] },
  { group: 'System',          items: ['Integrations', 'System Health', 'Billing'] },
];

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

function Toast({ message, type = 'info', onDone }) {
  useEffect(() => { const id = setTimeout(onDone, 3000); return () => clearTimeout(id); }, [onDone]);
  return (
    <div className={`toast toast-${type}`}>
      <i className={type === 'success' ? 'fa-solid fa-check-circle' : type === 'error' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-info'} />
      {message}
    </div>
  );
}

function ServiceRow({ label, status }) {
  const isUp = status === 'up' || status === true || status === 'connected';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="status-dot" style={{ background: isUp ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: isUp ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isUp ? 'Running' : 'Down'}
        </span>
      </div>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('General');
  const [auth, setAuth] = useState(null);
  const [health, setHealth] = useState(null);
  const [voice, setVoice] = useState(null);
  const [persona, setPersona] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Notifications stored in localStorage
  const [notifs, setNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gp-notifs') || '{"approvals":true,"alerts":true,"weekly":false}'); }
    catch { return { approvals: true, alerts: true, weekly: false }; }
  });

  // Voice sliders
  const [voiceSliders, setVoiceSliders] = useState({ formality: 0.5, directness: 0.5, emoji_rate: 0.1 });
  const debounceRef = useRef(null);

  // Validation / disconnect states
  const [validating, setValidating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [cookieJson, setCookieJson] = useState('');
  const [importingCookies, setImportingCookies] = useState(false);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const loadData = useCallback(() => {
    getAuthStatus(USER_ID).then(r => setAuth(r.data)).catch(() => {});
    getVoiceProfile(USER_ID).then(r => {
      setVoice(r.data);
      if (r.data?.formality !== undefined) {
        setVoiceSliders({
          formality: r.data.formality || 0.5,
          directness: r.data.directness || 0.5,
          emoji_rate: r.data.emoji_rate || 0.1,
        });
      }
    }).catch(() => {});
    getPersona(USER_ID).then(r => setPersona(r.data)).catch(() => {});
  }, []);

  const loadHealth = useCallback(() => {
    getHealth().then(r => setHealth(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
    loadHealth();
  }, [loadData, loadHealth]);

  // Health auto-refresh every 30s
  useEffect(() => {
    if (activeTab !== 'System Health') return;
    const id = setInterval(loadHealth, 30000);
    return () => clearInterval(id);
  }, [activeTab, loadHealth]);

  // Save notifications to localStorage
  useEffect(() => {
    localStorage.setItem('gp-notifs', JSON.stringify(notifs));
  }, [notifs]);

  // Debounced voice slider update
  const handleSliderChange = (field, value) => {
    const next = { ...voiceSliders, [field]: value };
    setVoiceSliders(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await updateVoiceProfile(USER_ID, next);
        addToast('Voice profile updated', 'success');
      } catch {
        addToast('Failed to update voice profile', 'error');
      }
    }, 300);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      await validateAuth(USER_ID);
      addToast('X connection validated', 'success');
      loadData();
    } catch {
      addToast('Validation failed — check cookies', 'error');
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your X account?')) return;
    setDisconnecting(true);
    try {
      await disconnectAuth(USER_ID);
      addToast('X account disconnected', 'info');
      loadData();
    } catch {
      addToast('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleResetOnboarding = async () => {
    if (!window.confirm('This will delete your voice profile and all generated personas. You will need to re-record your voice. Continue?')) return;
    try {
      await resetVoiceProfile();
      addToast('Voice profile reset — redirecting to onboarding...', 'success');
      setTimeout(() => navigate('/recording'), 1200);
    } catch (err) {
      addToast('Reset failed', 'error');
    }
  };

  const handleImportCookies = async () => {
    if (!cookieJson.trim()) return;
    setImportingCookies(true);
    try {
      let parsed;
      try { parsed = JSON.parse(cookieJson); } catch { throw new Error('Invalid JSON'); }
      await importCookies(USER_ID, { cookies: parsed });
      addToast('Cookies imported successfully', 'success');
      setShowCookieModal(false);
      setCookieJson('');
      loadData();
    } catch (err) {
      addToast(err?.response?.data?.error || err.message || 'Import failed', 'error');
    } finally {
      setImportingCookies(false);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'General':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Account Info</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>User ID</label>
                  <input className="input font-mono" readOnly value={USER_ID} style={{ width: 120 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Connected X Account</label>
                  <input
                    className="input"
                    readOnly
                    value={auth?.x_username ? `@${auth.x_username}` : 'Not connected'}
                    style={{ width: 300 }}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'Notifications':
        return (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Notification Preferences</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { key: 'approvals', label: 'Approval Required', desc: 'Notify when drafts need review' },
                { key: 'alerts', label: 'System Alerts', desc: 'Errors, failed scans, service issues' },
                { key: 'weekly', label: 'Weekly Digest', desc: 'Weekly summary of activity' },
              ].map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.desc}</div>
                  </div>
                  <Toggle
                    checked={notifs[item.key]}
                    onChange={v => setNotifs(prev => ({ ...prev, [item.key]: v }))}
                  />
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
              Settings are stored locally. Push notifications coming in a future sprint.
            </p>
          </div>
        );

      case 'Voice Profile':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Current profile overview */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Voice Profile</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Your voice profile determines how GhostPost writes replies in your style. Re-record if your current profile doesn't sound like you.
              </p>
              {voice?.voice_profile && (
                <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Current profile: </span>
                    {voice.voice_profile.summary || 'No summary available'}
                  </p>
                  {voice.voice_profile.total_words > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Words analysed: </span>
                      <span className="font-mono">{voice.voice_profile.total_words}</span>
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={handleResetOnboarding}
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  color: 'var(--accent-red)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  padding: '10px 18px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => e.target.style.background = 'rgba(239,68,68,0.15)'}
                onMouseLeave={e => e.target.style.background = 'rgba(239,68,68,0.08)'}
              >
                <i className="fa-solid fa-rotate-left" style={{ marginRight: 8 }} />
                Reset Voice Profile & Re-record
              </button>
            </div>

            {/* Sliders */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Voice Characteristics</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Drag sliders to adjust — changes save automatically with a <span className="font-mono">300ms</span> debounce.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { key: 'formality', label: 'Formality', color: 'var(--accent-purple)', desc: 'Low = casual/slang · High = professional' },
                  { key: 'directness', label: 'Directness', color: 'var(--accent-blue)', desc: 'Low = exploratory · High = assertive' },
                  { key: 'emoji_rate', label: 'Emoji Usage', color: 'var(--accent-green)', desc: 'How often emojis appear in replies' },
                ].map(item => (
                  <div key={item.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 10 }}>{item.desc}</span>
                      </div>
                      <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: item.color }}>
                        {Math.round(voiceSliders[item.key] * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(voiceSliders[item.key] * 100)}
                      onChange={e => handleSliderChange(item.key, Number(e.target.value) / 100)}
                      style={{ width: '100%', accentColor: item.color, cursor: 'pointer' }}
                    />
                  </div>
                ))}
              </div>
            </div>
            {voice?.voice_profile?.summary && (
              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Voice Summary</h4>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{voice.voice_profile.summary}</p>
              </div>
            )}
          </div>
        );

      case 'Personas':
        return (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Persona Configuration</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Your persona is auto-generated from voice analysis. Individual persona editing coming in Sprint 11.
            </p>
            {persona?.persona ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Formality',     value: `${Math.round((persona.persona.formality || 0) * 10)}/10` },
                  { label: 'Directness',    value: `${Math.round((persona.persona.directness || 0) * 10)}/10` },
                  { label: 'Emoji Rate',    value: `${Math.round((persona.persona.emoji_rate || 0) * 100)}%` },
                  { label: 'Typing WPM',   value: persona.persona.base_typing_wpm || '—' },
                  { label: 'Chronotype',   value: persona.chronotype || '—' },
                  { label: 'Work Pattern', value: (persona.work_pattern || '—').replace(/_/g, ' ') },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-app)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                    <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No persona data — complete onboarding first.</div>
            )}
          </div>
        );

      case 'Privacy & Data':
        return (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Privacy & Data</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              GhostPost stores all data locally on your server. No data is sent to external services
              except the Ollama API for draft generation (running locally) and Twitter/X for observations.
            </p>
            <div style={{ marginTop: 16, padding: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-shield-halved" style={{ color: 'var(--accent-green)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-green)' }}>Self-hosted — your data stays on your server</span>
              </div>
            </div>
          </div>
        );

      case 'Integrations':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>X (Twitter) Connection</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="status-dot" style={{ background: auth?.x_auth_status === 'connected' ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: auth?.x_auth_status === 'connected' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {auth?.x_auth_status === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
                {auth?.x_username && (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>· @{auth.x_username}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={handleValidate} disabled={validating}>
                  {validating ? <><span className="spinner spinner-dark" />Validating…</> : <><i className="fa-solid fa-circle-check" />Test Connection</>}
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setShowCookieModal(true)}>
                  <i className="fa-solid fa-cookie" />Import Cookies
                </button>
                {auth?.x_auth_status === 'connected' && (
                  <button className="btn btn-sm btn-danger" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting ? <><span className="spinner" />…</> : <><i className="fa-solid fa-plug-circle-xmark" />Disconnect</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        );

      case 'System Health':
        return (
          <div className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>System Health</h3>
              <div style={{ display: 'flex', align: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Auto-refreshes every 30s</span>
                <button className="btn btn-sm btn-outline" onClick={loadHealth}>
                  <i className="fa-solid fa-arrows-rotate" />Refresh
                </button>
              </div>
            </div>
            {health ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ServiceRow label="PostgreSQL Database" status={health.database} />
                <ServiceRow label="Redis Cache" status={health.redis} />
                <ServiceRow label="Ollama (AI)" status={health.ollama} />
                <ServiceRow label="Playwright (Browser)" status={health.playwright} />
                {health.timestamp && (
                  <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                    Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                <div className="spinner spinner-dark" style={{ margin: '0 auto 10px' }} />
                Loading health status...
              </div>
            )}
          </div>
        );

      case 'Billing':
        return (
          <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
            <i className="fa-solid fa-credit-card" style={{ fontSize: 32, color: 'var(--text-dim)', marginBottom: 16, display: 'block' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Billing</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>GhostPost is self-hosted. No subscription required.</p>
          </div>
        );

      default:
        return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select a tab</div>;
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex' }}>
      {/* Sidebar */}
      <div style={{
        width: 220,
        borderRight: '1px solid var(--border-subtle)',
        padding: '24px 0',
        overflowY: 'auto',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        {CATEGORIES.map(cat => (
          <div key={cat.group} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 20px', marginBottom: 6 }}>
              {cat.group}
            </div>
            {cat.items.map(item => (
              <button
                key={item}
                onClick={() => setActiveTab(item)}
                style={{
                  width: '100%',
                  padding: '8px 20px',
                  border: 'none',
                  background: activeTab === item ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                  borderRight: activeTab === item ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  color: activeTab === item ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: activeTab === item ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s ease',
                }}
              >
                {item}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 64px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>{activeTab}</h2>
        {renderTab()}
      </div>

      {/* Cookie Import Modal */}
      {showCookieModal && (
        <div className="modal-overlay" onClick={() => setShowCookieModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Import X Cookies</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Use the <strong style={{ color: 'var(--text-primary)' }}>Cookie-Editor</strong> browser extension to export your X.com cookies as JSON, then paste them below.
            </p>
            <ol style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2, marginBottom: 16, paddingLeft: 20 }}>
              <li>Log into X.com in your browser</li>
              <li>Open Cookie-Editor extension</li>
              <li>Click Export → Copy as JSON</li>
              <li>Paste below and click Import</li>
            </ol>
            <textarea
              className="input font-mono"
              rows={6}
              placeholder='[{"name":"auth_token","value":"..."},...]'
              value={cookieJson}
              onChange={e => setCookieJson(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowCookieModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImportCookies} disabled={importingCookies || !cookieJson.trim()}>
                {importingCookies ? <><span className="spinner" />Importing…</> : <><i className="fa-solid fa-upload" />Import Cookies</>}
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
