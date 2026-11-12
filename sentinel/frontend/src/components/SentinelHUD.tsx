import React from 'react';
import { Fuel, BatteryCharging, Radio, Compass, ShieldCheck } from 'lucide-react';
import { OrbitalObject, MissionPhase } from '../types';

interface SentinelHUDProps {
  sentinel: OrbitalObject;
  phase: MissionPhase;
  targetName?: string;
}

export const SentinelHUD: React.FC<SentinelHUDProps> = ({ sentinel, phase, targetName }) => {
  const fuelPct = Math.max(0, Math.min(100, ((sentinel.fuel_kg ?? 150) / 150) * 100));
  const batteryPct = sentinel.battery_pct ?? 100;

  const vMag = Math.sqrt(
    sentinel.velocity_x ** 2 +
    sentinel.velocity_y ** 2 +
    sentinel.velocity_z ** 2
  );

  return (
    <div className="glass-panel p-3 flex flex-col gap-2.5 font-mono text-xs">
      {/* Header */}
      <div className="section-header">
        <div className="section-title">
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          <span>Sentinel-01</span>
          <span className="text-tertiary" style={{ fontSize: '10px', fontWeight: 400 }}>Service Craft</span>
        </div>
        <div className="badge-tech badge-cyan">{phase}</div>
      </div>

      {/* Target Engagement Status */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-base)', borderRadius: 6, padding: '6px 10px' }} className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Radio style={{ width: 13, height: 13, color: 'var(--accent)' }} />
          <span className="text-dim" style={{ fontSize: '10px' }}>Target:</span>
          <span className="text-warning font-semibold">{targetName || 'Standby'}</span>
        </div>
        {sentinel.target_distance_km !== undefined && sentinel.target_distance_km !== null ? (
          <div className="text-cyan font-bold" style={{ fontSize: '11px' }}>
            {sentinel.target_distance_km < 1.0
              ? `${(sentinel.target_distance_km * 1000).toFixed(0)} m`
              : `${sentinel.target_distance_km.toFixed(1)} km`}
          </div>
        ) : null}
      </div>

      {/* Fuel & Battery Progress Gauges */}
      <div className="grid grid-cols-2 gap-2">
        {/* Propellant */}
        <div className="stat-tile">
          <div className="flex items-center justify-between mb-1" style={{ fontSize: '10px' }}>
            <span className="flex items-center gap-1 text-dim">
              <Fuel style={{ width: 11, height: 11, color: 'var(--accent)' }} /> Fuel
            </span>
            <span className="font-mono font-semibold" style={{ color: 'var(--accent)', fontSize: '11px' }}>{(sentinel.fuel_kg ?? 150).toFixed(1)} kg</span>
          </div>
          <div className="gauge-bar-bg">
            <div
              className={`gauge-bar-fill ${fuelPct > 30 ? 'gauge-cyan' : 'gauge-red'}`}
              style={{ width: `${fuelPct}%` }}
            />
          </div>
        </div>

        {/* Battery Power Bus */}
        <div className="stat-tile">
          <div className="flex items-center justify-between mb-1" style={{ fontSize: '10px' }}>
            <span className="flex items-center gap-1 text-dim">
              <BatteryCharging style={{ width: 11, height: 11, color: 'var(--success)' }} /> Power
            </span>
            <span className="font-mono font-semibold" style={{ color: 'var(--success)', fontSize: '11px' }}>{batteryPct.toFixed(0)}%</span>
          </div>
          <div className="gauge-bar-bg">
            <div
              className={`gauge-bar-fill ${batteryPct > 25 ? 'gauge-emerald' : 'gauge-red'}`}
              style={{ width: `${batteryPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Flight Vectors: Altitude, Velocity, Closing Rate */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="stat-tile">
          <div className="stat-label">Altitude</div>
          <div className="stat-value text-accent">{sentinel.altitude.toFixed(1)} km</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Velocity</div>
          <div className="stat-value text-accent">{vMag.toFixed(3)} km/s</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Closing Rate</div>
          <div className="stat-value text-warning">
            {sentinel.target_rel_velocity_kms
              ? `${(sentinel.target_rel_velocity_kms * 1000).toFixed(1)} m/s`
              : '0.0 m/s'}
          </div>
        </div>
      </div>

      {/* Cartesian ECI Coordinates */}
      <div className="flex justify-between font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-base)', borderRadius: 6, padding: '5px 10px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
        <span>X: <strong className="text-white">{sentinel.position_x.toFixed(0)}</strong></span>
        <span>Y: <strong className="text-white">{sentinel.position_y.toFixed(0)}</strong></span>
        <span>Z: <strong className="text-white">{sentinel.position_z.toFixed(0)}</strong></span>
      </div>
    </div>
  );
};
