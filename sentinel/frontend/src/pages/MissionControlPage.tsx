import React, { useState } from 'react';
import { OrbitalCanvas } from '../three/OrbitalCanvas';
import { SentinelHUD } from '../components/SentinelHUD';
import { TargetHUD } from '../components/TargetHUD';
import { AIRecommendationCard } from '../components/AIRecommendationCard';
import { EventLogStream } from '../components/EventLogStream';
import { SystemState, MissionPhase } from '../types';
import { Target, Compass, ArrowUpRight, ShieldAlert, Zap } from 'lucide-react';

interface MissionControlPageProps {
  state: SystemState;
  onSelectObject: (id: string) => void;
  onSelectStrategy: (strat: string) => void;
  selectedObjectId: string | null;
  predictionData: any;
}

const MISSION_PHASES: MissionPhase[] = [
  'IDLE',
  'TARGET_SELECTION',
  'TRACKING',
  'PREDICTION',
  'INTERCEPT_PLANNING',
  'INTERCEPTING',
  'RENDEZVOUS',
  'INSPECTION',
  'CAPTURE',
  'MANEUVER',
  'SAFE_TRAJECTORY',
  'MISSION_COMPLETE'
];

export const MissionControlPage: React.FC<MissionControlPageProps> = ({
  state,
  onSelectObject,
  onSelectStrategy,
  selectedObjectId,
  predictionData
}) => {
  const [cameraMode, setCameraMode] = useState<'FREE' | 'FOLLOW_SENTINEL' | 'FOLLOW_TARGET' | 'TOP_DOWN'>('FREE');

  const strategies = [
    { id: 'SAFE ORBIT', label: 'SAFE GRAVEYARD (+300km)', dv: '18.4 m/s' },
    { id: 'DISPOSAL ORBIT', label: 'ATMOSPHERIC DEORBIT', dv: '42.1 m/s' },
    { id: 'STORAGE ORBIT', label: 'PARKING STORAGE', dv: '12.0 m/s' }
  ];

  // Map candidate objects with priority scores from ranked_targets
  const scoreMap = new Map<string, number>();
  state.ranked_targets.forEach(r => scoreMap.set(r.object_id, r.total_score));

  const candidateObjects = state.objects
    .filter(o => o.id !== state.sentinel?.id)
    .sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))
    .slice(0, 5);

  const currentPhaseIndex = MISSION_PHASES.indexOf(state.mission.phase);

  return (
    <div className="control-layout">
      {/* LEFT COLUMN: Target Selection & Relocation Objectives */}
      <div className="side-panel">
        {/* Target Catalog & Priority Scoring */}
        <div className="glass-panel p-3 flex flex-col gap-2.5">
          <div className="section-header">
            <div className="section-title">
              <Target style={{ width: 13, height: 13 }} />
              <span>Target Priority</span>
            </div>
            <span className="section-meta">ECI Catalog</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {candidateObjects.map(obj => {
              const isCurrentTarget = obj.id === state.target?.id;
              const isSelected = obj.id === selectedObjectId;
              return (
                <div
                  key={obj.id}
                  onClick={() => onSelectObject(obj.id)}
                  style={{
                    background: isCurrentTarget
                      ? 'rgba(251,191,36,0.08)'
                      : isSelected
                      ? 'rgba(56,189,248,0.08)'
                      : 'var(--bg-elevated)',
                    border: `1px solid ${isCurrentTarget ? 'rgba(251,191,36,0.3)' : isSelected ? 'rgba(56,189,248,0.25)' : 'var(--border-base)'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="font-semibold" style={{ fontSize: '12px', color: isCurrentTarget ? 'var(--warning)' : 'var(--text-primary)' }}>
                        {obj.name}
                      </span>
                      {isCurrentTarget && (
                        <span className="badge-tech badge-amber" style={{ fontSize: '9px', padding: '1px 5px' }}>Active</span>
                      )}
                    </div>
                    <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                      {obj.altitude.toFixed(0)} km &nbsp;&middot;&nbsp; Score: <strong style={{ color: 'var(--accent)' }}>{((scoreMap.get(obj.id) || 0) * 100).toFixed(0)}%</strong>
                    </div>
                  </div>
                  <div>
                    <span className={`badge-tech ${obj.health_status === 'CRITICAL' ? 'badge-red' : obj.health_status === 'DEGRADED' ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: '9px' }}>
                      {obj.health_status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Relocation Destination Strategy Selector */}
        <div className="glass-panel p-3 flex flex-col gap-2.5">
          <div className="section-header">
            <div className="section-title">
              <Zap style={{ width: 13, height: 13 }} />
              <span>Relocation Maneuver</span>
            </div>
            <span className="section-meta">ΔV Plan</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {strategies.map(strat => {
              const isActive = state.mission.relocation_strategy === strat.id;
              return (
                <button
                  key={strat.id}
                  onClick={() => onSelectStrategy(strat.id)}
                  style={{
                    background: isActive ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: isActive ? 'var(--bg-base)' : 'var(--text-primary)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-base)'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{strat.label}</span>
                  <span className="font-mono" style={{ fontSize: '10px', opacity: 0.8 }}>
                    ΔV {strat.dv}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Tactical Recommendation */}
        <AIRecommendationCard
          recommendation={state.recommendation}
          anomaly={state.anomaly}
        />
      </div>

      {/* CENTER COLUMN: 3D Orbital Canvas & Phase Stepper */}
      <div className="center-viewport">
        {/* 3D Viewport Container */}
        <div className="three-container">
          <OrbitalCanvas
            objects={state.objects}
            sentinel={state.sentinel}
            target={state.target}
            risks={state.risks}
            selectedObjectId={selectedObjectId}
            onSelectObject={onSelectObject}
            cameraMode={cameraMode}
            onChangeCameraMode={setCameraMode}
            onResetCamera={() => setCameraMode('FREE')}
            predictedWaypoints={predictionData?.waypoints}
            interceptWaypoints={state.mission.intercept_plan?.trajectory_waypoints}
          />
        </div>

        {/* Mission Autonomous Phase Sequence Stepper */}
        <div className="glass-panel p-3 flex flex-col gap-2" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center justify-between" style={{ fontSize: '11px' }}>
            <span className="font-semibold" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '10px' }}>Mission Timeline</span>
            <span className="font-mono font-semibold text-accent" style={{ fontSize: '11px' }}>{state.mission.phase}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 2, paddingTop: 2 }}>
            {MISSION_PHASES.map((ph, idx) => {
              const isCurrent = state.mission.phase === ph;
              const isPast = currentPhaseIndex > idx;
              return (
                <div
                  key={ph}
                  className={`phase-step ${isCurrent ? 'active' : isPast ? 'completed' : ''}`}
                >
                  <span style={{ fontSize: '9px', opacity: 0.5 }}>{idx + 1}.</span>
                  {ph.replace(/_/g, ' ')}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: SENTINEL Flight Systems Telemetry, Target HUD & Event Stream */}
      <div className="side-panel">
        {/* SENTINEL Vehicle Telemetry */}
        <SentinelHUD
          sentinel={state.sentinel}
          phase={state.mission.phase}
          targetName={state.target?.name}
        />

        {/* TARGET Diagnostic HUD */}
        <TargetHUD target={state.target} />

        {/* Chronological Mission Event Log */}
        <EventLogStream events={state.events} maxHeight="240px" />
      </div>
    </div>
  );
};
