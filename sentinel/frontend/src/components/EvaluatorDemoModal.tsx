import React, { useState } from 'react';
import { api } from '../services/api';
import { 
  Sparkles, CheckCircle2, ChevronRight, ChevronLeft, 
  X, AlertTriangle, ShieldCheck, Zap, Globe, Sliders, ArrowRight
} from 'lucide-react';

interface EvaluatorDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
  onRefreshState: () => void;
}

export const EvaluatorDemoModal: React.FC<EvaluatorDemoModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onRefreshState
}) => {
  const [currentStage, setCurrentStage] = useState<number>(1);
  const totalStages = 7;

  if (!isOpen) return null;

  const demoStages = [
    {
      number: 1,
      title: 'Stage 1 — Mission Overview & System Architecture',
      subtitle: 'Introduction to SENTINEL & Core Workflow',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Welcome to the <strong>SENTINEL 3D Orbital Safety Command Centre</strong> demonstration.
          </p>
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-900 font-medium">
            Tagline: <em>"Predict the Threat. Protect the Orbit."</em>
          </div>
          <p>
            SENTINEL demonstrates an end-to-end autonomous safety pipeline:
          </p>
          <div className="bg-slate-100 p-2.5 rounded-xl font-mono text-[11px] font-bold text-slate-800 text-center">
            DETECT → TRACK → PREDICT → ASSESS → DECIDE → MANEUVER → VERIFY
          </div>
          <p className="text-[11px] text-slate-500 italic">
            Disclaimer: Prototype using a simplified two-body orbital model, synthetic scenarios, and illustrative 3D visualization. Not live tracking or an operational conjunction assessment tool.
          </p>
        </div>
      ),
      actionLabel: 'Proceed to Orbital Environment →',
      onEnter: async () => {
        onNavigateTab('Mission Control');
      }
    },
    {
      number: 2,
      title: 'Stage 2 — 3D Orbital Environment & State Propagation',
      subtitle: 'Earth, Protected Satellite SAT-01 & Background Debris',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            The simulation environment renders:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Procedural Earth globe:</strong> Rotating day/night texture with continents, atmosphere glow, and equatorial coordinate grids.</li>
            <li><strong>SAT-01 Protected Spacecraft:</strong> 600 km circular LEO orbit (inclination 53°, velocity 7.558 km/s) with solar arrays and communications antenna.</li>
            <li><strong>Background Space Debris:</strong> Derived from optical telescope surveillance catalogues.</li>
            <li><strong>Safety Status:</strong> <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-bold">MONITORING</code> — no predicted clearance violations.</li>
          </ul>
        </div>
      ),
      actionLabel: 'Inject Conjunction Threat →',
      onEnter: async () => {
        onNavigateTab('Mission Control');
      }
    },
    {
      number: 3,
      title: 'Stage 3 — Threat Detection & Close Approach Prediction',
      subtitle: 'Deterministic Pairwise Conjunction Screening',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Loading <strong>Scenario 2: Avoidable Close Approach</strong>.
          </p>
          <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-red-900">
            <span className="font-bold block mb-1">Conjunction Event Detected:</span>
            Hazardous debris <strong>Cosmos-2251 Fragment #33A</strong> on intersecting orbital trajectory.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>Predicted d_CPA: <strong className="text-red-600">3.80 km</strong></div>
            <div>Time to CPA: <strong>2396 s</strong></div>
            <div>Closing Speed: <strong>2.89 km/s</strong></div>
            <div>Safety Limit: <strong className="text-blue-600">25.0 km</strong></div>
          </div>
          <p>
            Because d_CPA &lt; 25 km, the system triggers status <code className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">WARNING</code> and begins candidate maneuver assessment.
          </p>
        </div>
      ),
      actionLabel: 'Open Maneuver Comparison Lab →',
      onEnter: async () => {
        await api.loadScenario('Scenario 2: Avoidable Close Approach');
        await onRefreshState();
        onNavigateTab('Mission Control');
      }
    },
    {
      number: 4,
      title: 'Stage 4 — Explainable Maneuver Lab & Candidate Matrix',
      subtitle: 'Compare Prograde, Retrograde, and Radial Burns',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Navigating to the <strong>Maneuver Lab</strong>. The system evaluates candidate impulsive burns across multiple directions and magnitudes:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Prograde (+5, +10, +20 m/s):</strong> Raises apoapsis, induces along-track phase separation (d_CPA &gt; 30.5 km under two-body RK4, <span className="text-emerald-600 font-bold">PASS</span>).</li>
            <li><strong>Retrograde (-5, -10 m/s):</strong> Lowers periapsis to phase ahead of debris (d_CPA &gt; 33 km, <span className="text-emerald-600 font-bold">PASS</span>).</li>
            <li><strong>Radial+ / Radial- (±5 m/s):</strong> Oscillates altitude without secular phase drift (d_CPA ~17.4 km, <span className="text-red-600 font-bold">FAIL</span>).</li>
          </ul>
          <p className="bg-blue-50 p-2.5 rounded-xl border border-blue-200 text-blue-900 font-medium">
            Explainable Rule: <em>"Select candidate with minimum velocity change (Δv) that satisfies the 25.0 km threshold with positive fuel margins."</em>
          </p>
        </div>
      ),
      actionLabel: 'Execute Optimal Avoidance Burn →',
      onEnter: async () => {
        onNavigateTab('Maneuver Lab');
      }
    },
    {
      number: 5,
      title: 'Stage 5 — Autonomous Maneuver Execution',
      subtitle: 'Executing Candidate CAND-PRO-5 (Prograde +5 m/s)',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            Executing <strong>Candidate CAND-PRO-5</strong>:
          </p>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1 font-mono text-xs">
            <div>Burn Vector: <strong className="text-slate-900">+5.0 m/s Prograde</strong></div>
            <div>Propellant Expended: <strong className="text-emerald-600">1.31 kg</strong> (148.69 kg remaining)</div>
            <div>Post-burn Orbit Velocity: <strong className="text-slate-900">7.563 km/s</strong></div>
          </div>
          <p>
            SAT-01 updates its velocity vector and propagates the new post-maneuver trajectory into future time steps.
          </p>
        </div>
      ),
      actionLabel: 'Verify Safe Clearance →',
      onEnter: async () => {
        await api.executeManeuver('CAND-PRO-5');
        await onRefreshState();
        onNavigateTab('Maneuver Lab');
      }
    },
    {
      number: 6,
      title: 'Stage 6 — Post-Maneuver Verification & Mission Results',
      subtitle: 'Confirmation of Safe Trajectory Clearance',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-emerald-900">
            <span className="font-bold flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              STATUS: VERIFIED
            </span>
            New minimum separation exceeds <strong>30.5 km</strong> (&gt; 25.0 km safety threshold). Clearance verified safe under RK4 dynamics.
          </div>
          <p>
            The <strong>Mission Results</strong> digital twin presents:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Before vs After clearance comparison (+26.7 km improvement).</li>
            <li>Fuel budget delta: 1.31 kg consumed.</li>
            <li>Chronological mission audit trail with full CSV export capabilities.</li>
          </ul>
        </div>
      ),
      actionLabel: 'Test Failure Handling (Scenario 3) →',
      onEnter: async () => {
        onNavigateTab('Mission Results');
      }
    },
    {
      number: 7,
      title: 'Stage 7 — Technical Honesty & Failure Handling',
      subtitle: 'Scenario 3: No Acceptable Maneuver (Review Required)',
      content: (
        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            To demonstrate technical honesty, SENTINEL never forces a false success.
          </p>
          <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-red-900">
            <span className="font-bold block mb-1">Loading Scenario 3: No Acceptable Maneuver</span>
            High-speed fragmented debris cluster head-on convergence (closing speed 15.0 km/s, initial d_CPA = 1.78 km at t_CPA = 240 s).
          </div>
          <p>
            All tested candidate burns fail to achieve the required 25.0 km clearance (maximum achieved is ~4.8 km due to short warning time).
          </p>
          <div className="bg-slate-100 p-2.5 rounded-xl font-mono text-[11px] font-bold text-red-700 text-center">
            SAFETY GATE ESCALATION: STATUS REVIEW REQUIRED
          </div>
          <p className="text-[11px] text-slate-500">
            The decision engine explicitly refuses automatic authorization and escalates the conjunction to human orbital safety officers.
          </p>
        </div>
      ),
      actionLabel: 'Complete Evaluator Demonstration',
      onEnter: async () => {
        await api.loadScenario('Scenario 3: No Acceptable Maneuver');
        await onRefreshState();
        onNavigateTab('Maneuver Lab');
      }
    }
  ];

  const currentStageData = demoStages[currentStage - 1];

  const handleNext = async () => {
    if (currentStage < totalStages) {
      const nextStage = currentStage + 1;
      setCurrentStage(nextStage);
      await demoStages[nextStage - 1].onEnter();
    } else {
      onClose();
    }
  };

  const handlePrev = async () => {
    if (currentStage > 1) {
      const prevStage = currentStage - 1;
      setCurrentStage(prevStage);
      await demoStages[prevStage - 1].onEnter();
    }
  };

  const handleReset = async () => {
    setCurrentStage(1);
    await demoStages[0].onEnter();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-xl w-full max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-mono font-bold text-blue-600 uppercase tracking-wider truncate">
                5-MINUTE EVALUATOR WALKTHROUGH
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                {currentStageData.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stage Progress Bar */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-1 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-400 mb-1.5">
            <span>STAGE {currentStage} OF {totalStages}</span>
            <span className="truncate max-w-full">{currentStageData.subtitle}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300 rounded-full"
              style={{ width: `${(currentStage / totalStages) * 100}%` }}
            />
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {currentStageData.content}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <button
              onClick={handlePrev}
              disabled={currentStage === 1}
              className="flex-1 sm:flex-initial justify-center px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              onClick={handleReset}
              className="flex-1 sm:flex-initial justify-center px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-white transition-all"
            >
              Reset Tour
            </button>
          </div>

          <button
            onClick={handleNext}
            className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 sm:py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            {currentStageData.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
