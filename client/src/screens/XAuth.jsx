import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { validateCookieImport, getCookieImportStatus, disconnectCookieImport } from '../api';

const USER_ID = 1;

export default function XAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnboarding = location.pathname === '/x-auth';

  const [authToken, setAuthToken] = useState('');
  const [ct0, setCt0] = useState('');
  const [status, setStatus] = useState('idle'); // idle | validating | connected | error
  const [error, setError] = useState(null);
  const [connectionInfo, setConnectionInfo] = useState(null);

  useEffect(() => {
    getCookieImportStatus()
      .then(({ data }) => {
        if (data.connected) {
          setStatus('connected');
          setConnectionInfo(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleConnect = async () => {
    if (!authToken.trim() || !ct0.trim()) {
      setError('Both cookie values are required.');
      return;
    }
    setStatus('validating');
    setError(null);

    try {
      const { data } = await validateCookieImport(authToken.trim(), ct0.trim());
      if (data.valid) {
        setStatus('connected');
        setConnectionInfo({
          username: data.username,
          updatedAt: new Date().toISOString(),
          cookieCount: data.cookieCount,
        });
        setAuthToken('');
        setCt0('');
      } else {
        setStatus('error');
        setError(data.error || 'Cookies are invalid or expired.');
      }
    } catch (err) {
      setStatus('error');
      setError(err?.response?.data?.error || 'Connection failed. Check that the server is running.');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your X account? You will need to re-import cookies to post.')) return;
    try {
      await disconnectCookieImport();
      setStatus('idle');
      setConnectionInfo(null);
    } catch (_) {}
  };

  const handleContinue = () => {
    if (isOnboarding) {
      navigate('/dashboard');
    }
  };

  // ── Styles (matches existing glassmorphism design system) ──
  const card = {
    backdropFilter: 'blur(40px) saturate(200%) brightness(1.05)',
    background: 'rgba(255, 255, 255, 0.45)',
    border: '1px solid rgba(255, 255, 255, 0.6)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
    borderRadius: 16,
    padding: 32,
    maxWidth: 560,
    margin: '0 auto',
  };

  const inputStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'rgba(255,255,255,0.6)',
    outline: 'none',
    marginBottom: 16,
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  const labelStyle = {
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary, #374151)',
    display: 'block',
    marginBottom: 6,
  };

  const btnPrimary = {
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
    fontWeight: 600,
    fontSize: 14,
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    cursor: status === 'validating' ? 'wait' : 'pointer',
    background: '#1d9bf0',
    color: '#fff',
    transition: 'all 0.2s ease',
    opacity: status === 'validating' ? 0.6 : 1,
    width: '100%',
  };

  const btnSecondary = {
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.06)',
    color: 'var(--text-primary, #374151)',
    transition: 'all 0.2s ease',
  };

  const pageWrapper = isOnboarding
    ? {
        width: '100%', minHeight: '100vh', background: 'var(--bg-app)',
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)',
        position: 'relative',
      }
    : { padding: '40px 24px', fontFamily: 'var(--font-sans)' };

  return (
    <div style={pageWrapper}>
      {/* Onboarding header */}
      {isOnboarding && (
        <header style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', padding: '32px 40px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}>
              <i className="fa-solid fa-ghost" style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>GhostPost</span>
          </div>
        </header>
      )}

      <main style={isOnboarding
        ? { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 64px', position: 'relative', zIndex: 10 }
        : {}
      }>
        {/* Page title */}
        <div style={{ maxWidth: 560, margin: '0 auto 24px', textAlign: isOnboarding ? 'center' : 'left' }}>
          {isOnboarding && (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 0 30px rgba(0,0,0,0.2)' }}>
              <i className="fa-brands fa-x-twitter" style={{ fontSize: 32, color: 'white' }} />
            </div>
          )}
          <h1 style={{ fontSize: isOnboarding ? '1.75rem' : '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Connect X Account
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #6b7280)', lineHeight: 1.6 }}>
            Import your X.com cookies to enable the posting pipeline.
          </p>
        </div>

        {/* ── Connected state ── */}
        {status === 'connected' && (
          <div style={{ ...card, borderColor: 'rgba(29, 155, 240, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1d9bf0, #0d8ce0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                <i className="fa-solid fa-check" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
                  {connectionInfo?.username ? `@${connectionInfo.username}` : 'X Account Connected'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
                  {connectionInfo?.updatedAt
                    ? `Connected ${new Date(connectionInfo.updatedAt).toLocaleDateString()}`
                    : 'Cookies stored and encrypted'}
                  {connectionInfo?.cookieCount ? ` · ${connectionInfo.cookieCount} cookies` : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStatus('idle')} style={btnSecondary}>
                <i className="fa-solid fa-rotate" style={{ marginRight: 6 }} />
                Refresh Cookies
              </button>
              <button onClick={handleDisconnect} style={{ ...btnSecondary, color: '#ef4444' }}>
                <i className="fa-solid fa-link-slash" style={{ marginRight: 6 }} />
                Disconnect
              </button>
              {isOnboarding && (
                <button onClick={handleContinue} style={{ ...btnPrimary, width: 'auto', marginLeft: 'auto' }}>
                  Continue to Dashboard
                  <i className="fa-solid fa-arrow-right" style={{ marginLeft: 8 }} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Import form ── */}
        {(status === 'idle' || status === 'validating' || status === 'error') && (
          <div style={card}>
            {/* Instructions */}
            <div style={{
              background: 'rgba(29, 155, 240, 0.06)',
              borderRadius: 10,
              padding: 16,
              marginBottom: 24,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1d9bf0', marginBottom: 8 }}>
                How to get your cookies
              </div>
              <ol style={{
                fontSize: 13, color: 'var(--text-primary, #374151)',
                margin: 0, paddingLeft: 18, lineHeight: 1.8,
              }}>
                <li>Open <strong>x.com</strong> in Chrome and make sure you're logged in</li>
                <li>Press <strong>F12</strong> to open DevTools</li>
                <li>Go to <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>https://x.com</strong></li>
                <li>
                  Find <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>auth_token</code> — copy its <strong>Value</strong>
                </li>
                <li>
                  Find <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>ct0</code> — copy its <strong>Value</strong>
                </li>
              </ol>
            </div>

            {/* Cookie fields */}
            <div>
              <span style={labelStyle}>auth_token</span>
              <input
                type="password"
                placeholder="Paste auth_token value"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#1d9bf0'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(0,0,0,0.1)'; }}
              />
            </div>

            <div>
              <span style={labelStyle}>ct0</span>
              <input
                type="password"
                placeholder="Paste ct0 value"
                value={ct0}
                onChange={(e) => setCt0(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#1d9bf0'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(0,0,0,0.1)'; }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                fontSize: 13, color: '#ef4444',
                background: 'rgba(239,68,68,0.06)', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16,
              }}>
                <i className="fa-solid fa-circle-xmark" style={{ marginRight: 8 }} />
                {error}
              </div>
            )}

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={status === 'validating' || (!authToken.trim() || !ct0.trim())}
              style={{
                ...btnPrimary,
                opacity: (status === 'validating' || !authToken.trim() || !ct0.trim()) ? 0.5 : 1,
              }}
            >
              {status === 'validating' ? (
                <><span className="spinner" style={{ marginRight: 8 }} />Validating cookies…</>
              ) : (
                <><i className="fa-solid fa-plug" style={{ marginRight: 8 }} />Connect X Account</>
              )}
            </button>

            {/* Skip for onboarding */}
            {isOnboarding && (
              <button
                className="btn btn-outline w-full"
                onClick={() => navigate('/dashboard')}
                style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, width: '100%', background: 'none', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}
              >
                Skip for now — connect later in Settings
              </button>
            )}

            {/* Security note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'center' }}>
              <i className="fa-solid fa-lock" style={{ fontSize: 11, color: 'var(--text-dim, #9ca3af)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim, #9ca3af)' }}>
                Cookies are encrypted with AES-256-GCM and stored only on your server.
              </span>
            </div>
          </div>
        )}

        {/* Embedded browser fallback link */}
        {status !== 'connected' && (
          <div style={{ maxWidth: 560, margin: '24px auto 0', textAlign: 'center' }}>
            <a
              href="/browser"
              style={{ fontSize: 13, color: 'var(--text-dim, #9ca3af)', textDecoration: 'none' }}
            >
              Or use the embedded browser (experimental) →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
