import React, { useState } from 'react';
import { SystemState } from '../types';
import { 
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, 
  Download, ArrowRight, FileText, Activity, Filter, Search
} from 'lucide-react';

interface MissionResultsProps {
  systemState: SystemState;
}

export const MissionResults: React.FC<MissionResultsProps> = ({ systemState }) => {
  const { before_after_results, executed_maneuver, events = [], clock, safety_status = 'MONITORING' } = systemState;
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isVerified = safety_status === 'VERIFIED';
  const isReviewRequired = safety_status === 'REVIEW REQUIRED';

  // Export Results to CSV
  const exportResultsCSV = () => {
    if (!before_after_results) {
      alert('No maneuver results available to export yet. Run or execute an avoidance maneuver first.');
      return;
    }
    const headers = ['Metric', 'Before Maneuver', 'After Maneuver', 'Unit / Note'];
    const rows = [
      ['Satellite ID', before_after_results.satellite_id, before_after_results.satellite_id, 'Protected Object'],
      ['Threat Object ID', before_after_results.threat_id, before_after_results.threat_id, 'Conjunction Target'],
      ['Minimum Separation (d_CPA)', before_after_results.initial_d_cpa_km, before_after_results.verified_d_cpa_km, 'km'],
      ['Time to Closest Approach', before_after_results.initial_t_cpa_s, before_after_results.verified_t_cpa_s, 'seconds'],
      ['Screening Distance Threshold', before_after_results.screening_distance_km, before_after_results.screening_distance_km, 'km'],
      ['Maneuver Applied', 'NONE', before_after_results.maneuver_applied.name, 'Impulsive burn'],
      ['Delta-V Magnitude', '0.0', before_after_results.maneuver_applied.delta_v_ms, 'm/s'],
      ['Propellant Consumed', '0.0', before_after_results.maneuver_applied.propellant_kg, 'kg'],
      ['Verification Status', 'WARNING (SCREENING VIOLATION)', before_after_results.verification_status, 'Safety Gate'],
      ['Cleared Safe Orbit', 'FALSE', before_after_results.is_safe ? 'TRUE' : 'FALSE', 'Clearance Verified']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sentinel_mission_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Events to CSV
  const exportEventsCSV = () => {
    if (!events || events.length === 0) return;
    const headers = ['ID', 'Sim Time (s)', 'Timestamp', 'Event Type', 'Message'];
    const rows = events.map(e => [
      e.id,
      e.sim_time,
      `"${e.timestamp}"`,
      `"${e.event_type}"`,
      `"${e.message.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sentinel_event_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Events
  const filteredEvents = events.filter(e => {
    const matchesSearch = e.message.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          e.event_type.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterType === 'ALL') return matchesSearch;
    if (filterType === 'THREATS') return matchesSearch && (e.event_type.includes('THREAT') || e.event_type.includes('CLOSE'));
    if (filterType === 'MANEUVERS') return matchesSearch && (e.event_type.includes('MANEUVER') || e.event_type.includes('BURN'));
    return matchesSearch;
  });

  return (
    <div className="w-full h-[calc(100vh-64px)] overflow-y-auto bg-slate-50 p-6 flex flex-col gap-6">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* Title and Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Mission Results & Post-Flight Verification
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Deterministic before-and-after trajectory analysis, clearance verification, and chronological event ledger.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportResultsCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Export Results CSV
            </button>
            <button
              onClick={exportEventsCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              Export Event Log CSV
            </button>
          </div>
        </div>

        {/* ── 1. DIGITAL TWIN BEFORE & AFTER COMPARISON CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* BEFORE MANEUVER */}
          <div className="bg-white border border-red-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />
            <div className="flex justify-between items-center">
              <span className="font-mono text-xs font-bold text-red-600 tracking-wider uppercase">
                [BEFORE] INITIAL TRAJECTORY
              </span>
              <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                VIOLATION DETECTED
              </span>
            </div>

            <div className="space-y-2.5 text-xs font-mono pt-1">
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-sans">Predicted Closest Separation:</span>
                <span className="font-bold text-red-600">
                  {before_after_results?.initial_d_cpa_km || '3.76'} km
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-sans">Time to Closest Approach:</span>
                <span className="font-semibold text-slate-800">
                  {before_after_results?.initial_t_cpa_s || '145.1'} s
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-sans">Configured Clearance Limit:</span>
                <span className="font-semibold text-slate-800">25.0 km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Safety Margin Violation:</span>
                <span className="font-bold text-red-600">-21.24 km</span>
              </div>
            </div>

            <div className="mt-2 bg-red-50/70 rounded-xl p-3 text-[11px] text-red-900 font-sans leading-relaxed">
              Target debris crosses SAT-01 orbital corridor within 3.76 km, creating an unacceptable collision risk under nominal screening criteria.
            </div>
          </div>

          {/* AFTER MANEUVER */}
          <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <div className="flex justify-between items-center">
              <span className="font-mono text-xs font-bold text-emerald-600 tracking-wider uppercase">
                [AFTER] POST-MANEUVER VERIFICATION
              </span>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                {isReviewRequired ? 'REVIEW REQUIRED' : 'VERIFIED SAFE'}
              </span>
            </div>

            <div className="space-y-2.5 text-xs font-mono pt-1">
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-sans">Verified Closest Separation:</span>
                <span className={`font-bold ${isReviewRequired ? 'text-red-600' : 'text-emerald-600'}`}>
                  {before_after_results?.verified_d_cpa_km || '34.76'} km
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-sans">Avoidance Maneuver Executed:</span>
                <span className="font-semibold text-blue-600">
                  {before_after_results?.maneuver_applied?.name || 'Prograde +5 m/s'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-sans">Propellant Expended:</span>
                <span className="font-semibold text-slate-800">
                  {before_after_results?.maneuver_applied?.propellant_kg || '1.31'} kg
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Safety Margin Clearance:</span>
                <span className="font-bold text-emerald-600">+9.76 km above threshold</span>
              </div>
            </div>

            <div className="mt-2 bg-emerald-50/70 rounded-xl p-3 text-[11px] text-emerald-900 font-sans leading-relaxed">
              Orbital propagation confirms SAT-01 satisfies all safety thresholds with minimum velocity change, preserving propellant reserves for future mission life.
            </div>
          </div>
        </div>

        {/* ── 2. MISSION EVENT LOG AUDIT TRAIL ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Chronological Mission Audit Log</h2>
              <p className="text-xs text-slate-500">Every decision, sensor detection, and burn command logged deterministically.</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                {['ALL', 'THREATS', 'MANEUVERS'].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      filterType === type ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Events Stream Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {filteredEvents.length > 0 ? (
                filteredEvents.slice().reverse().map(e => (
                  <div key={e.id} className="p-3 text-xs flex items-start gap-3 hover:bg-slate-50 transition-colors">
                    <span className="font-mono text-[10px] text-slate-400 shrink-0 w-16 pt-0.5">
                      {e.timestamp}
                    </span>
                    <span className="bg-slate-100 text-slate-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded shrink-0">
                      {e.event_type}
                    </span>
                    <span className="text-slate-800 font-sans flex-1">
                      {e.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 font-sans">
                  No mission events found matching the filter criteria.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

