import React, { useState, useEffect } from 'react';
import { Settings, Sliders, Shield, Save, Check } from 'lucide-react';
import { SystemState } from '../types';
import { api } from '../services/api';

interface SettingsPageProps {
  state: SystemState;
}

export const SettingsPage: React.FC<SettingsPageProps> = () => {
  const [weights, setWeights] = useState({
    risk: 0.35,
    health_criticality: 0.25,
    collision_prob: 0.20,
    accessibility: 0.10,
    mission_priority: 0.10
  });

  const [thresholds, setThresholds] = useState({
    critical_cpa_km: 5.0,
    high_cpa_km: 20.0,
    critical_time_s: 1800
  });

  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    api.getConfig().then(cfg => {
      if (cfg.weights) {
        setWeights(prev => ({ ...prev, ...cfg.weights }));
      }
      if (cfg.thresholds) {
        setThresholds({
          critical_cpa_km: cfg.thresholds.threshold_critical_km ?? 5.0,
          high_cpa_km: cfg.thresholds.threshold_high_km ?? 20.0,
          critical_time_s: cfg.thresholds.time_window_critical_s ?? 1800
        });
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await api.updateConfig({ weights, thresholds });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (e) {
      console.error('Failed to update config:', e);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, maxWidth: 1200, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      <div className="glass-panel cyber-corners p-4 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2.5">
          <Settings style={{ width: 18, height: 18, color: 'var(--cyan)' }} />
          <div>
            <span className="font-tech text-sm font-bold text-white tracking-wider">
              SYSTEM CONFIGURATION & SAFETY CONSTRAINTS
            </span>
            <div className="text-dim" style={{ fontSize: '11px' }}>
              Customize collision thresholds, decision weights, and deterministic safety bounds.
            </div>
          </div>
        </div>
        {savedNotice && (
          <div className="badge-tech badge-emerald" style={{ fontSize: '11px' }}>
            <Check style={{ width: 14, height: 14 }} />
            <span>PARAMETERS UPDATED</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Target Priority Scoring Weights */}
        <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
          <div className="flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
            <Sliders style={{ width: 16, height: 16, color: 'var(--cyan)' }} />
            <span className="font-tech font-bold text-xs text-white">
              TARGET PRIORITY DECISION WEIGHTS (SUM = 1.0)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}>
            <div>
              <div className="flex justify-between mb-1">
                <span>Collision Risk Weight:</span>
                <span className="text-cyan font-bold">{weights.risk.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.05} max={0.7} step={0.05}
                value={weights.risk}
                onChange={(e) => setWeights({ ...weights, risk: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>Health Criticality Weight:</span>
                <span className="text-amber font-bold">{weights.health_criticality.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.05} max={0.6} step={0.05}
                value={weights.health_criticality}
                onChange={(e) => setWeights({ ...weights, health_criticality: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>Collision Probability Weight:</span>
                <span className="text-cyan font-bold">{weights.collision_prob.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.05} max={0.5} step={0.05}
                value={weights.collision_prob}
                onChange={(e) => setWeights({ ...weights, collision_prob: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>Accessibility / Delta-V Weight:</span>
                <span className="text-emerald font-bold">{weights.accessibility.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.05} max={0.4} step={0.05}
                value={weights.accessibility}
                onChange={(e) => setWeights({ ...weights, accessibility: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--emerald)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>Mission Class Priority Weight:</span>
                <span className="text-purple font-bold">{weights.mission_priority.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.05} max={0.4} step={0.05}
                value={weights.mission_priority}
                onChange={(e) => setWeights({ ...weights, mission_priority: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--purple)', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* Collision Thresholds */}
        <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
          <div className="flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
            <Shield style={{ width: 16, height: 16, color: 'var(--amber)' }} />
            <span className="font-tech font-bold text-xs text-white">
              COLLISION SCREENING THRESHOLDS
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}>
            <div>
              <div className="flex justify-between mb-1">
                <span>Critical CPA Distance Threshold:</span>
                <span className="text-red font-bold">{thresholds.critical_cpa_km} km</span>
              </div>
              <input
                type="range" min={1.0} max={20.0} step={0.5}
                value={thresholds.critical_cpa_km}
                onChange={(e) => setThresholds({ ...thresholds, critical_cpa_km: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--red)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>High CPA Distance Threshold:</span>
                <span className="text-amber font-bold">{thresholds.high_cpa_km} km</span>
              </div>
              <input
                type="range" min={5.0} max={50.0} step={1.0}
                value={thresholds.high_cpa_km}
                onChange={(e) => setThresholds({ ...thresholds, high_cpa_km: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span>Critical Conjunction Time Window:</span>
                <span className="text-cyan font-bold">{(thresholds.critical_time_s / 60).toFixed(0)} min</span>
              </div>
              <input
                type="range" min={600} max={7200} step={300}
                value={thresholds.critical_time_s}
                onChange={(e) => setThresholds({ ...thresholds, critical_time_s: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
              />
            </div>

            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)', fontSize: '10px', color: 'var(--text-dim)' }}>
              Deterministic Safety Rule: Propellant reserve must exceed 12.0 kg; relative velocity at capture contact must not exceed 1.0 m/s.
            </div>
          </div>

          <button
            onClick={handleSave}
            className="btn-demo"
            style={{ marginTop: 'auto', justifyContent: 'center', padding: '8px 14px' }}
          >
            <Save style={{ width: 14, height: 14 }} /> APPLY CONFIGURATION
          </button>
        </div>
      </div>
    </div>
  );
};
