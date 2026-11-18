import React, { useState, useEffect } from 'react';
import { SystemState } from '../types';
import { api } from '../services/api';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';
import {
  Play, Pause, RotateCcw, FastForward, AlertTriangle, CheckCircle2,
  Zap, Clock, Compass, Sliders, ArrowRight, Activity, SkipForward
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine
} from 'recharts';

interface SimulatorProps {
  systemState: SystemState;
  onRefreshState: () => void;
  onSelectScenario: (name: string) => void;
  theme?: 'light' | 'dark';
}

export const Simulator: React.FC<SimulatorProps> = ({
  systemState,
  onRefreshState,
  onSelectScenario,
  theme = 'light',
}) => {
  const {
    clock,
    sentinel,
    target,
    objects,
    risks,
    telemetry = [],
    safety_status = 'MONITORING',
    screening_distance_km = 25.0,
    events = [],
    selected_candidate,
    executed_maneuver,
  } = systemState;

  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [isStepping, setIsStepping] = useState<boolean>(false);
  const [screeningInput, setScreeningInput] = useState<number>(screening_distance_km);
  const [cameraMode, setCameraMode] = useState<CameraPresetMode>('GLOBAL');
  const [chartMetric, setChartMetric] = useState<'range' | 'prob' | 'alt'>('range');

  useEffect(() => {
    setScreeningInput(screening_distance_km);
  }, [screening_distance_km]);

  const speedOptions = [1, 5, 25, 100];

  const scenarios = [
    {
      id: 'Scenario 1: Normal Operation',
      name: 'Scenario 1: Normal Operation',
      badge: 'MONITORING',
      desc: 'SAT-01 in nominal 600 km orbit. All catalog debris outside screening zone; continuous monitoring.'
    },
    {
      id: 'Scenario 2: Avoidable Close Approach',
      name: 'Scenario 2: Avoidable Close Approach',
      badge: 'WARNING → VERIFIED',
      desc: 'Cosmos-2251 fragment on intersecting RK4 orbit (d_CPA = 3.80 km @ T+2396s). Prograde +5 m/s resolves hazard to 30.5 km.'
    },
    {
      id: 'Scenario 3: No Acceptable Maneuver',
      name: 'Scenario 3: No Acceptable Maneuver',
      badge: 'REVIEW REQUIRED',
      desc: 'Late-warning head-on hypervelocity debris convergence (15.0 km/s). All tested burns fail 25 km gate.'
    }
  ];

  const handlePlay = async () => {
    await api.play();
    await onRefreshState();
  };

  const handlePause = async () => {
    await api.pause();
    await onRefreshState();
  };

  const handleReset = async () => {
    await api.reset();
    await onRefreshState();
  };

  const handleSetSpeed = async (spd: number) => {
    await api.setSpeed(spd);
    await onRefreshState();
  };

  const handleStepForward = async (seconds: number) => {
    setIsStepping(true);
    try {
      await api.stepSimulation(seconds);
      await onRefreshState();
    } catch (e) {
      console.error(e);
    } finally {
      setIsStepping(false);
    }
  };

  const handleScreeningSlider = async (val: number) => {
    setScreeningInput(val);
    await api.setScreeningDistance(val);
    await onRefreshState();
  };

  const handleRunAutonomous = async () => {
    setIsAutoRunning(true);
    try {
      await api.runAutonomousAvoidance();
      await onRefreshState();
    } catch (e) {
      console.error(e);
    } finally {
      setIsAutoRunning(false);
    }
  };

  const liveDistanceKm = sentinel?.target_distance_km ?? 0;
  const liveRelVelKms = sentinel?.target_rel_velocity_kms ?? 0;

  return (
    <div className="w-full h-full overflow-y-auto bg-[#f4f6fc] p-3.5 sm:p-5 md:p-6 flex flex-col gap-4 sm:gap-5">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-4 sm:gap-5">

        {/* Page Title & Live Status Pill */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>RK4 Orbital Simulator & Propagation Controls</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Live two-body Runge-Kutta propagation clock, 3D orbital visualization, deterministic scenarios & autonomous collision avoidance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
                safety_status === 'VERIFIED' || safety_status === 'MONITORING'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : safety_status === 'REVIEW REQUIRED'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              SAFETY STATUS: {safety_status}
            </span>
          </div>
        </div>

        {/* ── 1. MASTER CLOCK, STEP & SPEED BAR ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              {clock.is_running ? (
                <button
                  onClick={handlePause}
                  className="bg-amber-500 hover:bg-amber-600 text-white p-2.5 sm:p-3 rounded-xl shadow-xs transition-all"
                  title="Pause Simulation"
                >
                  <Pause className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handlePlay}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 sm:p-3 rounded-xl shadow-xs transition-all"
                  title="Run Simulation"
                >
                  <Play className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleReset}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs transition-all"
                title="Reset Clock to T=0"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="text-[10px] font-mono text-slate-500 uppercase">SIMULATION CLOCK</div>
              <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                T+{(clock.sim_time || 0).toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Step Forward Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <SkipForward className="w-3.5 h-3.5 text-indigo-600" /> Step:
            </span>
            {[60, 300, 600].map(sec => (
              <button
                key={sec}
                onClick={() => handleStepForward(sec)}
                disabled={isStepping}
                className="px-2.5 py-1.5 text-xs font-mono font-bold rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 transition-all"
              >
                +{sec >= 60 ? `${sec / 60}m` : `${sec}s`}
              </button>
            ))}
          </div>

          {/* Speed Selectors */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-600 mr-1 flex items-center gap-1">
              <FastForward className="w-4 h-4 text-indigo-600" /> Speed:
            </span>
            {speedOptions.map(spd => (
              <button
                key={spd}
                onClick={() => handleSetSpeed(spd)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-mono font-bold rounded-xl transition-all ${
                  clock.time_scale === spd
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Autonomous Collision-Avoidance Trigger */}
          <button
            onClick={handleRunAutonomous}
            disabled={isAutoRunning}
            className="w-full sm:w-auto justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all active:scale-95"
          >
            <Zap className="w-4 h-4" />
            {isAutoRunning ? 'Engaging...' : 'Run Autonomous Avoidance'}
          </button>
        </div>

        {/* ── 2. LIVE 3D SIMULATION VIEWPORT + LIVE TELEMETRY CHART ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">

          {/* Left: Interactive 3D Orbit Canvas (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col gap-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-900">
                  Live 3D Orbital State Visualizer
                </span>
                <span className={`w-2 h-2 rounded-full ${clock.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['GLOBAL', 'PROXIMITY', 'FOLLOW_SENTINEL'] as CameraPresetMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setCameraMode(mode)}
                    className={`px-2 sm:px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      cameraMode === mode ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'GLOBAL' ? 'Earth Orbit' : mode === 'PROXIMITY' ? 'CPA Focus' : 'Follow SAT-01'}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full h-[320px] sm:h-[380px] lg:h-[410px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0">
              <OrbitalCanvas
                objects={objects}
                sentinel={sentinel}
                target={target}
                risks={risks}
                selectedObjectId={target?.id || sentinel?.id || null}
                onSelectObject={() => {}}
                cameraMode={cameraMode}
                onChangeCameraMode={setCameraMode}
                predictedWaypoints={selected_candidate?.trajectory_waypoints}
                interceptWaypoints={executed_maneuver?.trajectory_waypoints}
                simTime={clock?.sim_time ?? 0}
                isRunning={clock?.is_running}
                timeScale={clock?.time_scale}
                theme={theme}
                hideControls={true}
              />

              {/* Live SAT-01 Autonomous Workflow Status Pill (Top-Left) */}
              <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 z-10 max-w-[calc(100%-1.25rem)] bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-xs flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-mono">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  sentinel?.status === 'MANEUVER' ? 'bg-blue-600 animate-ping' :
                  sentinel?.status === 'INSPECTING' ? 'bg-sky-500 animate-pulse' :
                  safety_status === 'REVIEW REQUIRED' ? 'bg-rose-500 animate-pulse' :
                  'bg-emerald-500 animate-pulse'
                }`} />
                <span className="text-[9px] font-sans font-bold text-slate-400 uppercase tracking-wider shrink-0">SAT-01 DUTY:</span>
                <strong className="text-slate-900 truncate">
                  {(sentinel?.mission_phase || sentinel?.status || 'ORBITAL_PATROL').replace(/_/g, ' ')}
                </strong>
              </div>

              {/* Live telemetry overlay pill */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-3 sm:left-3 sm:right-auto z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3 sm:px-3.5 py-2 shadow-xs grid grid-cols-2 sm:flex sm:items-center gap-x-3 gap-y-1.5 sm:gap-4 text-[10px] sm:text-[11px] font-mono">
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">SAT-01 ALTITUDE</span>
                  <strong className="text-slate-900">{sentinel?.altitude?.toFixed(2) || '600.00'} km</strong>
                </div>
                <div className="sm:border-l sm:border-slate-200 sm:pl-3">
                  <span className="text-[9px] text-slate-400 block font-sans">THREAT RANGE</span>
                  <strong className={liveDistanceKm < screeningInput && target ? 'text-rose-600' : 'text-indigo-600'}>
                    {target ? `${liveDistanceKm.toFixed(1)} km` : 'No Threat'}
                  </strong>
                </div>
                <div className="sm:border-l sm:border-slate-200 sm:pl-3">
                  <span className="text-[9px] text-slate-400 block font-sans">CLOSING VEL</span>
                  <strong className="text-slate-800">{liveRelVelKms.toFixed(2)} km/s</strong>
                </div>
                <div className="sm:border-l sm:border-slate-200 sm:pl-3">
                  <span className="text-[9px] text-slate-400 block font-sans">FUEL</span>
                  <strong className="text-emerald-600">{sentinel?.fuel_kg?.toFixed(1) || '150.0'} kg</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Live Range Telemetry Chart & Event Log (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Live Telemetry Stream
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    (5Hz Live Sync • {telemetry.length} pts)
                  </span>
                </div>

                {/* Metric Selector Pills */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold font-mono">
                  <button
                    onClick={() => setChartMetric('range')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      chartMetric === 'range' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Range (km)
                  </button>
                  <button
                    onClick={() => setChartMetric('prob')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      chartMetric === 'prob' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Prob (%)
                  </button>
                  <button
                    onClick={() => setChartMetric('alt')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      chartMetric === 'alt' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Alt (km)
                  </button>
                </div>
              </div>

              <div className="w-full h-[195px]">
                {telemetry.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={telemetry} margin={{ top: 8, right: 10, left: 0, bottom: 2 }}>
                      <defs>
                        <linearGradient id="simRangeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="simProbGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="simAltGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="sim_time" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${v}s`} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        width={46}
                        domain={chartMetric === 'prob' ? [0, 100] : chartMetric === 'alt' ? ['dataMin - 5', 'dataMax + 5'] : ['auto', 'auto']}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 10, fontSize: 11 }}
                        formatter={(v: any) => [
                          chartMetric === 'range' ? `${v} km` : chartMetric === 'prob' ? `${v}%` : `${v} km`,
                          chartMetric === 'range' ? 'Target Range' : chartMetric === 'prob' ? 'Collision Prob' : 'Altitude'
                        ]}
                        labelFormatter={l => `T+${l}s`}
                      />
                      {chartMetric === 'range' && (
                        <ReferenceLine y={screeningInput} stroke="#dc2626" strokeDasharray="4 4" label={{ value: '25km Gate', fill: '#dc2626', fontSize: 9 }} />
                      )}
                      {chartMetric === 'prob' && (
                        <ReferenceLine y={95} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Critical', fill: '#dc2626', fontSize: 9 }} />
                      )}
                      <Area
                        type="monotone"
                        dataKey={chartMetric === 'range' ? 'target_dist' : chartMetric === 'prob' ? 'collision_prob' : 'altitude'}
                        stroke={chartMetric === 'range' ? '#4f46e5' : chartMetric === 'prob' ? '#ef4444' : '#10b981'}
                        strokeWidth={2}
                        fill={chartMetric === 'range' ? 'url(#simRangeGrad)' : chartMetric === 'prob' ? 'url(#simProbGrad)' : 'url(#simAltGrad)'}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 gap-2 p-4">
                    <Clock className="w-6 h-6 text-slate-300" />
                    <span>Press <strong>Play</strong> or click <strong>+1m / +5m Step</strong> above to watch RK4 propagation and live range telemetry.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Live Event Stream */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-2 h-[200px]">
              <div className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5 shrink-0">
                Simulation Event Log
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-[11px] font-mono">
                {[...events].reverse().slice(0, 8).map(ev => (
                  <div key={ev.id} className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-indigo-600 font-bold">T+{ev.sim_time.toFixed(1)}s</span>{' '}
                    <span className="text-slate-500">[{ev.event_type}]</span>{' '}
                    <span className="font-sans text-slate-700">{ev.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. SCENARIO SELECTOR MATRIX ── */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-slate-900">Deterministic Simulation Scenarios</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(sc => {
              const isSelected = clock.scenario_name.toLowerCase().includes(sc.name.toLowerCase().substring(0, 15));
              return (
                <div
                  key={sc.id}
                  onClick={() => onSelectScenario(sc.id)}
                  className={`border rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all shadow-xs ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h3 className="font-bold text-xs text-slate-900 leading-tight">{sc.name}</h3>
                      <span className="bg-slate-100 text-slate-700 text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0">
                        {sc.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-sans leading-relaxed">
                      {sc.desc}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-semibold">
                    <span>{isSelected ? '● Active Scenario' : 'Load Scenario'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 4. SCREENING DISTANCE SLIDER ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3">
          <div className="flex flex-wrap justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Safety Screening Threshold Distance</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Adjust the radial conjunction clearance threshold around SAT-01 (default: 25.0 km).
              </p>
            </div>
            <span className="font-mono text-sm sm:text-base font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl shrink-0">
              {screeningInput.toFixed(1)} km
            </span>
          </div>

          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={screeningInput}
            onChange={e => handleScreeningSlider(parseFloat(e.target.value))}
            className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>5 km (Tight)</span>
            <span>25 km (Standard LEO)</span>
            <span>50 km (Wide Margin)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
