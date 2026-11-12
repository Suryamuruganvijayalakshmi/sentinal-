import React, { useState } from 'react';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';
import { SystemState, OrbitalObject } from '../types';
import { api } from '../services/api';
import { 
  Search, Satellite, Disc, Radio, Compass, Eye,
  Target, Layers, ArrowUpRight, Zap, Info, ShieldAlert,
  RotateCcw, Sparkles
} from 'lucide-react';

interface ObjectExplorerProps {
  systemState: SystemState;
  onRefreshState: () => void;
  onSelectObject: (id: string) => void;
  onNavigateToSimulator: () => void;
  theme: 'light' | 'dark';
}

export const ObjectExplorer: React.FC<ObjectExplorerProps> = ({
  systemState,
  onRefreshState,
  onSelectObject,
  onNavigateToSimulator,
  theme
}) => {
  const { objects, sentinel, target, risks } = systemState;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTIVE' | 'DEBRIS' | 'LEO' | 'MEO'>('ALL');
  const [activeObjectId, setActiveObjectId] = useState<string>(target?.id || sentinel?.id || 'SAT-01');
  const [cameraMode, setCameraMode] = useState<CameraPresetMode>('GLOBAL');
  const [inspectedObject, setInspectedObject] = useState<OrbitalObject | null>(null);

  const activeObj = objects.find(o => o.id === activeObjectId) || sentinel;

  // Filter objects
  const filteredObjects = objects.filter(obj => {
    const matchesSearch = 
      obj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.object_type.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedFilter === 'ACTIVE') return obj.object_type === 'ACTIVE_SATELLITE' || obj.id === 'SAT-01';
    if (selectedFilter === 'DEBRIS') return obj.object_type === 'DEBRIS' || obj.object_type === 'FAILED_SATELLITE';
    if (selectedFilter === 'LEO') return obj.altitude < 2000;
    if (selectedFilter === 'MEO') return obj.altitude >= 2000;
    return true;
  });

  const handleSelect = (obj: OrbitalObject) => {
    setActiveObjectId(obj.id);
    onSelectObject(obj.id);
  };

  const handleFollow = (obj: OrbitalObject) => {
    setActiveObjectId(obj.id);
    onSelectObject(obj.id);
    if (obj.id === sentinel?.id) {
      setCameraMode('FOLLOW_SENTINEL');
    } else {
      setCameraMode('FOLLOW_TARGET');
    }
  };

  const handleSimulateApproach = async (obj: OrbitalObject) => {
    try {
      await api.selectTarget(obj.id);
      await onRefreshState();
      onNavigateToSimulator();
    } catch (e) {
      console.error('Failed to set target for approach:', e);
    }
  };

  return (
    <div className="relative w-full h-full overflow-y-auto lg:overflow-hidden bg-slate-50 flex flex-col lg:flex-row">
      {/* ── LEFT SIDEBAR: Search, Filters & Catalogue List (~360px) ── */}
      <aside className="order-2 lg:order-1 w-full lg:w-88 xl:w-96 h-auto lg:h-full max-h-[340px] lg:max-h-none bg-white border-t lg:border-t-0 lg:border-r border-slate-200 flex flex-col p-3.5 sm:p-4 gap-3 overflow-hidden shadow-xs shrink-0 z-10">
        
        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Satellite className="w-4 h-4 text-blue-600" />
            <h1 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900">
              Orbital Object Explorer
            </h1>
          </div>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
            {filteredObjects.length} TRACKED
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, or designator..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
          {(['ALL', 'ACTIVE', 'DEBRIS', 'LEO', 'MEO'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap ${
                selectedFilter === filter
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Objects Scroll List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
          {filteredObjects.map(obj => {
            const isSelected = obj.id === activeObjectId;
            const isSentinelObj = obj.id === sentinel?.id;
            const isDebrisObj = obj.object_type === 'DEBRIS';

            return (
              <div
                key={obj.id}
                onClick={() => handleSelect(obj)}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-400 shadow-2xs ring-1 ring-blue-300'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg shrink-0 ${
                    isSentinelObj
                      ? 'bg-blue-100 text-blue-700'
                      : isDebrisObj
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {isSentinelObj ? (
                      <Satellite className="w-3.5 h-3.5" />
                    ) : (
                      <Disc className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-slate-900 truncate font-mono text-[11px]">
                      {obj.name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {obj.id} • {obj.altitude.toFixed(0)} km
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                    obj.risk_level === 'CRITICAL'
                      ? 'bg-red-100 text-red-800'
                      : obj.risk_level === 'HIGH'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {obj.risk_level}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    inc {obj.inclination.toFixed(0)}°
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── CENTER: 3D Orbital Visualization (~55% of screen) ── */}
      <div className="order-1 lg:order-2 relative w-full lg:flex-1 min-w-0 h-[300px] sm:h-[380px] lg:h-full shrink-0">
        <OrbitalCanvas
          objects={objects}
          sentinel={sentinel}
          target={activeObj && activeObj.id !== sentinel?.id ? activeObj : target}
          risks={risks}
          selectedObjectId={activeObjectId}
          onSelectObject={id => setActiveObjectId(id)}
          cameraMode={cameraMode}
          onChangeCameraMode={setCameraMode}
          onResetCamera={() => setCameraMode('GLOBAL')}
          simTime={systemState.clock?.sim_time ?? 0}
          isRunning={systemState.clock?.is_running}
          timeScale={systemState.clock?.time_scale}
          theme={theme}
          hideControls={true}
        />

        {/* 3D Camera Controls Bar */}
        <div className="absolute top-2.5 sm:top-4 left-2.5 sm:left-auto right-2.5 sm:right-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-1 sm:p-1.5 shadow-sm flex flex-wrap items-center gap-1 w-fit max-w-[calc(100%-1.25rem)]">
          <span className="hidden sm:flex text-[11px] font-medium text-slate-500 px-2 items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-blue-600" /> Perspective:
          </span>
          <button
            onClick={() => setCameraMode('GLOBAL')}
            className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'GLOBAL' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Earth
          </button>
          <button
            onClick={() => setCameraMode('LEO')}
            className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'LEO' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            LEO
          </button>
          <button
            onClick={() => setCameraMode('MEO')}
            className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'MEO' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            MEO
          </button>
          <button
            onClick={() => setCameraMode('GEO')}
            className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'GEO' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            GEO
          </button>
          <button
            onClick={() => activeObj && handleFollow(activeObj)}
            className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg font-medium transition-all ${
              cameraMode === 'FOLLOW_TARGET' || cameraMode === 'FOLLOW_SENTINEL' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Focus Target
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL: Object Details & Interactive Inspection (~360px) ── */}
      {activeObj && (
        <aside className="order-3 w-full lg:w-88 xl:w-96 h-auto lg:h-full bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col p-3.5 sm:p-4 gap-3.5 lg:overflow-y-auto shadow-xs shrink-0 z-10">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                {activeObj.object_type}
              </div>
              <h2 className="text-sm font-bold text-slate-900 font-mono truncate">
                {activeObj.name}
              </h2>
            </div>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
              activeObj.risk_level === 'CRITICAL'
                ? 'bg-red-100 text-red-800'
                : activeObj.risk_level === 'HIGH'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              {activeObj.risk_level}
            </span>
          </div>

          {/* Core Orbital Parameters */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Keplerian Orbital Elements
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                <span className="text-[10px] text-slate-500 font-sans block">ALTITUDE</span>
                <span className="text-slate-900 font-bold">{activeObj.altitude.toFixed(1)} km</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                <span className="text-[10px] text-slate-500 font-sans block">INCLINATION</span>
                <span className="text-slate-900 font-bold">{activeObj.inclination.toFixed(1)}°</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                <span className="text-[10px] text-slate-500 font-sans block">PERIOD</span>
                <span className="text-slate-900 font-bold">{(activeObj.orbital_period / 60).toFixed(1)} min</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                <span className="text-[10px] text-slate-500 font-sans block">EST. MASS</span>
                <span className="text-slate-900 font-bold">{activeObj.mass.toFixed(0)} kg</span>
              </div>
            </div>
          </section>

          {/* 3D State Vector (Position & Velocity) */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Current Cartesian State Vector
            </span>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200/70 flex flex-wrap justify-between gap-1">
                <span className="text-slate-500 font-sans">POSITION [X, Y, Z]:</span>
                <span className="font-bold text-slate-900">
                  [{activeObj.position_x.toFixed(0)}, {activeObj.position_y.toFixed(0)}, {activeObj.position_z.toFixed(0)}] km
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200/70 flex flex-wrap justify-between gap-1">
                <span className="text-slate-500 font-sans">VELOCITY [Vx, Vy, Vz]:</span>
                <span className="font-bold text-blue-600">
                  [{activeObj.velocity_x.toFixed(2)}, {activeObj.velocity_y.toFixed(2)}, {activeObj.velocity_z.toFixed(2)}] km/s
                </span>
              </div>
            </div>
          </section>

          {/* Surveillance & Sensor Metadata (Kaggle dataset attributes) */}
          {activeObj.metadata && (
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Observational Surveillance Record
              </span>
              <div className="space-y-1 font-mono text-[11px] text-slate-700">
                {activeObj.metadata.source && (
                  <div className="flex flex-wrap justify-between gap-1">
                    <span className="text-slate-500">Source Dataset:</span>
                    <span className="font-semibold break-all">{activeObj.metadata.source}</span>
                  </div>
                )}
                {activeObj.metadata.cross_section_m2 && (
                  <div className="flex flex-wrap justify-between gap-1">
                    <span className="text-slate-500">RCS / Cross Section:</span>
                    <span className="font-semibold">{activeObj.metadata.cross_section_m2} m²</span>
                  </div>
                )}
                {activeObj.metadata.tumble_rate_deg_s && (
                  <div className="flex flex-wrap justify-between gap-1">
                    <span className="text-slate-500">Tumble Rate:</span>
                    <span className="font-semibold text-amber-600">{activeObj.metadata.tumble_rate_deg_s}°/s</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Interactive Action Controls (Section 5 Required Buttons) */}
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <button
              onClick={() => handleFollow(activeObj)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all"
            >
              <Eye className="w-3.5 h-3.5" />
              FOLLOW OBJECT IN 3D
            </button>

            <button
              onClick={() => handleSimulateApproach(activeObj)}
              className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
            >
              <Target className="w-3.5 h-3.5 text-amber-700" />
              SIMULATE CONJUNCTION APPROACH
            </button>
          </div>

        </aside>
      )}
    </div>
  );
};

