import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SystemState } from '../types';

interface RiskAnalysisPageProps {
  state: SystemState;
}

export const RiskAnalysisPage: React.FC<RiskAnalysisPageProps> = ({ state }) => {
  const [filterRisk, setFilterRisk] = useState<string>('ALL');
  const risks = state.risks;

  const filteredRisks = risks.filter(r => {
    if (filterRisk === 'ALL') return true;
    return r.risk_level === filterRisk;
  });

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'badge-tech badge-red';
      case 'HIGH': return 'badge-tech badge-amber';
      case 'MEDIUM': return 'badge-tech badge-cyan';
      default: return 'badge-tech badge-emerald';
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, maxWidth: 1600, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      {/* Header Banner */}
      <div className="glass-panel cyber-corners p-4 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2.5">
          <AlertTriangle style={{ width: 18, height: 18, color: 'var(--amber)' }} />
          <div>
            <span className="font-tech text-sm font-bold text-white tracking-wider">
              CONTINUOUS ORBITAL CONJUNCTION & COLLISION-RISK SCREENING
            </span>
            <div className="text-dim" style={{ fontSize: '11px' }}>
              Pairwise analysis: closest approach distance (d_CPA), conjunction epoch (t_CPA), and collision probability.
            </div>
          </div>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterRisk(lvl)}
              style={{
                padding: '4px 9px',
                borderRadius: 3,
                fontFamily: 'var(--font-tech)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: filterRisk === lvl ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.05)',
                color: filterRisk === lvl ? '#03060f' : 'var(--text-muted)'
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Conjunction Table */}
      <div className="sci-table-wrapper">
        <table className="sci-table">
          <thead>
            <tr>
              <th>SEVERITY</th>
              <th>PRIMARY OBJECT</th>
              <th>CONJUNCTION TARGET</th>
              <th>CURRENT RANGE</th>
              <th>RELATIVE SPEED</th>
              <th>CPA DISTANCE</th>
              <th>TIME TO CPA</th>
              <th>COLLISION PROB</th>
              <th>TRAJECTORY</th>
            </tr>
          </thead>
          <tbody>
            {filteredRisks.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                  No active conjunction hazards detected for current filter.
                </td>
              </tr>
            ) : (
              filteredRisks.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className={getRiskBadge(r.risk_level)}>
                      {r.risk_level}
                    </span>
                  </td>
                  <td className="font-tech font-bold text-white">
                    {r.object_a_name}
                  </td>
                  <td className="font-tech font-bold text-amber">
                    {r.object_b_name}
                  </td>
                  <td className="text-white">
                    {r.current_distance_km.toFixed(2)} km
                  </td>
                  <td className="text-muted">
                    {r.relative_speed_kms.toFixed(3)} km/s
                  </td>
                  <td className="font-bold text-cyan">
                    {r.cpa_distance_km.toFixed(3)} km
                  </td>
                  <td className="font-bold text-amber">
                    {r.cpa_time_s.toFixed(1)} s
                  </td>
                  <td className="text-muted">
                    {r.collision_probability.toExponential(2)}
                  </td>
                  <td>
                    {r.is_diverging ? (
                      <span className="text-dim">DIVERGING</span>
                    ) : (
                      <span className="text-red font-bold" style={{ animation: 'pulse-red 1.5s infinite' }}>CONVERGING</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
