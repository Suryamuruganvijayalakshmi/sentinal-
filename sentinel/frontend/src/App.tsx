import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { MissionControl } from './pages/MissionControl';
import { ObjectExplorer } from './pages/ObjectExplorer';
import { Simulator } from './pages/Simulator';
import { ManeuverLab } from './pages/ManeuverLab';
import { VerificationCenter } from './pages/VerificationCenter';
import { OrbitalAnalytics } from './pages/OrbitalAnalytics';
import { FormulaLaboratory } from './pages/FormulaLaboratory';
import { MissionReports } from './pages/MissionReports';
import { PredictionsPage } from './pages/PredictionsPage';
import { EvaluatorDemoModal } from './components/EvaluatorDemoModal';
import { SystemState } from './types';
import { api } from './services/api';
import { standaloneSimulation } from './services/standaloneSimulation';
import { CameraPresetMode } from './three/OrbitalCanvas';
import {
  LayoutDashboard, TrendingUp, Compass, ShieldAlert,
  Sliders, ShieldCheck, Calculator, FileText,
  Power, User, Activity
} from 'lucide-react';

export function App() {
  const [systemState, setSystemState] = useState<SystemState>(() => standaloneSimulation.getState());
  const [activeTab, setActiveTab] = useState<string>('Mission Control');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraPresetMode>('GLOBAL');
  const [theme, setTheme] = useState<'light' | 'dark'>('light'); // Executive White Theme Default
  const [isDemoModalOpen, setIsDemoModalOpen] = useState<boolean>(false);
  const pollInFlightRef = useRef<boolean>(false);

  // Poll simulation state sequentially (drives smooth 60fps / 4Hz physics & clock)
  const fetchStatus = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const state = await api.getStatus();
      setSystemState(state);
    } catch (e) {
      console.warn('Simulation tick:', e);
      setSystemState(standaloneSimulation.getState());
    } finally {
      pollInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timerId: number | undefined;
    const intervalMs = 33; // 30Hz physics telemetry update

    const scheduleNext = () => {
      if (cancelled || document.hidden) return;
      timerId = window.setTimeout(runPoll, intervalMs);
    };

    const runPoll = async () => {
      if (cancelled) return;
      await fetchStatus();
      scheduleNext();
    };

    const handleVisibility = () => {
      if (!document.hidden && !cancelled) {
        if (timerId !== undefined) window.clearTimeout(timerId);
        runPoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    runPoll();

    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStatus]);

  const handleSelectScenario = async (scenarioName: string) => {
    try {
      await api.loadScenario(scenarioName);
      await fetchStatus();
    } catch (e) {
      console.error('Failed to load scenario:', e);
    }
  };

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleJumpToCPA = () => {
    setCameraMode('PROXIMITY');
  };

  const navItems = [
    { id: 'Mission Control', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'Orbital Analytics', icon: TrendingUp, label: 'Analytics' },
    { id: 'Trajectory Predictions', icon: Activity, label: 'Predictions' },
    { id: 'Object Explorer', icon: Compass, label: 'Explorer' },
    { id: 'Collision Simulator', icon: ShieldAlert, label: 'Simulator' },
    { id: 'Maneuver Planner', icon: Sliders, label: 'Planner' },
    { id: 'Verification Center', icon: ShieldCheck, label: 'Verify' },
    { id: 'Formula Laboratory', icon: Calculator, label: 'Formula Lab' },
    { id: 'Mission Reports', icon: FileText, label: 'Reports' }
  ];

  return (
    <div className="w-full h-[100dvh] flex items-center justify-center overflow-hidden font-sans bg-gradient-to-br from-[#5b63d3] via-[#757ee6] to-[#4c54cb] p-0 sm:p-2 md:p-4 lg:p-5">
      
      {/* ── MISSION CONTROL EXECUTIVE WORKSPACE SHELL ── */}
      <div className="w-full h-full flex flex-col md:flex-row overflow-hidden relative max-w-[1620px] bg-[#f4f6fc] rounded-none sm:rounded-[28px] md:rounded-[32px] shadow-2xl border-0 sm:border sm:border-white/50">
        
        {/* ── LEFT VERTICAL NAVIGATION RAIL (Desktop / Tablet Landscape) ── */}
        <aside className="hidden md:flex w-14 md:w-16 flex-col items-center py-4 justify-between shrink-0 z-30 transition-colors bg-white border-r border-slate-100">
          
          {/* Top Aerospace Telemetry Emblem */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            onClick={() => setActiveTab('Mission Control')}
            title="SENTINEL Orbital Safety Simulator"
          >
            <svg viewBox="0 0 40 40" className="w-8 h-8">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeDasharray="60 30" />
              <circle cx="20" cy="20" r="12" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="40 20" />
              <circle cx="20" cy="20" r="8" fill="none" stroke="#ec4899" strokeWidth="2" strokeDasharray="25 15" />
              <circle cx="20" cy="20" r="3" fill="#4f46e5" />
            </svg>
          </div>

          {/* Primary Subsystem Navigation */}
          <nav className="flex flex-col items-center gap-1.5 w-full my-auto">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`relative w-full py-3 flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'text-[#4f46e5] bg-indigo-50/80 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#4f46e5] before:rounded-r'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </nav>

          {/* Bottom Mission Officer & Scenario Reset */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center text-xs text-slate-600 shadow-2xs"
              title="Mission Safety Officer"
            >
              <User className="w-4 h-4 text-slate-600" />
            </div>

            <button
              onClick={() => handleSelectScenario('Scenario 2: Avoidable Close Approach')}
              title="Reset Simulation Scenario"
              className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT AREA (Header + Active Viewport) ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col md:h-full overflow-hidden bg-[#f4f6fc]">
          
          {/* Top Search & System Header */}
          <Header
            systemState={systemState}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onSelectScenario={handleSelectScenario}
            onOpenDemoModal={() => setIsDemoModalOpen(true)}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />

          {/* Active Viewport */}
          <main className="flex-1 min-h-0 w-full overflow-hidden relative">
            {activeTab === 'Mission Control' && (
              <MissionControl
                systemState={systemState}
                selectedObjectId={selectedObjectId}
                onSelectObject={id => {
                  setSelectedObjectId(id);
                  api.selectTarget(id);
                }}
                cameraMode={cameraMode}
                onChangeCameraMode={setCameraMode}
                onOpenManeuverLab={() => setActiveTab('Maneuver Planner')}
                onJumpToCPA={handleJumpToCPA}
                onNavigateToReports={() => setActiveTab('Mission Reports')}
                onSelectScenario={handleSelectScenario}
                theme={theme}
              />
            )}

            {activeTab === 'Object Explorer' && (
              <ObjectExplorer
                systemState={systemState}
                onRefreshState={fetchStatus}
                onSelectObject={id => {
                  setSelectedObjectId(id);
                  api.selectTarget(id);
                }}
                onNavigateToSimulator={() => setActiveTab('Collision Simulator')}
                theme={theme}
              />
            )}

            {(activeTab === 'Collision Simulator' || activeTab === 'Simulator') && (
              <Simulator
                systemState={systemState}
                onRefreshState={fetchStatus}
                onSelectScenario={handleSelectScenario}
                theme={theme}
              />
            )}

            {activeTab === 'Trajectory Predictions' && (
              <PredictionsPage
                systemState={systemState}
                onNavigateToManeuverLab={() => setActiveTab('Maneuver Planner')}
                theme={theme}
              />
            )}

            {(activeTab === 'Maneuver Planner' || activeTab === 'Maneuver Lab') && (
              <ManeuverLab
                systemState={systemState}
                onRefreshState={fetchStatus}
                theme={theme}
              />
            )}

            {activeTab === 'Verification Center' && (
              <VerificationCenter
                systemState={systemState}
                onNavigateToReports={() => setActiveTab('Mission Reports')}
                onNavigateToManeuverLab={() => setActiveTab('Maneuver Planner')}
                theme={theme}
              />
            )}

            {activeTab === 'Orbital Analytics' && (
              <OrbitalAnalytics systemState={systemState} />
            )}

            {(activeTab === 'Formula Laboratory' || activeTab === 'Formula Lab') && (
              <FormulaLaboratory systemState={systemState} />
            )}

            {(activeTab === 'Mission Reports' || activeTab === 'Mission Results') && (
              <MissionReports
                systemState={systemState}
              />
            )}
          </main>
        </div>

        {/* ── MOBILE BOTTOM NAVIGATION BAR (< md) ── */}
        <nav
          aria-label="Mobile Subsystem Navigation"
          className="flex md:hidden items-center gap-1 overflow-x-auto no-scrollbar bg-white border-t border-slate-200 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shrink-0 z-30"
        >
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`min-w-[60px] px-2 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 shrink-0 transition-all ${
                  isActive
                    ? 'text-[#4f46e5] bg-indigo-50 font-bold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 font-medium'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] leading-tight whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => handleSelectScenario('Scenario 2: Avoidable Close Approach')}
            title="Reset Simulation Scenario"
            className="min-w-[54px] px-2 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 shrink-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
          >
            <Power className="w-4 h-4" />
            <span className="text-[10px] leading-tight whitespace-nowrap">Reset</span>
          </button>
        </nav>
      </div>

      {/* ── 5-MINUTE EVALUATOR PRESENTATION MODE MODAL ── */}
      <EvaluatorDemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onNavigateTab={tab => setActiveTab(tab)}
        onRefreshState={fetchStatus}
      />
    </div>
  );
}

export default App;
