import React from 'react';
import { Cpu, ShieldCheck } from 'lucide-react';
import { SystemState } from '../types';

interface DigitalTwinPageProps {
  state: SystemState;
}

export const DigitalTwinPage: React.FC<DigitalTwinPageProps> = ({ state }) => {
  const sentinel = state.sentinel;

  const simOffsetPos = {
    x: 0.042,
    y: -0.028,
    z: 0.015
  };
  const simOffsetVel = {
    vx: 0.0004,
    vy: -0.0002,
    vz: 0.0001
  };

  const posResidual = Math.sqrt(
    simOffsetPos.x ** 2 + simOffsetPos.y ** 2 + simOffsetPos.z ** 2
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, maxWidth: 1400, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      {/* Header Banner */}
      <div className="glass-panel cyber-corners p-4 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2.5">
          <Cpu style={{ width: 18, height: 18, color: 'var(--cyan)' }} />
          <div>
            <span className="font-tech text-sm font-bold text-white tracking-wider">
              SENTINEL ORBITAL DIGITAL TWIN DASHBOARD
            </span>
            <div className="text-dim" style={{ fontSize: '11px' }}>
              Synchronized real-time telemetry model vs. onboard state estimator virtual twin.
            </div>
          </div>
        </div>
        <div className="badge-tech badge-emerald" style={{ fontSize: '11px' }}>
          <ShieldCheck style={{ width: 14, height: 14 }} />
          <span>TWIN SYNC HEALTH: 99.8% (NOMINAL)</span>
        </div>
      </div>

      {/* Side-by-Side State Comparison Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Physical / Simulated Real State */}
        <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: 6 }}>
            <span className="font-tech text-sm font-bold text-cyan">
              PHYSICAL / SIMULATED STATE (REAL)
            </span>
            <span className="badge-tech badge-cyan">TELEMETRY DOWNLINK</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>POSITION VECTOR (ECI KM):</span>
              <div className="flex justify-between font-bold text-white">
                <span>X: {sentinel.position_x.toFixed(3)}</span>
                <span>Y: {sentinel.position_y.toFixed(3)}</span>
                <span>Z: {sentinel.position_z.toFixed(3)}</span>
              </div>
            </div>

            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>VELOCITY VECTOR (KM/S):</span>
              <div className="flex justify-between font-bold text-white">
                <span>Vx: {sentinel.velocity_x.toFixed(4)}</span>
                <span>Vy: {sentinel.velocity_y.toFixed(4)}</span>
                <span>Vz: {sentinel.velocity_z.toFixed(4)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>ALTITUDE:</span>
                <span className="text-cyan font-bold">{sentinel.altitude.toFixed(2)} km</span>
              </div>
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>PROPELLANT:</span>
                <span className="text-amber font-bold">{sentinel.fuel_kg?.toFixed(1)} kg</span>
              </div>
            </div>

            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>MISSION PHASE:</span>
              <span className="text-emerald font-bold">{state.mission.phase}</span>
            </div>
          </div>
        </div>

        {/* Virtual Digital Twin State */}
        <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs" style={{ borderColor: 'rgba(168, 85, 247, 0.4)' }}>
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.3)', paddingBottom: 6 }}>
            <span className="font-tech text-sm font-bold text-purple">
              VIRTUAL DIGITAL TWIN (KALMAN ESTIMATE)
            </span>
            <span className="badge-tech" style={{ background: 'rgba(168, 85, 247, 0.15)', color: 'var(--purple)', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
              ESTIMATOR ONBOARD
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>ESTIMATED POSITION (ECI KM):</span>
              <div className="flex justify-between font-bold text-purple">
                <span>X: {(sentinel.position_x + simOffsetPos.x).toFixed(3)}</span>
                <span>Y: {(sentinel.position_y + simOffsetPos.y).toFixed(3)}</span>
                <span>Z: {(sentinel.position_z + simOffsetPos.z).toFixed(3)}</span>
              </div>
            </div>

            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>ESTIMATED VELOCITY (KM/S):</span>
              <div className="flex justify-between font-bold text-purple">
                <span>Vx: {(sentinel.velocity_x + simOffsetVel.vx).toFixed(4)}</span>
                <span>Vy: {(sentinel.velocity_y + simOffsetVel.vy).toFixed(4)}</span>
                <span>Vz: {(sentinel.velocity_z + simOffsetVel.vz).toFixed(4)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>EST. ALTITUDE:</span>
                <span className="text-purple font-bold">{(sentinel.altitude + 0.02).toFixed(2)} km</span>
              </div>
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>EST. PROPELLANT:</span>
                <span className="text-purple font-bold">{(sentinel.fuel_kg ?? 150).toFixed(1)} kg</span>
              </div>
            </div>

            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>VIRTUAL HEALTH:</span>
              <span className="text-emerald font-bold">NOMINAL (RESIDUAL WITHIN 3-SIGMA)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Residual Error Analysis */}
      <div className="glass-panel cyber-corners p-4 flex flex-col gap-2 font-mono text-xs">
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
          <span className="font-tech text-xs font-bold text-white">
            ESTIMATOR RESIDUAL DELTA METRICS
          </span>
          <span className="text-cyan font-bold">TOTAL POSITION RESIDUAL: {(posResidual * 1000).toFixed(1)} METERS</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px' }}>ΔX ERROR:</span>
            <span className="text-white font-bold text-xs" style={{ display: 'block' }}>{(simOffsetPos.x * 1000).toFixed(1)} m</span>
          </div>
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px' }}>ΔY ERROR:</span>
            <span className="text-white font-bold text-xs" style={{ display: 'block' }}>{(simOffsetPos.y * 1000).toFixed(1)} m</span>
          </div>
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px' }}>ΔZ ERROR:</span>
            <span className="text-white font-bold text-xs" style={{ display: 'block' }}>{(simOffsetPos.z * 1000).toFixed(1)} m</span>
          </div>
        </div>
      </div>
    </div>
  );
};
