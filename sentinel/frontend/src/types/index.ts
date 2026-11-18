export type ObjectType = 
  | 'SERVICE_VEHICLE'
  | 'ACTIVE_SATELLITE'
  | 'FAILED_SATELLITE'
  | 'DEBRIS'
  | 'UNKNOWN';

export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'NON-RESPONSIVE' | 'DEBRIS' | 'UNKNOWN';

export type MissionPhase = 
  | 'IDLE'
  | 'TARGET_SELECTION'
  | 'TRACKING'
  | 'PREDICTION'
  | 'INTERCEPT_PLANNING'
  | 'INTERCEPTING'
  | 'RENDEZVOUS'
  | 'INSPECTION'
  | 'CAPTURE'
  | 'MANEUVER'
  | 'SAFE_TRAJECTORY'
  | 'MISSION_COMPLETE'
  | 'ABORT';

export interface OrbitalObject {
  id: string;
  name: string;
  object_type: ObjectType;
  status: string;
  mission_phase?: string;
  timestamp: number;
  position_x: number;
  position_y: number;
  position_z: number;
  velocity_x: number;
  velocity_y: number;
  velocity_z: number;
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  altitude: number;
  inclination: number;
  eccentricity: number;
  orbital_period: number;
  mass: number;
  fuel_kg?: number;
  battery_pct?: number;
  health_status: HealthStatus;
  risk_level: RiskLevel;
  target_distance_km?: number;
  target_rel_velocity_kms?: number;
  metadata?: {
    source?: string;
    derived?: boolean;
    optical_image_id?: number;
    bbox_index?: number;
    raw_bbox?: number[];
    apparent_pixel_size?: number;
    apparent_cross_section_m2?: number;
    image_path?: string;
    tumble_rate_deg_s?: number;
    anomaly?: string;
    predicted_cpa_km?: number;
    cpa_time_s?: number;
    relative_velocity_kms?: number;
    [key: string]: any;
  };
}

export interface SimulationClock {
  is_running: boolean;
  sim_time: number;
  mission_elapsed_time_s: number;
  real_time: string;
  time_scale: number;
  mode: 'SIMULATION' | 'DATASET_REPLAY';
  scenario_name: string;
}

export interface RiskAssessment {
  object_a_id: string;
  object_a_name: string;
  object_b_id: string;
  object_b_name: string;
  current_distance_km: number;
  relative_speed_kms: number;
  cpa_time_s: number;
  cpa_distance_km: number;
  collision_probability: number;
  risk_level: RiskLevel;
  is_diverging: boolean;
}

export interface AIRecommendation {
  recommendation: string;
  reason: string;
  affected_target?: string | null;
  confidence: number;
  urgency: 'IMMEDIATE' | 'HIGH' | 'NORMAL' | 'LOW';
  safety_validated: boolean;
}

export interface AnomalyReport {
  anomaly_detected: boolean;
  anomaly_score: number;
  affected_parameter: string;
  reason: string;
  recommended_action: string;
  all_anomalies?: Array<{
    param: string;
    score: number;
    reason: string;
    action: string;
  }>;
}

export interface RankedTarget {
  object_id: string;
  name: string;
  total_score: number;
  distance_km: number;
  breakdown: {
    risk_component: number;
    health_component: number;
    collision_component: number;
    accessibility_component: number;
    priority_component: number;
  };
}

export interface MissionEvent {
  id: number;
  mission_id: string;
  sim_time: number;
  event_type: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface TelemetryPoint {
  sim_time: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  vel_x: number;
  vel_y: number;
  vel_z: number;
  altitude: number;
  target_dist: number;
  target_rel_vel: number;
  fuel_kg: number;
  battery_pct: number;
  phase: string;
  collision_prob?: number;
  delta_r?: number;
  delta_t?: number;
  delta_w?: number;
}

export type SafetyStatus = 
  | 'MONITORING' 
  | 'WARNING' 
  | 'CRITICAL' 
  | 'EVALUATING' 
  | 'VERIFIED' 
  | 'REVIEW REQUIRED' 
  | 'COLLISION' 
  | 'NOMINAL' 
  | 'SAFE';

export interface ManeuverCandidate {
  id: string;
  name: string;
  direction: 'PROGRADE' | 'RETROGRADE' | 'RADIAL+' | 'RADIAL-';
  delta_v_ms: number;
  delta_v_kms: number;
  propellant_kg: number;
  original_d_cpa_km: number;
  resulting_d_cpa_km: number;
  resulting_t_cpa_s: number;
  screening_distance_km: number;
  passed: boolean;
  status: 'PASS' | 'FAIL';
  trajectory_waypoints?: Array<{ t: number; x: number; y: number; z: number; alt: number }>;
}

export interface BeforeAfterResults {
  satellite_id: string;
  satellite_name: string;
  threat_id: string;
  threat_name: string;
  initial_d_cpa_km: number;
  initial_t_cpa_s: number;
  initial_risk: string;
  screening_distance_km: number;
  maneuver_applied: {
    id: string;
    name: string;
    direction: string;
    delta_v_ms: number;
    delta_v_kms: number;
    propellant_kg: number;
  };
  verified_d_cpa_km: number;
  verified_t_cpa_s: number;
  verification_status: SafetyStatus;
  is_safe: boolean;
  timestamp: string;
  candidate_trajectory?: Array<{ t: number; x: number; y: number; z: number; alt: number }>;
}

export interface SystemState {
  clock: SimulationClock;
  mission: {
    id: string;
    phase: MissionPhase;
    target_id: string | null;
    relocation_strategy: string;
    capture_step: number;
    inspection_data: any;
    maneuver_data: any;
    intercept_plan: any;
    success: boolean;
  };
  safety_status?: SafetyStatus;
  screening_distance_km?: number;
  decision_rationale?: string;
  maneuver_candidates?: ManeuverCandidate[];
  selected_candidate?: ManeuverCandidate | null;
  executed_maneuver?: ManeuverCandidate | null;
  before_after_results?: BeforeAfterResults | null;
  autonomous_avoidance_active?: boolean;
  sentinel: OrbitalObject;
  target: OrbitalObject | null;
  objects: OrbitalObject[];
  risks: RiskAssessment[];
  recommendation: AIRecommendation;
  anomaly: AnomalyReport;
  ranked_targets: RankedTarget[];
  events: MissionEvent[];
  telemetry: TelemetryPoint[];
}
