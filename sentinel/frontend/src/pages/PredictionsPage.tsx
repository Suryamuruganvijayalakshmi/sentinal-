import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, Compass, AlertTriangle, CheckCircle2, RefreshCw,
  ArrowRight, Layers, Clock, Play, Pause, SkipForward, RotateCcw
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine
} from 'recharts';
import { SystemState } from '../types';
import { api } from '../services/api';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';

interface PredictionsPageProps {
  systemState: SystemState;
  onNavigateToManeuverLab?: () => void;
  theme?: 'light' | 'dark';
}

export const PredictionsPage: React.FC<PredictionsPageProps> = ({
  systemState,
  onNavigateToManeuverLab,
  theme = 'light',
}) => {
  const { clock, sentinel, target, objects, risks, screening_distance_km = 25.0 } = systemState;

  const horizons = ['10s', '30s', '1m', '5m', '10m', '30m', '1h'];
  const [selectedHorizon, setSelectedHorizon] = useState<string>('1h');
  const [selectedObjectId, setSelectedObjectId] = useState<string>(
    target?.id || sentinel?.id || 'SAT-01'
  );
  const [predictionData, setPredictionData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [cameraMode, setCameraMode] = useState<CameraPresetMode>('GLOBAL');

  // Keep default selection synced when scenario switches target
  useEffect(() => {
    const exists = objects.some(o => o.id === selectedObjectId);
    if (!exists || (target?.id && selectedObjectId === 'SAT-01' && objects.some(o => o.id === target.id))) {
      setSelectedObjectId(target?.id || sentinel?.id || 'SAT-01');
    }
  }, [target?.id, sentinel?.id, objects.length]);

  const fetchPrediction = async (objId = selectedObjectId, horizon = selectedHorizon, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getPrediction(objId, horizon);
      setPredictionData(data);
    } catch (e) {
      console.error('Failed to fetch prediction:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Re-fetch when selection/scenario/maneuver changes, plus sync on discrete jumps or 1s bucket while running
  const simEpochBucket = Math.floor(clock?.sim_time ?? 0);
  useEffect(() => {
    fetchPrediction(selectedObjectId, selectedHorizon, Boolean(clock?.is_running && predictionData));
  }, [
    selectedObjectId,
    selectedHorizon,
    clock?.scenario_name,
    systemState.executed_maneuver?.id,
    clock?.is_running ? Math.floor((clock?.sim_time ?? 0) / 1.0) : simEpochBucket
  ]);

  const pairwise = predictionData?.pairwise_forecast;
  const chartData = useMemo(() => {
    if (!predictionData?.waypoints) return [];
    return predictionData.waypoints.map((w: any) => ({
      t: w.t,
      tLabel: w.t >= 60 ? `${(w.t / 60).toFixed(1)}m` : `${w.t.toFixed(0)}s`,
      separation_km: w.separation_km,
      alt: w.alt,
      uncertainty_3sigma_km: w.uncertainty_3sigma_km,
    }));
  }, [predictionData]);

  const selectedObj = objects.find(o => o.id === selectedObjectId) || target || sentinel;

  return (
    <div className="w-full h-full overflow-y-auto bg-[#f4f6fc] p-3.5 sm:p-5 md:p-6 flex flex-col gap-4 sm:gap-5 text-slate-800">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-4 sm:gap-5">

        {/* ── HEADER & CONTROLS BAR ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                Deterministic Two-Body Trajectory Prediction Engine
              </h1>
              <p className="text-xs text-slate-500">
                Multi-horizon RK4 numerical orbit propagation, 3-sigma covariance ellipsoid growth & pairwise CPA forecasting
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Object Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 w-full sm:w-auto min-w-0 max-w-full">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase shrink-0">TARGET:</span>
              <select
                value={selectedObjectId}
                onChange={e => setSelectedObjectId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer w-full sm:w-auto min-w-0"
              >
                {objects.map(obj => (
                  <option key={obj.id} value={obj.id}>
                    {obj.id} — {obj.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Horizon Pills */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
              <span className="text-[10px] font-mono font-bold text-slate-500 px-1.5 sm:px-2">HORIZON</span>
              {horizons.map(h => (
                <button
                  key={h}
                  onClick={() => setSelectedHorizon(h)}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedHorizon === h
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => (clock?.is_running ? api.pause() : api.play())}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                  clock?.is_running ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                }`}
                title={clock?.is_running ? 'Pause Simulation' : 'Play Live Simulation'}
              >
                {clock?.is_running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{clock?.is_running ? 'Pause' : 'Play'}</span>
              </button>
              <button
                onClick={() => api.stepSimulation(60)}
                className="px-2 py-1 rounded-lg text-xs font-mono font-bold text-slate-700 hover:bg-white transition-all flex items-center gap-0.5"
                title="Advance Epoch +60s RK4"
              >
                <SkipForward className="w-3.5 h-3.5 text-indigo-600" />+1m
              </button>
              <button
                onClick={() => api.reset()}
                className="p-1 rounded-lg text-slate-600 hover:bg-white transition-all"
                title="Reset Simulation Epoch"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono font-bold text-indigo-700 px-1.5">
                T+{(clock?.sim_time ?? 0).toFixed(0)}s
              </span>
            </div>

            <button
              onClick={() => fetchPrediction(selectedObjectId, selectedHorizon)}
              disabled={loading}
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-all"
              title="Recompute Trajectory Prediction"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── CONJUNCTION FORECAST ALERT BANNER ── */}
        {pairwise && (
          <div
            className={`rounded-2xl p-3.5 sm:p-4 border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              pairwise.violates_screening
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-start sm:items-center gap-3">
              {pairwise.violates_screening ? (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
              )}
              <div className="text-xs min-w-0">
                <div className="font-bold flex flex-wrap items-center gap-2">
                  <span>
                    Pairwise RK4 Forecast: {predictionData.object_id} vs {pairwise.reference_id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      pairwise.violates_screening
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {pairwise.violates_screening ? 'SCREENING VIOLATION' : 'SAFE CLEARANCE'}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px]">
                  Initial Range: <strong>{pairwise.initial_separation_km} km</strong> • Predicted RK4{' '}
                  <strong>d_CPA = {pairwise.predicted_cpa_km} km</strong> at{' '}
                  <strong>T+{pairwise.predicted_cpa_t_s}s</strong> (Closing speed {pairwise.relative_speed_kms} km/s • Limit {pairwise.screening_distance_km} km)
                </div>
              </div>
            </div>

            {pairwise.violates_screening && onNavigateToManeuverLab && (
              <button
                onClick={onNavigateToManeuverLab}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 shrink-0 transition-all w-full md:w-auto"
              >
                <span>Plan Avoidance Maneuver</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* ── 2-COLUMN VISUAL FORECAST: 3D PATH + SEPARATION / UNCERTAINTY CHART ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">

          {/* Left: 3D Propagated Arcs (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col gap-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-900">
                  3D Propagated Trajectory Overlay ({selectedHorizon} horizon)
                </span>
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
                    {mode === 'GLOBAL' ? 'Earth Orbit' : mode === 'PROXIMITY' ? 'CPA Focus' : 'SAT-01'}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full h-[300px] sm:h-[380px] lg:h-[410px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0">
              <OrbitalCanvas
                objects={objects}
                sentinel={sentinel}
                target={selectedObj}
                risks={risks}
                selectedObjectId={selectedObjectId}
                onSelectObject={setSelectedObjectId}
                cameraMode={cameraMode}
                onChangeCameraMode={setCameraMode}
                predictedWaypoints={predictionData?.waypoints}
                interceptWaypoints={pairwise?.reference_waypoints}
                simTime={clock?.sim_time ?? 0}
                isRunning={clock?.is_running}
                timeScale={clock?.time_scale}
                theme={theme}
                hideControls={true}
              />

              <div className="absolute bottom-3 right-3 z-10 max-w-[calc(100%-9.5rem)] bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-[10px] font-mono flex flex-wrap items-center gap-2 sm:gap-3 shadow-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-sky-600 rounded shrink-0" />
                  <span className="text-slate-700 font-semibold truncate">{selectedObjectId} Path</span>
                </span>
                {pairwise && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-indigo-600 rounded shrink-0" />
                    <span className="text-slate-700 font-semibold truncate">{pairwise.reference_id} Orbit</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Separation Chart + 3-Sigma Ellipsoid Growth (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">

            {/* Pairwise Separation or Altitude Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-900">
                  {pairwise ? 'Predicted Pairwise Separation (km)' : 'Predicted Orbital Altitude (km)'}
                </span>
                <span className="text-[10px] font-mono text-indigo-600 font-bold">
                  {pairwise ? `Min: ${pairwise.horizon_min_separation_km} km @ T+${pairwise.horizon_min_time_s}s` : `${selectedObj?.altitude?.toFixed(1) || '600.0'} km`}
                </span>
              </div>

              <div className="w-full h-[215px]">
                <ResponsiveContainer width="100%" height="100%">
                  {pairwise ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="sepGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="tLabel" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={42} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: 10, fontSize: 11 }}
                        formatter={(val: any) => [`${val} km`, 'Separation']}
                      />
                      <ReferenceLine
                        y={screening_distance_km}
                        stroke="#dc2626"
                        strokeDasharray="4 4"
                        label={{ value: `${screening_distance_km} km threshold`, fill: '#dc2626', fontSize: 10, position: 'insideTopRight' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="separation_km"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        fill="url(#sepGrad)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  ) : (
                    <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="tLabel" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#64748b' }} width={48} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: 10, fontSize: 11 }}
                        formatter={(val: any) => [`${val} km`, 'Altitude']}
                      />
                      <Area type="monotone" dataKey="alt" stroke="#0284c7" fill="#bae6fd" strokeWidth={2} isAnimationActive={false} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3-Sigma Covariance Uncertainty Zone */}
            {predictionData?.uncertainty_zone && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    3-Sigma Ephemeris Uncertainty Envelope
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-bold">
                    99.7% CONFIDENCE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <span className="text-[10px] text-slate-500 block font-sans">Radial (R)</span>
                    <strong className="text-indigo-600 text-sm">
                      ±{predictionData.uncertainty_zone.radial_km} km
                    </strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <span className="text-[10px] text-slate-500 block font-sans">Along-Track (T)</span>
                    <strong className="text-amber-600 text-sm">
                      ±{predictionData.uncertainty_zone.along_track_km} km
                    </strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <span className="text-[10px] text-slate-500 block font-sans">Cross-Track (N)</span>
                    <strong className="text-emerald-600 text-sm">
                      ±{predictionData.uncertainty_zone.cross_track_km} km
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── STATE VECTORS & PROPAGATION WAYPOINTS ── */}
        {predictionData && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* Initial vs Predicted State Comparison */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  ECI State Vector Forecast ({predictionData.object_id})
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  +{predictionData.horizon_seconds}s
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                  <div className="text-[10px] font-sans font-bold text-slate-500 uppercase">
                    CURRENT EPOCH (T+{(clock?.sim_time ?? 0).toFixed(0)}s)
                  </div>
                  <div>X: <strong className="text-slate-900">{predictionData.initial_state.x}</strong> km</div>
                  <div>Y: <strong className="text-slate-900">{predictionData.initial_state.y}</strong> km</div>
                  <div>Z: <strong className="text-slate-900">{predictionData.initial_state.z}</strong> km</div>
                  <div className="pt-1 border-t border-slate-200 text-slate-600 break-words">
                    V: ({predictionData.initial_state.vx}, {predictionData.initial_state.vy}, {predictionData.initial_state.vz})
                  </div>
                  <div>ALT: <strong className="text-indigo-600">{predictionData.initial_state.alt} km</strong></div>
                </div>

                <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-3 space-y-1">
                  <div className="text-[10px] font-sans font-bold text-indigo-700 uppercase">
                    PREDICTED (T+{selectedHorizon})
                  </div>
                  <div>X: <strong className="text-slate-900">{predictionData.predicted_state.x}</strong> km</div>
                  <div>Y: <strong className="text-slate-900">{predictionData.predicted_state.y}</strong> km</div>
                  <div>Z: <strong className="text-slate-900">{predictionData.predicted_state.z}</strong> km</div>
                  <div className="pt-1 border-t border-indigo-200 text-slate-600 break-words">
                    V: ({predictionData.predicted_state.vx}, {predictionData.predicted_state.vy}, {predictionData.predicted_state.vz})
                  </div>
                  <div>ALT: <strong className="text-indigo-700">{predictionData.predicted_state.alt} km</strong></div>
                </div>
              </div>
            </div>

            {/* Propagated RK4 Waypoints Table */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  RK4 Propagated Waypoints Schedule
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {predictionData.waypoints?.length || 0} Samples
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-auto max-h-56">
                <table className="w-full min-w-[520px] text-left border-collapse text-xs font-mono">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600 text-[10px] uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">T (+sec)</th>
                      <th className="py-2 px-2">X (km)</th>
                      <th className="py-2 px-2">Y (km)</th>
                      <th className="py-2 px-2">Z (km)</th>
                      <th className="py-2 px-2">Alt (km)</th>
                      {pairwise && <th className="py-2 px-2">Sep (km)</th>}
                      <th className="py-2 px-3 text-right">3σ Env</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {predictionData.waypoints.slice(0, 20).map((w: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-bold text-indigo-600">+{w.t.toFixed(1)}s</td>
                        <td className="py-1.5 px-2 text-slate-700">{w.x.toFixed(1)}</td>
                        <td className="py-1.5 px-2 text-slate-700">{w.y.toFixed(1)}</td>
                        <td className="py-1.5 px-2 text-slate-700">{w.z.toFixed(1)}</td>
                        <td className="py-1.5 px-2 text-slate-800">{w.alt.toFixed(1)}</td>
                        {pairwise && (
                          <td
                            className={`py-1.5 px-2 font-bold ${
                              (w.separation_km ?? 999) < screening_distance_km ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {w.separation_km?.toFixed(2)}
                          </td>
                        )}
                        <td className="py-1.5 px-3 text-right text-slate-500">
                          ±{w.uncertainty_3sigma_km?.toFixed(2) ?? '0.20'} km
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
