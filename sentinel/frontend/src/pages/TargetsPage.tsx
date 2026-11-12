import React from 'react';
import { Crosshair } from 'lucide-react';
import { SystemState } from '../types';

interface TargetsPageProps {
  state: SystemState;
  onSelectTarget: (id: string) => void;
}

export const TargetsPage: React.FC<TargetsPageProps> = ({ state, onSelectTarget }) => {
  const ranked = state.ranked_targets;
  const currentTargetId = state.target?.id;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, maxWidth: 1400, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      {/* Formula & Weights Card */}
      <div className="glass-panel cyber-corners p-4 flex flex-col gap-2 font-mono text-xs">
        <div className="flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: 8 }}>
          <Crosshair style={{ width: 16, height: 16, color: 'var(--cyan)' }} />
          <span className="font-tech text-sm font-bold tracking-wider text-cyan">
            AUTONOMOUS TARGET SELECTION & PRIORITY SCORING ENGINE
          </span>
        </div>
        <p className="text-muted" style={{ fontSize: '11px' }}>
          SENTINEL autonomously prioritizes service and mitigation targets using a multi-factor weighted decision function:
        </p>
        <div style={{ background: 'rgba(5, 11, 24, 0.85)', border: '1px solid var(--border-cyan)', borderRadius: 4, padding: '8px 12px', color: 'var(--cyan)', fontSize: '11px' }}>
          Target Score = (Risk × 0.35) + (Health Criticality × 0.25) + (Collision Probability × 0.20) + (Accessibility × 0.10) + (Mission Priority × 0.10)
        </div>
      </div>

      {/* Ranked Targets List */}
      <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
          <span className="font-tech text-sm text-white font-bold">
            CANDIDATE TARGET PRIORITY MATRIX
          </span>
          <span className="text-dim" style={{ fontSize: '11px' }}>{ranked.length} EVALUATED CANDIDATES</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ranked.map((cand, idx) => {
            const isAssigned = cand.object_id === currentTargetId;
            const scorePct = Math.round(cand.total_score * 100);

            return (
              <div
                key={cand.object_id}
                style={{
                  background: isAssigned ? 'rgba(245, 158, 11, 0.12)' : 'rgba(5, 11, 24, 0.65)',
                  border: isAssigned ? '1px solid var(--border-amber)' : '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: isAssigned ? '0 0 16px var(--amber-glow)' : 'none'
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span style={{ width: 24, height: 24, borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--cyan)' }}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-tech text-sm font-bold text-white">{cand.name}</span>
                      <span className="text-dim ml-2" style={{ fontSize: '10px' }}>({cand.object_id})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-dim" style={{ fontSize: '9px' }}>TOTAL SCORE</div>
                      <div className="text-amber font-bold text-sm">{cand.total_score.toFixed(4)} ({scorePct}%)</div>
                    </div>
                    {isAssigned ? (
                      <span className="badge-tech badge-amber">PRIMARY TARGET</span>
                    ) : (
                      <button
                        onClick={() => onSelectTarget(cand.object_id)}
                        className="btn-secondary"
                        style={{ fontSize: '10px', padding: '4px 10px' }}
                      >
                        DESIGNATE TARGET
                      </button>
                    )}
                  </div>
                </div>

                {/* Score breakdown bars */}
                <div className="grid grid-cols-5 gap-2 text-dim mt-2" style={{ background: 'rgba(3, 7, 16, 0.65)', padding: '6px 10px', borderRadius: 4, fontSize: '10px' }}>
                  <div>
                    <span>Risk ({((cand.breakdown.risk_component / 0.35) * 100).toFixed(0)}%)</span>
                    <div className="gauge-bar-bg">
                      <div className="gauge-bar-fill gauge-red" style={{ width: `${(cand.breakdown.risk_component / 0.35) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Health ({((cand.breakdown.health_component / 0.25) * 100).toFixed(0)}%)</span>
                    <div className="gauge-bar-bg">
                      <div className="gauge-bar-fill gauge-amber" style={{ width: `${(cand.breakdown.health_component / 0.25) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Collision ({((cand.breakdown.collision_component / 0.20) * 100).toFixed(0)}%)</span>
                    <div className="gauge-bar-bg">
                      <div className="gauge-bar-fill gauge-cyan" style={{ width: `${(cand.breakdown.collision_component / 0.20) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Access ({((cand.breakdown.accessibility_component / 0.10) * 100).toFixed(0)}%)</span>
                    <div className="gauge-bar-bg">
                      <div className="gauge-bar-fill gauge-emerald" style={{ width: `${(cand.breakdown.accessibility_component / 0.10) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Priority ({((cand.breakdown.priority_component / 0.10) * 100).toFixed(0)}%)</span>
                    <div className="gauge-bar-bg">
                      <div className="gauge-bar-fill gauge-cyan" style={{ width: `${(cand.breakdown.priority_component / 0.10) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
