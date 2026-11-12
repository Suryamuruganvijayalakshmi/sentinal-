# SENTINEL: Technical Architecture & System Specification

## 1. System Overview

**SENTINEL** (Autonomous Orbital Safety, Satellite Rescue & Debris Mitigation System) is a high-fidelity, interactive orbital simulation and autonomous guidance platform. The system simulates how an autonomous orbital service vehicle detects, tracks, predicts, intercepts, inspects, grapples, and safely relocates non-responsive satellites and dangerous space debris objects in Low Earth Orbit (LEO).

---

## 2. Multi-Layer Safety Architecture

The system enforces strict separation between perception, statistical inference, deterministic mechanics, and actuator execution:

```
[ OPTICAL SSA DATASET / SENSORS ]
                ↓
    [ DATA ADAPTER LAYER ]
                ↓
  [ TWO-BODY ORBITAL PHYSICS ENGINE ]
                ↓
   [ COLLISION-RISK ENGINE (CPA) ]
                ↓
     [ PREDICTION ENGINE (RK4) ]
                ↓
   [ AI ANOMALY & RECOMMENDATIONS ]
                ↓
  [ AUTONOMOUS MISSION PLANNER ]
                ↓
   [ DETERMINISTIC SAFETY GATE ]  <--- (Hard physical boundaries: Fuel > 12kg, V_rel < 1.0 m/s)
                ↓
  [ SIMULATION PROPAGATION & EXEC ]
```

### Safety Principles
1. **Explainable Recommendations**: All AI outputs provide plain-language rationale and confidence scoring.
2. **Deterministic Safety Gate**: No recommendation or maneuver executes without passing physical safety checks (fuel margin, battery state of charge, closing velocity tolerances, standoff clearances).
3. **Deterministic Mechanics**: Physics calculations use Newtonian two-body Keplerian mechanics rather than generative black-box models.

---

## 3. Mathematical & Physics Formulations

### 3.1 Two-Body Orbital Dynamics
- **Gravitational Parameter of Earth**: $\mu = 398600.4418 \text{ km}^3/\text{s}^2$
- **Equatorial Radius of Earth**: $R_E = 6378.137 \text{ km}$
- **Radius Vector Magnitude**:
  $$D = \|\mathbf{P}\| = \sqrt{x^2 + y^2 + z^2}$$
- **Altitude**:
  $$h = D - R_E$$
- **Two-Body Acceleration**:
  $$\mathbf{A} = -\frac{\mu}{D^3} \mathbf{P}$$
- **Numerical Integration**: 4th-Order Runge-Kutta (RK4) numerical integration over time step $\Delta t$:
  $$\mathbf{P}(t + \Delta t) = \mathbf{P}(t) + \frac{\Delta t}{6} (k_{1,p} + 2k_{2,p} + 2k_{3,p} + k_{4,p})$$
  $$\mathbf{V}(t + \Delta t) = \mathbf{V}(t) + \frac{\Delta t}{6} (k_{1,v} + 2k_{2,v} + 2k_{3,v} + k_{4,v})$$
- **Second-Order Kinematic Prediction**:
  $$\mathbf{P}_{future} = \mathbf{P} + \mathbf{V}t + \frac{1}{2}\mathbf{A}t^2$$

### 3.2 Conjunction & Closest Approach (CPA)
For relative position $\mathbf{r} = \mathbf{P}_B - \mathbf{P}_A$ and relative velocity $\mathbf{v} = \mathbf{V}_B - \mathbf{V}_A$:
- **Time of Closest Approach**:
  $$t_{CPA} = -\frac{\mathbf{r} \cdot \mathbf{v}}{\mathbf{v} \cdot \mathbf{v}}$$
- **Closest Approach Distance**:
  $$d_{CPA} = \|\mathbf{r} + \mathbf{v} \cdot t_{CPA}\|$$
- **Collision Probability**:
  $$P_c = \exp\left(-\frac{d_{CPA}^2}{2\sigma^2}\right) \cdot \frac{r_{coll}}{\sigma}$$

### 3.3 Autonomous Target Priority Scoring
$$S_{target} = w_1 S_{risk} + w_2 S_{health} + w_3 P_{coll} + w_4 S_{access} + w_5 S_{prio}$$
- Default weights: $w_1 = 0.35, w_2 = 0.25, w_3 = 0.20, w_4 = 0.10, w_5 = 0.10$.

### 3.4 Propulsion & Tsiolkovsky Rocket Equation
- **Specific Impulse**: $I_{sp} = 310 \text{ s}$
- **Propellant Mass Consumed**:
  $$\Delta m = m_0 \left(1 - \exp\left(-\frac{\Delta V \times 1000}{I_{sp} \cdot g_0}\right)\right)$$

---

## 4. Software Component Structure

- `backend/`
  - `api/`: FastAPI REST endpoints and WebSockets (`/ws/telemetry`, `/ws/mission`).
  - `simulation/engine.py`: Central simulation clock, active vehicle guidance, and scenario manager.
  - `orbital/physics.py`: Two-body RK4 propagator, CPA calculator, and orbital element conversions.
  - `risk/collision.py`: Pairwise conjunction screening and risk categorization (SAFE, LOW, MEDIUM, HIGH, CRITICAL).
  - `prediction/propagator.py`: Multi-horizon trajectory forecast (10s to 1h) and uncertainty envelopes.
  - `ai/anomaly.py`: Statistical z-score, tumble rate, and power depletion detector.
  - `ai/recommendation.py`: Explainable recommendations and deterministic safety validator.
  - `mission/planner.py`: Target scoring, Hohmann transfer planning, and relocation burns.
  - `mission/state_machine.py`: 13-phase autonomous mission state machine.
  - `dataset/adapter.py`: Optical camera coordinate to 3D ECI Keplerian orbit mapper.
  - `database/db.py`: SQLite persistence layer for mission events and telemetry.
- `frontend/`
  - `src/three/OrbitalCanvas.tsx`: Three.js 3D Earth, atmosphere, spacecraft, debris, and trajectory trails.
  - `src/components/`: Header, Navigation, SentinelHUD, TargetHUD, AIRecommendationCard, EventLogStream, MissionSummaryModal.
  - `src/pages/`: 10 comprehensive dashboard views.

---

## 5. Mission State Machine Lifecycle

```
[IDLE]
  ↓ (Operator or Demo trigger)
[TARGET_SELECTION]
  ↓ (Autonomous Priority Scorer selects highest score)
[TRACKING]
  ↓ (Filter converges, relative range/rate locked)
[PREDICTION]
  ↓ (Ephemeris projected, CPA bounded)
[INTERCEPT_PLANNING]
  ↓ (Hohmann injection & braking delta-v approved by Safety Validator)
[INTERCEPTING]
  ↓ (Range closes to terminal proximity < 2.5 km)
[RENDEZVOUS]
  ↓ (Standoff station-keeping achieved at range < 50 m, closing rate < 0.2 m/s)
[INSPECTION]
  ↓ (Sensor/camera classification: Power, Comm, Thermal, Attitude, Structural)
[CAPTURE]
  ↓ (Approach -> Alignment -> Grapple activated -> Target secured)
[MANEUVER]
  ↓ (Relocation ignition: DISPOSAL ORBIT, SAFE ORBIT, or CONTROLLED DEORBIT)
[SAFE_TRAJECTORY]
  ↓ (Burn completes, disposal corridor reached)
[MISSION_COMPLETE]
```



cd e:\archive\sentinel\frontend
npm run dev -- --host 127.0.0.1 --port 5173
