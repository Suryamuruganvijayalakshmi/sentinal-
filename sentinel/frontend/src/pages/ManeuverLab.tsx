import React, { useState, useMemo, useEffect } from 'react';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';
import { SystemState, ManeuverCandidate } from '../types';
import { api } from '../services/api';
import { 
  Zap, CheckCircle2, XCircle, AlertTriangle, ArrowRight,
  Fuel, Compass, Flame, ArrowUpRight, RotateCcw, Sliders,
  ShieldCheck, Crosshair
} from 'lucide-react';

interface ManeuverLabProps {
  systemState: SystemState;
  onRefreshState: () => void;
  onNavigateToVerification?: () => void;
  theme: 'light' | 'dark';
}

export const ManeuverLab: React.FC<ManeuverLabProps> = ({
  systemState,
  onRefreshState,
  onNavigateToVerification,
  theme
}) => {
  const { 
    sentinel, 
    target, 
    objects, 
    risks, 
    maneuver_candidates = [],
    selected_candidate,
    executed_maneuver,
    screening_distance_km = 25.0,
    safety_status = 'EVALUATING',
    decision_rationale
  } = systemState;

  const [cameraMode, setCameraMode] = useState<CameraPresetMode>('PROXIMITY');
  const [plannerMode, setPlannerMode] = useState<'PRESET' | 'CUSTOM'>('PRESET');
  
  // Preset candidate selection
  const [activeCandidateId, setActiveCandidateId] = useState<string>(
    selected_candidate?.id || (maneuver_candidates.length > 0 ? maneuver_candidates[0].id : 'CAND-PRO-5')
  );

  // Custom 3D vector burn sliders
  const [customDvX, setCustomDvX] = useState<number>(0.0);
  const [customDvY, setCustomDvY] = useState<number>(5.0);
  const [customDvZ, setCustomDvZ] = useState<number>(0.0);

  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [customScreening, setCustomScreening] = useState<number>(screening_distance_km);
  const [customPreview, setCustomPreview] = useState<any>(null);

  useEffect(() => {
    setCustomScreening(screening_distance_km);
  }, [screening_distance_km]);

  useEffect(() => {
    if (plannerMode !== 'CUSTOM') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.previewCustomManeuver(customDvX, customDvY, customDvZ);
        if (!cancelled) setCustomPreview(res);
      } catch (e) {
        console.warn('Custom preview failed:', e);
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [plannerMode, customDvX, customDvY, customDvZ, customScreening, target?.id]);

  const activeCandidate = maneuver_candidates.find(c => c.id === activeCandidateId) || selected_candidate || maneuver_candidates[0];

  // Calculate 3D burn vector for live ArrowHelper preview in 3D scene
  const activeBurnVector = useMemo(() => {
    if (plannerMode === 'CUSTOM') {
      return { x: customDvX, y: customDvY, z: customDvZ };
    }
    if (!sentinel || !activeCandidate) return { x: 0, y: 5, z: 0 };

    const velMag = Math.sqrt(sentinel.velocity_x ** 2 + sentinel.velocity_y ** 2 + sentinel.velocity_z ** 2) || 7.56;
    const vUnit = { x: sentinel.velocity_x / velMag, y: sentinel.velocity_y / velMag, z: sentinel.velocity_z / velMag };

    const posMag = Math.sqrt(sentinel.position_x ** 2 + sentinel.position_y ** 2 + sentinel.position_z ** 2) || 6978.0;
    const rUnit = { x: sentinel.position_x / posMag, y: sentinel.position_y / posMag, z: sentinel.position_z / posMag };

    const dv = activeCandidate.delta_v_ms;
    if (activeCandidate.direction === 'PROGRADE') {
      return { x: vUnit.x * dv, y: vUnit.y * dv, z: vUnit.z * dv };
    } else if (activeCandidate.direction === 'RETROGRADE') {
      return { x: -vUnit.x * dv, y: -vUnit.y * dv, z: -vUnit.z * dv };
    } else if (activeCandidate.direction === 'RADIAL+') {
      return { x: rUnit.x * dv, y: rUnit.y * dv, z: rUnit.z * dv };
    } else {
      return { x: -rUnit.x * dv, y: -rUnit.y * dv, z: -rUnit.z * dv };
    }
  }, [plannerMode, customDvX, customDvY, customDvZ, activeCandidate, sentinel]);

  // Custom vector magnitude & fuel cost
  const customDvMag = Math.sqrt(customDvX ** 2 + customDvY ** 2 + customDvZ ** 2);
  const customFuelKg = Math.round(800.0 * (1.0 - Math.exp(-Math.max(0.001, customDvMag) / (310.0 * 9.80665))) * 100) / 100;

  const handleSelectCandidate = (candidate: ManeuverCandidate) => {
    setActiveCandidateId(candidate.id);
  };

  const handleExecutePreset = async () => {
    if (!activeCandidate) return;
    setIsExecuting(true);
    try {
      await api.executeManeuver(activeCandidate.id);
      await onRefreshState();
      if (onNavigateToVerification) onNavigateToVerification();
    } catch (e) {
      console.error('Failed to execute preset maneuver', e);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecuteCustom = async () => {
    setIsExecuting(true);
    try {
      await api.executeCustomManeuver(customDvX, customDvY, customDvZ);
      await onRefreshState();
      if (onNavigateToVerification) onNavigateToVerification();
    } catch (e) {
      console.error('Failed to execute custom maneuver', e);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleScreeningChange = async (newDist: number) => {
    setCustomScreening(newDist);
    try {
      await api.setScreeningDistance(newDist);
      await onRefreshState();
    } catch (e) {
      console.error('Failed to set screening distance', e);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-50 flex">
      {/* ── LEFT 3D TRAJECTORY PREVIEW VIEWPORT (~58% of screen) ── */}
      <div className="relative flex-1 min-w-0 h-full">
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
          predictedWaypoints={
            plannerMode === 'CUSTOM'
              ? customPreview?.trajectory_waypoints || activeCandidate?.trajectory_waypoints
              : activeCandidate?.trajectory_waypoints
          }
          interceptWaypoints={executed_maneuver?.trajectory_waypoints}
          maneuverVector={activeBurnVector}
          simTime={systemState.clock?.sim_time ?? 0}
          isRunning={systemState.clock?.is_running}
          timeScale={systemState.clock?.time_scale}
          theme={theme}
          hideControls={true}
        />

        {/* Top-Left: Trajectory Legend Pill */}
        <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-red-500 rounded" />
            <span className="text-slate-700 font-sans font-medium">Pre-Burn Trajectory</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-emerald-500 rounded" />
            <span className="text-slate-700 font-sans font-medium">Candidate Trajectory</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span className="text-slate-700 font-sans font-medium">Δv Vector Arrow</span>
          </div>
        </div>

        {/* Top-Right: Camera Mode Selector */}
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-1.5 shadow-sm flex items-center gap-1">
          <button
            onClick={() => setCameraMode('PROXIMITY')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'PROXIMITY' || cameraMode === 'COLLISION' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Encounter View
          </button>
          <button
            onClick={() => setCameraMode('GLOBAL')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'GLOBAL' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Earth View
          </button>
          <button
            onClick={() => setCameraMode('FOLLOW_SENTINEL')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'FOLLOW_SENTINEL' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            SAT-01
          </button>
          <button
            onClick={() => setCameraMode('FREE')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'FREE' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Free
          </button>
        </div>

        {/* Bottom Banner: Candidate Preview Summary */}
        <div className="absolute bottom-4 left-4 right-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3.5 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 block font-sans">SELECTED MANEUVER</span>
              <span className="font-bold text-slate-900">
                {plannerMode === 'CUSTOM' ? `Custom Burn (Δv=${customDvMag.toFixed(1)} m/s)` : activeCandidate?.name}
              </span>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[10px] text-slate-500 block font-sans">DELTA-V IMPULSE</span>
              <span className="font-bold text-blue-600">
                {plannerMode === 'CUSTOM' ? customDvMag.toFixed(1) : activeCandidate?.delta_v_ms} m/s
              </span>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[10px] text-slate-500 block font-sans">RESULTING MIN SEPARATION</span>
              <span className={`font-bold ${
                (plannerMode === 'CUSTOM' ? (customPreview?.passed ?? false) : activeCandidate?.passed) ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {plannerMode === 'CUSTOM'
                  ? (customPreview ? `${customPreview.resulting_d_cpa_km} km` : 'Computing RK4...')
                  : `${activeCandidate?.resulting_d_cpa_km} km`}
              </span>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[10px] text-slate-500 block font-sans">PROPELLANT COST</span>
              <span className="font-bold text-slate-700">
                {plannerMode === 'CUSTOM' ? (customPreview?.propellant_kg ?? customFuelKg).toFixed(2) : activeCandidate?.propellant_kg} kg
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={isExecuting || safety_status === 'VERIFIED'}
              onClick={plannerMode === 'CUSTOM' ? handleExecuteCustom : handleExecutePreset}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all ${
                safety_status === 'VERIFIED'
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
              }`}
            >
              {safety_status === 'VERIFIED' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Maneuver Executed & Verified
                </>
              ) : isExecuting ? (
                <>Executing Impulsive Burn...</>
              ) : (
                <>
                  <Flame className="w-4 h-4" /> EXECUTE AVOIDANCE MANEUVER
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT MANEUVER COMPARISON PANEL (~42% of screen) ── */}
      <aside className="w-[460px] lg:w-[500px] h-full bg-white border-l border-slate-200 flex flex-col p-4 gap-3.5 overflow-y-auto shadow-xs shrink-0 z-10">
        
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              Maneuver Simulation Lab
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare candidate burns or design custom 3D impulsive velocity changes.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {safety_status}
          </span>
        </div>

        {/* Mode Selector Tabs: Preset Matrix vs Custom 3D Burn */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setPlannerMode('PRESET')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              plannerMode === 'PRESET' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Candidate Matrix (Optimal Search)
          </button>
          <button
            onClick={() => setPlannerMode('CUSTOM')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              plannerMode === 'CUSTOM' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Custom 3D Δv Sliders
          </button>
        </div>

        {/* Screening Distance Quick Selector */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700">Safety Screening Threshold</span>
            <span className="font-mono font-bold text-blue-600">{customScreening.toFixed(1)} km</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[10, 15, 20, 25, 35, 50].map(dist => (
              <button
                key={dist}
                onClick={() => handleScreeningChange(dist)}
                className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                  customScreening === dist
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {dist}km
              </button>
            ))}
          </div>
        </div>

        {/* PRESET MODE: Candidate Comparison Matrix */}
        {plannerMode === 'PRESET' && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
              <span>Candidate Maneuver Matrix</span>
              <span className="text-[11px] text-slate-500 font-normal">Click to preview in 3D</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-mono text-[10px] uppercase border-b border-slate-200">
                    <th className="py-2 px-3">Candidate</th>
                    <th className="py-2 px-2">Direction</th>
                    <th className="py-2 px-2">Δv</th>
                    <th className="py-2 px-2">Sep (d_CPA)</th>
                    <th className="py-2 px-2">Fuel</th>
                    <th className="py-2 px-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {maneuver_candidates.map(candidate => {
                    const isSelected = candidate.id === activeCandidateId;
                    const isOptimal = selected_candidate?.id === candidate.id;

                    return (
                      <tr
                        key={candidate.id}
                        onClick={() => handleSelectCandidate(candidate)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/90 font-bold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <td className="py-2.5 px-3 flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900">{candidate.id}</span>
                          {isOptimal && (
                            <span className="bg-blue-600 text-white text-[9px] font-sans px-1.5 py-0.2 rounded font-bold">
                              OPT
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-[11px] font-sans font-medium text-slate-600">
                          {candidate.direction}
                        </td>
                        <td className="py-2.5 px-2 text-slate-800">
                          {candidate.delta_v_ms} m/s
                        </td>
                        <td className="py-2.5 px-2 font-bold" style={{ color: candidate.passed ? '#059669' : '#dc2626' }}>
                          {candidate.resulting_d_cpa_km} km
                        </td>
                        <td className="py-2.5 px-2 text-slate-600 text-[11px]">
                          {candidate.propellant_kg} kg
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              candidate.passed
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {candidate.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CUSTOM MODE: 3D Velocity Adjustment Sliders */}
        {plannerMode === 'CUSTOM' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3.5 shadow-2xs">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                Custom Cartesian Impulse Vectors
              </span>
              <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                |Δv| = {customDvMag.toFixed(2)} m/s
              </span>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>ΔVx (In-Plane Transverse / Radial):</span>
                  <span className="font-bold text-slate-900">{customDvX.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={customDvX}
                  onChange={e => setCustomDvX(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>ΔVy (Prograde / Retrograde Axis):</span>
                  <span className="font-bold text-slate-900">{customDvY.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={customDvY}
                  onChange={e => setCustomDvY(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>ΔVz (Out-of-Plane / Inclination):</span>
                  <span className="font-bold text-slate-900">{customDvZ.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={customDvZ}
                  onChange={e => setCustomDvZ(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">EST. FUEL BURN</span>
                <span className="font-bold text-slate-900">{customFuelKg.toFixed(2)} kg</span>
              </div>
              <button
                onClick={() => { setCustomDvX(0); setCustomDvY(5); setCustomDvZ(0); }}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset to Nominal Burn
              </button>
            </div>
          </div>
        )}

        {/* Explainable Decision Engine Box */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-col gap-1.5 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
            <Zap className="w-3.5 h-3.5 text-blue-600" />
            Explainable Decision Rationale
          </div>
          <p className="text-xs text-blue-950 font-sans leading-relaxed">
            {decision_rationale ||
              'Rule-based evaluation selects the passing candidate that satisfies the configured screening clearance with minimum velocity change (Δv) and lowest fuel mass expenditure.'}
          </p>
        </div>

        {/* Deterministic Safety Constraints */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 text-xs shadow-2xs">
          <span className="font-semibold text-slate-700">Deterministic Safety Constraints</span>
          <div className="space-y-1.5 font-mono text-[11px] text-slate-600">
            <div className="flex items-center justify-between">
              <span>Minimum Miss Distance:</span>
              <span className="font-bold text-slate-900">≥ {customScreening.toFixed(1)} km</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Propellant Margin Remaining:</span>
              <span className="font-bold text-emerald-600">&gt; 12.0 kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Max Allowable Δv Budget:</span>
              <span className="font-bold text-slate-900">25.0 m/s</span>
            </div>
          </div>
        </div>

      </aside>
    </div>
  );
};
