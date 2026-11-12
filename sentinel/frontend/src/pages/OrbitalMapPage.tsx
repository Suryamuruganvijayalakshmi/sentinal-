import React, { useState } from 'react';
import { OrbitalCanvas } from '../three/OrbitalCanvas';
import { SystemState } from '../types';
import { Search, Globe } from 'lucide-react';

interface OrbitalMapPageProps {
  state: SystemState;
  onSelectObject: (id: string) => void;
  selectedObjectId: string | null;
  predictionData: any;
}

export const OrbitalMapPage: React.FC<OrbitalMapPageProps> = ({
  state,
  onSelectObject,
  selectedObjectId,
  predictionData
}) => {
  const [cameraMode, setCameraMode] = useState<'FREE' | 'FOLLOW_SENTINEL' | 'FOLLOW_TARGET' | 'TOP_DOWN'>('FREE');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredObjects = state.objects.filter(obj => {
    if (filterType !== 'ALL' && obj.object_type !== filterType) return false;
    if (searchQuery && !obj.name.toLowerCase().includes(searchQuery.toLowerCase()) && !obj.id.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 10, padding: 10, height: '100%', overflow: 'hidden' }}>
      {/* Left: Expanded 3D Map Viewport */}
      <div className="glass-panel cyber-corners" style={{ position: 'relative', overflow: 'hidden' }}>
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

      {/* Right: Object Catalog Sidebar */}
      <div className="glass-panel cyber-corners p-3 flex flex-col gap-2.5 font-mono text-xs" style={{ overflowY: 'auto' }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: '6px' }}>
          <div className="flex items-center gap-2">
            <Globe style={{ width: 15, height: 15, color: 'var(--cyan)' }} />
            <span className="font-tech text-sm font-bold tracking-wider text-cyan">
              ORBITAL CATALOG
            </span>
          </div>
          <span className="text-dim" style={{ fontSize: '10px' }}>{filteredObjects.length} OBJECTS</span>
        </div>

        {/* Search and Filter Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ width: 14, height: 14, color: 'var(--text-dim)', position: 'absolute', left: 8, top: 8 }} />
            <input
              type="text"
              placeholder="Search by ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(5, 11, 24, 0.85)',
                border: '1px solid var(--border-cyan)',
                borderRadius: 4,
                padding: '6px 10px 6px 28px',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
            {['ALL', 'SERVICE_VEHICLE', 'FAILED_SATELLITE', 'DEBRIS', 'ACTIVE_SATELLITE'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  padding: '3px 7px',
                  borderRadius: 3,
                  fontFamily: 'var(--font-tech)',
                  fontSize: '9px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: 'none',
                  background: filterType === type ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.05)',
                  color: filterType === type ? '#03060f' : 'var(--text-dim)'
                }}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Object List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
          {filteredObjects.map(obj => {
            const isSelected = obj.id === selectedObjectId;
            const isTarget = obj.id === state.target?.id;
            return (
              <div
                key={obj.id}
                onClick={() => onSelectObject(obj.id)}
                style={{
                  background: isSelected
                    ? 'rgba(0, 240, 255, 0.15)'
                    : isTarget
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(5, 11, 24, 0.75)',
                  border: isSelected
                    ? '1px solid var(--cyan)'
                    : isTarget
                    ? '1px solid var(--amber)'
                    : '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-tech font-bold text-xs" style={{ color: isTarget ? 'var(--amber)' : '#fff' }}>
                    {obj.name}
                  </span>
                  <span className={`badge-tech ${obj.risk_level === 'CRITICAL' ? 'badge-red' : obj.risk_level === 'HIGH' ? 'badge-amber' : 'badge-cyan'}`} style={{ fontSize: '8px' }}>
                    {obj.risk_level}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-dim" style={{ fontSize: '10px' }}>
                  <div>ALT: <strong className="text-cyan">{obj.altitude.toFixed(0)} km</strong></div>
                  <div>INC: <strong className="text-white">{obj.inclination.toFixed(1)}°</strong></div>
                  <div>MASS: <strong className="text-white">{obj.mass.toFixed(0)} kg</strong></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
