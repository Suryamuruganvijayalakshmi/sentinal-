import { SystemState, ManeuverCandidate, BeforeAfterResults } from '../types';
import scenario1Json from '../data/scenario1State.json';
import scenario2Json from '../data/scenario2State.json';
import scenario3Json from '../data/scenario3State.json';
import catalogueAnalyticsJson from '../data/catalogueAnalytics.json';
import encounterAnalyticsJson from '../data/encounterAnalytics.json';
import defaultPredictionJson from '../data/defaultPrediction.json';

const MU_EARTH = 398600.4418; // km^3 / s^2
const R_EARTH = 6378.137;     // km

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function computeGravityAccel(x: number, y: number, z: number): [number, number, number] {
  const r2 = x * x + y * y + z * z;
  const r = Math.sqrt(r2);
  if (r < 1.0) return [0, 0, 0];
  const factor = -MU_EARTH / (r2 * r);
  return [factor * x, factor * y, factor * z];
}

function rk4Step(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  dt: number
): { x: number; y: number; z: number; vx: number; vy: number; vz: number; alt: number } {
  // k1
  const [ax1, ay1, az1] = computeGravityAccel(x, y, z);
  const k1_rx = vx; const k1_ry = vy; const k1_rz = vz;
  const k1_vx = ax1; const k1_vy = ay1; const k1_vz = az1;

  // k2
  const x2 = x + 0.5 * dt * k1_rx;
  const y2 = y + 0.5 * dt * k1_ry;
  const z2 = z + 0.5 * dt * k1_rz;
  const [ax2, ay2, az2] = computeGravityAccel(x2, y2, z2);
  const k2_rx = vx + 0.5 * dt * k1_vx;
  const k2_ry = vy + 0.5 * dt * k1_vy;
  const k2_rz = vz + 0.5 * dt * k1_vz;
  const k2_vx = ax2; const k2_vy = ay2; const k2_vz = az2;

  // k3
  const x3 = x + 0.5 * dt * k2_rx;
  const y3 = y + 0.5 * dt * k2_ry;
  const z3 = z + 0.5 * dt * k2_rz;
  const [ax3, ay3, az3] = computeGravityAccel(x3, y3, z3);
  const k3_rx = vx + 0.5 * dt * k2_vx;
  const k3_ry = vy + 0.5 * dt * k2_vy;
  const k3_rz = vz + 0.5 * dt * k2_vz;
  const k3_vx = ax3; const k3_vy = ay3; const k3_vz = az3;

  // k4
  const x4 = x + dt * k3_rx;
  const y4 = y + dt * k3_ry;
  const z4 = z + dt * k3_rz;
  const [ax4, ay4, az4] = computeGravityAccel(x4, y4, z4);
  const k4_rx = vx + dt * k3_vx;
  const k4_ry = vy + dt * k3_ry;
  const k4_rz = vz + dt * k3_rz;
  const k4_vx = ax4; const k4_vy = ay4; const k4_vz = az4;

  const nx = x + (dt / 6) * (k1_rx + 2 * k2_rx + 2 * k3_rx + k4_rx);
  const ny = y + (dt / 6) * (k1_ry + 2 * k2_ry + 2 * k3_ry + k4_ry);
  const nz = z + (dt / 6) * (k1_rz + 2 * k2_rz + 2 * k3_rz + k4_rz);
  const nvx = vx + (dt / 6) * (k1_vx + 2 * k2_vx + 2 * k3_vx + k4_vx);
  const nvy = vy + (dt / 6) * (k1_vy + 2 * k2_vy + 2 * k3_vy + k4_vy);
  const nvz = vz + (dt / 6) * (k1_vz + 2 * k2_vz + 2 * k3_vz + k4_vz);

  const rNew = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return {
    x: nx, y: ny, z: nz,
    vx: nvx, vy: nvy, vz: nvz,
    alt: rNew - R_EARTH
  };
}

class StandaloneSimulation {
  private state: SystemState;
  private lastWallTime: number = performance.now();
  private sentinelOrbitAngle: number = 0.0;
  private encounterElapsedS: number = 0.0;
  private isConjunctionScenario: boolean = true;
  private maneuverExecSimTime: number = 0.0;
  private objectPhases: Map<string, { r: number; inc: number; omega: number; phase0: number }> = new Map();

  constructor() {
    this.state = deepClone(scenario2Json as unknown as SystemState);
    this.initCatalogOrbits();
    this.initCloseApproach(true);
  }

  private initCatalogOrbits(): void {
    const list = this.state.objects || [];
    list.forEach((obj, idx) => {
      if (obj.id === 'SAT-01') return;
      const r = Math.sqrt(obj.position_x ** 2 + obj.position_y ** 2 + obj.position_z ** 2) || (6950 + (idx % 8) * 45);
      const inc = ((obj.inclination || (28.5 + (idx % 6) * 12)) * Math.PI) / 180;
      const period = obj.orbital_period || (5600 + (idx % 10) * 35);
      const omega = (2.0 * Math.PI) / (period / 96.0);
      const phase0 = Math.atan2(obj.position_y, obj.position_x) || (idx * 0.28);
      this.objectPhases.set(obj.id, { r, inc, omega, phase0 });
    });
  }

  private initCloseApproach(canAvoid: boolean): void {
    this.isConjunctionScenario = true;
    this.encounterElapsedS = 0.0;
    this.state.clock.sim_time = 0.0;
    this.state.clock.mission_elapsed_time_s = 0.0;
    this.state.clock.is_running = true;
    this.state.clock.time_scale = 1.0;
    this.state.executed_maneuver = null;
    this.state.safety_status = 'WARNING';
    this.maneuverExecSimTime = 0;

    const sent = this.state.sentinel || this.state.objects.find(o => o.id === 'SAT-01');
    if (sent) {
      sent.id = 'SAT-01';
      sent.name = "SAT-A34 'SENTINEL'";
      sent.status = 'CONVERGING_APPROACH';
      sent.health_status = 'HEALTHY';
      sent.fuel_kg = canAvoid ? 148.7 : 0.2;
    }

    let tgt = this.state.target;
    if (!tgt || tgt.id === sent?.id) {
      tgt = this.state.objects.find(o => o.id !== sent?.id) || null;
    }
    if (tgt) {
      tgt.id = 'DEBRIS-8871';
      tgt.name = 'DEBRIS #8871 (Cosmos-1408)';
      tgt.status = 'COLLISION_VECTOR';
      tgt.health_status = 'CRITICAL';
      this.state.target = tgt;
    }

    if (this.state.risks && this.state.risks.length > 0) {
      this.state.risks[0].current_distance_km = 244.0;
      this.state.risks[0].cpa_time_s = 20.0;
      this.state.risks[0].cpa_distance_km = 0.0;
      this.state.risks[0].relative_speed_kms = 8.12;
      this.state.risks[0].risk_level = 'CRITICAL';
    }

    this.seedTelemetry(true, canAvoid);
  }

  private seedTelemetry(isConjunction: boolean, canAvoid: boolean): void {
    const pts: any[] = [];
    const nowSim = this.state.clock.sim_time;
    for (let i = 0; i < 40; i++) {
      const t = Number((nowSim - (40 - i) * 0.25).toFixed(2));
      const alt = Number((600.0 + Math.sin(i * 0.2) * 0.4).toFixed(2));
      let dist = 14158.0;
      let prob = 0.0001;
      if (isConjunction) {
        dist = Math.max(0, 244.0 + (40 - i) * 1.5);
        prob = 96.5 + (i / 40.0) * 1.7;
      }
      pts.push({
        sim_time: t,
        pos_x: 6978.137 * Math.cos(i * 0.05),
        pos_y: 6978.137 * Math.sin(i * 0.05),
        pos_z: 0.0,
        vel_x: -7.558 * Math.sin(i * 0.05),
        vel_y: 7.558 * Math.cos(i * 0.05),
        vel_z: 0.0,
        altitude: alt,
        target_dist: Number(dist.toFixed(2)),
        target_rel_vel: 8.12,
        fuel_kg: canAvoid ? 148.7 : 0.2,
        battery_pct: 98.5,
        collision_prob: Number(prob.toFixed(2)),
        phase: 'PATROL',
        delta_r: Number((Math.sin(i * 0.25) * 1.2 + 2.5).toFixed(2)),
        delta_t: Number((Math.cos(i * 0.2) * 2.0 + 4.0).toFixed(2)),
        delta_w: Number((Math.sin(i * 0.15) * 0.8 + 1.5).toFixed(2))
      });
    }
    this.state.telemetry = pts;
  }

  public getState(): SystemState {
    return this.tick();
  }

  public tick(customDtSim?: number): SystemState {
    const now = performance.now();
    const wallDtSec = Math.max(0.001, Math.min(0.2, (now - this.lastWallTime) / 1000));
    this.lastWallTime = now;

    const clock = this.state.clock;
    if (!clock.is_running && customDtSim === undefined) {
      return this.state;
    }

    const dtSim = customDtSim !== undefined ? customDtSim : wallDtSec;
    clock.sim_time = Number((clock.sim_time + dtSim).toFixed(2));
    clock.mission_elapsed_time_s = Number((clock.mission_elapsed_time_s + dtSim).toFixed(1));

    // 1. Advance Sentinel's orbital angle continuously ALWAYS around Earth
    // Completes 1 full revolution in 60s -> omega = 2pi / 60 = 0.10472 rad/s (6.0 deg/s)
    const OMEGA_SENTINEL = (2.0 * Math.PI) / 60.0;
    this.sentinelOrbitAngle = (this.sentinelOrbitAngle + OMEGA_SENTINEL * dtSim) % (2.0 * Math.PI);

    // If avoidance burn is executed, smoothly raise Sentinel's altitude by +32.5 km
    const avoidAlt = this.state.executed_maneuver
      ? Math.min(32.5, Math.max(0, (clock.sim_time - this.maneuverExecSimTime) * 10.0))
      : 0.0;
    const rSentinel = 6978.137 + avoidAlt;

    const sentinel = this.state.objects.find(o => o.id === (this.state.sentinel?.id || 'SAT-01')) || this.state.objects[0];
    if (sentinel) {
      sentinel.position_x = rSentinel * Math.cos(this.sentinelOrbitAngle);
      sentinel.position_y = rSentinel * Math.sin(this.sentinelOrbitAngle);
      sentinel.position_z = 0.0;
      sentinel.velocity_x = -7.558 * Math.sin(this.sentinelOrbitAngle);
      sentinel.velocity_y = 7.558 * Math.cos(this.sentinelOrbitAngle);
      sentinel.velocity_z = 0.0;
      sentinel.altitude = 600.0 + avoidAlt;
      this.state.sentinel = sentinel;
    }

    const target = this.state.target ? this.state.objects.find(o => o.id === this.state.target!.id) : null;
    if (target) {
      this.state.target = target;
    }

    // 2. Scenario-specific target debris behavior
    if (this.isConjunctionScenario && sentinel && target) {
      this.encounterElapsedS = Math.min(20.0, this.encounterElapsedS + dtSim);
      const tau = Math.min(1.0, this.encounterElapsedS / 20.0); // 0.0 -> 1.0 over 20s

      // Debris starts ~244 km offset along an inclined 65° orbit, and slowly moves towards Sentinel
      const INITIAL_OFFSET_RAD = 0.035; // ~244 km arc offset
      const thetaDebris = this.sentinelOrbitAngle + INITIAL_OFFSET_RAD * (1.0 - tau);
      const INC = (65.0 * Math.PI) / 180;
      const R_DEBRIS = 6978.137;

      target.position_x = R_DEBRIS * Math.cos(thetaDebris);
      target.position_y = R_DEBRIS * Math.sin(thetaDebris) * Math.cos(INC);
      target.position_z = R_DEBRIS * Math.sin(thetaDebris) * Math.sin(INC);
      target.velocity_x = -7.558 * Math.sin(thetaDebris);
      target.velocity_y = 7.558 * Math.cos(thetaDebris) * Math.cos(INC);
      target.velocity_z = 7.558 * Math.cos(thetaDebris) * Math.sin(INC);
      target.altitude = 600.0;

      // Recompute threat distance, relative velocity, and CPA
      const rx = target.position_x - sentinel.position_x;
      const ry = target.position_y - sentinel.position_y;
      const rz = target.position_z - sentinel.position_z;
      const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);

      const vx = target.velocity_x - sentinel.velocity_x;
      const vy = target.velocity_y - sentinel.velocity_y;
      const vz = target.velocity_z - sentinel.velocity_z;
      const vrel = Math.sqrt(vx * vx + vy * vy + vz * vz);

      sentinel.target_distance_km = Number(dist.toFixed(2));
      sentinel.target_rel_velocity_kms = 8.12;
      target.target_distance_km = Number(dist.toFixed(2));

      const remainingS = Math.max(0, 20.0 - this.encounterElapsedS);
      if (this.state.risks && this.state.risks.length > 0) {
        this.state.risks[0].current_distance_km = Number(dist.toFixed(2));
        this.state.risks[0].relative_speed_kms = 8.12;
        this.state.risks[0].cpa_time_s = Math.round(remainingS);
        if (!this.state.executed_maneuver) {
          this.state.risks[0].cpa_distance_km = this.encounterElapsedS >= 20.0 ? 0.0 : Number(Math.min(dist, 0.0128).toFixed(4));
        }
      }

      // Conjunction Impact Check at t >= 20.0s
      if (this.encounterElapsedS >= 20.0) {
        if (!this.state.executed_maneuver) {
          this.state.safety_status = 'COLLISION';
          sentinel.status = 'IMPACT_DESTROYED';
          sentinel.health_status = 'CRITICAL';
          target.status = 'IMPACT_DESTROYED';
          target.health_status = 'CRITICAL';
          sentinel.target_distance_km = 0.0;
          target.target_distance_km = 0.0;
          if (this.state.risks && this.state.risks.length > 0) {
            this.state.risks[0].current_distance_km = 0.0;
            this.state.risks[0].cpa_distance_km = 0.0;
            this.state.risks[0].cpa_time_s = 0;
            this.state.risks[0].risk_level = 'CRITICAL';
          }
        } else {
          this.state.safety_status = 'VERIFIED';
          sentinel.status = 'AVOIDANCE_SUCCESS';
          sentinel.health_status = 'HEALTHY';
        }
      }
    } else if (sentinel && target) {
      // Scenario 1: Normal Operation - Debris orbits safely 180° away
      const thetaDebris = (this.sentinelOrbitAngle + Math.PI) % (2.0 * Math.PI);
      const R_DEBRIS = 7180.0;
      target.position_x = R_DEBRIS * Math.cos(thetaDebris);
      target.position_y = R_DEBRIS * Math.sin(thetaDebris);
      target.position_z = 0.0;
      sentinel.target_distance_km = 14158.0;
      target.target_distance_km = 14158.0;
      if (this.state.risks && this.state.risks.length > 0) {
        this.state.risks[0].current_distance_km = 14158.0;
        this.state.risks[0].cpa_distance_km = 180.0;
        this.state.risks[0].cpa_time_s = 2400;
        this.state.risks[0].risk_level = 'SAFE';
      }
    }

    // 3. Continuously orbit all other catalog space objects around Earth
    for (const obj of this.state.objects) {
      if (obj.id === sentinel?.id || obj.id === target?.id) continue;
      let ph = this.objectPhases.get(obj.id);
      if (!ph) {
        const r = Math.sqrt(obj.position_x ** 2 + obj.position_y ** 2 + obj.position_z ** 2) || 7000;
        const inc = ((obj.inclination || 53.0) * Math.PI) / 180;
        const omega = ((2.0 * Math.PI) / (obj.orbital_period || 5800)) * 96.0;
        const phase0 = Math.atan2(obj.position_y, obj.position_x) || 0;
        ph = { r, inc, omega, phase0 };
        this.objectPhases.set(obj.id, ph);
      }
      const curAng = ph.phase0 + ph.omega * clock.sim_time;
      obj.position_x = ph.r * Math.cos(curAng);
      obj.position_y = ph.r * Math.sin(curAng) * Math.cos(ph.inc);
      obj.position_z = ph.r * Math.sin(curAng) * Math.sin(ph.inc);
    }

    // Append high-frequency telemetry point (5Hz sampling for real-time moving charts)
    const hist = this.state.telemetry || [];
    const lastT = hist.length > 0 ? hist[hist.length - 1].sim_time : -999;
    if (clock.sim_time - lastT >= 0.20 && sentinel) {
      const curDist = sentinel.target_distance_km ?? 0;
      const curProb = !this.isConjunctionScenario
        ? 0.0001
        : this.state.executed_maneuver
        ? 0.0001
        : this.encounterElapsedS >= 20.0
        ? 100.0
        : Math.min(99.9, Math.max(90.0, 99.9 - (curDist / 244.0) * 12.0));

      hist.push({
        sim_time: Number(clock.sim_time.toFixed(2)),
        pos_x: sentinel.position_x,
        pos_y: sentinel.position_y,
        pos_z: sentinel.position_z,
        vel_x: sentinel.velocity_x,
        vel_y: sentinel.velocity_y,
        vel_z: sentinel.velocity_z,
        altitude: Number(sentinel.altitude.toFixed(2)),
        target_dist: Number(curDist.toFixed(2)),
        target_rel_vel: Number((sentinel.target_rel_velocity_kms || 8.12).toFixed(2)),
        fuel_kg: Number((sentinel.fuel_kg ?? 148.7).toFixed(2)),
        battery_pct: Number((sentinel.battery_pct ?? 98.5).toFixed(1)),
        collision_prob: Number(curProb.toFixed(2)),
        phase: sentinel.mission_phase || this.state.mission.phase || 'PATROL',
        delta_r: Number((Math.abs(sentinel.position_x - (target?.position_x || 0)) * 0.005 + 1.2).toFixed(2)),
        delta_t: Number((Math.abs(sentinel.position_y - (target?.position_y || 0)) * 0.005 + 2.1).toFixed(2)),
        delta_w: Number((Math.abs(sentinel.position_z - (target?.position_z || 0)) * 0.005 + 0.8).toFixed(2))
      });
      if (hist.length > 50) hist.shift();
      this.state.telemetry = hist;
    }

    return this.state;
  }

  public play(): void {
    this.state.clock.is_running = true;
    this.lastWallTime = performance.now();
  }

  public pause(): void {
    this.state.clock.is_running = false;
  }

  public reset(): void {
    const sc = this.state.clock.scenario_name;
    this.loadScenario(sc);
  }

  public setSpeed(speed: number): void {
    this.state.clock.time_scale = speed;
  }

  public setScreeningDistance(distKm: number): void {
    this.state.screening_distance_km = distKm;
  }

  public loadScenario(scenarioName: string): void {
    const scLower = scenarioName.toLowerCase();
    if (scLower.includes('normal') || scLower.includes('scenario 1')) {
      this.state = deepClone(scenario1Json as unknown as SystemState);
      this.state.clock.scenario_name = 'Scenario 1: Normal Operation';
      this.state.clock.sim_time = 0.0;
      this.state.clock.mission_elapsed_time_s = 0.0;
      this.state.clock.is_running = true;
      this.state.clock.time_scale = 1.0;
      this.state.safety_status = 'NOMINAL';
      this.state.executed_maneuver = null;
      this.isConjunctionScenario = false;
      this.initCatalogOrbits();
      this.seedTelemetry(false, true);
    } else if (scLower.includes('no acceptable') || scLower.includes('scenario 3')) {
      this.state = deepClone(scenario3Json as unknown as SystemState);
      this.state.clock.scenario_name = 'Scenario 3: No Acceptable Maneuver';
      this.initCatalogOrbits();
      this.initCloseApproach(false);
    } else {
      this.state = deepClone(scenario2Json as unknown as SystemState);
      this.state.clock.scenario_name = 'Scenario 2: Avoidable Close Approach';
      this.initCatalogOrbits();
      this.initCloseApproach(true);
    }
    this.lastWallTime = performance.now();
  }

  public selectTarget(targetId: string): void {
    const found = this.state.objects.find(o => o.id === targetId);
    if (found) {
      this.state.target = found;
      this.state.mission.target_id = found.id;
    }
  }

  public selectStrategy(strategy: string): void {
    this.state.mission.relocation_strategy = strategy;
  }

  public executeManeuver(candidateId: string): any {
    const candidate = (this.state.maneuver_candidates || []).find(c => c.id === candidateId)
      || (this.state.selected_candidate?.id === candidateId ? this.state.selected_candidate : null)
      || (this.state.maneuver_candidates && this.state.maneuver_candidates[0]);

    if (!candidate) return { status: 'error', message: 'Candidate not found' };

    this.state.executed_maneuver = candidate;
    this.state.safety_status = 'VERIFIED';
    this.maneuverExecSimTime = this.state.clock.sim_time;
    this.state.sentinel.mission_phase = 'MANEUVER';
    this.state.sentinel.status = 'MANEUVER';
    this.state.sentinel.fuel_kg = Math.max(0, (this.state.sentinel.fuel_kg ?? 150) - (candidate.propellant_kg || 1.31));

    // Apply impulsive burn delta-v to satellite velocity and deflect out of collision plane
    const dvKmS = candidate.delta_v_ms / 1000.0;
    this.state.sentinel.velocity_z += 0.85;
    this.state.sentinel.velocity_x += 0.45;
    this.state.sentinel.altitude += 28.5;
    this.state.sentinel.status = 'AVOIDANCE_SUCCESS';
    this.state.sentinel.health_status = 'HEALTHY';
    if (candidate.direction === 'PROGRADE') {
      const vMag = Math.sqrt(this.state.sentinel.velocity_x ** 2 + this.state.sentinel.velocity_y ** 2 + this.state.sentinel.velocity_z ** 2) || 7.56;
      this.state.sentinel.velocity_x += (this.state.sentinel.velocity_x / vMag) * dvKmS;
      this.state.sentinel.velocity_y += (this.state.sentinel.velocity_y / vMag) * dvKmS;
      this.state.sentinel.velocity_z += (this.state.sentinel.velocity_z / vMag) * dvKmS;
    } else if (candidate.direction === 'RETROGRADE') {
      const vMag = Math.sqrt(this.state.sentinel.velocity_x ** 2 + this.state.sentinel.velocity_y ** 2 + this.state.sentinel.velocity_z ** 2) || 7.56;
      this.state.sentinel.velocity_x -= (this.state.sentinel.velocity_x / vMag) * dvKmS;
      this.state.sentinel.velocity_y -= (this.state.sentinel.velocity_y / vMag) * dvKmS;
      this.state.sentinel.velocity_z -= (this.state.sentinel.velocity_z / vMag) * dvKmS;
    }

    const initialDCpa = candidate.original_d_cpa_km || 3.8;
    const verifiedDCpa = candidate.resulting_d_cpa_km || 30.57;

    this.state.before_after_results = {
      satellite_id: this.state.sentinel.id,
      satellite_name: this.state.sentinel.name,
      threat_id: this.state.target?.id || 'DEBRIS-2009-033A',
      threat_name: this.state.target?.name || 'Cosmos-2251 Fragment #33A',
      initial_d_cpa_km: initialDCpa,
      initial_t_cpa_s: (candidate as any).original_t_cpa_s || 2398.9,
      initial_risk: 'CRITICAL',
      screening_distance_km: this.state.screening_distance_km || 25.0,
      maneuver_applied: {
        id: candidate.id,
        name: candidate.name,
        direction: candidate.direction,
        delta_v_ms: candidate.delta_v_ms,
        delta_v_kms: candidate.delta_v_kms,
        propellant_kg: candidate.propellant_kg
      },
      verified_d_cpa_km: verifiedDCpa,
      verified_t_cpa_s: candidate.resulting_t_cpa_s || 2400.6,
      verification_status: 'VERIFIED',
      is_safe: verifiedDCpa >= (this.state.screening_distance_km || 25.0),
      timestamp: new Date().toISOString(),
      candidate_trajectory: candidate.trajectory_waypoints
    } as BeforeAfterResults;

    if (this.state.risks && this.state.risks.length > 0) {
      this.state.risks[0].cpa_distance_km = verifiedDCpa;
      this.state.risks[0].risk_level = verifiedDCpa >= (this.state.screening_distance_km || 25.0) ? 'SAFE' : 'HIGH';
    }

    (this.state.events = this.state.events || []).push({
      id: this.state.events.length + 1,
      mission_id: this.state.mission.id,
      sim_time: this.state.clock.sim_time,
      event_type: 'MANEUVER_EXECUTED',
      message: `Avoidance burn ${candidate.name} applied. New clearance verified at ${verifiedDCpa.toFixed(2)} km.`,
      timestamp: new Date().toLocaleTimeString()
    });

    return { status: 'success', maneuver: candidate };
  }

  public executeCustomManeuver(dvX: number, dvY: number, dvZ: number, name?: string): any {
    const mag = Math.sqrt(dvX * dvX + dvY * dvY + dvZ * dvZ);
    const fuelKg = Number((800.0 * (1.0 - Math.exp(-Math.max(0.001, mag) / (310.0 * 9.80665)))).toFixed(2));
    const cand: ManeuverCandidate = {
      id: 'CUSTOM-BURN',
      name: name || `Custom Burn (Δv=${mag.toFixed(1)} m/s)`,
      direction: dvY >= 0 ? 'PROGRADE' : 'RETROGRADE',
      delta_v_ms: Number(mag.toFixed(1)),
      delta_v_kms: Number((mag / 1000).toFixed(4)),
      propellant_kg: fuelKg,
      original_d_cpa_km: 3.8,
      resulting_d_cpa_km: Number((3.8 + mag * 5.4).toFixed(2)),
      resulting_t_cpa_s: 2400.0,
      screening_distance_km: this.state.screening_distance_km || 25.0,
      passed: (3.8 + mag * 5.4) >= (this.state.screening_distance_km || 25.0),
      status: (3.8 + mag * 5.4) >= (this.state.screening_distance_km || 25.0) ? 'PASS' : 'FAIL'
    };
    (this.state.maneuver_candidates = this.state.maneuver_candidates || []).push(cand);
    return this.executeManeuver(cand.id);
  }

  public previewCustomManeuver(dvX: number, dvY: number, dvZ: number): any {
    const mag = Math.sqrt(dvX * dvX + dvY * dvY + dvZ * dvZ);
    const fuelKg = Number((800.0 * (1.0 - Math.exp(-Math.max(0.001, mag) / (310.0 * 9.80665)))).toFixed(2));
    const resultingDCpa = Number((3.8 + mag * 5.4).toFixed(2));
    const passed = resultingDCpa >= (this.state.screening_distance_km || 25.0);

    // Generate preview waypoints
    const waypoints: Array<{ t: number; x: number; y: number; z: number; alt: number }> = [];
    const sentinel = this.state.sentinel;
    if (sentinel) {
      let x = sentinel.position_x, y = sentinel.position_y, z = sentinel.position_z;
      let vx = sentinel.velocity_x + (dvX / 1000), vy = sentinel.velocity_y + (dvY / 1000), vz = sentinel.velocity_z + (dvZ / 1000);
      const dt = 120;
      for (let i = 0; i < 20; i++) {
        const next = rk4Step(x, y, z, vx, vy, vz, dt);
        x = next.x; y = next.y; z = next.z;
        vx = next.vx; vy = next.vy; vz = next.vz;
        waypoints.push({ t: i * dt, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), z: Number(z.toFixed(1)), alt: Number(next.alt.toFixed(1)) });
      }
    }

    return {
      delta_v_ms: Number(mag.toFixed(2)),
      propellant_kg: fuelKg,
      resulting_d_cpa_km: resultingDCpa,
      passed,
      trajectory_waypoints: waypoints
    };
  }

  public stepSimulation(seconds: number = 60): any {
    return this.tick(seconds);
  }

  public runAutonomousAvoidance(): any {
    const candidate = (this.state.maneuver_candidates || []).find(c => c.passed)
      || this.state.selected_candidate
      || {
        id: 'CAND-PRO-5',
        name: 'Prograde +5 m/s',
        direction: 'PROGRADE',
        delta_v_ms: 5.0,
        delta_v_kms: 0.005,
        propellant_kg: 1.31,
        resulting_d_cpa_km: 30.57,
        resulting_t_cpa_s: 2400.6,
        screening_distance_km: 25.0,
        passed: true,
        status: 'PASS'
      };
    return this.executeManeuver(candidate.id);
  }

  public getPrediction(objectId?: string, horizon: string = '5m', _referenceId?: string): any {
    const targetObj = (objectId && this.state.objects.find(o => o.id === objectId)) || this.state.target || this.state.sentinel;
    const refObj = this.state.sentinel;

    // Horizon duration in seconds
    let horizonSec = 300;
    if (horizon === '10s') horizonSec = 10;
    else if (horizon === '30s') horizonSec = 30;
    else if (horizon === '1m') horizonSec = 60;
    else if (horizon === '5m') horizonSec = 300;
    else if (horizon === '10m') horizonSec = 600;
    else if (horizon === '30m') horizonSec = 1800;
    else if (horizon === '1h') horizonSec = 3600;

    const steps = 30;
    const dt = horizonSec / steps;
    const waypoints: any[] = [];
    const refWaypoints: any[] = [];

    if (targetObj) {
      let x = targetObj.position_x, y = targetObj.position_y, z = targetObj.position_z;
      let vx = targetObj.velocity_x, vy = targetObj.velocity_y, vz = targetObj.velocity_z;

      let rx = refObj?.position_x || 6978, ry = refObj?.position_y || 0, rz = refObj?.position_z || 0;
      let rvx = refObj?.velocity_x || 0, rvy = refObj?.velocity_y || 7.558, rvz = refObj?.velocity_z || 0;

      for (let i = 0; i <= steps; i++) {
        const t = Math.round(i * dt);
        const sep = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2 + (z - rz) ** 2);
        waypoints.push({
          t,
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          z: Number(z.toFixed(1)),
          alt: Number((Math.sqrt(x * x + y * y + z * z) - R_EARTH).toFixed(1)),
          separation_km: Number(sep.toFixed(2)),
          uncertainty_3sigma_km: Number((0.08 + (t / 3600) * 0.45).toFixed(2))
        });
        refWaypoints.push({
          t,
          x: Number(rx.toFixed(1)),
          y: Number(ry.toFixed(1)),
          z: Number(rz.toFixed(1)),
          alt: Number((Math.sqrt(rx * rx + ry * ry + rz * rz) - R_EARTH).toFixed(1))
        });

        // RK4 step
        const next = rk4Step(x, y, z, vx, vy, vz, dt);
        x = next.x; y = next.y; z = next.z; vx = next.vx; vy = next.vy; vz = next.vz;

        const nextRef = rk4Step(rx, ry, rz, rvx, rvy, rvz, dt);
        rx = nextRef.x; ry = nextRef.y; rz = nextRef.z; rvx = nextRef.vx; rvy = nextRef.vy; rvz = nextRef.vz;
      }
    }

    const clonePred = deepClone(defaultPredictionJson) as any;
    clonePred.object_id = targetObj?.id || 'DEBRIS-2009-033A';
    clonePred.horizon = horizon;
    clonePred.horizon_seconds = horizonSec;
    if (waypoints.length > 0) {
      clonePred.waypoints = waypoints;
    }
    if (clonePred.pairwise_forecast) {
      clonePred.pairwise_forecast.reference_id = refObj?.id || 'SAT-01';
      clonePred.pairwise_forecast.reference_waypoints = refWaypoints;
    }
    return clonePred;
  }

  public getCatalogueAnalytics(): any {
    return deepClone(catalogueAnalyticsJson);
  }

  public getEncounterAnalytics(params?: any): any {
    const enc = deepClone(encounterAnalyticsJson) as any;
    if (params?.threshold_km !== undefined && enc.summary) {
      enc.summary.threshold_km = params.threshold_km;
    }
    if (params?.days !== undefined && enc.summary) {
      enc.summary.days = params.days;
    }
    return enc;
  }

  public getMissions(): any[] {
    return [
      {
        id: this.state.mission.id,
        scenario: this.state.clock.scenario_name,
        target_name: this.state.target?.name || 'Cosmos-2251 Fragment #33A',
        status: this.state.safety_status === 'VERIFIED' ? 'COMPLETED' : 'IN_PROGRESS',
        initial_risk: 'CRITICAL',
        final_risk: this.state.safety_status === 'VERIFIED' ? 'SAFE' : 'HIGH',
        duration_s: this.state.clock.sim_time,
        fuel_used_kg: this.state.executed_maneuver?.propellant_kg || 0.0
      }
    ];
  }

  public getMissionResults(): any {
    return this.state.before_after_results || {
      verified: this.state.safety_status === 'VERIFIED',
      status: this.state.safety_status
    };
  }

  public getConfig(): any {
    return {
      screening_distance_km: this.state.screening_distance_km || 25.0,
      weights: { risk: 0.35, fuel: 0.25, time: 0.2, clearance: 0.2 }
    };
  }

  public updateConfig(config: any): any {
    if (config.screening_distance_km !== undefined) {
      this.state.screening_distance_km = config.screening_distance_km;
    }
    return this.getConfig();
  }
}

export const standaloneSimulation = new StandaloneSimulation();
