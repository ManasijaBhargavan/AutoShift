import React from 'react';

export const Logo = ({ size = 40, className = "" }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* The Icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background container */}
        <rect width="40" height="40" rx="12" className="fill-indigo-50" />
        
        {/* Shift Block 1 (Top Left - Emerald/Available) */}
        <rect x="8" y="10" width="14" height="6" rx="3" className="fill-emerald-500" />
        
        {/* Shift Block 2 (Middle - Indigo/Primary) */}
        <rect x="14" y="18" width="18" height="6" rx="3" className="fill-indigo-600" />
        
        {/* Shift Block 3 (Bottom - Amber/Warning or Variation) */}
        <rect x="8" y="26" width="10" height="6" rx="3" className="fill-amber-400" />
        
        {/* Connection Line (representing the algorithm) */}
        <path d="M24 13L28 13C30 13 32 15 32 18V29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-900 opacity-10"/>
      </svg>

      {/* The Text Name */}
      <div className="flex flex-col">
        <span className="font-extrabold text-lg leading-tight text-slate-800 tracking-tight">
          Shift<span className="text-indigo-600">Sync</span>
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          AI Scheduler
        </span>
      </div>
    </div>
  );
};