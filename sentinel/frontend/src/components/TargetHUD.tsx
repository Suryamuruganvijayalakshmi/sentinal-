import React from 'react';
import { Target, Orbit, AlertTriangle } from 'lucide-react';
import { OrbitalObject } from '../types';

interface TargetHUDProps {
  target: OrbitalObject | null;
  onSelectAlternative?: () => void;
}

export const TargetHUD: React.FC<TargetHUDProps> = ({ target }) => {
  if (!target) {
    return (
      <div className="glass-panel p-4 flex flex-col items-center justify-center text-center gap-2 font-mono text-xs" style={{ minHeight: '140px' }}>
        <Target style={{ width: 24, height: 24, color: 'var(--text-tertiary)' }} />
        <div className="font-semibold" style={{ color: 'var(--text-secondary)' }}>No Target Designated</div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Select an object from the catalog</div>
      </div>
    );
  }

  const vMag = Math.sqrt(
    target.velocity_x ** 2 +
    target.velocity_y ** 2 +
    target.velocity_z ** 2
  );

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'CRITICAL': return 'badge-tech badge-red';
      case 'HIGH': return 'badge-tech badge-amber';
      case 'MEDIUM': return 'badge-tech badge-cyan';
      default: return 'badge-tech badge-emerald';
    }
  };

  const isCritical = target.health_status === 'CRITICAL' || target.risk_level === 'CRITICAL';

  return (
    <div className={`glass-panel p-3 flex flex-col gap-2.5 font-mono text-xs ${isCritical ? 'glass-panel-amber' : ''}`}>
      {/* Top Header */}
      <div className="section-header">
        <div className="section-title">
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isCritical ? 'var(--danger)' : 'var(--warning)'
          }} />
          <span className="text-warning">{target.id}</span>
          <span className="text-dim truncate" style={{ maxWidth: '110px', fontSize: '10px', fontWeight: 400 }}>{target.name}</span>
        </div>
        <div className={getRiskBadge(target.risk_level)}>{target.risk_level}</div>
      </div>

      {/* Type & Health Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
          <Orbit style={{ width: 12, height: 12, color: 'var(--accent)' }} />
          <span>Type: <strong className="text-white">{target.object_type}</strong></span>
        </div>
        <div className={`badge-tech ${target.health_status === 'CRITICAL' ? 'badge-red' : target.health_status === 'DEGRADED' ? 'badge-amber' : 'badge-emerald'}`}>
          {target.health_status}
        </div>
      </div>

      {/* Orbit Properties */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="stat-tile">
          <div className="stat-label">Altitude</div>
          <div className="stat-value text-warning">{target.altitude.toFixed(1)} km</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Velocity</div>
          <div className="stat-value text-warning">{vMag.toFixed(3)} km/s</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Mass / Period</div>
          <div className="stat-value">
            {target.mass ? `${target.mass.toFixed(0)} kg` : `${(target.orbital_period / 60).toFixed(0)}m`}
          </div>
        </div>
      </div>

      {/* Physical & Status info */}
      <div className="flex items-center justify-between font-mono" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-base)', borderRadius: 6, padding: '5px 10px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
        <span>Status: <strong className="text-warning">{target.status}</strong></span>
        <span>Incl: <strong className="text-white">{target.inclination.toFixed(1)}°</strong></span>
      </div>
    </div>
  );
};
