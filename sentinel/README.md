# SENTINEL — 3D Orbital Safety Command Centre
## Autonomous Satellite Collision-Avoidance & Space Debris Intelligence Simulator

**Tagline:** *"Predict the Threat. Protect the Orbit."*  
**Core Workflow:** **DETECT → TRACK → PREDICT → ASSESS → DECIDE → MANEUVER → VERIFY**

---

> [!NOTE]
> **Technical Honesty Disclaimer:**
> Prototype using a simplified orbital model, synthetic scenarios, and illustrative 3D visualization. Not live tracking or an operational conjunction assessment tool.

---

## 1. Project Overview

SENTINEL is an interactive, fully calculated space situational awareness (SSA) and autonomous satellite collision-avoidance simulation platform. Built with a clean, high-contrast mission-control interface (Clean Aerospace White Theme by default, with optional Deep Space Dark Mode), it provides an immersive, educational simulation for aerospace engineering evaluations, project exhibitions, and startup demonstrations.

### Core Capabilities:
1. **Interactive 3D Orbital Environment**: Procedural Earth globe (rotating day/night textures, atmosphere glow, continents, oceans, latitude/longitude grids), SAT-01 protected satellite model (solar panels, communications antenna), threatening vs non-threatening space debris, and orbital trajectory trails.
2. **Deterministic Two-Body Orbital Physics Engine**: Numerical propagation under central Earth gravity ($\mu = 398,600.4418 \text{ km}^3/\text{s}^2$, $R_{\text{Earth}} = 6,378.137 \text{ km}$) using 4th-Order Runge-Kutta (RK4) stepping.
3. **Continuous Pairwise Conjunction Screening**: Computes relative separation, relative velocity vectors, Time of Closest Approach ($t_{\text{CPA}}$), Closest Approach Distance ($d_{\text{CPA}}$), and screening threshold violations.
4. **Interactive Maneuver Lab**: Side-by-side comparison matrix evaluating Prograde, Retrograde, and Radial impulsive burns (5, 10, 20 m/s) with real-time 3D trajectory preview and Tsiolkovsky propellant expenditure calculations.
5. **Explainable Deterministic Decision Engine**: Selects the optimal maneuver that satisfies configured screening distance with minimal velocity change ($\Delta v$) and positive fuel margins. When all tested candidates fail, safety gates escalate to `REVIEW REQUIRED` rather than forcing false success.
6. **Post-Maneuver Trajectory Verification**: Propagates post-burn orbits, recalculates minimum separation ($d_{\text{CPA}}$), and confirms status `VERIFIED`.
7. **Dedicated Evaluator Presentation Mode**: A 5-minute, 7-stage interactive demo designed for evaluators, professors, and judges.
8. **Digital Twin Mission Results**: Before-and-after comparison cards, chronological audit logs, and one-click CSV export (`sentinel_mission_results.csv`, `sentinel_event_log.csv`).
9. **Orbital Catalogue Analytics**: Ingests and summarizes 1,911 space objects from optical surveillance telescope datasets with altitude, inclination, and object-type distributions.

---

## 2. Deterministic Demo Scenarios

| Scenario | Conjunction Geometry | Expected Outcome | Rationale |
| :--- | :--- | :--- | :--- |
| **Scenario 1: Normal Operation** | SAT-01 in nominal 600 km circular orbit; all tracked objects &gt; 150 km separation | **`MONITORING`** | No predicted screening violation. Normal orbital maintenance. |
| **Scenario 2: Avoidable Close Approach** | Cosmos-2251 fragment on intersecting path ($d_{\text{CPA}} = 3.76\text{ km} < 25.0\text{ km}$, $t_{\text{CPA}} = 145.1\text{ s}$) | **`WARNING` → `EVALUATING` → `VERIFIED`** | Candidate `CAND-PRO-5` (+5 m/s Prograde) shifts separation to 34.76 km with 1.31 kg propellant, resolving hazard. |
| **Scenario 3: No Acceptable Maneuver** | Hypervelocity debris cluster head-on convergence ($v_{\text{rel}} = 14.8\text{ km/s}$, initial $d_{\text{CPA}} = 1.8\text{ km}$) | **`WARNING` → `EVALUATING` → `REVIEW REQUIRED`** | All tested candidate burns fail to achieve the required 25.0 km clearance (maximum achieved is 12.8 km). Escalated for human review. |

---

## 3. Technology Stack

- **Frontend Interface**:
  - React 19 + TypeScript + Vite
  - Three.js + OrbitControls (Photorealistic procedural Earth, shaders, 3D spacecraft, orbit lines)
  - Tailwind CSS + Pristine Aerospace Light Theme (`#ffffff` / `#f8fafc`) + Dark Mode
  - Lucide React aerospace icons
- **Simulation Engine & Backend**:
  - Python 3.11 with `numpy`, `scipy`, `pandas`
  - FastAPI + Uvicorn REST API & WebSocket server
  - Deterministic RK4 numerical integrator and Tsiolkovsky propulsion calculations

---

## 4. Quick Start & Execution

### Prerequisites:
- Python 3.10+
- Node.js 18+ and npm

### 1. Launch Backend API & Simulation Engine
```powershell
python -m uvicorn sentinel.backend.api.main:app --host 127.0.0.1 --port 8000
```
- API Documentation (Swagger): `http://127.0.0.1:8000/docs`

### 2. Launch Frontend Command Centre
In a separate terminal:
```powershell
cd sentinel/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
- Open in your browser: `http://127.0.0.1:5173`

### 3. Run Automated Orbital Verification Test Suite
```powershell
python sentinel/tests/test_orbital_suite.py
```
**Result:** `ALL 14 SENTINEL AUTOMATED UNIT & INTEGRATION TESTS PASSED PERFECTLY!`

---

## 5. Five-Minute Evaluator Demonstration Guide

1. **Launch**: Open `http://127.0.0.1:5173`. Click the **`Evaluator Demo`** button in the top navigation.
2. **Stage 1 (Overview)**: Review SENTINEL's core workflow: `DETECT → TRACK → PREDICT → ASSESS → DECIDE → MANEUVER → VERIFY`.
3. **Stage 2 (Environment)**: Observe 3D Earth, SAT-01 in nominal 600 km orbit, camera presets (`Earth View`, `Follow SAT-01`, `Track Threat`, `Closest Approach`, `Free Orbit`).
4. **Stage 3 (Threat Prediction)**: Scenario 2 loads automatically. Point out the red intersecting path of `DEBRIS-2009-033A`, predicted $d_{\text{CPA}} = 3.76\text{ km}$ ($< 25\text{ km}$ threshold), and status `WARNING`.
5. **Stage 4 (Maneuver Comparison)**: Step into the **Maneuver Lab**. Compare candidate matrix (Prograde, Retrograde, Radial). Note how Prograde +5 m/s is selected as optimal because it yields 34.76 km clearance with lowest $\Delta v$ (5.0 m/s) and minimal fuel (1.31 kg).
6. **Stage 5 (Autonomous Execution)**: Execute the maneuver. SAT-01 burns thrusters, updates velocity, and recalculates the post-burn trajectory.
7. **Stage 6 (Verification)**: Navigate to **Mission Results**. Point out the verified before-and-after clearance (+31.0 km improvement), status `VERIFIED`, and export the CSV audit ledger.
8. **Stage 7 (Failure Handling)**: Demonstrate Scenario 3 where extreme hypervelocity geometry causes all candidates to fail, triggering status `REVIEW REQUIRED`. Highlight technical honesty and human operator escalation.

---

## 6. Architecture & File Structure

```
sentinel/
├── backend/
│   ├── api/
│   │   ├── main.py              # FastAPI application entrypoint & WebSockets
│   │   └── routes.py            # REST endpoints (status, maneuvers, analytics, scenarios)
│   ├── orbital/
│   │   └── physics.py           # Two-body RK4 integrator, CPA calculation, orbital elements
│   ├── risk/
│   │   └── collision.py         # Pairwise conjunction screening & probability estimation
│   ├── prediction/
│   │   └── propagator.py        # Multi-horizon trajectory propagation
│   ├── simulation/
│   │   └── engine.py            # Master simulation engine, clock, deterministic scenarios, maneuvers
│   ├── dataset/
│   │   └── adapter.py           # Optical telescope dataset adapter
│   └── database/
│       └── db.py                # SQLite persistent mission logging
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx             # Top navigation, status badge, scenario picker, demo launcher
│   │   │   └── EvaluatorDemoModal.tsx # 5-minute 7-stage guided evaluator walkthrough
│   │   ├── pages/
│   │   │   ├── MissionControl.tsx     # 3D Command Centre (~70% viewport + compact HUDs)
│   │   │   ├── ManeuverLab.tsx        # Side-by-side maneuver matrix & 3D candidate preview
│   │   │   ├── Simulator.tsx          # Master clock, speed acceleration, screening distance slider
│   │   │   ├── MissionResults.tsx     # Before-and-after digital twin, event log & CSV export
│   │   │   └── OrbitalAnalytics.tsx   # Catalogue statistics (1,911 objects), histograms, CSV upload
│   │   ├── three/
│   │   │   └── OrbitalCanvas.tsx      # Three.js photorealistic Earth, satellite models, trajectories
│   │   ├── services/
│   │   │   └── api.ts                 # Type-safe API client
│   │   ├── types/
│   │   │   └── index.ts               # Complete TypeScript interfaces
│   │   ├── App.tsx                    # Root application component
│   │   └── index.css                  # Clean White Theme design tokens & dark mode overrides
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── processed/               # 1,911 indexed orbital objects
│   └── raw/                     # Optical surveillance dataset
├── tests/
│   └── test_orbital_suite.py    # 14 automated unit & end-to-end integration tests
└── README.md
```

---

## 7. Genuine Limitations & Technical Honesty

- **Simplified Orbital Physics**: The physics engine employs a deterministic two-body Keplerian gravity model. Perturbations such as non-spherical Earth harmonics ($J_2, J_3$), atmospheric drag (NRLMSISE-00), and solar radiation pressure are omitted in this educational prototype.
- **Conjunction Probability**: CPA and Gaussian uncertainty models are calculated for illustrative simulation demonstration and should not be used as operational operational conjunction assessment messages (CDMs).
- **Future Scope**: Robotic grappling, satellite servicing, refueling, and Active Debris Removal (ADR) represent conceptual research directions documented for academic completeness.
