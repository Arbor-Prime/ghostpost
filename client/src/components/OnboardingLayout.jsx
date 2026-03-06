import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const SCREENS = [
  { path: '/', name: 'Welcome', step: 1 },
  { path: '/recording', name: 'Recording', step: 2 },
  { path: '/processing', name: 'Processing', step: 3 },
  { path: '/voice-profile', name: 'Voice Profile', step: 4 },
  { path: '/persona-schedule', name: 'Persona Schedule', step: 5 },
  { path: '/x-auth', name: 'X OAuth', step: 6 },
];

export default function OnboardingLayout({ children, currentStep, onPrev, onNext, prevDisabled = false, nextDisabled = false }) {
  const navigate = useNavigate();
  const idx = currentStep - 1;

  const handlePrev = () => {
    if (onPrev) onPrev();
    else if (idx > 0) navigate(SCREENS[idx - 1].path);
  };

  const handleNext = () => {
    if (onNext) onNext();
    else if (idx < SCREENS.length - 1) navigate(SCREENS[idx + 1].path);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {children}
      {/* Bottom nav bar */}
      <div className="fixed bottom-0 left-0 right-0 h-10 border-t border-[#2a2b32] bg-[#131316] flex items-center justify-between px-6 z-50">
        <div className="flex gap-2">
          {SCREENS.map((s, i) => (
            <div
              key={s.path}
              className={`w-2 h-2 rounded-full ${i + 1 === currentStep ? 'bg-white' : 'bg-[#2a2b32]'}`}
            />
          ))}
        </div>
        <div className="text-xs font-mono text-[#9ca3af]">
          Screen {currentStep} of 14: {SCREENS[idx]?.name || 'Onboarding'}
        </div>
        <div className="flex gap-4">
          <button
            onClick={handlePrev}
            disabled={prevDisabled}
            className="text-xs text-[#9ca3af] hover:text-white disabled:opacity-30 cursor-not-allowed disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-chevron-left mr-1" /> Previous
          </button>
          <button
            onClick={handleNext}
            disabled={nextDisabled}
            className="text-xs text-[#9ca3af] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next <i className="fa-solid fa-chevron-right ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
