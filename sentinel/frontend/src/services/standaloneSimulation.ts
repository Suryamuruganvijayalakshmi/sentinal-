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
  private maneuverExecSimTime: number = 0;

  constructor() {
    this.state = deepClone(scenario2Json as unknown as SystemState);
    this.initCloseApproach(true);
  }

  private initCloseApproach(canAvoid: boolean): void {
    const R = 6978.137;
    const THETA_SPAN = (45.0 * Math.PI) / 180; // 45° visible arc traverse across orbit
    const inc = (65.0 * Math.PI) / 180;

    // Sentinel at t=0 (starts 45° back on equatorial orbit)
    const theta_s = -THETA_SPAN;
    const pos_s0 = [R * Math.cos(theta_s), R * Math.sin(theta_s), 0.0];
    const vel_s0 = [-7.558 * Math.sin(theta_s), 7.558 * Math.cos(theta_s), 0.0];

    // Debris at t=0 (starts 45° back on 65° inclined plane)
    const theta_d = -THETA_SPAN;
    const pos_d0 = [
      R * Math.cos(theta_d),
      R * Math.sin(theta_d) * Math.cos(inc),
      R * Math.sin(theta_d) * Math.sin(inc)
    ];
    const vel_d0 = [
      -7.558 * Math.sin(theta_d),
      7.558 * Math.cos(theta_d) * Math.cos(inc),
      7.558 * Math.cos(theta_d) * Math.sin(inc)
    ];

    const sent = this.state.sentinel || this.state.objects[0];
    if (sent) {
      sent.id = 'SAT-01';
      sent.name = "SAT-A34 'SENTINEL'";
      sent.position_x = pos_s0[0];
      sent.position_y = pos_s0[1];
      sent.position_z = pos_s0[2];
      sent.velocity_x = vel_s0[0];
      sent.velocity_y = vel_s0[1];
      sent.velocity_z = vel_s0[2];
      sent.altitude = 600.0;
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
      tgt.position_x = pos_d0[0];
      tgt.position_y = pos_d0[1];
      tgt.position_z = pos_d0[2];
      tgt.velocity_x = vel_d0[0];
      tgt.velocity_y = vel_d0[1];
      tgt.velocity_z = vel_d0[2];
      tgt.altitude = 600.0;
      tgt.status = 'COLLISION_VECTOR';
      tgt.health_status = 'CRITICAL';
      this.state.target = tgt;
    }

    const sObj = this.state.objects.find(o => o.id === sent?.id);
    if (sObj && sent) Object.assign(sObj, sent);
    const tObj = this.state.objects.find(o => o.id === tgt?.id);
    if (tObj && tgt) Object.assign(tObj, tgt);

    this.state.clock.sim_time = 0.0;
    this.state.clock.mission_elapsed_time_s = 0.0;
    this.state.clock.is_running = true;
    this.state.clock.time_scale = 1.0;
    this.state.executed_maneuver = null;
    this.state.safety_status = 'WARNING';
    this.maneuverExecSimTime = 0;

    const initDist = Math.sqrt(
      (pos_d0[0] - pos_s0[0]) ** 2 +
      (pos_d0[1] - pos_s0[1]) ** 2 +
      (pos_d0[2] - pos_s0[2]) ** 2
    );

    if (this.state.risks && this.state.risks.length > 0) {
      this.state.risks[0].current_distance_km = Number(initDist.toFixed(1));
      this.state.risks[0].cpa_time_s = 20.0;
      this.state.risks[0].cpa_distance_km = 0.0;
      this.state.risks[0].relative_speed_kms = 8.12;
      this.state.risks[0].risk_level = 'CRITICAL';
    }
  }

  public getState(): SystemState {
    return this.tick();
  }

  public tick(customDtSim?: number): SystemState {
    const now = performance.now();
    const wallDtSec = Math.max(0.001, Math.min(1.0, (now - this.lastWallTime) / 1000));
    this.lastWallTime = now;

    const clock = this.state.clock;
    if (!clock.is_running && customDtSim === undefined) {
      return this.state;
    }

    const dtSim = customDtSim !== undefined ? customDtSim : wallDtSec * (clock.time_scale || 1.0);
    clock.sim_time = Number((clock.sim_time + dtSim).toFixed(2));
    clock.mission_elapsed_time_s = Number((clock.mission_elapsed_time_s + dtSim).toFixed(1));

    const sentinel = this.state.objects.find(o => o.id === (this.state.sentinel?.id || 'SAT-01')) || this.state.objects[0];
    if (sentinel) {
      this.state.sentinel = sentinel;
    }

    const target = this.state.target ? this.state.objects.find(o => o.id === this.state.target!.id) : null;
    if (target) {
      this.state.target = target;
    }

    const isConjunctionScenario =
      this.state.clock.scenario_name.includes('Close Approach') ||
      this.state.clock.scenario_name.includes('No Acceptable');

    // Propagate background satellites & debris using RK4 central gravity
    const subSteps = Math.max(1, Math.min(10, Math.ceil(Math.abs(dtSim) / 5.0)));
    const subDt = dtSim / subSteps;
    for (let s = 0; s < subSteps; s++) {
      for (const obj of this.state.objects) {
        if (isConjunctionScenario && (obj.id === sentinel?.id || obj.id === target?.id)) {
          continue; // Driven by the exact converging approach equations below
        }
        const next = rk4Step(
          obj.position_x, obj.position_y, obj.position_z,
          obj.velocity_x, obj.velocity_y, obj.velocity_z,
          subDt
        );
        obj.position_x = next.x;
        obj.position_y = next.y;
        obj.position_z = next.z;
        obj.velocity_x = next.vx;
        obj.velocity_y = next.vy;
        obj.velocity_z = next.vz;
        obj.altitude = next.alt;
      }
    }

    // Dynamic 20-Second Converging Conjunction Trajectory
    if (isConjunctionScenario && sentinel && target) {
      const T_ENCOUNTER = 20.0;
      const THETA_SPAN = (45.0 * Math.PI) / 180;
      const INC = (65.0 * Math.PI) / 180;
      const R = 6978.137;

      const tau = Math.min(1.0, clock.sim_time / T_ENCOUNTER);
      const thetaS = -THETA_SPAN * (1.0 - tau);
      const thetaD = -THETA_SPAN * (1.0 - tau);

      // If avoidance burn is executed, Sentinel cleanly deflects +32.5 km upward
      const avoidAlt = this.state.executed_maneuver
        ? Math.min(32.5, Math.max(0, (clock.sim_time - this.maneuverExecSimTime) * 6.5))
        : 0.0;
      const curRadiusS = R + avoidAlt;

      if (clock.sim_time < 20.0 || this.state.executed_maneuver) {
        sentinel.position_x = curRadiusS * Math.cos(thetaS);
        sentinel.position_y = curRadiusS * Math.sin(thetaS);
        sentinel.position_z = 0.0;
        sentinel.velocity_x = -7.558 * Math.sin(thetaS);
        sentinel.velocity_y = 7.558 * Math.cos(thetaS);
        sentinel.velocity_z = 0.0;
        sentinel.altitude = 600.0 + avoidAlt;

        target.position_x = R * Math.cos(thetaD);
        target.position_y = R * Math.sin(thetaD) * Math.cos(INC);
        target.position_z = R * Math.sin(thetaD) * Math.sin(INC);
        target.velocity_x = -7.558 * Math.sin(thetaD);
        target.velocity_y = 7.558 * Math.cos(thetaD) * Math.cos(INC);
        target.velocity_z = 7.558 * Math.cos(thetaD) * Math.sin(INC);
        target.altitude = 600.0;
      }

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
      sentinel.target_rel_velocity_kms = Number(vrel.toFixed(3));
      target.target_distance_km = Number(dist.toFixed(2));

      const remainingS = Math.max(0, 20.0 - clock.sim_time);
      if (this.state.risks && this.state.risks.length > 0) {
        this.state.risks[0].current_distance_km = Number(dist.toFixed(2));
        this.state.risks[0].relative_speed_kms = Number(vrel.toFixed(2));
        this.state.risks[0].cpa_time_s = Math.round(remainingS);
        if (!this.state.executed_maneuver) {
          this.state.risks[0].cpa_distance_km = clock.sim_time >= 20.0 ? 0.0 : Number(Math.min(dist, 0.0128).toFixed(4));
        }
      }

      // Conjunction Impact Check at t >= 20.0s
      if (clock.sim_time >= 20.0) {
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
      // Scenario 1 normal operation separation
      const rx = target.position_x - sentinel.position_x;
      const ry = target.position_y - sentinel.position_y;
      const rz = target.position_z - sentinel.position_z;
      const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
      sentinel.target_distance_km = Number(dist.toFixed(2));
      target.target_distance_km = Number(dist.toFixed(2));
    }

    // Append downsampled telemetry point
    const hist = this.state.telemetry || [];
    const lastT = hist.length > 0 ? hist[hist.length - 1].sim_time : -999;
    if (clock.sim_time - lastT >= 1.0 && sentinel) {
      hist.push({
        sim_time: Number(clock.sim_time.toFixed(1)),
        pos_x: sentinel.position_x,
        pos_y: sentinel.position_y,
        pos_z: sentinel.position_z,
        vel_x: sentinel.velocity_x,
        vel_y: sentinel.velocity_y,
        vel_z: sentinel.velocity_z,
        altitude: Number(sentinel.altitude.toFixed(2)),
        target_dist: sentinel.target_distance_km || 0,
        target_rel_vel: sentinel.target_rel_velocity_kms || 0,
        fuel_kg: Number((sentinel.fuel_kg ?? 148.7).toFixed(2)),
        battery_pct: Number((sentinel.battery_pct ?? 98.5).toFixed(1)),
        phase: sentinel.mission_phase || this.state.mission.phase || 'PATROL'
      });
      if (hist.length > 300) hist.shift();
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
    } else if (scLower.includes('no acceptable') || scLower.includes('scenario 3')) {
      this.state = deepClone(scenario3Json as unknown as SystemState);
      this.state.clock.scenario_name = 'Scenario 3: No Acceptable Maneuver';
      this.initCloseApproach(false);
    } else {
      this.state = deepClone(scenario2Json as unknown as SystemState);
      this.state.clock.scenario_name = 'Scenario 2: Avoidable Close Approach';
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
