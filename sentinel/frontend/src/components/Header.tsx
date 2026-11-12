import React, { useState } from 'react';
import { SystemState } from '../types';
import {
  ShieldCheck, AlertTriangle, AlertOctagon, CheckCircle2,
  Sparkles, Sun, Moon, Info, ChevronDown, Activity, Globe,
  Compass, Calculator, FileText, Database, ShieldAlert, Cpu,
  Search, Bell, MessageSquare
} from 'lucide-react';

interface HeaderProps {
  systemState: SystemState | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onSelectScenario: (scenario: string) => void;
  onOpenDemoModal: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  systemState,
  activeTab,
  onSelectTab,
  onSelectScenario,
  onOpenDemoModal,
  theme,
  onToggleTheme
}) => {
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(false);
  const [showScenarioMenu, setShowScenarioMenu] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const scenarios = [
    { id: 'Scenario 1: Normal Operation', title: '1. Normal Operation (Monitoring)' },
    { id: 'Scenario 2: Avoidable Close Approach', title: '2. Avoidable Close Approach (Pass)' },
    { id: 'Scenario 3: No Acceptable Maneuver', title: '3. No Acceptable Maneuver (Review)' }
  ];

  const safety_status = systemState?.safety_status || 'MONITORING';
  const isRunning = systemState?.clock?.is_running ?? false;
  const simTime = systemState?.clock?.sim_time ?? 0;
  const currentScenarioName = systemState?.clock?.scenario_name || 'Scenario 2: Avoidable Close Approach';

  return (
    <header className="h-12 sm:h-14 w-full bg-white border-b border-slate-100 px-3 sm:px-6 flex items-center justify-between gap-2 select-none relative z-30 shrink-0">
      
      {/* ── Left: Brand Title ("SENTINEL • ORBITAL SAFETY COMMAND") & Space Search Bar ── */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 md:flex-1 md:max-w-xl">
        <div className="flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0" onClick={() => onSelectTab('Mission Control')}>
          <svg viewBox="0 0 40 40" className="w-6 h-6 md:hidden shrink-0">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="60 30" />
            <circle cx="20" cy="20" r="12" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="40 20" />
            <circle cx="20" cy="20" r="8" fill="none" stroke="#ec4899" strokeWidth="2.5" strokeDasharray="25 15" />
            <circle cx="20" cy="20" r="3.5" fill="#4f46e5" />
          </svg>
          <span className="font-black text-xs md:text-sm tracking-wider font-mono text-[#4f46e5]">
            SENTINEL
          </span>
          <span className="hidden lg:inline text-[10px] font-mono text-slate-400 font-semibold tracking-wider">
            • ORBITAL SAFETY COMMAND
          </span>
        </div>

        <div className="hidden md:block h-4 w-[1px] bg-slate-200" />

        {/* Search input with magnifying glass icon */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search satellite NORAD ID, debris catalog, ephemeris..."
            className="w-full text-xs text-slate-700 placeholder:text-slate-400 bg-transparent focus:outline-none font-sans"
          />
        </div>
      </div>

      {/* ── Right: Scenario Selector, Evaluator Demo, Bell & Chat Icons ── */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Scenario Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowScenarioMenu(!showScenarioMenu)}
            className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-medium px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-200/90 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all shadow-2xs"
          >
            <span className="hidden sm:inline font-mono text-indigo-600 text-[10px] font-bold">SCENARIO:</span>
            <span className="font-semibold truncate max-w-[96px] sm:max-w-[140px] text-slate-900">
              {currentScenarioName.split(':')[1]?.trim() || currentScenarioName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {showScenarioMenu && (
            <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl shadow-xl py-1.5 z-40 bg-white border border-slate-200 text-slate-800">
              <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase border-b border-slate-100">
                Select Deterministic Scenario
              </div>
              {scenarios.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => {
                    onSelectScenario(sc.id);
                    setShowScenarioMenu(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center justify-between hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <span className="font-medium">{sc.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Simulation Clock & Active Indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 border border-slate-200 bg-slate-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-mono shadow-2xs">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
          <span className="hidden sm:inline text-[11px] font-sans font-semibold text-slate-500">{isRunning ? 'ACTIVE' : 'PAUSED'}</span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="font-bold text-indigo-600 whitespace-nowrap">T+{simTime.toFixed(0)}s</span>
        </div>

        {/* Evaluator Demo Mode Button */}
        <button
          onClick={onOpenDemoModal}
          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[11px] sm:text-xs shadow-2xs flex items-center gap-1 sm:gap-1.5 transition-all"
          title="Launch 5-Minute Evaluator Guided Walkthrough"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="sm:hidden">Demo</span>
          <span className="hidden sm:inline">Evaluator Demo</span>
        </button>

        {/* Orbital Alert Feed Indicator */}
        <div className="hidden md:block relative p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-50 transition-colors" title="Conjunction Alerts">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
        </div>

        {/* Telemetry Dispatch Log */}
        <div className="hidden md:block p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-50 transition-colors" title="Mission Logs">
          <MessageSquare className="w-4 h-4" />
        </div>

        {/* Technical Honesty Disclaimer Popover */}
        <div className="relative">
          <button
            onClick={() => setShowDisclaimer(!showDisclaimer)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            title="Educational Prototype Disclaimer"
          >
            <Info className="w-4 h-4 text-indigo-600" />
          </button>

          {showDisclaimer && (
            <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl shadow-xl p-4 text-xs leading-relaxed z-50 bg-white border border-slate-200 text-slate-600">
              <div className="font-bold mb-1 flex items-center gap-1.5 text-indigo-900">
                <Info className="w-3.5 h-3.5 text-indigo-600" />
                Technical Honesty Disclaimer
              </div>
              <p className="text-[11px]">
                Prototype using a simplified orbital model, synthetic scenarios, and illustrative 3D visualization. Not live tracking or an operational conjunction assessment tool.
              </p>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                Engine: Deterministic Two-Body RK4 • Synthetic Catalog: 1,911 objects
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
