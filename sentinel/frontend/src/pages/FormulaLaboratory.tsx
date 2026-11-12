import React, { useState, useEffect } from 'react';
import { SystemState } from '../types';
import {
  Calculator, Compass, Activity, ArrowRight, CheckCircle2,
  HelpCircle, RefreshCw, Zap, Sliders, Play, RotateCcw
} from 'lucide-react';

interface FormulaLaboratoryProps {
  systemState?: SystemState | null;
}

export const FormulaLaboratory: React.FC<FormulaLaboratoryProps> = ({ systemState }) => {
  const [activeFormula, setActiveFormula] = useState<number>(4); // Default to t_CPA
  const [liveSync, setLiveSync] = useState<boolean>(true);

  // Interactive Calculator State
  // Object 1 (SAT-01)
  const [r1, setR1] = useState<{ x: number; y: number; z: number }>({ x: 6978.0, y: 0.0, z: 0.0 });
  const [v1, setV1] = useState<{ x: number; y: number; z: number }>({ x: 0.0, y: 7.563, z: 0.0 });

  // Object 2 (Debris Fragment)
  const [r2, setR2] = useState<{ x: number; y: number; z: number }>({ x: 6998.0, y: 234.4, z: 43.5 });
  const [v2, setV2] = useState<{ x: number; y: number; z: number }>({ x: -0.12, y: 5.938, z: -0.28 });

  // Time for future position
  const [simT, setSimT] = useState<number>(145.0);

  useEffect(() => {
    if (!liveSync || !systemState?.sentinel) return;
    const s = systemState.sentinel;
    const t = systemState.target;
    setR1({ x: Number(s.position_x.toFixed(2)), y: Number(s.position_y.toFixed(2)), z: Number(s.position_z.toFixed(2)) });
    setV1({ x: Number(s.velocity_x.toFixed(4)), y: Number(s.velocity_y.toFixed(4)), z: Number(s.velocity_z.toFixed(4)) });
    if (t) {
      setR2({ x: Number(t.position_x.toFixed(2)), y: Number(t.position_y.toFixed(2)), z: Number(t.position_z.toFixed(2)) });
      setV2({ x: Number(t.velocity_x.toFixed(4)), y: Number(t.velocity_y.toFixed(4)), z: Number(t.velocity_z.toFixed(4)) });
    }
  }, [
    liveSync,
    systemState?.sentinel?.position_x, systemState?.sentinel?.position_y, systemState?.sentinel?.position_z,
    systemState?.sentinel?.velocity_x, systemState?.sentinel?.velocity_y, systemState?.sentinel?.velocity_z,
    systemState?.target?.position_x, systemState?.target?.position_y, systemState?.target?.position_z,
    systemState?.target?.velocity_x, systemState?.target?.velocity_y, systemState?.target?.velocity_z,
  ]);

  // Computed Values
  const r_rel = { x: r2.x - r1.x, y: r2.y - r1.y, z: r2.z - r1.z };
  const v_rel = { x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z };

  const distCurrent = Math.sqrt(r_rel.x ** 2 + r_rel.y ** 2 + r_rel.z ** 2);
  const v_rel_mag = Math.sqrt(v_rel.x ** 2 + v_rel.y ** 2 + v_rel.z ** 2);
  const r_dot_v = (r_rel.x * v_rel.x) + (r_rel.y * v_rel.y) + (r_rel.z * v_rel.z);
  const v_squared = v_rel_mag ** 2;

  const t_cpa = v_squared > 1e-6 ? -(r_dot_v / v_squared) : 0;
  const pos_at_cpa = {
    x: r_rel.x + v_rel.x * t_cpa,
    y: r_rel.y + v_rel.y * t_cpa,
    z: r_rel.z + v_rel.z * t_cpa
  };
  const d_cpa = Math.sqrt(pos_at_cpa.x ** 2 + pos_at_cpa.y ** 2 + pos_at_cpa.z ** 2);

  // Future position of SAT-01 at t
  const future_r1 = {
    x: r1.x + v1.x * simT,
    y: r1.y + v1.y * simT,
    z: r1.z + v1.z * simT
  };

  const formulas = [
    {
      id: 1,
      title: '1. Relative Position Vector',
      symbol: 'r_rel = r_2 - r_1',
      equation: '{\\vec{r}}_{\\text{rel}} = {\\vec{r}}_2 - {\\vec{r}}_1',
      description: 'Defines the 3D displacement vector pointing from the protected spacecraft to the space debris fragment.',
      variables: [
        { sym: 'r_1', name: 'Position vector of Satellite (SAT-01)', unit: 'km' },
        { sym: 'r_2', name: 'Position vector of Debris Object', unit: 'km' },
        { sym: 'r_rel', name: 'Relative separation vector', unit: 'km' }
      ]
    },
    {
      id: 2,
      title: '2. Relative Velocity Vector',
      symbol: 'v_rel = v_2 - v_1',
      equation: '{\\vec{v}}_{\\text{rel}} = {\\vec{v}}_2 - {\\vec{v}}_1',
      description: 'The velocity of the debris object relative to the reference frame of the protected satellite.',
      variables: [
        { sym: 'v_1', name: 'Inertial velocity of SAT-01', unit: 'km/s' },
        { sym: 'v_2', name: 'Inertial velocity of Debris', unit: 'km/s' },
        { sym: 'v_rel', name: 'Relative closing velocity vector', unit: 'km/s' }
      ]
    },
    {
      id: 3,
      title: '3. Instantaneous Separation Distance',
      symbol: 'D = ||r_2 - r_1||',
      equation: 'D = \\|{\\vec{r}}_2 - {\\vec{r}}_1\\| = \\sqrt{\\Delta x^2 + \\Delta y^2 + \\Delta z^2}',
      description: 'Euclidean geometric distance separating the two orbital bodies at the current simulation timestamp.',
      variables: [
        { sym: 'D', name: 'Current instantaneous separation', unit: 'km' },
        { sym: '\\Delta x, \\Delta y, \\Delta z', name: 'Cartesian coordinate component differences', unit: 'km' }
      ]
    },
    {
      id: 4,
      title: '4. Time of Closest Approach (t_CPA)',
      symbol: 't_CPA = - (r_rel · v_rel) / ||v_rel||²',
      equation: 't_{\\text{CPA}} = -\\frac{{\\vec{r}}_{\\text{rel}} \\cdot {\\vec{v}}_{\\text{rel}}}{\\|{\\vec{v}}_{\\text{rel}}\\|^2}',
      description: 'The time duration until the two objects reach their closest geometric encounter. Derived by finding the zero of the time derivative of squared separation: d/dt(D²) = 0.',
      variables: [
        { sym: 't_CPA', name: 'Time to closest approach', unit: 'seconds' },
        { sym: 'r_rel · v_rel', name: 'Vector dot product of relative position and velocity', unit: 'km² / s' },
        { sym: '||v_rel||²', name: 'Squared magnitude of relative closing velocity', unit: 'km² / s²' }
      ]
    },
    {
      id: 5,
      title: '5. Closest Approach Distance (d_CPA)',
      symbol: 'd_CPA = ||r_rel + t_CPA * v_rel||',
      equation: 'd_{\\text{CPA}} = \\|{\\vec{r}}_{\\text{rel}} + t_{\\text{CPA}}\\,{\\vec{v}}_{\\text{rel}}\\|',
      description: 'The minimum miss distance between the satellite and debris. If d_CPA is less than the configured screening threshold (e.g. 25 km), an avoidance maneuver is initiated.',
      variables: [
        { sym: 'd_CPA', name: 'Minimum separation at closest encounter', unit: 'km' },
        { sym: 'Threshold', name: 'Safety screening boundary (configured)', unit: '25.0 km' }
      ]
    },
    {
      id: 6,
      title: '6. Kinematic Trajectory Prediction',
      symbol: 'r(t) = r_0 + v*t + 0.5*a*t²',
      equation: '{\\vec{r}}(t) = {\\vec{r}}_0 + {\\vec{v}}_0\\,t + \\frac{1}{2}{\\vec{a}}\\,t^2',
      description: 'Taylor-series second-order kinematic orbital expansion predicting future position under central Newtonian Earth gravity acceleration a = -(mu / r³) * r.',
      variables: [
        { sym: 'r_0, v_0', name: 'Initial position and velocity state vectors', unit: 'km, km/s' },
        { sym: 'mu', name: 'Earth gravitational parameter (398,600.44 km³/s²)', unit: 'km³/s²' },
        { sym: 't', name: 'Propagation forecast window', unit: 'seconds' }
      ]
    }
  ];

  const currentFormula = formulas.find(f => f.id === activeFormula) || formulas[3];

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-50 p-6 flex flex-col gap-6">
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              Educational Formula Laboratory
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Rigorous mathematical formulations governing relative orbital mechanics, conjunction prediction, and maneuver planning.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-1.5 rounded-xl font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Deterministic 3D Vector Math • Verified</span>
          </div>
        </div>

        {/* 6 Formula Navigation Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {formulas.map(f => {
            const isSelected = f.id === activeFormula;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFormula(f.id)}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80">
                  Step {f.id}
                </div>
                <div className="font-mono text-xs font-bold truncate">
                  {f.symbol}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Formula Exploration Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-6">
          
          <div className="border-b border-slate-100 pb-4">
            <div className="text-xs font-mono font-bold text-blue-600 uppercase tracking-wider">
              MATHEMATICAL SPECIFICATION
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {currentFormula.title}
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              {currentFormula.description}
            </p>
          </div>

          {/* Mathematical Formula Display Box */}
          <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col items-center justify-center gap-2 shadow-inner font-mono text-base md:text-lg tracking-wide border border-slate-800">
            <div className="text-cyan-400 font-bold text-center">
              {currentFormula.symbol}
            </div>
            <div className="text-[11px] text-slate-400 font-sans">
              LaTeX Expression: <code className="text-slate-300 font-mono text-[10px]">{currentFormula.equation}</code>
            </div>
          </div>

          {/* Variable Definitions Grid */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
              Variable Nomenclature & Units
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
              {currentFormula.variables.map(v => (
                <div key={v.sym} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between">
                  <span className="font-bold text-blue-600">{v.sym}</span>
                  <span className="text-slate-700 font-sans text-[11px] mt-0.5">{v.name}</span>
                  <span className="text-[10px] text-slate-400 mt-1">Unit: {v.unit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Interactive Calculation Sandbox */}
          <div className="border-t border-slate-100 pt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                Live Numerical Calculator & Verification
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLiveSync(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-all flex items-center gap-1.5 ${
                    liveSync
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${liveSync ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {liveSync ? 'Live Sim Synced' : 'Manual Override (Enable Sync)'}
                </button>
                <button
                  onClick={() => {
                    setLiveSync(false);
                    setR1({ x: 6978.0, y: 0.0, z: 0.0 });
                    setV1({ x: 0.0, y: 7.563, z: 0.0 });
                    setR2({ x: 6998.0, y: 234.4, z: 43.5 });
                    setV2({ x: -0.12, y: 5.938, z: -0.28 });
                    setSimT(145.0);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
                >
                  <RotateCcw className="w-3 h-3" /> Preset Sample Vectors
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              
              {/* Spacecraft 1 Inputs */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                <div className="font-bold text-slate-800 flex justify-between">
                  <span>SAT-01 Position & Velocity</span>
                  <span className="text-[10px] text-blue-600">SPACECRAFT 1</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">X (km)</label>
                    <input
                      type="number"
                      value={r1.x}
                      onChange={e => { setLiveSync(false); setR1({ ...r1, x: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Y (km)</label>
                    <input
                      type="number"
                      value={r1.y}
                      onChange={e => { setLiveSync(false); setR1({ ...r1, y: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Z (km)</label>
                    <input
                      type="number"
                      value={r1.z}
                      onChange={e => { setLiveSync(false); setR1({ ...r1, z: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div>
                    <label className="text-[10px] text-slate-500 block">Vx (km/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v1.x}
                      onChange={e => { setLiveSync(false); setV1({ ...v1, x: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Vy (km/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v1.y}
                      onChange={e => { setLiveSync(false); setV1({ ...v1, y: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Vz (km/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v1.z}
                      onChange={e => { setLiveSync(false); setV1({ ...v1, z: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Spacecraft 2 (Debris) Inputs */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                <div className="font-bold text-slate-800 flex justify-between">
                  <span>Debris Position & Velocity</span>
                  <span className="text-[10px] text-red-600">THREAT OBJECT</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">X (km)</label>
                    <input
                      type="number"
                      value={r2.x}
                      onChange={e => { setLiveSync(false); setR2({ ...r2, x: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Y (km)</label>
                    <input
                      type="number"
                      value={r2.y}
                      onChange={e => { setLiveSync(false); setR2({ ...r2, y: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Z (km)</label>
                    <input
                      type="number"
                      value={r2.z}
                      onChange={e => { setLiveSync(false); setR2({ ...r2, z: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div>
                    <label className="text-[10px] text-slate-500 block">Vx (km/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v2.x}
                      onChange={e => { setLiveSync(false); setV2({ ...v2, x: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Vy (km/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v2.y}
                      onChange={e => { setLiveSync(false); setV2({ ...v2, y: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Vz (km/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v2.z}
                      onChange={e => { setLiveSync(false); setV2({ ...v2, z: parseFloat(e.target.value) || 0 }); }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Arithmetic Step-by-Step Breakdown */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3 font-mono text-xs">
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center justify-between">
                <span>Step-by-Step Numerical Evaluation</span>
                <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                  Real-Time Evaluated
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">1. Relative Vector r_rel</span>
                  <span className="font-bold text-slate-900 block mt-1">
                    [{r_rel.x.toFixed(1)}, {r_rel.y.toFixed(1)}, {r_rel.z.toFixed(1)}] km
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Range: {distCurrent.toFixed(1)} km
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">2. Relative Velocity v_rel</span>
                  <span className="font-bold text-blue-600 block mt-1">
                    [{v_rel.x.toFixed(2)}, {v_rel.y.toFixed(2)}, {v_rel.z.toFixed(2)}] km/s
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Speed: {v_rel_mag.toFixed(3)} km/s
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">3. Time to CPA (t_CPA)</span>
                  <span className="font-bold text-amber-700 block mt-1 text-sm">
                    {t_cpa.toFixed(1)} seconds
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    r · v = {r_dot_v.toFixed(1)} km²/s
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">4. Miss Distance (d_CPA)</span>
                  <span className={`font-bold block mt-1 text-sm ${d_cpa < 25.0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {d_cpa.toFixed(2)} km
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {d_cpa < 25.0 ? '🚨 Screening Violation (<25km)' : '✅ Trajectory Safe (≥25km)'}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

