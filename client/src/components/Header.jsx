import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';

export default function Header({ title, subtitle }) {
  const [time, setTime] = useState('');
  const { connected } = useSocket() || {};

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header style={{
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      background: 'transparent',
      zIndex: 20,
      flexShrink: 0,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Live connection indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={connected ? 'Live' : 'Offline'}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: connected ? 'var(--accent-green)' : 'var(--text-dim)',
            animation: connected ? 'pulse-dot 2s ease infinite' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Clock */}
        <span
          className="font-mono"
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            background: 'var(--bg-card)',
            padding: '5px 10px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
          }}
        >
          {time}
        </span>

        {/* Notification bell */}
        <button style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 15,
          transition: 'color 0.15s ease',
        }}>
          <i className="fa-regular fa-bell" />
        </button>
      </div>
    </header>
  );
}
