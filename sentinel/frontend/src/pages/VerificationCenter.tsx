import React, { useState } from 'react';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';
import { SystemState } from '../types';
import { 
  CheckCircle2, AlertOctagon, AlertTriangle, ShieldCheck, 
  ArrowRight, Download, Zap, Compass, RotateCcw,
  Sparkles, FileText, ArrowUpRight
} from 'lucide-react';

interface VerificationCenterProps {
  systemState: SystemState;
  onNavigateToReports: () => void;
  onNavigateToManeuverLab: () => void;
  theme: 'light' | 'dark';
}

export const VerificationCenter: React.FC<VerificationCenterProps> = ({
  systemState,
  onNavigateToReports,
  onNavigateToManeuverLab,
  theme
}) => {
  const { 
    sentinel, 
    target, 
    objects, 
    risks, 
    before_after_results, 
    executed_maneuver,
    selected_candidate,
    screening_distance_km = 25.0,
    safety_status = 'MONITORING'
  } = systemState;

  const [cameraMode, setCameraMode] = useState<CameraPresetMode>('PROXIMITY');

  const threatRisk = risks?.find(r =>
    (r.object_a_id === target?.id && (r.object_b_id === sentinel?.id || r.object_b_id === 'SAT-01')) ||
    (r.object_b_id === target?.id && (r.object_a_id === sentinel?.id || r.object_a_id === 'SAT-01'))
  ) || (risks && risks.length > 0 ? risks[0] : null);

  const hasExecutedBurn = Boolean(before_after_results || executed_maneuver);
  const initial_d_cpa = before_after_results?.initial_d_cpa_km
    ?? selected_candidate?.original_d_cpa_km
    ?? threatRisk?.cpa_distance_km
    ?? (target ? (sentinel?.target_distance_km ?? 0) : 999.0);
  const verified_d_cpa = before_after_results?.verified_d_cpa_km
    ?? executed_maneuver?.resulting_d_cpa_km
    ?? selected_candidate?.resulting_d_cpa_km
    ?? initial_d_cpa;
  const delta_d_cpa = verified_d_cpa - initial_d_cpa;
  const initial_t_cpa = before_after_results?.initial_t_cpa_s
    ?? threatRisk?.cpa_time_s
    ?? target?.metadata?.cpa_time_s
    ?? 0.0;
  const verified_t_cpa = before_after_results?.verified_t_cpa_s
    ?? executed_maneuver?.resulting_t_cpa_s
    ?? selected_candidate?.resulting_t_cpa_s
    ?? initial_t_cpa;

  const maneuverName = before_after_results?.maneuver_applied?.name
    || executed_maneuver?.name
    || selected_candidate?.name
    || 'Nominal Coast (No Burn)';
  const dvMagnitude = before_after_results?.maneuver_applied?.delta_v_ms
    ?? executed_maneuver?.delta_v_ms
    ?? selected_candidate?.delta_v_ms
    ?? 0.0;
  const fuelUsed = before_after_results?.maneuver_applied?.propellant_kg
    ?? executed_maneuver?.propellant_kg
    ?? 0.0;

  const isSafe = target ? verified_d_cpa >= screening_distance_km : true;
  const clearanceMargin = target ? verified_d_cpa - screening_distance_km : screening_distance_km;

  return (
    <div className="relative w-full h-full overflow-y-auto lg:overflow-hidden bg-slate-50 flex flex-col lg:flex-row">
      {/* ── LEFT: 3D Trajectory Overlay Viewport (~55% of screen) ── */}
      <div className="w-full lg:flex-1 min-w-0 lg:h-full flex flex-col shrink-0 lg:relative">
        <div className="relative w-full h-[300px] sm:h-[380px] lg:h-full">
          <OrbitalCanvas
            objects={objects}
            sentinel={sentinel}
            target={target}
            risks={risks}
            selectedObjectId={sentinel?.id || null}
            onSelectObject={() => {}}
            cameraMode={cameraMode}
            onChangeCameraMode={setCameraMode}
            onResetCamera={() => setCameraMode('PROXIMITY')}
            predictedWaypoints={selected_candidate?.trajectory_waypoints}
            interceptWaypoints={executed_maneuver?.trajectory_waypoints || selected_candidate?.trajectory_waypoints}
            simTime={systemState.clock?.sim_time ?? 0}
            isRunning={systemState.clock?.is_running}
            timeScale={systemState.clock?.time_scale}
            theme={theme}
            hideControls={true}
          />

          {/* Legend */}
          <div className="hidden sm:flex lg:flex absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3.5 py-2 shadow-sm items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-red-500 rounded" />
              <span className="text-slate-700 font-sans font-medium">Pre-Burn Orbit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-emerald-500 rounded" />
              <span className="text-slate-700 font-sans font-medium">Verified Orbit</span>
            </div>
          </div>

          {/* Camera Selector */}
          <div className="absolute top-2.5 sm:top-4 left-2.5 sm:left-auto right-2.5 sm:right-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-1 sm:p-1.5 shadow-sm flex flex-wrap items-center gap-1 w-fit max-w-[calc(100%-1.25rem)]">
            <button
              onClick={() => setCameraMode('PROXIMITY')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
                cameraMode === 'PROXIMITY' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Encounter View
            </button>
            <button
              onClick={() => setCameraMode('GLOBAL')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
                cameraMode === 'GLOBAL' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Earth Orbit
            </button>
            <button
              onClick={() => setCameraMode('FREE')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
                cameraMode === 'FREE' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Free
            </button>
          </div>
        </div>

        {/* Bottom Banner */}
        <div className="lg:absolute lg:bottom-4 lg:left-4 lg:right-4 z-10 m-3 lg:m-0 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3 shadow-sm lg:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${isSafe ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {isSafe ? <CheckCircle2 className="w-5 h-5" /> : <AlertOctagon className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs text-slate-900 font-mono">
                {isSafe ? 'ORBIT CLEARANCE VERIFIED SAFE' : 'SAFETY GATE: REVIEW REQUIRED'}
              </div>
              <div className="text-[11px] text-slate-600 font-sans">
                Post-burn separation ({verified_d_cpa.toFixed(2)} km) vs safety threshold ({screening_distance_km.toFixed(1)} km): {clearanceMargin >= 0 ? `+${clearanceMargin.toFixed(1)}` : clearanceMargin.toFixed(1)} km margin.
              </div>
            </div>
          </div>

          <button
            onClick={onNavigateToReports}
            className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            View Mission Report
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL: Before vs After Verification Metrics (~450px) ── */}
      <aside className="w-full lg:w-[430px] xl:w-[480px] h-auto lg:h-full bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col p-4 sm:p-5 gap-4 lg:overflow-y-auto shadow-xs shrink-0 z-10">
        
        {/* Title */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider">
              POST-MANEUVER VALIDATION
            </div>
            <h2 className="text-sm font-bold text-slate-900">
              Trajectory Verification Center
            </h2>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
            isSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
          }`}>
            {isSafe ? 'CLEARANCE CONFIRMED' : 'NON-COMPLIANT'}
          </span>
        </div>

        {/* Side-by-Side Comparison Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          
          {/* BEFORE CARD */}
          <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 flex flex-col gap-2 shadow-2xs">
            <div className="flex items-center justify-between border-b border-red-200/80 pb-1.5">
              <span className="font-bold text-red-900 uppercase text-[10px]">BEFORE MANEUVER</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                target && initial_d_cpa < screening_distance_km ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'
              }`}>
                {target && initial_d_cpa < screening_distance_km ? 'VIOLATION' : 'NOMINAL'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-sans block">Min Separation (d_CPA)</span>
              <span className="text-red-700 font-black text-base">{target ? `${initial_d_cpa.toFixed(2)} km` : 'NONE (<25km)'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-sans block">Time to Encounter</span>
              <span className="text-slate-800 font-bold">{initial_t_cpa.toFixed(1)} s</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-sans block">Screening Threshold</span>
              <span className="text-slate-700 font-medium">{screening_distance_km.toFixed(1)} km</span>
            </div>
          </div>

          {/* AFTER CARD */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col gap-2 shadow-2xs">
            <div className="flex items-center justify-between border-b border-emerald-200/80 pb-1.5">
              <span className="font-bold text-emerald-900 uppercase text-[10px]">AFTER MANEUVER</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                hasExecutedBurn
                  ? (isSafe ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800')
                  : 'bg-amber-200 text-amber-800'
              }`}>
                {hasExecutedBurn ? (isSafe ? 'VERIFIED' : 'FAILED GATE') : (target ? 'PROJECTED' : 'NOMINAL')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-sans block">New Separation (d_CPA)</span>
              <span className={`font-black text-base ${isSafe ? 'text-emerald-700' : 'text-red-700'}`}>
                {target ? `${verified_d_cpa.toFixed(2)} km` : 'SAFE'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-sans block">Time to Encounter</span>
              <span className="text-slate-800 font-bold">{verified_t_cpa.toFixed(1)} s</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-sans block">Margin Improvement</span>
              <span className="text-emerald-700 font-bold">{delta_d_cpa >= 0 ? '+' : ''}{delta_d_cpa.toFixed(1)} km</span>
            </div>
          </div>

        </div>

        {/* Executed Burn Summary Card */}
        <section className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
            Applied Avoidance Burn Parameters
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-sans block">BURN VECTOR</span>
              <span className="font-bold text-slate-900 break-words">{maneuverName.split(' ')[0]}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-sans block">IMPULSE Δv</span>
              <span className="font-bold text-blue-600">{dvMagnitude.toFixed(1)} m/s</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-sans block">FUEL MASS</span>
              <span className="font-bold text-slate-900">{fuelUsed.toFixed(2)} kg</span>
            </div>
          </div>
        </section>

        {/* Official Conjunction Verification Certificate Card */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>SENTINEL Trajectory Clearance Certificate</span>
          </div>
          <div className="space-y-1.5 font-mono text-[11px] text-slate-600 border-t border-slate-100 pt-2">
            <div className="flex flex-wrap justify-between gap-1">
              <span>Protected Satellite:</span>
              <span className="font-bold text-slate-900">{sentinel?.name || 'SAT-01'}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span>Threat Object:</span>
              <span className="font-bold text-slate-900">{target?.name || 'None Active (Nominal Orbit)'}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span>Screening Threshold:</span>
              <span className="font-bold text-slate-900">{screening_distance_km.toFixed(1)} km</span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span>Post-Burn Minimum Miss Distance:</span>
              <span className={`font-bold ${isSafe ? 'text-emerald-700' : 'text-red-700'}`}>
                {target ? `${verified_d_cpa.toFixed(2)} km` : 'No Threat Detected'}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span>Safety Margin Above Threshold:</span>
              <span className={`font-bold ${clearanceMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {clearanceMargin >= 0 ? '+' : ''}{clearanceMargin.toFixed(2)} km
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span>Verification Status:</span>
              <span className={`font-bold ${
                hasExecutedBurn
                  ? (isSafe ? 'text-emerald-600' : 'text-red-600')
                  : (safety_status === 'MONITORING' ? 'text-sky-600' : 'text-amber-600')
              }`}>
                {hasExecutedBurn
                  ? (isSafe ? 'PASS (CLEARED)' : 'FAIL (REVIEW REQUIRED)')
                  : (safety_status === 'MONITORING' ? 'NOMINAL (MONITORING)' : 'PENDING MANEUVER')}
              </span>
            </div>
          </div>
        </section>

        {/* Action Controls */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            onClick={onNavigateToReports}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            GENERATE FULL MISSION REPORT (PDF)
          </button>
          <button
            onClick={onNavigateToManeuverLab}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Return to Maneuver Planner
          </button>
        </div>

      </aside>
    </div>
  );
};

