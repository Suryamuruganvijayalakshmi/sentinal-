import React, { useState, useMemo, useEffect } from 'react';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';
import { SystemState } from '../types';
import { api } from '../services/api';
import {
  AlertTriangle, ShieldAlert, ShieldCheck, Play, Pause, RotateCcw,
  SkipForward, Rocket, FileText, ChevronDown, Radio, Activity,
  Sliders, Globe, Sparkles
} from 'lucide-react';

interface MissionControlProps {
  systemState: SystemState;
  selectedObjectId: string | null;
  onSelectObject: (id: string) => void;
  cameraMode: CameraPresetMode;
  onChangeCameraMode: (mode: CameraPresetMode) => void;
  onOpenManeuverLab: () => void;
  onJumpToCPA: () => void;
  onNavigateToReports?: () => void;
  theme: 'light' | 'dark';
}

export const MissionControl: React.FC<MissionControlProps> = ({
  systemState,
  selectedObjectId,
  onSelectObject,
  cameraMode,
  onChangeCameraMode,
  onNavigateToReports,
}) => {
  const {
    clock,
    sentinel,
    target,
    objects,
    risks,
    safety_status = 'MONITORING',
    screening_distance_km = 25.0,
    maneuver_candidates = [],
    executed_maneuver
  } = systemState;

  const [isAutoExecuting, setIsAutoExecuting] = useState<boolean>(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'DENSITY' | 'SHELL' | 'TIMELINE'>('TIMELINE');
  const [mobileHudOpen, setMobileHudOpen] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  const simTime = clock?.sim_time ?? 0;
  const isRunning = clock?.is_running ?? true;
  const timeScale = clock?.time_scale ?? 25;
  const scenarioName = clock?.scenario_name || 'Scenario 2: Avoidable Close Approach';

  // Format live UTC Epoch from base + simTime
  const epochString = useMemo(() => {
    const baseEpochMs = new Date('2024-10-27T14:38:05Z').getTime();
    const currentMs = baseEpochMs + Math.round(simTime * 1000);
    const d = new Date(currentMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }, [simTime]);

  // Determine active scenario category
  const isScenario1 = scenarioName.toLowerCase().includes('normal') || scenarioName.toLowerCase().includes('scenario 1');
  const isScenario3 = scenarioName.toLowerCase().includes('no acceptable') || scenarioName.toLowerCase().includes('scenario 3');
  const isScenario2 = !isScenario1 && !isScenario3;

  // Collision risk metrics
  const threatRisk = risks?.find(r =>
    (r.object_a_id === target?.id && (r.object_b_id === sentinel?.id || r.object_b_id === 'SAT-01')) ||
    (r.object_b_id === target?.id && (r.object_a_id === sentinel?.id || r.object_a_id === 'SAT-01'))
  ) || (risks && risks.length > 0 ? risks[0] : null);

  const isExecuted = Boolean(executed_maneuver);

  // Dynamic collision probability
  const collisionProbabilityPct = isScenario1
    ? 0.0001
    : isExecuted
    ? 0.0001
    : isScenario3
    ? 99.9
    : 98.2;

  const threatActive = !isScenario1 && !isExecuted;

  // CPA and T-Minus calculations
  const cpaDistanceKm = isExecuted
    ? (executed_maneuver?.resulting_d_cpa_km ?? 34.2)
    : isScenario1
    ? 58.4
    : (threatRisk?.cpa_distance_km ?? target?.metadata?.predicted_cpa_km ?? 0.0128);

  const tCpaRemainingS = Math.max(0, Math.round((threatRisk?.cpa_time_s ?? 258) - simTime));
  const tMinusMinutes = Math.floor(tCpaRemainingS / 60);
  const tMinusSeconds = tCpaRemainingS % 60;
  const tMinusStr = `00:${String(tMinusMinutes).padStart(2, '0')}:${String(tMinusSeconds).padStart(2, '0')}`;

  const currentDistKm = sentinel && target
    ? Math.sqrt(
        (target.position_x - sentinel.position_x) ** 2 +
        (target.position_y - sentinel.position_y) ** 2 +
        (target.position_z - sentinel.position_z) ** 2
      )
    : (isScenario1 ? 64.2 : 12.8);

  const currentDistDisplay = currentDistKm < 1.0
    ? `${(currentDistKm * 1000).toFixed(1)}m`
    : `${currentDistKm.toFixed(2)} km`;

  // Scenario switching handler
  const handleSelectScenario = async (sc: string) => {
    try {
      await api.loadScenario(sc);
    } catch (e) {
      console.error('Failed to load scenario:', e);
    }
  };

  // Play / Pause toggle
  const handleTogglePlay = async () => {
    try {
      if (isRunning) await api.pause();
      else await api.play();
    } catch (e) {
      console.error('Toggle play error:', e);
    }
  };

  // Step simulation
  const handleStep = async (sec: number) => {
    try {
      await api.stepSimulation(sec);
    } catch (e) {
      console.error('Step error:', e);
    }
  };

  // Reset simulation
  const handleReset = async () => {
    try {
      await api.reset();
    } catch (e) {
      console.error('Reset error:', e);
    }
  };

  // Execute avoidance maneuver
  const handleExecuteBurn = async () => {
    setIsAutoExecuting(true);
    try {
      const candidate = maneuver_candidates[0] || { id: 'burn_prograde_opt' };
      await api.executeManeuver(candidate.id);
    } catch (e) {
      console.error('Maneuver execution error:', e);
    } finally {
      setIsAutoExecuting(false);
    }
  };

  // Fuel telemetry
  const fuelRemaining = sentinel?.fuel_kg ?? (isScenario3 ? 0.2 : 148.7);
  const fuelCapacity = 200.0;
  const fuelPct = Math.max(0, Math.min(100, (fuelRemaining / fuelCapacity) * 100));

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#02050f] text-cyan-300 font-mono select-none">
      
      {/* ── 1. FULL-BLEED 3D ORBITAL VIEWPORT ── */}
      <div className="absolute inset-0 z-0">
        <OrbitalCanvas
          objects={objects}
          sentinel={sentinel}
          target={target}
          risks={risks}
          selectedObjectId={selectedObjectId}
          onSelectObject={onSelectObject}
          cameraMode={cameraMode}
          onChangeCameraMode={onChangeCameraMode}
          simTime={simTime}
          isRunning={isRunning}
          timeScale={timeScale}
          theme="dark"
          hideControls={true}
        />
      </div>

      {/* ── 2. TOP AEROSPACE HUD HEADER (Full width glassmorphism) ── */}
      <header className="absolute top-0 left-0 right-0 z-20 px-3 sm:px-5 py-2.5 bg-[#071322]/85 backdrop-blur-md border-b border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
        
        {/* Left: ODTS Logo & Title */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-cyan-400/60 animate-ping opacity-30" />
            <div className="w-5 h-5 rounded-full border-2 border-cyan-400 flex items-center justify-center bg-cyan-950/60">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#00f0ff]" />
            </div>
          </div>
          <div>
            <div className="text-[12px] sm:text-[14px] font-black tracking-wider text-cyan-100 flex items-center gap-1.5">
              <span>ORBITAL DEBRIS TRACKING SYSTEM (ODTS)</span>
              <span className="text-cyan-400/60 font-normal">|</span>
              <span className="text-cyan-400 font-bold">ACTIVE MONITORING</span>
            </div>
            <div className="text-[10px] text-cyan-400/70 hidden sm:block tracking-wide">
              SENTINEL AUTONOMOUS COLLISION AVOIDANCE & FLIGHT SAFETY
            </div>
          </div>
        </div>

        {/* Center: Quick Scenario Switcher */}
        <div className="flex items-center gap-1.5 bg-[#030a14]/90 p-1 rounded-lg border border-cyan-500/25 overflow-x-auto max-w-full">
          <button
            onClick={() => handleSelectScenario('Scenario 1: Normal Operation')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer whitespace-nowrap ${
              isScenario1
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-400 hover:text-cyan-200 hover:bg-cyan-950/40'
            }`}
          >
            [1] NORMAL
          </button>
          <button
            onClick={() => handleSelectScenario('Scenario 2: Avoidable Close Approach')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer whitespace-nowrap ${
              isScenario2
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : 'text-slate-400 hover:text-cyan-200 hover:bg-cyan-950/40'
            }`}
          >
            [2] CLOSE APPROACH
          </button>
          <button
            onClick={() => handleSelectScenario('Scenario 3: No Acceptable Maneuver')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer whitespace-nowrap ${
              isScenario3
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'text-slate-400 hover:text-cyan-200 hover:bg-cyan-950/40'
            }`}
          >
            [3] CRITICAL (NO BURN)
          </button>
        </div>

        {/* Right: Epoch, System Status & Camera Modes */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex flex-col text-right">
            <span className="text-[10px] text-cyan-400/80 font-mono tracking-wider">
              EPOCH: {epochString}
            </span>
            <div className="flex items-center justify-end gap-1.5 text-[10px]">
              <span className="text-slate-400">SYSTEM STATUS:</span>
              <span className={`font-bold flex items-center gap-1 ${
                threatActive ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  threatActive ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
                }`} />
                {threatActive ? 'WARNING' : isExecuted ? 'VERIFIED SAFE' : 'NOMINAL'}
              </span>
            </div>
          </div>

          {/* Camera Quick Switcher */}
          <div className="hidden sm:flex items-center gap-1 bg-[#030a14]/90 p-1 rounded-lg border border-cyan-500/25">
            <button
              onClick={() => onChangeCameraMode('GLOBAL')}
              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                cameraMode === 'GLOBAL' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-cyan-300 hover:bg-cyan-900/40'
              }`}
              title="Earth Global View"
            >
              GLOBAL
            </button>
            <button
              onClick={() => onChangeCameraMode('LEO')}
              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                cameraMode === 'LEO' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-cyan-300 hover:bg-cyan-900/40'
              }`}
              title="Low Earth Orbit"
            >
              LEO
            </button>
            <button
              onClick={() => onChangeCameraMode('FOLLOW_SENTINEL')}
              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                cameraMode === 'FOLLOW_SENTINEL' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-cyan-300 hover:bg-cyan-900/40'
              }`}
              title="Lock SAT-A34"
            >
              SAT-A34
            </button>
            <button
              onClick={() => onChangeCameraMode('COLLISION')}
              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                cameraMode === 'COLLISION' || cameraMode === 'PROXIMITY'
                  ? 'bg-rose-500 text-white font-bold animate-pulse'
                  : 'text-rose-300 hover:bg-rose-900/40'
              }`}
              title="Encounter Vector View"
            >
              ENCOUNTER
            </button>
          </div>

          {/* Mobile HUD Toggle */}
          <button
            onClick={() => setMobileHudOpen(!mobileHudOpen)}
            className="sm:hidden px-2.5 py-1 text-xs bg-cyan-950/80 border border-cyan-500/40 rounded text-cyan-300"
          >
            {mobileHudOpen ? 'CLOSE HUD' : 'HUD PANELS'}
          </button>
        </div>
      </header>

      {/* ── 3. OVERLAID SCI-FI HUD PANELS CONTAINER (Pointer-events passthrough to 3D globe) ── */}
      <div className={`absolute inset-0 pt-16 pb-3 px-3 sm:px-5 pointer-events-none z-10 flex flex-col justify-between ${
        mobileHudOpen ? 'overflow-y-auto pointer-events-auto bg-[#02050f]/80 sm:bg-transparent sm:pointer-events-none' : ''
      }`}>
        
        {/* TOP ROW: LEFT TELEMETRY + RIGHT CONJUNCTION WARNING */}
        <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
          
          {/* ── LEFT HUD CARDS COLUMN ── */}
          <div className="w-full sm:w-72 lg:w-80 flex flex-col gap-2.5 pointer-events-auto">
            
            {/* CARD 1: LIVE TRACKING */}
            <div className="bg-[#071322]/85 backdrop-blur-md rounded-xl p-3 border border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-[11px] font-bold tracking-wider text-cyan-200">LIVE TRACKING</span>
                </div>
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#030a14]/60 p-1.5 rounded border border-cyan-500/15">
                  <div className="text-[9px] text-slate-400">Total</div>
                  <div className="text-xs font-bold text-cyan-300 mt-0.5">48,210</div>
                </div>
                <div className="bg-[#030a14]/60 p-1.5 rounded border border-cyan-500/15">
                  <div className="text-[9px] text-amber-400/80">Debris</div>
                  <div className="text-xs font-bold text-amber-300 mt-0.5">31,495</div>
                </div>
                <div className="bg-[#030a14]/60 p-1.5 rounded border border-cyan-500/15">
                  <div className="text-[9px] text-sky-400/80">Satellites</div>
                  <div className="text-xs font-bold text-sky-300 mt-0.5">16,715</div>
                </div>
              </div>
            </div>

            {/* CARD 2: THREAT ALERTS SUMMARY */}
            <div className="bg-[#071322]/85 backdrop-blur-md rounded-xl p-3 border border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 mb-2">
                <div className="flex items-center gap-1.5 text-rose-300">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-[11px] font-bold tracking-wider">THREAT ALERTS</span>
                </div>
                <span className="text-[10px] text-rose-400 font-bold px-1.5 py-0.2 rounded bg-rose-950/60 border border-rose-500/30">
                  {threatActive ? 'ACTIVE CONJUNCTION' : 'SAFE PASS'}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Screening Radius:</span>
                  <span className="text-cyan-300 font-bold">{screening_distance_km.toFixed(1)} km</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Relative Velocity:</span>
                  <span className="text-amber-300 font-bold">14.28 km/s</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Current Distance:</span>
                  <span className={`font-bold ${threatActive ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                    {currentDistDisplay}
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 3: THREAT ALERTS LIST */}
            <div className="bg-[#071322]/85 backdrop-blur-md rounded-xl p-3 border border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase flex justify-between">
                <span>CONJUNCTION CATALOG</span>
                <span className="text-cyan-400">LEO ORBIT</span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto no-scrollbar">
                
                {/* Threat item 1 */}
                <div
                  onClick={() => {
                    if (target) onSelectObject(target.id);
                    onChangeCameraMode('COLLISION');
                  }}
                  className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between text-[11px] ${
                    threatActive
                      ? 'bg-rose-950/50 border-rose-500/40 hover:bg-rose-900/50 text-rose-200'
                      : 'bg-cyan-950/40 border-cyan-500/20 text-cyan-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${threatActive ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`} />
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        <span>DEBRIS #8871</span>
                        <span className="text-[9px] opacity-75">49127</span>
                      </div>
                      <div className="text-[9px] text-slate-400">SAT-A34 'SENTINEL' VECTOR</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-rose-400">{cpaDistanceKm.toFixed(1)} km</div>
                    <div className="text-[9px] text-slate-400">{tMinusStr}</div>
                  </div>
                </div>

                {/* Secondary pass items */}
                <div className="p-1.5 rounded bg-[#030a14]/60 border border-cyan-500/15 flex items-center justify-between text-[10px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>DEBRIS #8872</span>
                  </div>
                  <span className="text-slate-400">48.2 km • SAFE PASS</span>
                </div>

                <div className="p-1.5 rounded bg-[#030a14]/60 border border-cyan-500/15 flex items-center justify-between text-[10px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>SAT-AS158 'STSOTINEL'</span>
                  </div>
                  <span className="text-slate-400">112.5 km • NOMINAL</span>
                </div>
              </div>
            </div>

          </div>

          {/* ── RIGHT HUD CARD: CONJUNCTION WARNING & PROBABILITY TREND ── */}
          <div className="w-full sm:w-80 lg:w-96 flex flex-col gap-2.5 pointer-events-auto">
            
            {/* WARNING & COLLISION PROBABILITY HUD */}
            <div className={`backdrop-blur-md rounded-xl p-3.5 border shadow-[0_8px_32px_rgba(0,0,0,0.6)] ${
              threatActive
                ? 'bg-[#18090d]/90 border-rose-500/50 shadow-rose-950/40'
                : 'bg-[#071322]/90 border-emerald-500/40 shadow-emerald-950/30'
            }`}>
              
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b pb-2 mb-2.5 border-white/10">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${threatActive ? 'text-rose-400 animate-bounce' : 'text-emerald-400'}`} />
                  <span className={`text-xs font-black tracking-wider ${threatActive ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {threatActive ? 'WARNING • HIGH CONJUNCTION RISK' : 'CONJUNCTION STATUS: SAFE'}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  threatActive ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {threatActive ? 'HIGH RISK' : 'NOMINAL'}
                </span>
              </div>

              {/* Collision Probability Score */}
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] text-slate-300">COLLISION PROBABILITY:</span>
                <span className={`text-lg sm:text-xl font-black ${
                  threatActive ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                }`}>
                  {collisionProbabilityPct.toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-3 font-mono">
                <span>EVENT ID: 49127</span>
                <span className={threatActive ? 'text-rose-300 font-bold' : 'text-slate-300'}>
                  T-MINUS: {tMinusStr}
                </span>
              </div>

              {/* PROBABILITY TREND MINI-GRAPH */}
              <div className="mb-3 bg-[#030712]/70 p-2 rounded-lg border border-white/10">
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                  <span>PROBABILITY TREND</span>
                  <span className={threatActive ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                    {threatActive ? 'RISING (98.2%)' : '0.0001% (LOW)'}
                  </span>
                </div>
                
                {/* SVG Curve */}
                <div className="w-full h-14 relative">
                  <svg viewBox="0 0 200 50" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={threatActive ? '#ef4444' : '#10b981'} stopOpacity="0.5" />
                        <stop offset="100%" stopColor={threatActive ? '#ef4444' : '#10b981'} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {threatActive ? (
                      <>
                        <path
                          d="M 0,45 Q 60,42 110,32 T 160,18 L 200,6 L 200,50 L 0,50 Z"
                          fill="url(#probGrad)"
                        />
                        <path
                          d="M 0,45 Q 60,42 110,32 T 160,18 L 200,6"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2.5"
                        />
                        <circle cx="200" cy="6" r="3" fill="#ef4444" className="animate-ping" />
                      </>
                    ) : (
                      <>
                        <path
                          d="M 0,48 L 200,48 L 200,50 L 0,50 Z"
                          fill="url(#probGrad)"
                        />
                        <path
                          d="M 0,48 L 200,48"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2"
                        />
                      </>
                    )}
                  </svg>
                </div>
              </div>

              {/* MIN DISTANCE CURVE */}
              <div className="mb-3 bg-[#030712]/70 p-2 rounded-lg border border-white/10">
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                  <span>MIN DISTANCE AT CPA</span>
                  <span className="text-cyan-300 font-bold">{cpaDistanceKm < 1 ? `${(cpaDistanceKm * 1000).toFixed(0)}m` : `${cpaDistanceKm.toFixed(1)} km`}</span>
                </div>
                <div className="w-full h-10 relative">
                  <svg viewBox="0 0 200 40" className="w-full h-full overflow-visible">
                    <path
                      d="M 0,8 Q 80,12 140,34 T 200,32"
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth="2"
                    />
                    <circle cx="140" cy="34" r="2.5" fill="#00f0ff" />
                  </svg>
                </div>
              </div>

              {/* AVOIDANCE ACTIONS & BURN BUTTON */}
              {isScenario2 && !isExecuted && (
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] text-slate-300 flex justify-between">
                    <span>RECOMMENDED BURN:</span>
                    <span className="text-cyan-300 font-bold">PROGRADE +2.4 m/s (Δh +18.5km)</span>
                  </div>
                  <button
                    onClick={handleExecuteBurn}
                    disabled={isAutoExecuting}
                    className="w-full py-2.5 px-3 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white rounded-lg text-xs font-black tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(244,63,94,0.5)] transition-all active:scale-98"
                  >
                    <Rocket className="w-4 h-4 text-white" />
                    <span>{isAutoExecuting ? 'EXECUTING BURN...' : 'EXECUTE AVOIDANCE MANEUVER'}</span>
                  </button>
                </div>
              )}

              {isScenario2 && isExecuted && (
                <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[11px] text-emerald-300 text-center font-bold">
                  ✓ MANEUVER EXECUTED • CPA EXPANDED TO {cpaDistanceKm.toFixed(1)} KM (SAFE PASS VERIFIED)
                </div>
              )}

              {isScenario3 && (
                <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-500/50 text-[10px] text-rose-300 leading-tight">
                  <div className="font-bold text-rose-400 mb-1">CRITICAL ALERT: INSUFFICIENT PROPELLANT</div>
                  All candidate burn solutions intersect secondary debris fragments in swarm. Payload emergency shield mode recommended.
                </div>
              )}

              {isScenario1 && (
                <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 text-center">
                  All orbital assets in clear flight envelope. No conjunction vectors detected within screening volume.
                </div>
              )}

            </div>

            {/* HYDRAZINE PROPELLANT STATUS */}
            <div className="bg-[#071322]/85 backdrop-blur-md rounded-xl p-2.5 border border-cyan-500/30 text-[11px] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-slate-300">Hydrazine Propellant:</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${fuelPct < 15 ? 'bg-rose-500' : 'bg-cyan-400'}`}
                    style={{ width: `${fuelPct}%` }}
                  />
                </div>
                <span className="font-bold text-cyan-200">{fuelRemaining.toFixed(1)} kg</span>
              </div>
            </div>

          </div>

        </div>

        {/* ── 4. BOTTOM AEROSPACE HUD PANELS (DENSITY MAP | SHELL RADAR | TIMELINE & PLAYBACK) ── */}
        <div className="w-full mt-auto pt-2">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pointer-events-auto">
            
            {/* PANEL 1: DEBRIS FIELD DENSITY (4 cols) */}
            <div className="md:col-span-4 bg-[#071322]/85 backdrop-blur-md rounded-xl p-3 border border-cyan-500/30 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 mb-2">
                <span className="text-[10px] font-bold tracking-wider text-cyan-200">DEBRIS FIELD DENSITY</span>
                <span className="text-[9px] text-slate-400 font-mono">EQUIRECTANGULAR PROJECTION</span>
              </div>
              
              {/* 2D Equirectangular Earth Map with Glowing Density Clusters */}
              <div className="w-full h-24 relative bg-[#020713] rounded border border-cyan-500/20 overflow-hidden">
                
                {/* World Map Outline SVG */}
                <svg viewBox="0 0 360 180" className="w-full h-full opacity-40">
                  {/* Continents rough paths */}
                  <path d="M 60,40 L 90,35 L 120,45 L 110,70 L 80,75 Z" fill="#0d2847" />
                  <path d="M 90,85 L 120,80 L 130,130 L 110,140 Z" fill="#0d2847" />
                  <path d="M 170,30 L 230,25 L 250,55 L 200,60 Z" fill="#0d2847" />
                  <path d="M 180,70 L 220,65 L 210,110 L 190,110 Z" fill="#0d2847" />
                  <path d="M 230,35 L 300,30 L 320,60 L 270,75 Z" fill="#0d2847" />
                  <path d="M 280,100 L 320,95 L 310,130 L 280,125 Z" fill="#0d2847" />
                </svg>

                {/* Glowing Heatmap Spots */}
                <div className="absolute top-[28%] left-[24%] w-10 h-10 rounded-full bg-amber-500/30 blur-sm pointer-events-none" />
                <div className="absolute top-[25%] left-[52%] w-12 h-12 rounded-full bg-rose-500/35 blur-sm pointer-events-none" />
                <div className="absolute top-[32%] left-[78%] w-14 h-14 rounded-full bg-amber-500/35 blur-sm pointer-events-none" />
                <div className="absolute top-[50%] left-[82%] w-8 h-8 rounded-full bg-cyan-500/25 blur-sm pointer-events-none" />

                {/* Satellite sub-track dot */}
                <div className="absolute top-[35%] left-[45%] w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#00f0ff] animate-ping" />
                <div className="absolute top-[35%] left-[45%] w-2 h-2 rounded-full bg-cyan-300" />
                <div className="absolute bottom-1 right-2 text-[9px] text-cyan-400/80 font-mono">
                  DENSITY PEAK: 800-950 KM
                </div>
              </div>
            </div>

            {/* PANEL 2: ORBITAL SHELL ANALYSIS (4 cols) */}
            <div className="md:col-span-4 bg-[#071322]/85 backdrop-blur-md rounded-xl p-3 border border-cyan-500/30 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 mb-2">
                <span className="text-[10px] font-bold tracking-wider text-cyan-200">ORBITAL SHELL ANALYSIS</span>
                <span className="text-[9px] text-cyan-400 font-mono">LEO / MEO / GEO</span>
              </div>
              
              <div className="flex items-center justify-between gap-3 h-24">
                
                {/* Circular Polar Radar Graphic */}
                <div className="w-24 h-24 relative flex items-center justify-center shrink-0">
                  <div className="absolute w-24 h-24 rounded-full border border-cyan-500/20" />
                  <div className="absolute w-18 h-18 rounded-full border border-cyan-500/30 border-dashed" />
                  <div className="absolute w-12 h-12 rounded-full border border-cyan-500/40" />
                  <div className="absolute w-6 h-6 rounded-full bg-cyan-400/30 border border-cyan-400 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                  </div>
                  {/* Radar sweep hand */}
                  <div className="absolute w-12 h-0.5 bg-gradient-to-r from-transparent to-cyan-400 origin-left left-12 animate-spin" />
                </div>

                {/* Shell Altitude Histogram Bars */}
                <div className="flex-1 flex flex-col justify-between h-full py-1 text-[9px]">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>LEO (200-2,000 km)</span>
                      <span className="text-cyan-300 font-bold">84%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: '84%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>MEO (2,000-35,786 km)</span>
                      <span className="text-amber-300 font-bold">11%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: '11%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>GEO (35,786 km)</span>
                      <span className="text-purple-300 font-bold">5%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-400 rounded-full" style={{ width: '5%' }} />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* PANEL 3: EVENT TIMELINE & PLAYBACK CONTROLS (4 cols) */}
            <div className="md:col-span-4 bg-[#071322]/85 backdrop-blur-md rounded-xl p-3 border border-cyan-500/30 shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex flex-col justify-between">
              
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 mb-1.5">
                <span className="text-[10px] font-bold tracking-wider text-cyan-200">EVENT TIMELINE & PLAYBACK</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-cyan-400 font-mono">T+{simTime.toFixed(0)}s</span>
                  <span className="text-[9px] text-slate-400">({timeScale}x)</span>
                </div>
              </div>

              {/* Waveform / Timeline with CPA spike */}
              <div className="w-full h-8 relative flex items-center mb-1 bg-[#030712]/60 rounded px-2 border border-cyan-500/15">
                {/* Waveform bars */}
                <div className="flex items-center justify-between w-full h-full gap-0.5">
                  {Array.from({ length: 48 }).map((_, i) => {
                    const isCpaSpike = i >= 26 && i <= 30;
                    const h = isCpaSpike ? 24 : 4 + Math.sin(i * 0.4) * 5 + (i % 3) * 3;
                    return (
                      <div
                        key={i}
                        className={`w-0.5 rounded-full transition-all ${
                          isCpaSpike
                            ? 'bg-rose-500 shadow-[0_0_6px_#ef4444]'
                            : i < 20
                            ? 'bg-cyan-500/60'
                            : 'bg-cyan-500/30'
                        }`}
                        style={{ height: `${h}px` }}
                      />
                    );
                  })}
                </div>
                {/* Current playhead marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white]"
                  style={{ left: `${Math.min(95, Math.max(5, (simTime % 300) / 3))}%` }}
                />
              </div>

              {/* Interactive Play / Pause / Step Controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {/* Play / Pause big glowing circle button */}
                  <button
                    onClick={handleTogglePlay}
                    className="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center cursor-pointer shadow-[0_0_12px_#00f0ff] transition-transform active:scale-95"
                    title={isRunning ? 'Pause Simulation' : 'Run Simulation'}
                  >
                    {isRunning ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0.5" />}
                  </button>

                  {/* Step +10s */}
                  <button
                    onClick={() => handleStep(10)}
                    className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 rounded text-[10px] font-bold text-cyan-300 cursor-pointer"
                    title="Step forward 10 seconds"
                  >
                    +10s
                  </button>

                  {/* Step +60s */}
                  <button
                    onClick={() => handleStep(60)}
                    className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 rounded text-[10px] font-bold text-cyan-300 cursor-pointer"
                    title="Step forward 60 seconds"
                  >
                    +60s
                  </button>

                  {/* Reset Clock */}
                  <button
                    onClick={handleReset}
                    className="p-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 rounded text-cyan-400 cursor-pointer"
                    title="Reset Simulation Clock"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Speed Multiplier Pills */}
                <div className="flex items-center gap-1 text-[9px]">
                  {[1, 5, 25, 60].map(s => (
                    <button
                      key={s}
                      onClick={() => api.setSpeed(s)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        timeScale === s
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-cyan-200'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
