import React, { useState, useMemo } from 'react';
import OriginkitGlobe from '../three/Globe';
import { OrbitalCanvas, CameraPresetMode } from '../three/OrbitalCanvas';
import { SystemState } from '../types';
import { api } from '../services/api';
import {
  Compass, Zap, Eye, Download, ChevronDown, Edit3, Rocket,
  FileText, ShieldAlert, Globe, Play, Pause, SkipForward, RotateCcw,
  LayoutDashboard, Radio, Activity, AlertTriangle, ShieldCheck
} from 'lucide-react';

interface MissionControlProps {
  systemState: SystemState;
  selectedObjectId: string | null;
  onSelectObject: (id: string) => void;
  cameraMode: CameraPresetMode;
  onChangeCameraMode: (mode: CameraPresetMode) => void;
  onOpenManeuverLab: () => void;
  onJumpToCPA: () => void;
  onNavigateToReports?: () => void;
  onSelectScenario?: (sc: string) => void;
  theme: 'light' | 'dark';
}

export const MissionControl: React.FC<MissionControlProps> = ({
  systemState,
  selectedObjectId,
  onSelectObject,
  cameraMode,
  onChangeCameraMode,
  onOpenManeuverLab,
  onJumpToCPA,
  onNavigateToReports,
  onSelectScenario,
}) => {
  const {
    clock,
    sentinel,
    target,
    objects,
    risks,
    safety_status = 'MONITORING',
    screening_distance_km = 25.0,
    maneuver_candidates = [],
    selected_candidate,
    executed_maneuver
  } = systemState;

  // View Mode: Default to EXECUTIVE ("in the beginning of the dashboard use the other pages layout and theme")
  const [dashboardViewMode, setDashboardViewMode] = useState<'EXECUTIVE' | 'TACTICAL'>('EXECUTIVE');
  const [isAutoExecuting, setIsAutoExecuting] = useState<boolean>(false);
  const [viewMode3D, setViewMode3D] = useState<'orbits' | 'globe'>('orbits');
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [isStepping, setIsStepping] = useState<boolean>(false);

  // Bottom tab for tactical view
  const [activeBottomTab, setActiveBottomTab] = useState<'DENSITY' | 'SHELL' | 'TIMELINE'>('TIMELINE');

  const simTime = clock?.sim_time ?? 0;
  const isRunning = clock?.is_running ?? true;
  const scenarioName = clock?.scenario_name || 'Scenario 2: Avoidable Close Approach';

  // Compute live UTC Epoch from base + simTime
  const epochString = useMemo(() => {
    const baseEpochMs = new Date('2024-10-27T14:38:05Z').getTime();
    const currentMs = baseEpochMs + Math.round(simTime * 1000);
    const d = new Date(currentMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }, [simTime]);

  // Compute exact 2-body RK4 orbital ground track from live ECI (position, velocity) accounting for Earth rotation
  const computeRk4GroundTrack = (obj?: any, horizonSec = 5400, steps = 72) => {
    if (!obj || typeof obj.position_x !== 'number') return [];
    const MU = 398600.4418;
    const omegaDegS = 360.0 / 86164.0905;
    let rx = obj.position_x, ry = obj.position_y, rz = obj.position_z;
    let vx = obj.velocity_x, vy = obj.velocity_y, vz = obj.velocity_z;
    const accel = (x: number, y: number, z: number) => {
      const r2 = x * x + y * y + z * z;
      const r = Math.sqrt(r2) || 1;
      const c = -MU / (r2 * r);
      return [c * x, c * y, c * z];
    };
    const pts: Array<{ lat: number; lng: number }> = [];
    const dt = horizonSec / steps;
    for (let i = 0; i <= steps; i++) {
      const t = i * dt;
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      const lat = Math.asin(Math.max(-1, Math.min(1, rz / r))) * (180 / Math.PI);
      let lng = Math.atan2(ry, rx) * (180 / Math.PI) - omegaDegS * (simTime + t);
      lng = ((((lng + 180) % 360) + 360) % 360) - 180;
      pts.push({ lat, lng });

      // Sub-step RK4 (2 substeps of dt/2 for crisp orbital closure)
      const h = dt * 0.5;
      for (let s = 0; s < 2; s++) {
        const [ax1, ay1, az1] = accel(rx, ry, rz);
        const rx2 = rx + 0.5 * h * vx, ry2 = ry + 0.5 * h * vy, rz2 = rz + 0.5 * h * vz;
        const vx2 = vx + 0.5 * h * ax1, vy2 = vy + 0.5 * h * ay1, vz2 = vz + 0.5 * h * az1;
        const [ax2, ay2, az2] = accel(rx2, ry2, rz2);
        const rx3 = rx + 0.5 * h * vx2, ry3 = ry + 0.5 * h * vy2, rz3 = rz + 0.5 * h * vz2;
        const vx3 = vx + 0.5 * h * ax2, vy3 = vy + 0.5 * h * ay2, vz3 = vz + 0.5 * h * az2;
        const [ax3, ay3, az3] = accel(rx3, ry3, rz3);
        const rx4 = rx + h * vx3, ry4 = ry + h * vy3, rz4 = rz + h * vz3;
        const vx4 = vx + h * ax3, vy4 = vy + h * ay3, vz4 = vz + h * az3;
        const [ax4, ay4, az4] = accel(rx4, ry4, rz4);
        rx += (h / 6) * (vx + 2 * vx2 + 2 * vx3 + vx4);
        ry += (h / 6) * (vy + 2 * vy2 + 2 * vy3 + vy4);
        rz += (h / 6) * (vz + 2 * vz2 + 2 * vz3 + vz4);
        vx += (h / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
        vy += (h / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);
        vz += (h / 6) * (az1 + 2 * az2 + 2 * az3 + az4);
      }
    }
    return pts;
  };

  // Convert 3D orbital ECI position to sub-satellite ECEF latitude/longitude accounting for Earth rotation
  const getObjectLatLng = (obj?: any, defaultLat = 28.5, defaultLng = -80.5) => {
    if (!obj || typeof obj.position_x !== 'number') return { lat: defaultLat, lng: defaultLng };
    const x = obj.position_x;
    const y = obj.position_y;
    const z = obj.position_z;
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r === 0) return { lat: defaultLat, lng: defaultLng };
    const lat = Math.asin(Math.max(-1, Math.min(1, z / r))) * (180 / Math.PI);
    const omegaEarthDegS = (360.0 / 86164.0905);
    let lng = Math.atan2(y, x) * (180 / Math.PI) - omegaEarthDegS * simTime;
    lng = ((((lng + 180) % 360) + 360) % 360) - 180;
    return { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) };
  };

  const sat01Coords = getObjectLatLng(sentinel, 0.0, 0.0);
  const targetCoords = getObjectLatLng(target, 45.0, 15.0);
  const satSpeedKms = sentinel
    ? Math.sqrt(sentinel.velocity_x ** 2 + sentinel.velocity_y ** 2 + sentinel.velocity_z ** 2)
    : 7.558;

  // Memoize globe marker & dot configs so telemetry polling never recreates WebGL objects
  const globeDotsConfig = useMemo(
    () => ({ color: "#38bdf8", size: 5, density: 8, allDots: false }),
    []
  );

  const globeTracksConfig = useMemo(() => {
    const tracks: Array<{ id: string; color: string; points: Array<{ lat: number; lng: number }>; dashed?: boolean }> = [];
    if (sentinel) {
      tracks.push({
        id: 'sat-orbit-track',
        color: '#10b981',
        points: computeRk4GroundTrack(sentinel, 5400, 72),
      });
    }
    if (target) {
      tracks.push({
        id: 'threat-orbit-track',
        color: '#f43f5e',
        points: computeRk4GroundTrack(target, 5400, 72),
        dashed: true,
      });
    }
    return tracks;
  }, [
    clock?.scenario_name,
    target?.id,
    executed_maneuver?.id,
    sentinel?.status,
    Math.floor(simTime / 15)
  ]);

  const globeMarkerConfig = useMemo(() => {
    const groundStationMarkers = [
      { lat: 28.5, lng: -80.6, label: 'Cape Canaveral Space Force Station' },
      { lat: 45.9, lng: 63.3, label: 'Baikonur Cosmodrome' },
      { lat: 5.2, lng: -52.8, label: 'Guiana Space Centre, Kourou' },
      { lat: 30.4, lng: 130.9, label: 'Tanegashima Space Center' },
      { lat: 78.2, lng: 15.6, label: 'Svalbard Satellite Station' },
      { lat: -35.4, lng: 148.9, label: 'Canberra Deep Space Station' },
      { lat: 13.7, lng: 80.2, label: 'Satish Dhawan Space Centre' },
      { lat: 49.8, lng: 8.6, label: 'ESOC European Space Operations' },
      { lat: -2.3, lng: -44.4, label: 'Alcantara Launch Center' },
    ];
    const dynamicMarkers = [
      { lat: sat01Coords.lat, lng: sat01Coords.lng, label: 'SAT-01 (Protected Asset)' },
    ];
    if (target) {
      dynamicMarkers.push({ lat: targetCoords.lat, lng: targetCoords.lng, label: target.name });
    }
    return {
      markers: [
        ...dynamicMarkers,
        ...groundStationMarkers,
      ],
      color: "#ef4444",
      size: 45,
    };
  }, [sat01Coords.lat, sat01Coords.lng, targetCoords.lat, targetCoords.lng, target?.id, target?.name]);

  // Match primary conjunction risk between SAT-01 and target debris
  const threatRisk = risks?.find(r =>
    (r.object_a_id === target?.id && (r.object_b_id === sentinel?.id || r.object_b_id === 'SAT-01')) ||
    (r.object_b_id === target?.id && (r.object_a_id === sentinel?.id || r.object_a_id === 'SAT-01'))
  ) || (risks && risks.length > 0 ? risks[0] : null);

  const closingSpeedKms = (threatRisk && threatRisk.relative_speed_kms > 0)
    ? threatRisk.relative_speed_kms
    : (sentinel?.target_rel_velocity_kms ?? 8.12);

  const isExecuted = Boolean(executed_maneuver);
  const isCollided = safety_status === 'COLLISION' || sentinel?.status === 'IMPACT_DESTROYED';

  const predictedCpaKm = isExecuted
    ? (executed_maneuver?.resulting_d_cpa_km ?? 30.57)
    : isCollided
    ? 0.0
    : ((threatRisk && typeof threatRisk.cpa_distance_km === 'number')
        ? threatRisk.cpa_distance_km
        : (target?.metadata?.predicted_cpa_km ?? 0.0128));

  const predictedCpaTimeS = isCollided
    ? 0
    : (threatRisk?.cpa_time_s ?? target?.metadata?.cpa_time_s ?? 0);

  const isThreatActive = !isExecuted && (safety_status === 'WARNING' || safety_status === 'EVALUATING' || safety_status === 'REVIEW REQUIRED' || isCollided);
  const isVerified = safety_status === 'VERIFIED' || isExecuted;

  // Exact RIC (Radial, In-Track, Cross-Track) decomposition from live ECI state vectors
  const ricSep = useMemo(() => {
    if (!sentinel || !target) return { r: 0, t: 0, w: 0 };
    const rx = sentinel.position_x, ry = sentinel.position_y, rz = sentinel.position_z;
    const vx = sentinel.velocity_x, vy = sentinel.velocity_y, vz = sentinel.velocity_z;
    const rMag = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    const rHat = [rx / rMag, ry / rMag, rz / rMag];
    const hx = ry * vz - rz * vy;
    const hy = rz * vx - rx * vz;
    const hz = rx * vy - ry * vx;
    const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    const wHat = [hx / hMag, hy / hMag, hz / hMag];
    const tHat = [
      wHat[1] * rHat[2] - wHat[2] * rHat[1],
      wHat[2] * rHat[0] - wHat[0] * rHat[2],
      wHat[0] * rHat[1] - wHat[1] * rHat[0],
    ];
    const rel = [target.position_x - rx, target.position_y - ry, target.position_z - rz];
    return {
      r: Math.abs(rel[0] * rHat[0] + rel[1] * rHat[1] + rel[2] * rHat[2]),
      t: Math.abs(rel[0] * tHat[0] + rel[1] * tHat[1] + rel[2] * tHat[2]),
      w: Math.abs(rel[0] * wHat[0] + rel[1] * wHat[1] + rel[2] * wHat[2]),
    };
  }, [
    sentinel?.position_x, sentinel?.position_y, sentinel?.position_z,
    sentinel?.velocity_x, sentinel?.velocity_y, sentinel?.velocity_z,
    target?.position_x, target?.position_y, target?.position_z
  ]);

  const deltaR = ricSep.r;
  const deltaT = ricSep.t;
  const deltaW = ricSep.w;
  const violationDepthKm = target ? Math.max(0, screening_distance_km - predictedCpaKm) : 0;
  const violationPct = target ? Math.min(100, Math.round((violationDepthKm / Math.max(1, screening_distance_km)) * 100)) : 0;

  const handleTogglePlayPause = async () => {
    try {
      if (clock?.is_running) await api.pause();
      else await api.play();
    } catch (e) {
      console.error('Clock toggle failed:', e);
    }
  };

  const handleStep = async (sec: number) => {
    setIsStepping(true);
    try {
      await api.stepSimulation(sec);
    } catch (e) {
      console.error('Step failed:', e);
    } finally {
      setIsStepping(false);
    }
  };

  const handleSpeedChange = async (spd: number) => {
    try {
      await api.setSpeed(spd);
    } catch (e) {
      console.error('Speed update failed:', e);
    }
  };

  const handleResetClock = async () => {
    try {
      if (onSelectScenario) {
        onSelectScenario(scenarioName);
      } else {
        await api.reset();
      }
    } catch (e) {
      console.error('Reset failed:', e);
    }
  };

  const handleAutonomousAvoidance = async () => {
    setIsAutoExecuting(true);
    try {
      await api.runAutonomousAvoidance();
    } catch (e) {
      console.error('Autonomous avoidance execution failed:', e);
    } finally {
      setIsAutoExecuting(false);
    }
  };

  // Live Hydrazine Fuel Telemetry
  const fuelRemaining = sentinel?.fuel_kg ?? 148.7;
  const fuelCapacity = 200.0;
  const fuelPct = Math.max(0, Math.min(100, (fuelRemaining / fuelCapacity) * 100));
  const tankLiquidY = 26 + (100 - fuelPct) * 0.88;
  const tankLiquidHeight = Math.max(0, 114 - tankLiquidY);

  // Live distance and CPA countdown
  const currentDistKm = sentinel && target
    ? Math.sqrt(
        (target.position_x - sentinel.position_x) ** 2 +
        (target.position_y - sentinel.position_y) ** 2 +
        (target.position_z - sentinel.position_z) ** 2
      )
    : 12.8;

  const currentDistDisplay = currentDistKm < 1.0
    ? `${(currentDistKm * 1000).toFixed(0)}m`
    : `${currentDistKm.toFixed(2)} km`;

  const tCpaRemainingS = Math.max(0, Math.round(predictedCpaTimeS));
  const tMinusMinutes = Math.floor(tCpaRemainingS / 60);
  const tMinusSeconds = tCpaRemainingS % 60;
  const tMinusStr = `00:${String(tMinusMinutes).padStart(2, '0')}:${String(tMinusSeconds).padStart(2, '0')}`;

  // Live Orbital Catalogue Screening Rows
  const buildTrackedCatalogueRows = () => {
    const satAlt = sentinel?.altitude ?? 600.0;
    const rows = [
      {
        id: sentinel?.id || 'SAT-01',
        norad: '48274',
        name: "SAT-A34 'SENTINEL'",
        desc: `Primary protected LEO payload • ${satAlt.toFixed(1)} km orbit`,
        statusPct: isVerified ? 98 : isCollided ? 0 : 92,
        statusColor: isCollided ? 'bg-rose-600' : isVerified ? 'bg-emerald-500' : 'bg-emerald-500',
        distanceLabel: `${satAlt.toFixed(1)} km`,
        statusLabel: isCollided ? 'COLLISION' : isVerified ? 'VERIFIED' : (sentinel?.status || 'ACTIVE')
      }
    ];

    if (target) {
      rows.push({
        id: target.id,
        norad: '49127',
        name: target.name || 'DEBRIS #8871 (Cosmos-1408)',
        desc: 'Tracked hypervelocity conjunction hazard ephemeris',
        statusPct: isCollided ? 100 : isThreatActive ? Math.max(15, 100 - violationPct) : 96,
        statusColor: isCollided ? 'bg-rose-600' : isThreatActive ? 'bg-rose-500' : 'bg-emerald-500',
        distanceLabel: currentDistDisplay,
        statusLabel: isCollided ? 'IMPACT' : isThreatActive ? 'CRITICAL' : 'CLEARED'
      });
    }

    const extraObjects = (objects || [])
      .filter(o => o.id !== sentinel?.id && o.id !== target?.id)
      .slice(0, 3);

    if (extraObjects.length > 0) {
      extraObjects.forEach((obj, idx) => {
        const distKm = sentinel
          ? Math.sqrt(
              (obj.position_x - sentinel.position_x) ** 2 +
              (obj.position_y - sentinel.position_y) ** 2 +
              (obj.position_z - sentinel.position_z) ** 2
            )
          : (48.2 + idx * 32.1);
        const isMonitored = distKm < 80;
        rows.push({
          id: obj.id,
          norad: obj.id.replace(/\D/g, '').slice(0, 5) || String(41000 + idx * 123),
          name: obj.name || obj.id,
          desc: `${obj.object_type || 'DEBRIS'} • Tracked orbital ephemeris pass`,
          statusPct: isMonitored ? 55 : 82,
          statusColor: isMonitored ? 'bg-amber-500' : 'bg-indigo-500',
          distanceLabel: `${distKm.toFixed(1)} km`,
          statusLabel: isMonitored ? 'MONITORED' : 'SAFE PASS'
        });
      });
    }

    return rows;
  };

  const trackedRows = buildTrackedCatalogueRows();

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. EXECUTIVE THEME & LAYOUT (DEFAULT - MATCHES ALL OTHER APP PAGES)
  // ══════════════════════════════════════════════════════════════════════════════
  if (dashboardViewMode === 'EXECUTIVE') {
    return (
      <div className="w-full h-full overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-7 flex flex-col gap-4 sm:gap-5 bg-[#f4f6fc] text-slate-800 font-sans">
        
        {/* ── TOP ACTION & TITLE BAR ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                MISSION CONTROL • CONJUNCTION ASSESSMENT
              </h1>
              <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                isCollided
                  ? 'bg-rose-100 text-rose-700 animate-pulse'
                  : isVerified
                  ? 'bg-emerald-100 text-emerald-700'
                  : isThreatActive
                  ? 'bg-amber-100 text-amber-700 animate-pulse'
                  : 'bg-indigo-100 text-indigo-700'
              }`}>
                {isCollided ? 'IMPACT COLLISION' : isVerified ? 'VERIFIED SAFE' : safety_status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Autonomous Satellite Safety Analytics & Hypervelocity Debris Avoidance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 relative">
            {/* View Mode Switcher Pill */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                onClick={() => setDashboardViewMode('EXECUTIVE')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-[#4f46e5] text-white shadow-xs"
                title="Executive Dashboard View (Matches Other Pages)"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Executive View</span>
              </button>
              <button
                onClick={() => setDashboardViewMode('TACTICAL')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900"
                title="Dark Aerospace Military HUD (ODTS)"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Tactical ODTS</span>
              </button>
            </div>

            {/* Mission Data Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>MISSION DATA</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showExportMenu && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs">
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      if (onNavigateToReports) onNavigateToReports();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>View Mission Report</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      window.print();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Print Telemetry Summary</span>
                  </button>
                </div>
              )}
            </div>

            {/* Reset Simulation Scenario */}
            <button
              onClick={handleResetClock}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              title="Re-run Simulation Scenario"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>RESET</span>
            </button>

            {/* Execute Avoidance Maneuver Burn */}
            <button
              onClick={handleAutonomousAvoidance}
              disabled={isAutoExecuting || isVerified}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold shadow-md transition-all active:scale-98 cursor-pointer ${
                isVerified
                  ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                  : isCollided
                  ? 'bg-rose-600 text-white shadow-rose-500/20'
                  : 'bg-[#4f46e5] hover:bg-[#4338ca] text-white shadow-indigo-500/20'
              }`}
            >
              <Rocket className="w-4 h-4 text-white" />
              <span>
                {isAutoExecuting
                  ? 'FIRING RCS THRUSTERS...'
                  : isVerified
                  ? 'AVOIDANCE VERIFIED SAFE ✓'
                  : isCollided
                  ? 'COLLISION OCCURRED'
                  : 'EXECUTE AVOIDANCE'}
              </span>
            </button>
          </div>
        </div>

        {/* ── MASTER 2-COLUMN COMMAND BRIDGE: TELEMETRY (LEFT 7 COLS) | 3D VIEWPORT (RIGHT 5 COLS) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch flex-1 min-h-0">
          
          {/* ── LEFT COLUMN (7 COLS): EXECUTIVE TELEMETRY & CARDS ── */}
          <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-5">
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 items-stretch">
              
              {/* ── CARD 1: CONJUNCTION THREAT LEVEL ── */}
              <div className="md:col-span-6 bg-white rounded-[24px] p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                        CONJUNCTION THREAT LEVEL
                      </span>
                      <div className="flex flex-wrap items-baseline gap-2 mt-1">
                        <span className={`text-xl sm:text-2xl font-black tracking-tight font-mono ${
                          isCollided ? 'text-rose-600' : isThreatActive ? 'text-rose-600' : isVerified ? 'text-emerald-600' : 'text-slate-900'
                        }`}>
                          {isCollided ? '0.00 m (IMPACT)' : predictedCpaKm < 25 ? `${predictedCpaKm.toFixed(2)} km` : 'SAFE (>25km)'}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                          isCollided
                            ? 'bg-rose-100 text-rose-700 animate-pulse'
                            : isThreatActive
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {isCollided ? 'COLLISION' : safety_status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        Range: {currentDistDisplay} • T-Minus: {tMinusStr}
                      </div>
                    </div>

                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 ${
                      isCollided || isThreatActive ? 'bg-rose-500 shadow-rose-500/20' : 'bg-[#6366f1] shadow-indigo-500/20'
                    }`}>
                      <ShieldAlert className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="w-20 sm:w-24 text-slate-500 truncate" title="Radial Separation ΔR">Radial ΔR</span>
                    <span className="w-14 sm:w-16 font-mono font-bold text-slate-800">{deltaR.toFixed(2)} km</span>
                    <div className="flex-1 mx-1.5 sm:mx-2.5 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-[#3b82f6] rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.round((deltaR / 10) * 100))}%` }} />
                    </div>
                    <span className="w-8 sm:w-9 text-right text-slate-400 font-mono text-[11px]">{Math.min(100, Math.round((deltaR / 10) * 100))}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="w-20 sm:w-24 text-slate-500 truncate" title="In-Track Separation ΔT">In-Track ΔT</span>
                    <span className="w-14 sm:w-16 font-mono font-bold text-slate-800">{deltaT.toFixed(2)} km</span>
                    <div className="flex-1 mx-1.5 sm:mx-2.5 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-[#6366f1] rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.round((deltaT / 25) * 100))}%` }} />
                    </div>
                    <span className="w-8 sm:w-9 text-right text-slate-400 font-mono text-[11px]">{Math.min(100, Math.round((deltaT / 25) * 100))}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="w-20 sm:w-24 text-slate-500 truncate" title="Cross-Track Separation ΔW">Cross-Track ΔW</span>
                    <span className="w-14 sm:w-16 font-mono font-bold text-slate-800">{deltaW.toFixed(2)} km</span>
                    <div className="flex-1 mx-1.5 sm:mx-2.5 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-[#f59e0b] rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.round((deltaW / 25) * 100))}%` }} />
                    </div>
                    <span className="w-8 sm:w-9 text-right text-slate-400 font-mono text-[11px]">{Math.min(100, Math.round((deltaW / 25) * 100))}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="w-20 sm:w-24 text-slate-500 truncate" title="Screening Penetration">Violation Depth</span>
                    <span className="w-14 sm:w-16 font-mono font-bold text-rose-600">{violationDepthKm.toFixed(1)} km</span>
                    <div className="flex-1 mx-1.5 sm:mx-2.5 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-[#f43f5e] rounded-full transition-all duration-300" style={{ width: `${violationPct}%` }} />
                    </div>
                    <span className="w-8 sm:w-9 text-right text-rose-500 font-mono text-[11px] font-bold">{violationPct}%</span>
                  </div>
                </div>
              </div>

              {/* ── CARD 2: AVOIDANCE BURN PROFILE (ΔV) — LIVE RK4 CANDIDATES ── */}
              <div className="md:col-span-6 bg-white rounded-[24px] p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-col justify-between">
                <div className="w-full flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2.5">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    AVOIDANCE BURN PROFILE (ΔV)
                  </h2>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    isVerified
                      ? 'text-emerald-700 bg-emerald-50'
                      : isCollided
                      ? 'text-rose-700 bg-rose-50'
                      : 'text-amber-700 bg-amber-50'
                  }`}>
                    {isVerified ? 'VERIFIED SAFE' : isCollided ? 'IMPACT DESTROYED' : safety_status}
                  </span>
                </div>

                {maneuver_candidates.length > 0 ? (() => {
                  const topFour = [
                    ...maneuver_candidates.filter(c => c.passed).slice(0, 2),
                    ...maneuver_candidates.filter(c => !c.passed).slice(0, 2),
                  ];
                  while (topFour.length < Math.min(4, maneuver_candidates.length)) {
                    const nextC = maneuver_candidates.find(c => !topFour.includes(c));
                    if (!nextC) break;
                    topFour.push(nextC);
                  }
                  const radii = [74, 58, 42, 26];
                  const ringColors = ['#4f46e5', '#0ea5e9', '#f59e0b', '#f43f5e'];
                  const maxScale = Math.max(screening_distance_km * 1.6, ...topFour.map(c => c.resulting_d_cpa_km), 35);
                  const activeBurn = executed_maneuver || selected_candidate || topFour[0];

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 my-auto py-2">
                        <svg className="w-32 h-32 sm:w-36 sm:h-36 shrink-0" viewBox="0 0 180 180">
                          {topFour.map((cand, idx) => {
                            const r = radii[idx];
                            const circ = 2 * Math.PI * r;
                            const frac = Math.max(0.08, Math.min(0.95, cand.resulting_d_cpa_km / maxScale));
                            const dashLen = circ * frac;
                            const color = cand.passed ? ringColors[idx % 2] : (idx >= 2 ? ringColors[idx] : '#f43f5e');
                            return (
                              <g key={cand.id}>
                                <circle cx="90" cy="90" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
                                <circle
                                  cx="90"
                                  cy="90"
                                  r={r}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="8"
                                  strokeLinecap="round"
                                  strokeDasharray={`${dashLen} ${circ}`}
                                  transform="rotate(-90 90 90)"
                                />
                              </g>
                            );
                          })}
                          <text x="90" y="88" textAnchor="middle" fill="#0f172a" fontSize="13" fontWeight="bold" fontFamily="monospace">
                            {activeBurn ? `${activeBurn.resulting_d_cpa_km.toFixed(1)}` : '—'}
                          </text>
                          <text x="90" y="102" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
                            km d_CPA
                          </text>
                        </svg>

                        <div className="w-full sm:flex-1 flex flex-col gap-1.5 text-[10px] font-mono">
                          {topFour.map((cand) => (
                            <div key={cand.id} className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-lg border border-slate-100">
                              <span className="font-bold truncate text-slate-700" title={cand.name}>
                                {cand.direction.slice(0, 5)} {cand.delta_v_ms}m/s
                              </span>
                              <span className={`font-bold ${cand.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {cand.resulting_d_cpa_km.toFixed(1)}km {cand.passed ? '✓' : '✗'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="w-full flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-500">
                        <span>
                          BURN: {activeBurn ? `${activeBurn.delta_v_ms.toFixed(1)} m/s ${activeBurn.direction}` : 'STANDBY'}
                        </span>
                        <span className={`font-bold ${activeBurn?.passed ? 'text-indigo-600' : 'text-rose-600'}`}>
                          CLEARANCE: {activeBurn ? `${activeBurn.resulting_d_cpa_km.toFixed(1)} km` : 'NOMINAL'}
                        </span>
                      </div>
                    </>
                  );
                })() : (
                  <>
                    <div className="flex flex-col items-center justify-center text-center py-6 my-auto gap-1.5">
                      <span className="text-xs font-mono font-bold text-emerald-600">NO BURN REQUIRED</span>
                      <span className="text-[11px] text-slate-500">All tracked objects clear the {screening_distance_km.toFixed(1)} km threshold.</span>
                    </div>
                    <div className="w-full flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-500">
                      <span>BURN: 0.0 m/s IDLE</span>
                      <span className="font-bold text-emerald-600">CLEARANCE: SAFE</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── CARD 3: ORBITAL CONJUNCTION CATALOGUE & REAL-TIME SCREENING ── */}
            <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-col justify-between gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                  ORBITAL CONJUNCTION CATALOGUE & REAL-TIME SCREENING
                </h2>
                <span className="text-[10px] font-mono text-slate-500">
                  {objects?.length || 1911} TRACKED OBJECTS
                </span>
              </div>

              <div className="hidden md:grid grid-cols-12 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 font-mono">
                <div className="col-span-2">NORAD ID</div>
                <div className="col-span-4">OBJECT & CLASSIFICATION</div>
                <div className="col-span-3">SAFETY STATUS</div>
                <div className="col-span-1 text-right">RANGE</div>
                <div className="col-span-2 text-right">ACTIONS</div>
              </div>

              <div className="flex flex-col gap-2">
                {trackedRows.map((row) => (
                  <React.Fragment key={row.id}>
                    {/* Desktop Row */}
                    <div className="hidden md:grid grid-cols-12 items-center bg-[#f8fafc] hover:bg-indigo-50/40 rounded-xl px-3 py-2 transition-colors text-xs border border-slate-100/80">
                      <div className="col-span-2 font-mono font-bold text-slate-700">
                        {row.norad}
                      </div>
                      <div className="col-span-4 font-medium text-slate-800 truncate pr-2" title={row.desc}>
                        {row.name}
                      </div>
                      <div className="col-span-3 flex items-center gap-2 pr-2">
                        <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${row.statusColor}`}
                            style={{ width: `${row.statusPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 font-semibold">{row.statusLabel}</span>
                      </div>
                      <div className="col-span-1 text-right font-mono font-bold text-slate-700 text-[11px] whitespace-nowrap">
                        {row.distanceLabel}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            onSelectObject(row.id);
                            onJumpToCPA();
                          }}
                          title="Track object & align camera"
                          className="w-6.5 h-6.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={onOpenManeuverLab}
                          title="Open Maneuver Planning Lab"
                          className="w-6.5 h-6.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleAutonomousAvoidance}
                          title="Execute Autonomous Avoidance Action"
                          className="w-6.5 h-6.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Zap className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile Card Row */}
                    <div className="flex md:hidden flex-col gap-2 bg-[#f8fafc] rounded-xl px-3 py-2.5 text-xs border border-slate-100/80">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                            {row.norad}
                          </span>
                          <span className="font-semibold text-slate-800 truncate">{row.name}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-700 text-[11px] shrink-0">
                          {row.distanceLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${row.statusColor}`}
                              style={{ width: `${row.statusPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 font-semibold shrink-0">{row.statusLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              onSelectObject(row.id);
                              onJumpToCPA();
                            }}
                            title="Track object & align camera"
                            className="w-8 h-8 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={onOpenManeuverLab}
                            title="Open Maneuver Planning Lab"
                            className="w-8 h-8 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleAutonomousAvoidance}
                            title="Execute Autonomous Avoidance Action"
                            className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── CARD 4: SPACECRAFT HYDRAZINE PROPELLANT PRESSURE VESSEL ── */}
            <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-5">
              {/* Spacecraft Titanium Propellant Tank Illustration */}
              <div className="relative w-36 h-28 sm:w-44 sm:h-36 flex items-center justify-center shrink-0">
                <svg className="w-full h-full" viewBox="0 0 200 160">
                  {/* Top Helium Pressurization Valve Assembly */}
                  <rect x="86" y="10" width="28" height="14" rx="3" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" />
                  <line x1="100" y1="4" x2="100" y2="10" stroke="#64748b" strokeWidth="2.5" />
                  <circle cx="100" cy="4" r="3" fill="#4f46e5" />

                  {/* Titanium Pressure Vessel Outer Shell */}
                  <rect x="52" y="24" width="96" height="106" rx="44" fill="#f8fafc" stroke="#64748b" strokeWidth="2.5" />

                  {/* Internal Hydrazine Propellant Fluid Level */}
                  <clipPath id="tankClip">
                    <rect x="55" y="27" width="90" height="100" rx="41" />
                  </clipPath>
                  <rect
                    x="54"
                    y={tankLiquidY}
                    width="92"
                    height={tankLiquidHeight + 16}
                    fill={fuelPct < 15 ? '#ef4444' : '#3b82f6'}
                    opacity="0.88"
                    clipPath="url(#tankClip)"
                  />
                  <line x1="56" y1={tankLiquidY} x2="144" y2={tankLiquidY} stroke="#93c5fd" strokeWidth="2" />

                  {/* Measurement Graduation Ticks */}
                  <line x1="65" y1="50" x2="135" y2="50" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="65" y1="77" x2="135" y2="77" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="65" y1="104" x2="135" y2="104" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />

                  {/* Bottom RCS Thruster Feed Line & Nozzle Assembly */}
                  <path d="M 100 130 L 100 140 L 88 152 L 112 152 L 100 140" fill="#cbd5e1" stroke="#64748b" strokeWidth="2" strokeLinejoin="round" />

                  {/* Readout Badge */}
                  <g transform="translate(100, 77)">
                    <rect x="-24" y="-11" width="48" height="16" rx="4" fill="#0f172a" />
                    <text x="0" y="0" textAnchor="middle" fill="#38bdf8" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      {fuelPct.toFixed(1)}%
                    </text>
                  </g>
                </svg>
              </div>

              <div className="flex-1 flex flex-col justify-between gap-2.5 w-full">
                <div className="border-b border-slate-100 pb-2 flex flex-wrap items-center justify-between gap-1.5">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    DELTA-V PROPELLANT RESERVE
                  </h3>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    fuelRemaining < 10 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'
                  }`}>
                    {fuelRemaining < 1 ? 'RESERVOIR CRITICAL' : `${Math.max(1, Math.floor(fuelRemaining / 35))} BURNS REMAINING`}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-mono">PROPELLANT REMAINING</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{fuelRemaining.toFixed(1)} / {fuelCapacity} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-mono">SPECIFIC IMPULSE</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">Isp = 310 s (Hydrazine)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-mono">
                      {executed_maneuver ? `CONSUMED (${executed_maneuver.id})` : selected_candidate ? `EST. (${selected_candidate.id})` : 'BURN CONSUMPTION'}
                    </span>
                    <span className="font-mono font-bold text-indigo-600 text-sm">
                      {(() => {
                        const burnFuel = (executed_maneuver || selected_candidate)?.propellant_kg ?? 0;
                        const burnPct = (burnFuel / fuelCapacity) * 100;
                        return `${burnFuel.toFixed(2)} kg (${burnPct.toFixed(2)}%)`;
                      })()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-mono">RCS SUBSYSTEM</span>
                    <span className={`font-mono font-bold text-sm ${fuelRemaining < 1 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fuelRemaining < 1 ? 'PROPELLANT DEPLETED' : 'ALL 4 PODS NOMINAL'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (5 COLS): INTERACTIVE 3D ORBITAL SIMULATION VIEWPORT ── */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-white rounded-[24px] sm:rounded-[28px] p-3.5 sm:p-5 shadow-xs border border-slate-100 flex flex-col justify-between h-full lg:min-h-[760px] relative">
              
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-indigo-600" />
                    3D ORBITAL ENVIRONMENT
                  </h2>
                  <span className="text-[10px] text-slate-400 font-mono">
                    REAL-TIME LEO SIMULATION • 60 FPS ORBITAL PROPAGATION
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Live Sim Clock Quick Controls */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={handleTogglePlayPause}
                      className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        clock?.is_running ? 'bg-amber-500 text-white shadow-2xs' : 'bg-indigo-600 text-white shadow-2xs'
                      }`}
                      title={clock?.is_running ? 'Pause Live Simulation' : 'Play Live Simulation'}
                    >
                      {clock?.is_running ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{clock?.is_running ? 'Pause' : 'Play'}</span>
                    </button>
                    <button
                      onClick={() => handleStep(60)}
                      disabled={isStepping}
                      className="px-1.5 py-1 rounded text-[10px] font-mono font-bold text-slate-600 hover:bg-white hover:text-indigo-600 transition-all flex items-center gap-0.5 cursor-pointer"
                      title="Step Forward +60s RK4"
                    >
                      <SkipForward className="w-3 h-3" />+1m
                    </button>
                    <button
                      onClick={handleResetClock}
                      className="p-1 rounded text-slate-500 hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
                      title="Reset Simulation Scenario"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    {[1, 25, 100].map(spd => (
                      <button
                        key={spd}
                        onClick={() => handleSpeedChange(spd)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                          clock?.time_scale === spd ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setViewMode3D('orbits')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        viewMode3D === 'orbits' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="View 3D Orbital Trajectory Simulator"
                    >
                      <Compass className="w-3 h-3" />
                      <span>3D Orbits</span>
                    </button>
                    <button
                      onClick={() => setViewMode3D('globe')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        viewMode3D === 'globe' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="View Interactive 2D Ground Track Globe"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Globe</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Viewport Box */}
              <div className="w-full my-3 h-[380px] sm:h-[500px] lg:h-[610px] rounded-2xl overflow-hidden bg-[#02050f] border border-slate-800/80 relative flex items-center justify-center shadow-inner">
                {viewMode3D === 'orbits' ? (
                  <div className="w-full h-full relative">
                    <OrbitalCanvas
                      objects={objects}
                      sentinel={sentinel}
                      target={target}
                      risks={risks}
                      selectedObjectId={selectedObjectId}
                      onSelectObject={onSelectObject}
                      cameraMode={cameraMode}
                      onChangeCameraMode={onChangeCameraMode}
                      onResetCamera={() => onChangeCameraMode('FREE')}
                      predictedWaypoints={systemState.selected_candidate?.trajectory_waypoints}
                      interceptWaypoints={systemState.executed_maneuver?.trajectory_waypoints}
                      simTime={simTime}
                      isRunning={clock?.is_running}
                      timeScale={clock?.time_scale}
                      theme="dark"
                      hideControls={true}
                    />

                    {/* Top Overlay Controls: Camera Modes & Workflow Tag */}
                    <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-auto z-10 flex flex-col gap-1.5 max-w-[calc(100%-1.25rem)] pointer-events-auto">
                      <div className="flex flex-wrap items-center gap-1 bg-slate-900/90 backdrop-blur-md px-2 sm:px-2.5 py-1 rounded-xl shadow-xs border border-slate-700 w-fit max-w-full">
                        <button
                          onClick={() => onChangeCameraMode('GLOBAL')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                            cameraMode === 'GLOBAL' ? 'bg-[#4f46e5] text-white shadow-xs' : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          🌍 Earth
                        </button>
                        <button
                          onClick={() => onChangeCameraMode('FOLLOW_SENTINEL')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                            cameraMode === 'FOLLOW_SENTINEL' ? 'bg-[#4f46e5] text-white shadow-xs' : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          🛰️ SAT-01
                        </button>
                        <button
                          onClick={() => onChangeCameraMode('PROXIMITY')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                            cameraMode === 'PROXIMITY' ? 'bg-[#4f46e5] text-white shadow-xs' : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          🎯 CPA Proximity
                        </button>
                      </div>

                      {/* Live Status Pill */}
                      <div className="bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/80 text-[9px] font-mono text-sky-300 flex items-center gap-1.5 w-fit max-w-full shadow-sm">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isCollided
                            ? 'bg-rose-500 animate-ping'
                            : isVerified
                            ? 'bg-emerald-400'
                            : sentinel?.status === 'MANEUVER'
                            ? 'bg-blue-400 animate-ping'
                            : 'bg-emerald-400 animate-pulse'
                        }`} />
                        <span className="truncate">
                          {isCollided
                            ? 'STATUS: HYPERVELOCITY COLLISION DETECTED'
                            : isVerified
                            ? 'STATUS: ORBITAL DEFLECTION COMPLETE (SAFE)'
                            : `WORKFLOW: ${(sentinel?.mission_phase || sentinel?.status || 'ORBITAL_PATROL').replace(/_/g, ' ')}`}
                        </span>
                      </div>

                      {/* Live Encounter Range & T-Minus Overlay */}
                      {target && (
                        <div className={`backdrop-blur-md px-2.5 py-1 rounded-lg border text-[9px] font-mono flex items-center gap-2 w-fit max-w-full shadow-sm ${
                          isCollided
                            ? 'bg-rose-950/90 border-rose-500 text-rose-200'
                            : isThreatActive
                            ? 'bg-rose-950/80 border-rose-500/80 text-rose-200'
                            : 'bg-slate-900/80 border-slate-700 text-emerald-300'
                        }`}>
                          <span className="font-bold">RANGE: {currentDistDisplay}</span>
                          <span>•</span>
                          <span>V_REL: {closingSpeedKms.toFixed(2)} km/s</span>
                          <span>•</span>
                          <span className="font-bold text-amber-300">T-MINUS: {tMinusStr}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Right: Inspect CPA Zoom */}
                    <div className="absolute bottom-2.5 sm:bottom-3 right-2.5 sm:right-3 z-10 flex items-center gap-1.5">
                      <button
                        onClick={onJumpToCPA}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-white" />
                        <span>Inspect CPA</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <OriginkitGlobe
                      speed={clock?.is_running ? 0.55 : 0.2}
                      smoothing={8}
                      dots={globeDotsConfig}
                      fill="dots"
                      scale={8}
                      stopOnHover={true}
                      oceanColor="#070d1e"
                      outlineColor="#38bdf8"
                      showOutline={true}
                      graticuleColor="#1e293b"
                      showGrid={true}
                      showCountries={true}
                      showPlaces={true}
                      markerConfig={globeMarkerConfig}
                      groundTracks={globeTracksConfig}
                      style={{ width: '100%', height: '100%' }}
                    />

                    <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-auto z-10 flex flex-col gap-1.5 pointer-events-none max-w-[calc(100%-1.25rem)]">
                      <div className="bg-slate-900/90 backdrop-blur-md px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-700/80 shadow-md flex items-center gap-2 text-white w-fit max-w-full">
                        <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <div className="min-w-0">
                          <div className="font-mono text-[9px] sm:text-[10px] font-bold text-emerald-400 truncate">SAT-01 (PROTECTED ASSET)</div>
                          <div className="font-mono text-[9px] sm:text-[10px] text-slate-300 truncate">
                            {sat01Coords.lat}°N, {sat01Coords.lng}°E • {(sentinel?.altitude ?? 600).toFixed(1)} km • {satSpeedKms.toFixed(2)} km/s
                          </div>
                        </div>
                      </div>

                      {target && (
                        <div className="bg-slate-900/90 backdrop-blur-md px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-700/80 shadow-md flex items-center gap-2 text-white w-fit max-w-full">
                          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-rose-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-mono text-[9px] sm:text-[10px] font-bold text-rose-400 truncate">
                              {target.name} (THREAT)
                            </div>
                            <div className="font-mono text-[9px] sm:text-[10px] text-slate-300 truncate">
                              {targetCoords.lat}°N, {targetCoords.lng}°E • v_rel {closingSpeedKms.toFixed(2)} km/s • CPA {Math.max(0, predictedCpaTimeS).toFixed(0)}s
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="absolute bottom-2.5 sm:bottom-3 right-2.5 sm:right-3 z-10 flex items-center gap-2">
                      <span className="hidden sm:inline-block bg-slate-900/90 backdrop-blur-md text-[9px] font-mono text-slate-400 px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-sm">
                        Drag to rotate • Hover to inspect countries
                      </span>
                      <button
                        onClick={() => {
                          setViewMode3D('orbits');
                          onJumpToCPA();
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-white" />
                        <span>Inspect CPA</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Ephemeris Bar */}
              <div className="w-full flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>EPHEMERIS: TWO-BODY RK4 SOLVER (μ = 398,600.44 km³/s²)</span>
                </span>
                <span>SCREENING BOUNDARY: {screening_distance_km.toFixed(1)} km</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. TACTICAL ODTS HUD (AEROSPACE MILITARY HUD WHEN TOGGLED)
  // ══════════════════════════════════════════════════════════════════════════════
  const totalTracked = objects?.length || 48210;
  const debrisTracked = 31495;
  const satTracked = 16715;

  return (
    <div className="w-full h-full bg-[#02050f] text-cyan-100 font-mono flex flex-col overflow-hidden select-none relative">
      
      {/* ── TOP HUD HEADER BAR ── */}
      <header className="h-11 sm:h-12 border-b border-cyan-500/20 px-3 sm:px-5 flex items-center justify-between bg-[#040915]/95 backdrop-blur-md shrink-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-6 h-6 rounded border border-cyan-400/40 bg-cyan-950/60 flex items-center justify-center text-cyan-400 shrink-0">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span className="text-xs sm:text-sm font-bold tracking-widest text-cyan-300 truncate">
            ORBITAL DEBRIS TRACKING SYSTEM (ODTS)
          </span>
          <span className="text-cyan-500/60 hidden sm:inline">|</span>
          <span className="text-[11px] text-cyan-400/80 font-bold hidden sm:inline tracking-wider">
            ACTIVE MONITORING
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0 text-[10px] sm:text-xs">
          {/* Switch back to Executive View */}
          <button
            onClick={() => setDashboardViewMode('EXECUTIVE')}
            className="flex items-center gap-1.5 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
            title="Return to Executive Dashboard View"
          >
            <LayoutDashboard className="w-3 h-3" />
            <span>Executive View</span>
          </button>

          <div className="hidden lg:flex items-center gap-2 text-cyan-400/80">
            <span className="text-cyan-600">EPOCH:</span>
            <span className="font-semibold text-cyan-200">{epochString}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-cyan-600 hidden sm:inline">SYSTEM STATUS:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
              isCollided
                ? 'bg-rose-950 border border-rose-500 text-rose-300 animate-pulse'
                : isVerified
                ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                : isThreatActive
                ? 'bg-amber-950 border border-amber-500 text-amber-300'
                : 'bg-cyan-950 border border-cyan-500 text-cyan-300'
            }`}>
              {isCollided ? 'COLLISION' : isVerified ? 'VERIFIED' : safety_status}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN BODY: 3D VIEWPORT WITH HUD OVERLAYS ── */}
      <div className="flex-1 min-h-0 relative w-full h-full overflow-hidden">
        {/* Full-bleed 3D Three.js Orbital Canvas */}
        <div className="absolute inset-0 z-0">
          <OrbitalCanvas
            objects={objects}
            sentinel={sentinel}
            target={target}
            risks={risks}
            selectedObjectId={selectedObjectId}
            onSelectObject={onSelectObject}
            cameraMode={cameraMode}
            onChangeCameraMode={onChangeCameraMode}
            onResetCamera={() => onChangeCameraMode('FREE')}
            predictedWaypoints={systemState.selected_candidate?.trajectory_waypoints}
            interceptWaypoints={systemState.executed_maneuver?.trajectory_waypoints}
            simTime={simTime}
            isRunning={isRunning}
            timeScale={clock?.time_scale}
            theme="dark"
            hideControls={true}
          />
        </div>

        {/* TOP LEFT HUD: LIVE TRACKING & THREAT COUNTERS */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2.5 max-w-[210px] sm:max-w-[240px] pointer-events-auto">
          {/* Live Tracking Card */}
          <div className="bg-[#050c18]/85 backdrop-blur-md border border-cyan-500/25 rounded-lg p-2.5 text-[11px] shadow-lg">
            <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-cyan-500/20 pb-1.5 mb-1.5 text-[10px] tracking-wider">
              <span>LIVE TRACKING</span>
              <Activity className="w-3 h-3 text-cyan-400" />
            </div>
            <div className="flex flex-col gap-1 text-[10px]">
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Total</span>
                </span>
                <span className="font-bold text-cyan-200">{totalTracked.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Debris</span>
                </span>
                <span className="font-bold text-amber-200">{debrisTracked.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Satellites</span>
                </span>
                <span className="font-bold text-emerald-200">{satTracked.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Threat Alerts Summary Card */}
          <div className="bg-[#050c18]/85 backdrop-blur-md border border-cyan-500/25 rounded-lg p-2.5 text-[11px] shadow-lg">
            <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-cyan-500/20 pb-1.5 mb-1.5 text-[10px] tracking-wider">
              <span>THREAT ALERTS</span>
              <ShieldAlert className="w-3 h-3 text-rose-400" />
            </div>
            <div className="flex flex-col gap-1 text-[10px]">
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Critical (CPA &lt; 25km)</span>
                </span>
                <span className="font-bold text-rose-300">{isThreatActive ? '1' : '0'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Monitored (&lt; 80km)</span>
                </span>
                <span className="font-bold text-amber-200">3</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Cleared</span>
                </span>
                <span className="font-bold text-emerald-200">16,712</span>
              </div>
            </div>
          </div>
        </div>

        {/* TOP RIGHT HUD: COLLISION WARNING CARD */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 max-w-[240px] sm:max-w-[280px] pointer-events-auto">
          <div className={`backdrop-blur-md border rounded-lg p-3 text-[11px] shadow-xl ${
            isCollided
              ? 'bg-rose-950/90 border-rose-500 text-rose-100'
              : isVerified
              ? 'bg-emerald-950/85 border-emerald-500/40 text-emerald-100'
              : 'bg-[#150a12]/90 border-rose-500/50 text-rose-200'
          }`}>
            <div className="flex items-center justify-between border-b border-rose-500/30 pb-1.5 mb-2">
              <span className="font-black text-rose-400 tracking-wider flex items-center gap-1 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>WARNING</span>
              </span>
              <span className="text-[9px] text-rose-400/80 font-mono">
                EVENT ID: 49127
              </span>
            </div>

            <div className="flex flex-col gap-1.5 text-[10px]">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">COLLISION PROBABILITY:</span>
                <span className={`font-black ${isCollided ? 'text-rose-400' : isVerified ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isCollided ? '100%' : isVerified ? '0.001%' : 'HIGH 98.2%'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">T-MINUS CPA:</span>
                <span className="font-bold text-amber-300 font-mono">{tMinusStr}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">MIN DISTANCE (d_CPA):</span>
                <span className="font-bold text-cyan-300 font-mono">
                  {isCollided ? '0.0 m (COLLISION)' : isVerified ? `${predictedCpaKm.toFixed(1)} km (SAFE)` : `${(predictedCpaKm * 1000).toFixed(0)}m`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">CURRENT RANGE:</span>
                <span className="font-bold text-rose-300 font-mono">{currentDistDisplay}</span>
              </div>
            </div>

            {/* Execute Avoidance Button in Tactical HUD */}
            <div className="mt-3 pt-2 border-t border-rose-500/20 flex flex-col gap-1.5">
              <button
                onClick={handleAutonomousAvoidance}
                disabled={isAutoExecuting || isVerified}
                className={`w-full py-1.5 rounded text-[10px] font-black tracking-wider shadow-md transition-all cursor-pointer ${
                  isVerified
                    ? 'bg-emerald-600 text-white'
                    : isCollided
                    ? 'bg-rose-700 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                }`}
              >
                {isAutoExecuting
                  ? 'FIRING THRUSTERS...'
                  : isVerified
                  ? 'AVOIDANCE VERIFIED SAFE ✓'
                  : isCollided
                  ? 'COLLISION OCCURRED'
                  : 'EXECUTE AVOIDANCE MANEUVER'}
              </button>

              <button
                onClick={handleResetClock}
                className="w-full py-1 rounded text-[9px] font-semibold bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
              >
                RESET SIMULATION SCENARIO
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM HUD DOCK */}
        <div className="absolute bottom-2 left-2 right-2 z-10 pointer-events-auto">
          <div className="bg-[#040915]/90 backdrop-blur-md border border-cyan-500/30 rounded-xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold text-[10px] tracking-wider">TACTICAL CONTROLS:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleTogglePlayPause}
                  className="bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 px-2 py-1 rounded text-[10px] font-bold border border-cyan-500/30 cursor-pointer"
                >
                  {isRunning ? 'PAUSE' : 'RESUME'}
                </button>
                <button
                  onClick={() => onChangeCameraMode('FOLLOW_SENTINEL')}
                  className="bg-cyan-950 hover:bg-cyan-900 text-cyan-300 px-2 py-1 rounded text-[10px] font-bold border border-cyan-500/20 cursor-pointer"
                >
                  LOCK SAT-01
                </button>
                <button
                  onClick={() => onChangeCameraMode('PROXIMITY')}
                  className="bg-cyan-950 hover:bg-cyan-900 text-cyan-300 px-2 py-1 rounded text-[10px] font-bold border border-cyan-500/20 cursor-pointer"
                >
                  LOCK CPA
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[10px] text-cyan-400/80 font-mono">
              <span>PROPAGATION: TWO-BODY RK4</span>
              <span>•</span>
              <span>SCREENING: 25.0 km</span>
              <span>•</span>
              <span className="text-cyan-200 font-bold">T+{simTime.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionControl;
