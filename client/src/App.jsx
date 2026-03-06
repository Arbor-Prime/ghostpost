import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Welcome from './screens/Welcome';
import Recording from './screens/Recording';
import Processing from './screens/Processing';
import VoiceProfile from './screens/VoiceProfile';
import PersonaSchedule from './screens/PersonaSchedule';
import XAuth from './screens/XAuth';
import Dashboard from './screens/Dashboard';
import BrowserView from './screens/BrowserView';
import Approvals from './screens/Approvals';
import TrackedProfiles from './screens/TrackedProfiles';
import Personas from './screens/Personas';
import AIComposition from './screens/AIComposition';
import Simulation from './screens/Simulation';
import Settings from './screens/Settings';

const MAIN_ROUTES = [
  { path: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-table-columns', component: Dashboard },
  { path: '/connect', label: 'X Connect', icon: 'fa-brands fa-x-twitter', component: XAuth },
  { path: '/browser', label: 'Browser View', icon: 'fa-regular fa-compass', component: BrowserView },
  { path: '/approvals', label: 'Approvals', icon: 'fa-solid fa-check-to-slot', component: Approvals, badge: true },
  { path: '/tracked', label: 'Tracked Profiles', icon: 'fa-solid fa-users-viewfinder', component: TrackedProfiles },
  { path: '/personas', label: 'Personas', icon: 'fa-solid fa-masks-theater', component: Personas },
  { path: '/compose', label: 'AI Composition', icon: 'fa-solid fa-wand-magic-sparkles', component: AIComposition },
  { path: '/simulation', label: 'Simulation', icon: 'fa-solid fa-flask', component: Simulation },
  { path: '/settings', label: 'Settings', icon: 'fa-solid fa-gear', component: Settings },
];

const ONBOARDING_ROUTES = ['/welcome', '/recording', '/processing', '/voice-profile', '/persona-schedule', '/x-auth'];

function OnboardingGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const isOnboardingRoute = ONBOARDING_ROUTES.some(r => location.pathname.startsWith(r));

  useEffect(() => {
    if (isOnboardingRoute) {
      setChecked(true);
      return;
    }

    fetch('/api/voice-profile/status')
      .then(r => r.json())
      .then(data => {
        if (!data.complete) {
          setNeedsOnboarding(true);
          navigate('/welcome', { replace: true });
        }
        setChecked(true);
      })
      .catch(() => {
        setNeedsOnboarding(true);
        navigate('/welcome', { replace: true });
        setChecked(true);
      });
  }, []);

  if (!checked) return null;
  return children;
}

function AppLayout() {
  const location = useLocation();
  const [systemActive, setSystemActive] = useState(true);
  const isOnboarding = ONBOARDING_ROUTES.some(r => location.pathname.startsWith(r));

  if (isOnboarding) {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/recording" element={<Recording />} />
        <Route path="/processing" element={<Processing />} />
        <Route path="/voice-profile" element={<VoiceProfile />} />
        <Route path="/persona-schedule" element={<PersonaSchedule />} />
        <Route path="/x-auth" element={<XAuth />} />
      </Routes>
    );
  }

  const currentRoute = MAIN_ROUTES.find(r => location.pathname.startsWith(r.path));
  const title = currentRoute ? currentRoute.label : 'Dashboard';
  const isBrowserView = location.pathname === '/browser';

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        marginLeft: 72,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app)',
      }}>
        {!isBrowserView && <Header title={title} />}
        <div style={{ flex: 1, overflow: 'auto', padding: isBrowserView ? 0 : '0 0' }}>
          <Routes>
            {MAIN_ROUTES.map(r => <Route key={r.path} path={r.path} element={<r.component />} />)}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <OnboardingGuard>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/recording" element={<Recording />} />
          <Route path="/processing" element={<Processing />} />
          <Route path="/voice-profile" element={<VoiceProfile />} />
          <Route path="/persona-schedule" element={<PersonaSchedule />} />
          <Route path="/x-auth" element={<XAuth />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </OnboardingGuard>
    </Router>
  );
}
