import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getObserverStats, triggerObservation } from '../api';
import { useSocket } from '../contexts/SocketContext';

const USER_ID = 1;

const timeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

function Toast({ message, type = 'info', onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3000);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div className={`toast toast-${type}`}>
      <i className={type === 'success' ? 'fa-solid fa-check-circle' : type === 'error' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-info'} />
      {message}
    </div>
  );
}

function ScanLogEntry({ entry }) {
  const getVerdict = (entry) => {
    const score = entry.data?.score || 0;
    if (entry.type === 'opportunity:scored' && score >= 0.75)
      return { label: `MATCH ${Math.round(score * 100)}%`, bg: 'rgba(34,197,94,0.1)', color: '#15803d', border: 'rgba(34,197,94,0.2)', reason: 'Intent Detected' };
    if (entry.type === 'opportunity:scored' && score >= 0.4)
      return { label: `HOLD ${Math.round(score * 100)}%`, bg: 'rgba(234,179,8,0.1)', color: '#a16207', border: 'rgba(234,179,8,0.2)', reason: 'Review Needed' };
    if (entry.type === 'opportunity:scored')
      return { label: `SKIP ${Math.round(score * 100)}%`, bg: 'rgba(239,68,68,0.1)', color: '#b91c1c', border: 'rgba(239,68,68,0.2)', reason: 'Low Relevance' };
    if (entry.type === 'scan:started')
      return { label: 'SCANNING', bg: 'rgba(59,130,246,0.1)', color: '#1d4ed8', border: 'rgba(59,130,246,0.2)', reason: 'Feed Scan' };
    if (entry.type === 'scan:completed')
      return { label: 'COMPLETE', bg: 'rgba(34,197,94,0.1)', color: '#15803d', border: 'rgba(34,197,94,0.2)', reason: 'Scan Done' };
    if (entry.type === 'scan:tweets_found')
      return { label: `+${entry.data?.count || 0}`, bg: 'rgba(59,130,246,0.1)', color: '#1d4ed8', border: 'rgba(59,130,246,0.2)', reason: 'Tweets Found' };
    return { label: 'EVENT', bg: 'rgba(156,163,175,0.1)', color: '#6b7280', border: 'rgba(156,163,175,0.2)', reason: entry.type };
  };

  const verdict = getVerdict(entry);
  const handle = entry.data?.handle || entry.data?.handles?.[0] || 'system';
  const initials = handle.slice(0, 2).toUpperCase();
  const text = entry.data?.tweet_content
    || (entry.type === 'scan:started' ? `Scanning @${handle} feed...` : '')
    || (entry.type === 'scan:completed' ? `${entry.data?.tweetsExtracted || 0} tweets extracted` : '')
    || (entry.type === 'scan:tweets_found' ? `Found ${entry.data?.count || 0} new posts` : '')
    || '';

  const elapsed = entry.timestamp ? timeAgo(entry.timestamp) + ' ago' : 'Just now';

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 12, transition: 'all 0.15s',
      border: '1px solid transparent', cursor: 'pointer',
      opacity: verdict.label.startsWith('SKIP') ? 0.65 : 1,
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.6)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)';
      e.currentTarget.style.opacity = '1';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.borderColor = 'transparent';
      e.currentTarget.style.opacity = verdict.label.startsWith('SKIP') ? '0.65' : '1';
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>{initials}</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>@{handle}</span>
        </div>
        <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{elapsed}</span>
      </div>
      {text && (
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>
          {text}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="font-mono" style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: verdict.bg, color: verdict.color, border: `1px solid ${verdict.border}`,
        }}>{verdict.label}</span>
        <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{verdict.reason}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.4)', borderRadius: 14, padding: 14,
      border: '1px solid rgba(255,255,255,0.5)', transition: 'background 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.6)'}
    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

export default function BrowserView() {
  const { socket, events, connected } = useSocket() || {};
  const canvasRef = useRef(null);

  // Browser state
  const [browserActive, setBrowserActive] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [cookieStatus, setCookieStatus] = useState(null);

  // Right panel state
  const [obsStats, setObsStats] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanLog, setScanLog] = useState([]);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Load stats + cookie status on mount, auto-reconnect if session is active
  useEffect(() => {
    getObserverStats().then(r => setObsStats(r.data)).catch(() => {});
    fetch('/api/browser-session/cookie-status')
      .then(r => r.json())
      .then(setCookieStatus)
      .catch(() => {});

    fetch('/api/browser-session/status')
      .then(r => r.json())
      .then(data => {
        if (data.active && socket) {
          setBrowserLoading(true);
          socket.emit('browser:launch');
        }
      })
      .catch(() => {});
  }, [socket]);

  // Handle incoming screencast frames + browser events
  useEffect(() => {
    if (!socket) return;

    const handleFrame = async ({ data }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const blob = await fetch(`data:image/jpeg;base64,${data}`).then(r => r.blob());
        const bitmap = await createImageBitmap(blob);
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      } catch (_) {}
    };

    const handleLaunched = (data) => {
      setBrowserActive(true);
      setBrowserLoading(false);
      addToast(data?.reconnected ? 'Browser reconnected' : 'Browser launched', 'success');
    };

    const handleClosed = () => {
      setBrowserActive(false);
      setBrowserLoading(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const handleCookiesCaptured = (data) => {
      setCookieStatus({ status: 'valid', updatedAt: data.timestamp });
      addToast(`Session cookies captured (${data.count} cookies)`, 'success');
    };

    const handleError = ({ message }) => {
      setBrowserLoading(false);
      addToast(message, 'error');
    };

    socket.on('browser:frame', handleFrame);
    socket.on('browser:launched', handleLaunched);
    socket.on('browser:closed', handleClosed);
    socket.on('browser:cookies-captured', handleCookiesCaptured);
    socket.on('browser:error', handleError);

    return () => {
      socket.off('browser:frame', handleFrame);
      socket.off('browser:launched', handleLaunched);
      socket.off('browser:closed', handleClosed);
      socket.off('browser:cookies-captured', handleCookiesCaptured);
      socket.off('browser:error', handleError);
    };
  }, [socket, addToast]);

  // Build scan log from socket events
  useEffect(() => {
    if (!events || events.length === 0) return;
    const latest = events[0];
    setScanLog(prev => [latest, ...prev].slice(0, 50));
    if (latest.type === 'scan:started') setScanning(true);
    if (latest.type === 'scan:completed') {
      setScanning(false);
      getObserverStats().then(r => setObsStats(r.data)).catch(() => {});
    }
  }, [events]);

  // Browser controls
  const handleLaunch = useCallback(() => {
    if (!socket) return;
    setBrowserLoading(true);
    socket.emit('browser:launch');
  }, [socket]);

  const handleClose = useCallback(() => {
    if (!socket) return;
    socket.emit('browser:close');
  }, [socket]);

  const handleBack = useCallback(() => { if (socket) socket.emit('browser:back'); }, [socket]);
  const handleForward = useCallback(() => { if (socket) socket.emit('browser:forward'); }, [socket]);
  const handleReload = useCallback(() => { if (socket) socket.emit('browser:reload'); }, [socket]);

  const handleTriggerScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await triggerObservation(USER_ID);
      addToast('Scan triggered', 'success');
    } catch {
      addToast('Failed to trigger scan', 'error');
      setScanning(false);
    }
  };

  // Canvas coordinate helpers
  const getCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!socket || !browserActive) return;
    const coords = getCanvasCoords(e);
    if (coords) socket.emit('browser:mouse', { type: 'mousemove', ...coords });
  }, [socket, browserActive, getCanvasCoords]);

  const handleMouseDown = useCallback((e) => {
    if (!socket || !browserActive) return;
    const coords = getCanvasCoords(e);
    if (coords) socket.emit('browser:mouse', { type: 'mousedown', ...coords, button: e.button });
  }, [socket, browserActive, getCanvasCoords]);

  const handleMouseUp = useCallback((e) => {
    if (!socket || !browserActive) return;
    const coords = getCanvasCoords(e);
    if (coords) socket.emit('browser:mouse', { type: 'mouseup', ...coords, button: e.button });
  }, [socket, browserActive, getCanvasCoords]);

  // Wheel needs a non-passive listener to preventDefault (React onWheel is passive)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !socket || !browserActive) return;

    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      socket.emit('browser:mouse', { type: 'wheel', x, y, deltaX: e.deltaX, deltaY: e.deltaY });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [socket, browserActive]);

  const handleKeyDown = useCallback((e) => {
    if (!socket || !browserActive) return;
    e.preventDefault();
    socket.emit('browser:key', {
      type: 'keydown', key: e.key, code: e.code, keyCode: e.keyCode,
      altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
    });
  }, [socket, browserActive]);

  const handleKeyUp = useCallback((e) => {
    if (!socket || !browserActive) return;
    e.preventDefault();
    socket.emit('browser:key', {
      type: 'keyup', key: e.key, code: e.code, keyCode: e.keyCode,
      altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
    });
  }, [socket, browserActive]);

  const candidateCount = Number(obsStats?.opportunities_today || 0);

  return (
    <div style={{ flex: 1, padding: '8px 32px 8px 32px', display: 'flex', gap: 24, overflow: 'hidden', height: '100%' }}>

      {/* LEFT PANEL: Embedded Browser */}
      <section className="glass-card" style={{
        width: '65%', borderRadius: 20, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Browser Tab Bar */}
        <div style={{
          background: 'rgba(243,244,246,0.5)', borderBottom: '1px solid rgba(255,255,255,0.6)',
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{ display: 'flex', gap: 5, marginLeft: 8 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(239,68,68,0.7)', cursor: 'pointer', transition: 'background 0.15s' }}
              onClick={handleClose}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.7)'}
              title="Close browser"
            />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(234,179,8,0.7)' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(34,197,94,0.7)' }} />
          </div>
          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 10 }}>
            {[
              { icon: 'fa-solid fa-chevron-left', handler: handleBack, title: 'Back' },
              { icon: 'fa-solid fa-chevron-right', handler: handleForward, title: 'Forward' },
              { icon: 'fa-solid fa-rotate-right', handler: handleReload, title: 'Reload' },
            ].map((btn) => (
              <button
                key={btn.title}
                onClick={btn.handler}
                disabled={!browserActive}
                title={btn.title}
                style={{
                  width: 26, height: 26, borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: browserActive ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: browserActive ? 'var(--text-secondary)' : 'rgba(0,0,0,0.15)',
                  fontSize: 11, transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (browserActive) { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = browserActive ? 'var(--text-secondary)' : 'rgba(0,0,0,0.15)'; }}
              >
                <i className={btn.icon} />
              </button>
            ))}
          </div>
          <div style={{
            marginLeft: 6, background: 'white', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 8, padding: '5px 12px', fontSize: 12, color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 360,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <i className="fa-solid fa-lock" style={{ fontSize: 10, color: 'var(--accent-green)' }} />
            <span>x.com</span>
          </div>

          {/* Cookie status */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {cookieStatus?.status === 'valid' && (
              <span style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="fa-solid fa-cookie-bite" style={{ fontSize: 12 }} />
                Cookies saved
              </span>
            )}
            {cookieStatus?.status === 'stale' && (
              <span style={{ fontSize: 11, color: 'var(--accent-amber)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="fa-solid fa-exclamation-triangle" style={{ fontSize: 12 }} />
                Cookies stale
              </span>
            )}
          </div>
        </div>

        {/* Browser Content Area */}
        <div style={{
          flex: 1, position: 'relative', background: 'white', overflow: 'hidden',
          cursor: browserActive ? 'default' : 'pointer',
        }}>
          {/* Launch Screen */}
          {!browserActive && !browserLoading && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: 32,
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: 20,
                background: 'var(--gradient-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24, boxShadow: '0 12px 40px rgba(99,102,241,0.35)',
              }}>
                <i className="fa-solid fa-globe" style={{ color: 'white', fontSize: 32 }} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Embedded Browser
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 420, lineHeight: 1.6 }}>
                Launch a secure browser session to log into X.com.
                GhostPost will automatically capture your session cookies for posting.
              </p>
              <button
                onClick={handleLaunch}
                style={{
                  background: 'var(--accent-blue)', color: 'white',
                  padding: '12px 28px', borderRadius: 14, border: 'none',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 8px 24px rgba(59,130,246,0.35)',
                  transition: 'all 0.2s ease', fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(59,130,246,0.45)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,130,246,0.35)'; }}
              >
                <i className="fa-solid fa-play" />
                Launch Browser
              </button>

              {cookieStatus?.status === 'valid' && (
                <p style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-check-circle" />
                  Valid cookies from {new Date(cookieStatus.updatedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Loading State */}
          {browserLoading && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 48, height: 48, border: '4px solid rgba(99,102,241,0.15)',
                borderTop: '4px solid var(--accent-blue)',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
                marginBottom: 16,
              }} />
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Launching Chromium...</p>
            </div>
          )}

          {/* Canvas — always rendered, hidden when not active */}
          <canvas
            ref={canvasRef}
            tabIndex={0}
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              display: browserActive ? 'block' : 'none',
              outline: 'none', pointerEvents: 'auto', cursor: 'default',
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={(e) => { canvasRef.current?.focus(); handleMouseDown(e); }}
            onMouseUp={handleMouseUp}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </section>

      {/* RIGHT PANEL: Live Scan Activity */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>

        {/* Live Scan Stats Card */}
        <div className="glass-card" style={{ borderRadius: 20, padding: 24, position: 'relative', overflow: 'hidden' }}>
          {scanning && (
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: 2,
              background: 'linear-gradient(90deg, transparent, var(--accent-blue), transparent)',
              boxShadow: '0 0 15px var(--accent-blue)',
              animation: 'scan-line 3s linear infinite',
              zIndex: 10, opacity: 0.5,
            }} />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(59,130,246,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-blue)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                <i className="fa-solid fa-radar" style={{ fontSize: 18 }} />
              </div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Live Scan</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className={connected ? 'pulse-dot' : ''} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: connected ? 'var(--accent-green)' : 'var(--text-dim)',
                    display: 'inline-block',
                  }} />
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                    color: connected ? 'var(--accent-green)' : 'var(--text-secondary)',
                  }}>
                    {connected ? 'Active' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleTriggerScan}
              disabled={scanning}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: scanning ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.5)',
                border: scanning ? 'none' : '1px solid rgba(0,0,0,0.06)',
                color: scanning ? 'white' : 'var(--text-secondary)',
                cursor: scanning ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease', fontSize: 12,
              }}
              title={scanning ? 'Scanning...' : 'Trigger Scan'}
            >
              {scanning ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <i className="fa-solid fa-bolt" />}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MiniStat label="Scan Rate" value={`${obsStats?.sessions_today || 0}/d`} />
            <MiniStat label="Candidates" value={candidateCount} />
            <MiniStat label="Scanned" value={Number(obsStats?.tweets_today || 0).toLocaleString()} />
            <MiniStat label="Avg Duration" value={
              obsStats?.avg_duration_secs
                ? `${Math.round(Number(obsStats.avg_duration_secs))}s`
                : '—'
            } />
          </div>
        </div>

        {/* Scan Log Card */}
        <div className="glass-card" style={{
          borderRadius: 20, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.5)',
            background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Scan Log</h3>
            <span className="font-mono" style={{
              background: 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)',
              fontSize: 10, padding: '3px 8px', borderRadius: 6,
            }}>Live</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {scanLog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
                <i className="fa-solid fa-satellite" style={{ fontSize: 20, marginBottom: 8, display: 'block' }} />
                Waiting for scan events...
              </div>
            ) : (
              scanLog.map((entry, i) => <ScanLogEntry key={i} entry={entry} />)
            )}
          </div>
        </div>
      </section>

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
