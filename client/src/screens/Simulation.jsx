import React from 'react';

export default function Simulation() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px 64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: 48 }}>
          {/* Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(107, 114, 128, 0.1)',
            border: '1px solid rgba(107, 114, 128, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <i className="fa-solid fa-flask" style={{ fontSize: 28, color: 'var(--text-dim)' }} />
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Simulation Not Yet Active
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
            The simulation engine benchmarks your persona against real human behaviour patterns.
            It compares your GhostPost activity against thousands of verified human-operated accounts
            to produce a believability score.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28, padding: '12px 16px', background: 'var(--bg-app)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            <i className="fa-solid fa-circle-info" style={{ color: 'var(--accent-blue)', marginRight: 8 }} />
            This feature will be available once you have <strong style={{ color: 'var(--text-primary)' }}>7+ days of activity</strong> and at least <strong style={{ color: 'var(--text-primary)' }}>50 observations</strong> on record.
          </p>

          {/* Placeholder score rings — greyed out */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24, opacity: 0.3 }}>
            {['Behaviour Score', 'Timing Score', 'Content Score'].map(label => (
              <div key={label} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--border-subtle)', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{label}</div>
                <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>—</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Built in Sprint 14 — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
