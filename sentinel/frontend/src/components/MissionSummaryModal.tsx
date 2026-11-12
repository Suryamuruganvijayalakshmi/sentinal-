import React from 'react';
import { Award, XCircle, RotateCcw, X } from 'lucide-react';
import { SystemState } from '../types';

interface MissionSummaryModalProps {
  state: SystemState;
  onClose: () => void;
  onReset: () => void;
}

export const MissionSummaryModal: React.FC<MissionSummaryModalProps> = ({ state, onClose, onReset }) => {
  const { mission, sentinel, target } = state;
  const isSuccess = mission.success;

  return (
    <div className="modal-overlay">
      <div className="modal-card cyber-corners">
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: 14, marginBottom: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(0, 240, 255, 0.1)',
            border: '2px solid var(--cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px var(--cyan-glow)'
          }}>
            {isSuccess ? (
              <Award style={{ width: 24, height: 24, color: 'var(--cyan)' }} />
            ) : (
              <XCircle style={{ width: 24, height: 24, color: 'var(--red)' }} />
            )}
          </div>
          <div>
            <div className="font-tech font-bold text-cyan" style={{ fontSize: '18px', letterSpacing: '0.08em' }}>
              AUTONOMOUS MISSION COMPLETED
            </div>
            <div className="font-mono text-dim" style={{ fontSize: '11px' }}>
              MISSION ID: {mission.id} | STRATEGY: {mission.relocation_strategy}
            </div>
          </div>
        </div>

        {/* Metric Grid */}
        <div className="grid grid-cols-2 gap-2 font-mono text-xs" style={{ marginBottom: 18 }}>
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>TARGET OBJECT:</span>
            <span className="text-amber font-bold">{target?.name || target?.id || 'Debris Object'}</span>
          </div>

          <div style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>MISSION DURATION:</span>
            <span className="text-cyan font-bold">{state.clock.mission_elapsed_time_s.toFixed(1)} s</span>
          </div>

          <div style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>INITIAL RISK ➔ FINAL:</span>
            <span className="text-emerald font-bold">CRITICAL ➔ SAFE</span>
          </div>

          <div style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>CLOSEST RENDEZVOUS:</span>
            <span className="text-cyan font-bold">28.4 meters</span>
          </div>

          <div style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>REQUIRED ΔV (TOTAL):</span>
            <span className="text-white font-bold">
              {mission.intercept_plan?.required_delta_v_kms
                ? `${mission.intercept_plan.required_delta_v_kms.toFixed(4)} km/s`
                : '0.1840 km/s'}
            </span>
          </div>

          <div style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>FUEL CONSUMED:</span>
            <span className="text-amber font-bold">
              {(150.0 - (sentinel.fuel_kg ?? 150)).toFixed(1)} kg
            </span>
          </div>

          <div style={{ gridColumn: 'span 2', background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px' }}>
            <span className="text-dim block" style={{ fontSize: '10px' }}>FINAL RELOCATION ORBIT:</span>
            <span className="text-emerald font-bold">
              {mission.maneuver_data?.final_orbit || `${mission.relocation_strategy} Corridor (Conjunction Risk Neutralized)`}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '6px 14px' }}
          >
            DISMISS
          </button>
          <button
            onClick={() => {
              onReset();
              onClose();
            }}
            className="btn-demo"
            style={{ padding: '6px 16px' }}
          >
            <RotateCcw style={{ width: 14, height: 14 }} />
            RESET SIMULATION
          </button>
        </div>
      </div>
    </div>
  );
};
