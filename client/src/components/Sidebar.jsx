import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDrafts } from '../api';

const USER_ID = 1;

const NAV_ITEMS = [
  { path: '/dashboard',  label: 'Dashboard',       icon: 'fa-solid fa-table-columns' },
  { path: '/browser',    label: 'Browser View',     icon: 'fa-solid fa-compass' },
  { path: '/approvals',  label: 'Approvals',        icon: 'fa-solid fa-check-to-slot', badge: true },
  { path: '/tracked',    label: 'Tracked Profiles', icon: 'fa-solid fa-users-viewfinder' },
  { path: '/personas',   label: 'Personas',         icon: 'fa-solid fa-masks-theater' },
  { path: '/compose',    label: 'AI Composition',   icon: 'fa-solid fa-wand-magic-sparkles' },
  { path: '/simulation', label: 'Simulation',       icon: 'fa-solid fa-flask' },
  { path: '/settings',   label: 'Settings',         icon: 'fa-solid fa-gear' },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('gp-theme');
    return stored || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gp-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  return { theme, toggle };
}

function NavIcon({ item, isActive, pendingCount, onClick }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  const s = {
    wrapper: {
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
    },
    btn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      transition: 'all 0.15s ease',
      position: 'relative',
      background: isActive
        ? 'var(--gradient-brand)'
        : hovered
          ? 'var(--border-subtle)'
          : 'transparent',
      color: isActive
        ? 'white'
        : hovered
          ? 'var(--text-primary)'
          : 'var(--text-dim)',
      boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
    },
    badge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--accent-red)',
      border: '1.5px solid var(--bg-sidebar)',
    },
    tooltip: {
      position: 'absolute',
      left: 'calc(100% + 12px)',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'var(--bg-card-solid)',
      border: '1px solid var(--border-card)',
      borderRadius: 10,
      padding: '6px 12px',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      boxShadow: 'var(--shadow-card)',
      pointerEvents: 'none',
      zIndex: 9999,
      opacity: hovered ? 1 : 0,
      transition: 'opacity 0.15s ease',
    },
  };

  return (
    <div style={s.wrapper} ref={ref}>
      <button
        style={s.btn}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={item.label}
      >
        <i className={item.icon} />
        {item.badge && pendingCount > 0 && <span style={s.badge} />}
      </button>
      <div style={s.tooltip}>{item.label}</div>
    </div>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const [themeHovered, setThemeHovered] = useState(false);
  const [avatarHovered, setAvatarHovered] = useState(false);

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    getDrafts(USER_ID)
      .then(r => setPendingCount(r.data?.length || 0))
      .catch(() => {});

    const interval = setInterval(() => {
      getDrafts(USER_ID)
        .then(r => setPendingCount(r.data?.length || 0))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const s = {
    sidebar: {
      width: 72,
      minWidth: 72,
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 16,
      gap: 4,
      background: 'var(--bg-sidebar)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--border-subtle)',
    },
    logo: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: 'var(--gradient-brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      color: 'white',
      marginBottom: 8,
      flexShrink: 0,
      boxShadow: 'var(--shadow-glow)',
    },
    spacer: { flex: 1 },
    divider: {
      width: 32,
      height: 1,
      background: 'var(--border-subtle)',
      margin: '4px 0',
    },
    themeBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 15,
      transition: 'all 0.15s ease',
      background: themeHovered ? 'var(--border-subtle)' : 'transparent',
      color: themeHovered ? 'var(--text-primary)' : 'var(--text-dim)',
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'var(--gradient-brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 700,
      color: 'white',
      cursor: 'pointer',
      border: avatarHovered ? '2px solid var(--accent-blue)' : '2px solid transparent',
      transition: 'border-color 0.15s ease',
    },
  };

  return (
    <div style={s.sidebar}>
      {/* Logo */}
      <div style={s.logo}>
        <i className="fa-solid fa-ghost" />
      </div>

      <div style={s.divider} />

      {/* Nav Items */}
      {NAV_ITEMS.map(item => (
        <NavIcon
          key={item.path}
          item={item}
          isActive={location.pathname.startsWith(item.path)}
          pendingCount={pendingCount}
          onClick={() => navigate(item.path)}
        />
      ))}

      <div style={s.spacer} />
      <div style={s.divider} />

      {/* Theme Toggle */}
      <button
        style={s.themeBtn}
        onClick={toggle}
        onMouseEnter={() => setThemeHovered(true)}
        onMouseLeave={() => setThemeHovered(false)}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        <i className={theme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'} />
      </button>

      {/* User Avatar */}
      <div
        style={s.avatar}
        onMouseEnter={() => setAvatarHovered(true)}
        onMouseLeave={() => setAvatarHovered(false)}
        title="User"
      >
        GP
      </div>
    </div>
  );
}
