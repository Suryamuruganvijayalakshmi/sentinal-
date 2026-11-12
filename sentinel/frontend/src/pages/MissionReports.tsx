import React from 'react';
import { SystemState } from '../types';
import {
  FileText, Download, Printer, CheckCircle2, AlertTriangle,
  ShieldCheck, Info, ArrowRight, Activity, Fuel, Calendar, Clock
} from 'lucide-react';

interface MissionReportsProps {
  systemState: SystemState;
}

export const MissionReports: React.FC<MissionReportsProps> = ({ systemState }) => {
  const {
    sentinel,
    target,
    clock,
    risks,
    before_after_results,
    executed_maneuver,
    selected_candidate,
    screening_distance_km = 25.0,
    safety_status = 'MONITORING'
  } = systemState;

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

  const reportId = `SENTINEL-ORBITAL-REPORT-${Math.floor(Date.now() / 1000)}`;
  const generatedTime = clock.real_time || new Date().toUTCString();

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCSV = () => {
    const headers = ['Parameter', 'Initial Value', 'Post-Maneuver Value', 'Unit / Note'];
    const rows = [
      ['Report Identifier', reportId, reportId, 'Document ID'],
      ['Scenario', clock.scenario_name, clock.scenario_name, 'Deterministic Simulation'],
      ['Protected Satellite', sentinel?.name || 'SAT-01', sentinel?.name || 'SAT-01', 'Spacecraft'],
      ['Threat Object', target?.name || 'None Active', target?.name || 'None Active', 'Debris'],
      ['Screening Threshold', screening_distance_km, screening_distance_km, 'km'],
      ['Initial Miss Distance (d_CPA)', initial_d_cpa, initial_d_cpa, target ? (initial_d_cpa < screening_distance_km ? 'km (Breached)' : 'km (Safe)') : 'km'],
      ['Initial Encounter Time (t_CPA)', initial_t_cpa, initial_t_cpa, 'seconds'],
      ['Avoidance Maneuver', 'NONE', maneuverName, 'Impulsive Burn'],
      ['Delta-V Magnitude', '0.0', dvMagnitude, 'm/s'],
      ['Propellant Consumed', '0.0', fuelUsed, 'kg'],
      ['Verified Miss Distance (d_CPA)', initial_d_cpa, verified_d_cpa, 'km'],
      ['Safety Clearance Margin', (initial_d_cpa - screening_distance_km).toFixed(2), (verified_d_cpa - screening_distance_km).toFixed(2), 'km'],
      ['Verification Status', target && initial_d_cpa < screening_distance_km ? 'VIOLATION' : 'NOMINAL', isSafe ? 'VERIFIED_SAFE' : 'REVIEW_REQUIRED', 'Safety Gate']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${reportId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-100 p-6 flex flex-col gap-6">

      {/* Top Action Bar */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Mission Flight & Conjunction Report
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Aerospace-grade flight summary and before-and-after avoidance verification audit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF Report
          </button>
        </div>
      </div>

      {/* Printable Report Document Body */}
      <article className="max-w-4xl mx-auto w-full bg-white border border-slate-300 rounded-2xl p-8 md:p-12 shadow-sm flex flex-col gap-8 print:border-none print:shadow-none print:p-0">

        {/* Document Header & Metadata */}
        <header className="border-b-2 border-slate-900 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-mono font-black text-sm tracking-widest uppercase">
              <span>SENTINEL ORBITAL SAFETY COMMAND CENTRE</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 font-mono tracking-tight mt-1">
              CONJUNCTION ASSESSMENT & FLIGHT VERIFICATION REPORT
            </h2>
            <div className="text-xs text-slate-500 font-mono mt-1">
              Autonomous Satellite Collision-Avoidance & Space Debris Intelligence System
            </div>
          </div>

          <div className="text-right font-mono text-xs text-slate-600 shrink-0">
            <div><span className="text-slate-400">DOC ID:</span> <strong className="text-slate-900">{reportId}</strong></div>
            <div><span className="text-slate-400">DATE:</span> {generatedTime}</div>
            <div><span className="text-slate-400">CLASS:</span> EDUCATIONAL RESEARCH PROTOTYPE</div>
          </div>
        </header>

        {/* 1. Executive Summary */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
            1. Executive Mission Summary
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed font-sans">
            This mission report records the conjunction assessment, trajectory screening, impulsive maneuver planning, and verification analysis performed for protected satellite <strong>{sentinel?.name || 'SAT-01'}</strong> in Low Earth Orbit (live altitude {(sentinel?.altitude ?? 600.0).toFixed(1)} km at T+{(clock?.sim_time ?? 0).toFixed(1)}s).
            Under simulated operational conditions ({clock.scenario_name}), {target ? (
              <>
                approaching orbital debris (<strong>{target.name}</strong>) presented a closest approach of <strong>{initial_d_cpa.toFixed(2)} km</strong> against the configured safety screening perimeter of <strong>{screening_distance_km.toFixed(1)} km</strong>.
              </>
            ) : (
              <>no tracked catalog object breached the configured <strong>{screening_distance_km.toFixed(1)} km</strong> screening volume.</>
            )}
          </p>
        </section>

        {/* 2. Key Metrics Table */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
            2. Before vs After Conjunction Telemetry Matrix
          </h3>

          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-y border-slate-300">
                <th className="py-2.5 px-3">Flight Parameter</th>
                <th className="py-2.5 px-3 text-red-700">Pre-Maneuver State</th>
                <th className="py-2.5 px-3 text-emerald-700">Post-Maneuver State</th>
                <th className="py-2.5 px-3">Delta / Improvement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">Closest Approach Distance (d_CPA)</td>
                <td className="py-2.5 px-3 text-red-600 font-bold">{target ? `${initial_d_cpa.toFixed(2)} km` : 'NONE'}</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">{target ? `${verified_d_cpa.toFixed(2)} km` : 'NOMINAL'}</td>
                <td className="py-2.5 px-3 text-emerald-700 font-bold">
                  {target ? `${delta_d_cpa >= 0 ? '+' : ''}${delta_d_cpa.toFixed(2)} km (${((delta_d_cpa / Math.max(0.01, initial_d_cpa)) * 100).toFixed(0)}%)` : 'No Threat'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">Time to Encounter (t_CPA)</td>
                <td className="py-2.5 px-3 text-slate-700">{initial_t_cpa.toFixed(1)} s</td>
                <td className="py-2.5 px-3 text-slate-700">{verified_t_cpa.toFixed(1)} s</td>
                <td className="py-2.5 px-3 text-slate-500">{verified_t_cpa - initial_t_cpa >= 0 ? '+' : ''}{(verified_t_cpa - initial_t_cpa).toFixed(1)} s</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">Configured Screening Boundary</td>
                <td className="py-2.5 px-3 text-slate-700">{screening_distance_km.toFixed(1)} km</td>
                <td className="py-2.5 px-3 text-slate-700">{screening_distance_km.toFixed(1)} km</td>
                <td className="py-2.5 px-3 text-slate-500">Fixed Safety Criterion</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">Safety Envelope Compliance</td>
                <td className={`py-2.5 px-3 font-bold ${target && initial_d_cpa < screening_distance_km ? 'text-red-600' : 'text-emerald-600'}`}>
                  {target && initial_d_cpa < screening_distance_km
                    ? `VIOLATION (-${(screening_distance_km - initial_d_cpa).toFixed(1)} km)`
                    : 'NOMINAL'}
                </td>
                <td className={`py-2.5 px-3 font-bold ${isSafe ? 'text-emerald-600' : 'text-red-600'}`}>
                  {target
                    ? (isSafe ? `CLEARED (+${(verified_d_cpa - screening_distance_km).toFixed(1)} km)` : `BELOW GATE (-${(screening_distance_km - verified_d_cpa).toFixed(1)} km)`)
                    : 'SAFE'}
                </td>
                <td className={`py-2.5 px-3 font-bold ${hasExecutedBurn ? (isSafe ? 'text-emerald-700' : 'text-red-700') : 'text-amber-700'}`}>
                  {hasExecutedBurn ? (isSafe ? 'PASS (SAFE)' : 'REVIEW REQUIRED') : safety_status}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">Propellant Consumption</td>
                <td className="py-2.5 px-3 text-slate-500">0.00 kg</td>
                <td className="py-2.5 px-3 font-bold text-slate-900">{fuelUsed.toFixed(2)} kg</td>
                <td className="py-2.5 px-3 text-slate-500">Isp = 310s (Hydrazine RCS)</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 3. Avoidance Maneuver Details */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
            3. Executed Burn Kinematics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 font-sans block">Burn Identification</span>
              <span className="font-bold text-slate-900 mt-1 block">{maneuverName}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 font-sans block">Velocity Change Magnitude</span>
              <span className="font-bold text-blue-600 mt-1 block">Δv = {dvMagnitude.toFixed(1)} m/s</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 font-sans block">Propellant Consumed</span>
              <span className="font-bold text-slate-900 mt-1 block">{fuelUsed.toFixed(2)} kg</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 font-sans block">Fuel Margin Remaining</span>
              <span className="font-bold text-emerald-700 mt-1 block">{sentinel?.fuel_kg?.toFixed(1) || '148.7'} kg</span>
            </div>
          </div>
        </section>

        {/* 4. Mathematical Methodology */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
            4. Deterministic Mathematical Methodology
          </h3>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono space-y-2 text-slate-800">
            <div>
              <strong>1. Time of Closest Approach:</strong> <code>t_CPA = -(r_rel · v_rel) / ||v_rel||²</code>
            </div>
            <div>
              <strong>2. Closest Approach Distance:</strong> <code>d_CPA = ||r_rel + t_CPA * v_rel||</code>
            </div>
            <div>
              <strong>3. Propellant Mass Depletion:</strong> <code>Δm = m_0 * (1 - exp(-Δv / (I_sp * g_0)))</code>
            </div>
            <div>
              <strong>4. Orbital Trajectory Propagation:</strong> 4th-Order Runge-Kutta (RK4) numerical integration under central two-body gravitational acceleration <code>a = -(μ / r³) * r</code> (μ = 398,600.44 km³/s²).
            </div>
          </div>
        </section>

        {/* 5. Mandatory Technical Honesty Disclosure */}
        <section className="border-t border-slate-200 pt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 font-mono">
            <Info className="w-4 h-4 text-blue-600" />
            Mandatory Research & Technical Honesty Disclosure
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
            This simulation report was generated by <strong>SENTINEL</strong>, an educational engineering prototype.
            The system employs synthetic collision scenarios and a documented simplified two-body Runge-Kutta (RK4) orbital mechanics propagation model.
            This simulator is not an operational conjunction assessment tool, nor does it perform live spacecraft tracking.
            Space debris catalogue analytics are derived from optical surveillance datasets and are decoupled from synthetic simulation warnings.
          </p>
        </section>

        {/* Sign-off Seal */}
        <footer className="border-t-2 border-slate-900 pt-4 flex justify-between items-center text-xs font-mono text-slate-500">
          <div>SENTINEL Verification Engine v2.0 • Deterministic Safety Sign-off</div>
          <div className={`flex items-center gap-1.5 font-bold ${
            hasExecutedBurn ? (isSafe ? 'text-emerald-700' : 'text-red-700') : 'text-amber-700'
          }`}>
            {isSafe ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
            VERIFICATION SEAL: {hasExecutedBurn ? (isSafe ? 'PASS (VERIFIED)' : 'REVIEW REQUIRED') : safety_status}
          </div>
        </footer>

      </article>

    </div>
  );
};

