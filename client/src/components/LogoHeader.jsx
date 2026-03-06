import React from 'react';

export default function LogoHeader() {
  return (
    <header className="w-full flex justify-center pt-12 pb-6 z-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full ghost-icon-bg flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)]">
          <i className="fa-solid fa-ghost text-white text-lg" />
        </div>
        <span className="text-2xl font-bold tracking-tight">GhostPost</span>
      </div>
    </header>
  );
}
