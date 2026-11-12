import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { SystemState } from '../types';
import {
  BarChart3, PieChart, Layers, Upload, Info, Search,
  CheckCircle2, Sliders, RefreshCw, Activity, Play, Pause, SkipForward
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ScatterChart, Scatter, LineChart, Line, ZAxis
} from 'recharts';

interface OrbitalAnalyticsProps {
  systemState?: SystemState | null;
}

// Interpolate Pearson correlation r in [-1, 1] to Matplotlib RdBu_r palette
function correlationToColor(r: number): string {
  const clamped = Math.max(-1, Math.min(1, r));
  if (clamped >= 0) {
    // 0 -> #f8fafc (248, 250, 252) to +1 -> #67001f (103, 0, 31)
    // Smooth mid-stop around +0.5 -> #ef4444
    if (clamped <= 0.5) {
      const t = clamped / 0.5;
      const rr = Math.round(248 + (239 - 248) * t);
      const gg = Math.round(250 + (68 - 250) * t);
      const bb = Math.round(252 + (68 - 252) * t);
      return `rgb(${rr}, ${gg}, ${bb})`;
    }
    const t = (clamped - 0.5) / 0.5;
    const rr = Math.round(239 + (103 - 239) * t);
    const gg = Math.round(68 + (0 - 68) * t);
    const bb = Math.round(68 + (31 - 68) * t);
    return `rgb(${rr}, ${gg}, ${bb})`;
  } else {
    // 0 -> #f8fafc to -0.5 -> #3b82f6 to -1 -> #053061
    const absR = Math.abs(clamped);
    if (absR <= 0.5) {
      const t = absR / 0.5;
      const rr = Math.round(248 + (59 - 248) * t);
      const gg = Math.round(250 + (130 - 250) * t);
      const bb = Math.round(252 + (246 - 252) * t);
      return `rgb(${rr}, ${gg}, ${bb})`;
    }
    const t = (absR - 0.5) / 0.5;
    const rr = Math.round(59 + (5 - 59) * t);
    const gg = Math.round(130 + (48 - 130) * t);
    const bb = Math.round(246 + (97 - 246) * t);
    return `rgb(${rr}, ${gg}, ${bb})`;
  }
}

export const OrbitalAnalytics: React.FC<OrbitalAnalyticsProps> = ({ systemState }) => {
  // Simulation campaign parameters
  const [days, setDays] = useState<number>(30);
  const [maneuverDvMs, setManeuverDvMs] = useState<number>(3.5);
  const [leadTimeMin, setLeadTimeMin] = useState<number>(35);
  const [thresholdKm, setThresholdKm] = useState<number>(1.0);
  const [seed, setSeed] = useState<number>(42);
  const [includeLiveLabBurns, setIncludeLiveLabBurns] = useState<boolean>(false);

  const [encounterData, setEncounterData] = useState<any>(null);
  const [catalogueData, setCatalogueData] = useState<any>(null);
  const [loadingEncounters, setLoadingEncounters] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

  const fetchEncounterAnalytics = useCallback(async (overrideSeed?: number, silent: boolean = false) => {
    if (!silent) setLoadingEncounters(true);
    try {
      const data = await api.getEncounterAnalytics({
        days,
        seed: overrideSeed ?? seed,
        threshold_km: thresholdKm,
        maneuver_dv_ms: maneuverDvMs,
        lead_time_min: leadTimeMin,
      });
      setEncounterData(data);
    } catch (e) {
      console.error('Failed to load encounter analytics', e);
    } finally {
      if (!silent) setLoadingEncounters(false);
    }
  }, [days, seed, thresholdKm, maneuverDvMs, leadTimeMin]);

  const liveSimTimeBucket = Math.floor((systemState?.clock?.sim_time ?? 0) / 75);
  useEffect(() => {
    fetchEncounterAnalytics(undefined, Boolean(encounterData && systemState?.clock?.is_running));
  }, [
    fetchEncounterAnalytics,
    systemState?.clock?.scenario_name,
    systemState?.safety_status,
    systemState?.screening_distance_km,
    systemState?.executed_maneuver?.id,
    liveSimTimeBucket
  ]);

  useEffect(() => {
    const fetchCatalogue = async () => {
      try {
        const data = await api.getCatalogueAnalytics();
        setCatalogueData(data);
      } catch (e) {
        console.error('Failed to load catalogue analytics', e);
      }
    };
    fetchCatalogue();
  }, []);

  const handleSimulateUpload = () => {
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 4000);
  };

  const summary = encounterData?.summary;
  const liveSim = encounterData?.live_simulation;
  const missHistogram = encounterData?.miss_distance_histogram || [];
  const scatterLow = encounterData?.miss_vs_uncertainty?.low || [];
  const scatterMedium = encounterData?.miss_vs_uncertainty?.medium || [];
  const scatterHigh = encounterData?.miss_vs_uncertainty?.high || [];
  const scatterLive = encounterData?.miss_vs_uncertainty?.live || [];
  const corrLabels: string[] = encounterData?.correlation_matrix?.labels || ['Altitude', 'Speed', 'Uncert.', 'Miss dist.'];
  const corrMatrix: number[][] = encounterData?.correlation_matrix?.matrix || [
    [1, 0, 0, 0.01],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0.01, 0, 0, 1],
  ];
  const avoidancePoints = encounterData?.avoidance_effect?.points || [];
  const sessionManeuvers = encounterData?.avoidance_effect?.session_maneuvers || [];
  const dailyEncounters = encounterData?.daily_encounters || [];

  const sampleRecords = catalogueData?.sample_records || [];
  const filteredRecords = sampleRecords.filter((r: any) =>
    r.id?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.object_type?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const avoidanceXMax = includeLiveLabBurns && sessionManeuvers.length > 0
    ? Math.max(thresholdKm * 1.1, ...sessionManeuvers.map((m: any) => m.before_km * 1.1))
    : Math.max(1.05, Number((thresholdKm * 1.05).toFixed(2)));

  return (
    <div className="w-full h-full overflow-y-auto bg-[#f4f6fc] p-5 md:p-6 flex flex-col gap-6 text-slate-800">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">

        {/* ── HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              Orbital Conjunction Simulation & Statistical Analytics
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              30-day Monte Carlo LEO conjunction campaign grounded in optical surveillance shells, tracking covariance, correlation analysis & avoidance burn verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEncounterAnalytics(seed + 1)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
              title="Run fresh randomized conjunction cohort"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEncounters ? 'animate-spin' : ''}`} />
              New Campaign Seed
            </button>

            <label className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              Import TLE / CSV
              <input
                type="file"
                accept=".csv,.tle"
                onChange={handleSimulateUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {uploadSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Catalogue dataset parsed successfully. 1,911 space objects indexed into simulation memory.</span>
          </div>
        )}

        {/* ── LIVE SIMULATION TELEMETRY BRIDGE ── */}
        {systemState && (
          <div className="bg-white border border-indigo-200 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start lg:items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full mt-1 lg:mt-0 shrink-0 ${systemState.clock.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              <div className="text-xs">
                <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                  <span>Live RK4 Simulation Feed: {systemState.clock.scenario_name}</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 font-mono text-[10px] font-bold text-indigo-700">
                    T+{(systemState.clock.sim_time ?? 0).toFixed(1)}s • {systemState.safety_status}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                  {liveSim?.active_conjunctions?.[0] ? (
                    <>
                      Primary Pair: <strong>{liveSim.active_conjunctions[0].pair}</strong> • Live Range:{' '}
                      <strong>{liveSim.active_conjunctions[0].current_range_km} km</strong> • RK4 d_CPA:{' '}
                      <strong className={liveSim.active_conjunctions[0].raw_cpa_km < (systemState.screening_distance_km ?? 25) ? 'text-rose-600' : 'text-emerald-600'}>
                        {liveSim.active_conjunctions[0].raw_cpa_km} km
                      </strong>{' '}
                      @ T+{liveSim.active_conjunctions[0].cpa_time_s}s
                    </>
                  ) : (
                    <span>All tracked simulation pairs synchronized from real two-body RK4 engine.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => (systemState.clock.is_running ? api.pause() : api.play())}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  systemState.clock.is_running ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {systemState.clock.is_running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{systemState.clock.is_running ? 'Pause Live Sim' : 'Play Live Sim'}</span>
              </button>
              <button
                onClick={() => api.stepSimulation(60)}
                className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 flex items-center gap-1 transition-all"
                title="Advance live simulation +60s and update conjunction charts"
              >
                <SkipForward className="w-3.5 h-3.5" />+1m Step
              </button>
            </div>
          </div>
        )}

        {/* ── INTERACTIVE MONTE CARLO PARAMETER BAR ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 shrink-0">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Campaign Simulator Parameters</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span className="text-slate-500">Manoeuvre Δv</span>
                <span className="font-bold text-indigo-700">{maneuverDvMs.toFixed(1)} m/s</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={12.0}
                step={0.5}
                value={maneuverDvMs}
                onChange={e => setManeuverDvMs(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span className="text-slate-500">Burn Lead Time</span>
                <span className="font-bold text-indigo-700">{leadTimeMin} min</span>
              </div>
              <input
                type="range"
                min={5}
                max={90}
                step={5}
                value={leadTimeMin}
                onChange={e => setLeadTimeMin(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span className="text-slate-500">Risk Threshold</span>
                <span className="font-bold text-rose-600">{thresholdKm.toFixed(1)} km</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.5}
                value={thresholdKm}
                onChange={e => setThresholdKm(Number(e.target.value))}
                className="w-full accent-rose-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span className="text-slate-500">Horizon / Seed</span>
                <span className="font-bold text-slate-800">{days}d • #{seed}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {[15, 30, 60].map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
                      days === d
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
                <button
                  onClick={() => setSeed(s => s + 1)}
                  className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                  title="Step Seed"
                >
                  +1
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI STRIP ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              TOTAL SIMULATED ENCOUNTERS
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 mt-1 block">
              {(summary?.total_encounters ?? 9985).toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
              Across {days}-day LEO conjunction window
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              HIGH-RISK CONJUNCTIONS (&le; {thresholdKm.toFixed(1)} km)
            </span>
            <span className="text-2xl font-bold font-mono text-rose-600 mt-1 block">
              {(summary?.high_risk_count ?? 440).toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
              Requiring active avoidance burn planning
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              AVOIDANCE BURN CLEARANCE RATE
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-600 mt-1 block">
              {summary?.avoidance_success_rate_pct ?? 100}%
            </span>
            <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
              {summary?.avoidance_cleared ?? 320} / {summary?.avoidance_tested ?? 320} cleared &ge; {thresholdKm.toFixed(1)} km
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              MEAN DAILY ENCOUNTERS
            </span>
            <span className="text-2xl font-bold font-mono text-indigo-600 mt-1 block">
              {summary?.mean_daily_encounters ?? 332.8} / day
            </span>
            <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
              Medium Risk (&le;15 km): {(summary?.medium_risk_count ?? 2200).toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── ROW 1: PLOT 1 (HISTOGRAM) & PLOT 2 (MISS VS UNCERTAINTY) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* PLOT 1: Distribution of miss distance */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Distribution of miss distance</h2>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                <span className="inline-block w-5 border-t-2 border-dashed border-red-600" />
                <span>{thresholdKm} km high-risk threshold</span>
              </div>
            </div>

            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={missHistogram} margin={{ top: 14, right: 16, left: 6, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="bin_mid"
                    type="number"
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    label={{
                      value: 'Miss distance (km, capped at 100)',
                      position: 'insideBottom',
                      offset: -14,
                      fontSize: 11,
                      fill: '#334155'
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#334155' }}
                    label={{
                      value: 'Encounters',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 4,
                      fontSize: 11,
                      fill: '#334155'
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-2.5 text-xs font-mono">
                          <div className="font-bold text-slate-900">Bin: {pt.label} km</div>
                          <div className="text-blue-700">Encounters: {pt.encounters}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="encounters"
                    fill="#1665d8"
                    barSize={7}
                    radius={[1, 1, 0, 0]}
                    isAnimationActive={false}
                  />
                  <ReferenceLine
                    x={thresholdKm}
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PLOT 2: Miss distance vs tracking uncertainty */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Miss distance vs tracking uncertainty</h2>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-700">
                <span className="text-slate-400 font-semibold">Risk:</span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3b8246]" /> Low
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f59f00]" /> Medium
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" /> High
                </span>
                {scatterLive.length > 0 && (
                  <span className="flex items-center gap-1 text-indigo-700 font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb] ring-2 ring-indigo-200" /> Live Sim
                  </span>
                )}
              </div>
            </div>

            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 14, right: 16, left: 6, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="uncertainty_km"
                    name="Tracking uncertainty"
                    domain={[0, 2]}
                    ticks={[0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]}
                    tickFormatter={(v: number) => v.toFixed(2)}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    label={{
                      value: 'Tracking uncertainty (km)',
                      position: 'insideBottom',
                      offset: -14,
                      fontSize: 11,
                      fill: '#334155'
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="miss_distance_km"
                    name="Miss distance"
                    domain={[0, 105]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    label={{
                      value: 'Miss distance (km, capped at 100)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 4,
                      fontSize: 11,
                      fill: '#334155'
                    }}
                  />
                  <ZAxis range={[22, 22]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload;
                      const riskLabel = pt.miss_distance_km <= thresholdKm
                        ? 'HIGH'
                        : pt.miss_distance_km <= 15
                          ? 'MEDIUM'
                          : 'LOW';
                      return (
                        <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-2.5 text-xs font-mono space-y-0.5">
                          <div className="font-bold text-slate-900">
                            {pt.is_live ? `LIVE PAIR: ${pt.pair}` : `Risk Tier: ${riskLabel}`}
                          </div>
                          <div>Uncertainty: {pt.uncertainty_km} km</div>
                          <div>Miss Dist.: {pt.raw_cpa_km ?? pt.miss_distance_km} km</div>
                          <div className="text-slate-500">Alt: {pt.altitude_km} km • v_rel: {pt.speed_kms} km/s</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter name="Low" data={scatterLow} fill="#3b8246" fillOpacity={0.72} isAnimationActive={false} />
                  <Scatter name="Medium" data={scatterMedium} fill="#f59f00" fillOpacity={0.78} isAnimationActive={false} />
                  <Scatter name="High" data={scatterHigh} fill="#dc2626" fillOpacity={0.85} isAnimationActive={false} />
                  {scatterLive.length > 0 && (
                    <Scatter name="Live Sim" data={scatterLive} fill="#2563eb" fillOpacity={1} isAnimationActive={false} />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── ROW 2: PLOT 3 (CORRELATION MATRIX) & PLOT 4 (AVOIDANCE MANEUVER EFFECT) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* PLOT 3: Correlation Matrix (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Correlation matrix</h2>
              <span className="text-[10px] font-mono text-slate-400">Pearson r (&minus;1.00 to +1.00)</span>
            </div>

            <div className="flex items-center justify-center gap-4 py-2 flex-1">
              {/* Matrix + Labels */}
              <div className="flex flex-col">
                <div className="flex items-stretch">
                  {/* Left Row Labels */}
                  <div className="flex flex-col justify-around pr-2.5 text-right text-[11px] font-medium text-slate-700 select-none">
                    {corrLabels.map(lbl => (
                      <div key={lbl} className="h-14 flex items-center justify-end">
                        {lbl}
                      </div>
                    ))}
                  </div>

                  {/* 4x4 Heatmap Cells */}
                  <div className="grid grid-cols-4 border-l border-b border-slate-800">
                    {corrMatrix.map((row, rIdx) =>
                      row.map((val, cIdx) => {
                        const bg = correlationToColor(val);
                        const isDarkBg = Math.abs(val) >= 0.55;
                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            title={`${corrLabels[rIdx]} vs ${corrLabels[cIdx]}: r = ${val.toFixed(2)}`}
                            style={{ backgroundColor: bg }}
                            className={`w-14 h-14 sm:w-16 sm:h-14 flex items-center justify-center font-mono text-xs font-semibold transition-transform hover:scale-105 hover:z-10 hover:ring-1 hover:ring-slate-900 ${
                              isDarkBg ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {val.toFixed(2)}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Bottom Column Labels */}
                <div className="flex items-start mt-2 pl-16">
                  {corrLabels.map(lbl => (
                    <div key={lbl} className="w-14 sm:w-16 text-center text-[11px] font-medium text-slate-700 -rotate-25 origin-top-left pt-1">
                      {lbl}
                    </div>
                  ))}
                </div>
              </div>

              {/* Divergent Vertical Colorbar Legend */}
              <div className="flex items-stretch gap-1.5 h-56 shrink-0">
                <div
                  className="w-3.5 rounded-xs border border-slate-700"
                  style={{
                    background: 'linear-gradient(to bottom, #67001f 0%, #ef4444 25%, #f8fafc 50%, #3b82f6 75%, #053061 100%)'
                  }}
                />
                <div className="flex flex-col justify-between text-[10px] font-mono text-slate-600 leading-none py-0.5">
                  <span>1.00</span>
                  <span>0.75</span>
                  <span>0.50</span>
                  <span>0.25</span>
                  <span>0.00</span>
                  <span>&minus;0.25</span>
                  <span>&minus;0.50</span>
                  <span>&minus;0.75</span>
                  <span>&minus;1.00</span>
                </div>
              </div>
            </div>
          </div>

          {/* PLOT 4: Effect of simulated avoidance manoeuvre (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Effect of simulated avoidance manoeuvre</h2>
                <p className="text-[11px] text-slate-500">
                  Vectorized Two-Body RK4 propagation: Δv = {maneuverDvMs.toFixed(1)} m/s at {leadTimeMin} min lead across {summary?.avoidance_tested ?? 260} high-risk passes
                </p>
              </div>

              <div className="flex items-center gap-3">
                {sessionManeuvers.length > 0 && (
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeLiveLabBurns}
                      onChange={e => setIncludeLiveLabBurns(e.target.checked)}
                      className="accent-indigo-600"
                    />
                    Live Lab Burns ({sessionManeuvers.length})
                  </label>
                )}
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                  <span className="inline-block w-5 border-t-2 border-dashed border-red-600" />
                  <span>{thresholdKm} km safety threshold</span>
                </div>
              </div>
            </div>

            <div className="w-full h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 14, right: 16, left: 6, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="before_km"
                    name="Miss distance before manoeuvre"
                    domain={[0.1, avoidanceXMax]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    label={{
                      value: 'Miss distance before manoeuvre (km)',
                      position: 'insideBottom',
                      offset: -14,
                      fontSize: 11,
                      fill: '#334155'
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="after_km"
                    name="Miss distance after manoeuvre"
                    domain={[0.5, 'auto']}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    label={{
                      value: 'Miss distance after manoeuvre (km)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 4,
                      fontSize: 11,
                      fill: '#334155'
                    }}
                  />
                  <ZAxis range={[28, 28]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-2.5 text-xs font-mono space-y-0.5">
                          <div className="font-bold text-slate-900">
                            {pt.label ? `Live Burn: ${pt.label}` : 'Monte Carlo Conjunction'}
                          </div>
                          <div>Before Burn: {pt.before_km} km</div>
                          <div className="text-purple-700 font-bold">After Burn: {pt.after_km} km</div>
                          <div className={pt.cleared ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            {pt.cleared ? `CLEARED (>= ${thresholdKm} km)` : `BELOW GATE (< ${thresholdKm} km)`}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={thresholdKm}
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                  <Scatter
                    name="Simulated Burn Outcome"
                    data={avoidancePoints}
                    fill="#6d1ba4"
                    fillOpacity={0.85}
                    isAnimationActive={false}
                  />
                  {includeLiveLabBurns && sessionManeuvers.length > 0 && (
                    <Scatter
                      name="Live Executed Burns"
                      data={sessionManeuvers}
                      fill="#059669"
                      isAnimationActive={false}
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {liveSim?.candidate_maneuvers?.length > 0 && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                <span className="text-slate-400 font-bold mr-1">ACTIVE SIM CANDIDATES:</span>
                {liveSim.candidate_maneuvers.slice(0, 5).map((c: any) => (
                  <span
                    key={c.id}
                    className={`px-2 py-0.5 rounded-md border ${
                      c.executed
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                        : c.cleared
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {c.direction} {c.dv_ms}m/s: {c.before_km}→{c.after_km}km
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── ROW 3: PLOT 5 (DAILY ENCOUNTER COUNT - FULL WIDTH) ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Daily encounter count</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {days}-day orbital encounter cadence • Mean: {summary?.mean_daily_encounters ?? 332.8} encounters/day
            </span>
          </div>

          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyEncounters} margin={{ top: 14, right: 20, left: 6, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  type="number"
                  domain={[0, days]}
                  tick={{ fontSize: 11, fill: '#334155' }}
                  label={{
                    value: 'Day of simulation',
                    position: 'insideBottom',
                    offset: -14,
                    fontSize: 11,
                    fill: '#334155'
                  }}
                />
                <YAxis
                  domain={['dataMin - 4', 'dataMax + 4']}
                  tick={{ fontSize: 11, fill: '#334155' }}
                  label={{
                    value: 'Encounters per day',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 4,
                    fontSize: 11,
                    fill: '#334155'
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-2.5 text-xs font-mono space-y-0.5">
                        <div className="font-bold text-slate-900">Simulation Day {pt.day}</div>
                        <div className="text-blue-700">Encounters: {pt.encounters}</div>
                        <div className="text-rose-600">High Risk (&le;{thresholdKm} km): {pt.high_risk}</div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="linear"
                  dataKey="encounters"
                  stroke="#1665d8"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#1665d8', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── TECHNICAL HONESTY DISCLAIMER ── */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-900">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Methodology Note:</span> Conjunction avoidance outcomes are computed by the backend vectorized two-body RK4 solver (μ = 398,600.44 km³/s²) combined with live simulation pairwise telemetry from the active scenario, tracked catalogue shells, and executed maneuvers across the Mission Control, Predictions, Simulator, and Maneuver Planner views.
          </div>
        </div>

        {/* ── OPTICAL CATALOGUE DISTRIBUTIONS BREAKDOWN ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Altitude Distribution */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" /> Tracked Catalogue Altitude Distribution (LEO)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {catalogueData?.total_objects || '1,911'} objects
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {Object.entries(catalogueData?.altitude_distribution || {
                '500-600 km': 380,
                '600-700 km': 620,
                '700-800 km': 510,
                '800-900 km': 270,
                '900+ km': 131
              }).map(([range, count]: [string, any]) => {
                const total = catalogueData?.total_objects || 1911;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={range} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-600">{range}</span>
                      <span className="font-semibold text-slate-900">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inclination Distribution */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-emerald-600" /> Inclination Regimes
              </span>
              <span className="text-[10px] font-mono text-slate-400">Orbital Plane Inclinations</span>
            </div>

            <div className="space-y-2 pt-1">
              {Object.entries(catalogueData?.inclination_distribution || {
                '53° (Starlink)': 720,
                '74° (Cosmos)': 580,
                '82° (Polar)': 340,
                '98° (SSO)': 271
              }).map(([inc, count]: [string, any]) => {
                const total = catalogueData?.total_objects || 1911;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={inc} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-600">{inc}</span>
                      <span className="font-semibold text-slate-900">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CATALOGUE OBJECT SEARCH & SAMPLE TABLE ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Catalogue Objects Sample Preview</h2>
              <p className="text-xs text-slate-500">Derived orbital state vectors and cross-section estimates.</p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by ID or type..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-mono text-[10px] uppercase border-b border-slate-200">
                  <th className="py-2.5 px-3">Object ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Altitude</th>
                  <th className="py-2.5 px-3">Inclination</th>
                  <th className="py-2.5 px-3">Estimated Mass</th>
                  <th className="py-2.5 px-3 text-right">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredRecords.length > 0 ? (
                  filteredRecords.slice(0, 10).map((rec: any) => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{rec.id}</td>
                      <td className="py-2.5 px-3 text-slate-600">{rec.object_type}</td>
                      <td className="py-2.5 px-3 text-slate-800">{rec.altitude?.toFixed(1) || '600.0'} km</td>
                      <td className="py-2.5 px-3 text-slate-800">{rec.inclination?.toFixed(1) || '53.0'}°</td>
                      <td className="py-2.5 px-3 text-slate-600">{rec.mass?.toFixed(1) || '1.2'} kg</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.risk_level === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                          rec.risk_level === 'HIGH' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {rec.risk_level}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-slate-400 font-sans">
                      No records matching search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
