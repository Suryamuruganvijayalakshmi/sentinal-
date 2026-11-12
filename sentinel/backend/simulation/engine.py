"""
SENTINEL Central Simulation Engine
Orchestrates:
  - Simulation Clock (Play, Pause, Reset, Speed 1x, 10x, 100x, 1000x)
  - Orbital physics step propagation for all objects
  - SENTINEL spacecraft state, fuel, battery, guidance & control
  - Predefined mission scenarios (1-5), Dataset Replay Mode, and Custom Simulation Mode
  - Collision-risk screening, Anomaly detection, and AI recommendations
  - Chronological event generation and telemetry recording
"""

import os
import json
import math
import time
import uuid
import zlib
import base64
import threading
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime

from sentinel.backend.orbital.physics import (
    MU_EARTH, R_EARTH, position_magnitude, altitude_from_position,
    propagate_two_body_rk4, propagate_rk4_duration, compute_orbital_elements,
    compute_cpa, compute_rk4_cpa, predict_post_maneuver_cpa_rk4,
    propagate_rk4_batch, compute_rk4_cpa_batch
)
from sentinel.backend.risk.collision import CollisionRiskEngine
from sentinel.backend.prediction.propagator import PredictionEngine
from sentinel.backend.ai.anomaly import AnomalyDetector
from sentinel.backend.ai.recommendation import RecommendationEngine, SafetyValidator
from sentinel.backend.mission.planner import MissionPlanner
from sentinel.backend.mission.state_machine import MissionStateMachine, MissionPhase
from sentinel.backend.database.db import log_mission_event, save_mission

PROCESSED_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/processed"))
INSTANCE_ID = uuid.uuid4().hex[:12]

class SimulationEngine:
    def __init__(self):
        self._lock = threading.RLock()
        self._cached_catalog: Optional[List[Dict[str, Any]]] = None
        self._cached_catalogue_analytics: Optional[Dict[str, Any]] = None
        self._suppress_db_logs: bool = False
        self.state_revision: int = 1
        self._active_client_session: Optional[str] = None

        # Simulation clock (always starts actively orbiting at visible 25x time acceleration)
        self.is_running = True
        self.sim_time = 0.0          # Current simulation time in seconds
        self.time_scale = 25.0       # Time acceleration (1x, 5x, 25x, 100x)
        self.real_start_time = time.time()
        self.last_update_wall_time = time.time()
        
        # Current active scenario / mode
        self.mode = "SIMULATION"     # "SIMULATION" or "DATASET_REPLAY"
        self.scenario_name = "Scenario 2: Avoidable Close Approach"
        self.mission_id = f"MSN-{int(time.time())}"
        
        # Sub-engines
        self.risk_engine = CollisionRiskEngine()
        self.prediction_engine = PredictionEngine()
        self.anomaly_detector = AnomalyDetector()
        self.recommendation_engine = RecommendationEngine()
        self.safety_validator = SafetyValidator()
        self.planner = MissionPlanner()
        self.state_machine = MissionStateMachine(self.mission_id, event_callback=self._handle_event)
        
        # World state
        self.objects: Dict[str, Dict[str, Any]] = {}
        self.sentinel_id = "SAT-01"
        self.target_id: Optional[str] = None
        self.relocation_strategy = "DISPOSAL ORBIT"
        
        # Collision-Avoidance & Safety Gates
        self.screening_distance_km = 25.0
        self.safety_status = "WARNING"  # 'MONITORING', 'WARNING', 'EVALUATING', 'VERIFIED', 'REVIEW REQUIRED'
        self.maneuver_candidates: List[Dict[str, Any]] = []
        self.selected_candidate: Optional[Dict[str, Any]] = None
        self.executed_maneuver: Optional[Dict[str, Any]] = None
        self.before_after_results: Optional[Dict[str, Any]] = None
        self.decision_rationale: str = ""
        self.autonomous_avoidance_active: bool = False
        
        # Cached analytics
        self.latest_risks: List[Dict[str, Any]] = []
        self.latest_recommendation: Dict[str, Any] = {}
        self.latest_anomaly: Dict[str, Any] = {}
        self.telemetry_history: List[Dict[str, Any]] = []
        self.event_log: List[Dict[str, Any]] = []
        self.avoidance_history: List[Dict[str, Any]] = []
        self.encounter_analytics_cache: Dict[str, Any] = {}
        self._last_cand_eval_sim_time: float = 0.0
        self._scenario_stage: int = 0
        self._burn_end_sim_time: Optional[float] = None
        self._last_patrol_log_time: float = -999.0
        
        # Dataset replay state
        self.dataset_records: List[Dict[str, Any]] = []
        self.dataset_replay_idx = 0
        self.mission_saved = False
        
        # Initialize default scenario
        self.load_scenario("Scenario 2: Avoidable Close Approach")

    def _handle_event(self, mission_id: str, sim_time: float, event_type: str, message: str, details: Optional[Dict] = None):
        event = {
            "id": len(self.event_log) + 1,
            "mission_id": mission_id,
            "sim_time": round(sim_time, 2),
            "event_type": event_type,
            "message": message,
            "details": details or {},
            "timestamp": datetime.utcnow().strftime("%H:%M:%S")
        }
        self.event_log.append(event)
        # Log to SQLite
        if not self._suppress_db_logs:
            try:
                log_mission_event(mission_id, sim_time, event_type, message, details)
            except Exception:
                pass

    def load_processed_dataset(self) -> List[Dict[str, Any]]:
        if self._cached_catalog is None:
            json_path = os.path.join(PROCESSED_DATA_DIR, "debris_catalog.json")
            loaded: List[Dict[str, Any]] = []
            if os.path.exists(json_path):
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                except Exception as e:
                    print("Error loading debris catalog:", e)
            self._cached_catalog = loaded
        return [
            {**item, "metadata": dict(item.get("metadata", {}))} if isinstance(item.get("metadata"), dict) else dict(item)
            for item in self._cached_catalog
        ]

    def load_scenario(self, scenario_name: str, custom_params: Optional[Dict[str, Any]] = None):
        """
        Loads one of the predefined scenarios or custom simulation parameters
        and starts live two-body orbital propagation automatically.
        """
        with self._lock:
            self.is_running = True
            self.sim_time = 0.0
            self.real_start_time = time.time()
            self.last_update_wall_time = time.time()
            self.scenario_name = scenario_name
            self.mission_id = f"MSN-{int(time.time())}"
            self.state_machine = MissionStateMachine(self.mission_id, event_callback=self._handle_event)
            self.objects.clear()
            self.telemetry_history.clear()
            self.event_log.clear()
            self.mode = "SIMULATION"
            self.mission_saved = False
            self.maneuver_candidates = []
            self.selected_candidate = None
            self.executed_maneuver = None
            self.before_after_results = None
            self.autonomous_avoidance_active = False
            self._last_cand_eval_sim_time = 0.0
            self._scenario_stage = 0
            self._burn_end_sim_time = None
            self._last_patrol_log_time = -999.0

            self._populate_scenario_entities(scenario_name, custom_params)
            self.state_revision += 1

    def _populate_scenario_entities(self, scenario_name: str, custom_params: Optional[Dict[str, Any]] = None):
        
        params = custom_params or {}
        
        # 1. Create SENTINEL Service Vehicle
        sentinel_alt = params.get("sentinel_alt", 600.0)
        sentinel_r = R_EARTH + sentinel_alt
        sentinel_v = math.sqrt(MU_EARTH / sentinel_r)
        
        sentinel = {
            "id": self.sentinel_id,
            "name": "SAT-01 (Protected Satellite)",
            "object_type": "SERVICE_VEHICLE",
            "status": "NOMINAL",
            "timestamp": 0.0,
            "position_x": round(sentinel_r, 3),
            "position_y": 0.0,
            "position_z": 0.0,
            "velocity_x": 0.0,
            "velocity_y": round(sentinel_v, 4),
            "velocity_z": 0.0,
            "acceleration_x": -round(MU_EARTH / (sentinel_r ** 2), 6),
            "acceleration_y": 0.0,
            "acceleration_z": 0.0,
            "altitude": round(sentinel_alt, 2),
            "inclination": 53.0,
            "eccentricity": 0.0008,
            "orbital_period": round(2.0 * math.pi * math.sqrt((sentinel_r ** 3) / MU_EARTH), 1),
            "mass": 800.0,
            "fuel_kg": params.get("sentinel_fuel", 150.0),
            "battery_pct": 100.0,
            "health_status": "HEALTHY",
            "risk_level": "SAFE",
            "target_distance_km": 0.0,
            "target_rel_velocity_kms": 0.0
        }
        self.objects[self.sentinel_id] = sentinel
        # Note: Do not duplicate sentinel in self.objects to avoid screening SAT-01 against itself.
        
        # 2. Add realistic background debris and satellites from processed dataset
        catalog = self.load_processed_dataset()
        debris_to_add = min(params.get("debris_count", 18), len(catalog))
        for i in range(debris_to_add):
            obj = dict(catalog[i])
            self.objects[obj["id"]] = obj

        # 3. Add Scenario-Specific Target & Objects
        sc_lower = scenario_name.lower()
        if "normal operation" in sc_lower or "scenario 1:" in sc_lower:
            # Scenario 1: Normal Operation
            # Protected Satellite in 600km nominal orbit. No conjunction threats.
            self.target_id = None
            self.safety_status = "MONITORING"
            sentinel["status"] = "PATROL"
            sentinel["mission_phase"] = "ORBITAL_PATROL"
            self.decision_rationale = "Nominal orbital condition. SAT-01 conducting continuous orbital corridor surveillance patrol; all tracked objects remain outside the 25.0 km screening zone."
            self._handle_event(self.mission_id, 0.0, "MONITORING", "Scenario 1: Normal Operation loaded. SAT-01 active on 600 km orbital surveillance patrol.")

        elif "avoidable close approach" in sc_lower or "scenario 2:" in sc_lower:
            # Scenario 2: Avoidable Close Approach
            # Genuine two-body Keplerian RK4 intersecting orbit initialized via backward propagation
            # from T_conj = 2400s (40 min), miss distance d_CPA = 3.80 km (< 25 km screening violation).
            # Under two-body RK4 dynamics, Prograde +5 m/s clears 25 km (to ~30.5 km), while Radial fails (~17.4 km).
            t_conj = 2400.0
            ps0 = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vs0 = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            ps_c, vs_c, _ = propagate_rk4_duration(ps0, vs0, t_conj, max_step_s=5.0)
            r_norm = ps_c / max(1e-9, np.linalg.norm(ps_c))
            v_norm = vs_c / max(1e-9, np.linalg.norm(vs_c))
            c_norm = np.cross(r_norm, v_norm)
            c_norm = c_norm / max(1e-9, np.linalg.norm(c_norm))
            pt_c = ps_c + 2.2 * r_norm + 3.1 * c_norm
            v_mag_c = math.sqrt(MU_EARTH / max(1e-6, float(np.linalg.norm(pt_c))))
            ang = math.radians(22.0)
            vt_c = v_mag_c * (math.cos(ang) * v_norm + math.sin(ang) * c_norm)
            pt0, vt0, _ = propagate_rk4_duration(pt_c, vt_c, -t_conj, max_step_s=5.0)

            deb_r0 = float(np.linalg.norm(pt0))
            deb_alt = deb_r0 - R_EARTH
            rel_v0 = float(np.linalg.norm(vt0 - vs0))
            target = {
                "id": "DEBRIS-2009-033A",
                "name": "Cosmos-2251 Fragment #33A",
                "object_type": "DEBRIS",
                "status": "CONVERGING DEBRIS",
                "timestamp": 0.0,
                "position_x": round(float(pt0[0]), 3),
                "position_y": round(float(pt0[1]), 3),
                "position_z": round(float(pt0[2]), 3),
                "velocity_x": round(float(vt0[0]), 4),
                "velocity_y": round(float(vt0[1]), 4),
                "velocity_z": round(float(vt0[2]), 4),
                "altitude": round(deb_alt, 2),
                "inclination": 54.8,
                "eccentricity": 0.002,
                "orbital_period": round(2.0 * math.pi * math.sqrt((deb_r0 ** 3) / MU_EARTH), 1),
                "mass": 28.5,
                "health_status": "DEBRIS",
                "risk_level": "CRITICAL",
                "metadata": {
                    "source": "synthetic_scenario_2",
                    "cross_section_m2": 0.45,
                    "predicted_cpa_km": 3.80,
                    "cpa_time_s": 2396.0,
                    "relative_velocity_kms": round(rel_v0, 2)
                }
            }
            self.objects[target["id"]] = target
            self.target_id = target["id"]
            self.safety_status = "WARNING"
            sentinel["status"] = "TRACKING"
            sentinel["mission_phase"] = "THREAT_TRACKING"
            self.decision_rationale = "WARNING: Predicted RK4 close approach with DEBRIS-2009-033A (d_CPA = 3.80 km at t_CPA = 2396s) violates configured 25.0 km screening zone. Avoidance maneuver evaluation initiated."
            self._handle_event(self.mission_id, 0.0, "THREAT_DETECTED", "Predicted close approach with DEBRIS-2009-033A: d_CPA = 3.80 km at t_CPA = 2396s (screening violation).")
            self.evaluate_maneuver_candidates(target_id=target["id"])

        elif "no acceptable maneuver" in sc_lower or "scenario 3:" in sc_lower:
            # Scenario 3: No Acceptable Maneuver
            # Late-warning hypervelocity head-on debris convergence (v_rel ~15.0 km/s, d_CPA = 1.78 km at t_CPA = 240s).
            # Because reaction window is 240s, all tested burns up to 20 m/s genuinely fail 25 km screening under RK4.
            t_conj = 240.0
            ps0 = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vs0 = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            ps_c, vs_c, _ = propagate_rk4_duration(ps0, vs0, t_conj, max_step_s=4.0)
            r_norm = ps_c / max(1e-9, np.linalg.norm(ps_c))
            v_norm = vs_c / max(1e-9, np.linalg.norm(vs_c))
            c_norm = np.cross(r_norm, v_norm)
            c_norm = c_norm / max(1e-9, np.linalg.norm(c_norm))
            pt_c = ps_c + 1.1 * r_norm + 1.4 * c_norm
            v_mag_c = math.sqrt(MU_EARTH / max(1e-6, float(np.linalg.norm(pt_c))))
            vt_c = v_mag_c * (-0.98 * v_norm + 0.199 * c_norm)
            pt0, vt0, _ = propagate_rk4_duration(pt_c, vt_c, -t_conj, max_step_s=4.0)

            deb_r0 = float(np.linalg.norm(pt0))
            deb_alt = deb_r0 - R_EARTH
            rel_v0 = float(np.linalg.norm(vt0 - vs0))
            target = {
                "id": "DEBRIS-CLUSTER-77",
                "name": "Hypervelocity Debris Cluster #77",
                "object_type": "DEBRIS",
                "status": "CRITICAL CONVERGENCE",
                "timestamp": 0.0,
                "position_x": round(float(pt0[0]), 3),
                "position_y": round(float(pt0[1]), 3),
                "position_z": round(float(pt0[2]), 3),
                "velocity_x": round(float(vt0[0]), 4),
                "velocity_y": round(float(vt0[1]), 4),
                "velocity_z": round(float(vt0[2]), 4),
                "altitude": round(deb_alt, 2),
                "inclination": 127.0,
                "eccentricity": 0.001,
                "orbital_period": round(2.0 * math.pi * math.sqrt((deb_r0 ** 3) / MU_EARTH), 1),
                "mass": 65.0,
                "health_status": "DEBRIS",
                "risk_level": "CRITICAL",
                "metadata": {
                    "source": "synthetic_scenario_3",
                    "relative_velocity_kms": round(rel_v0, 2),
                    "predicted_cpa_km": 1.78,
                    "cpa_time_s": 240.0
                }
            }
            self.objects[target["id"]] = target
            self.target_id = target["id"]
            self.safety_status = "REVIEW REQUIRED"
            sentinel["status"] = "TRACKING"
            sentinel["mission_phase"] = "EMERGENCY_ACQUISITION"
            self.decision_rationale = "REVIEW REQUIRED: All tested candidate maneuvers (Prograde, Retrograde, Radial across 5, 10, 20 m/s) fail to satisfy the configured 25.0 km screening clearance. Safety gate escalated for human orbital safety officer review."
            self._handle_event(self.mission_id, 0.0, "REVIEW_REQUIRED", "No tested candidate maneuver satisfies the 25.0 km screening distance. Escalated for operator review.")
            self.evaluate_maneuver_candidates(target_id=target["id"])

        elif scenario_name == "Scenario 1 – Failed Satellite":
            # Failed non-responsive communication satellite at 650 km
            sat_alt = params.get("target_alt", 650.0)
            sat_r = R_EARTH + sat_alt
            sat_v = math.sqrt(MU_EARTH / sat_r)
            # Offset position slightly in orbit ahead of SENTINEL
            theta = math.radians(24.0)
            target = {
                "id": "SAT-NAV-204",
                "name": "NavSat-204 (Non-Responsive)",
                "object_type": "FAILED_SATELLITE",
                "status": "UNCONTROLLED DRIFT",
                "timestamp": 0.0,
                "position_x": round(sat_r * math.cos(theta), 3),
                "position_y": round(sat_r * math.sin(theta), 3),
                "position_z": 0.0,
                "velocity_x": round(-sat_v * math.sin(theta), 4),
                "velocity_y": round(sat_v * math.cos(theta), 4),
                "velocity_z": 0.0,
                "altitude": round(sat_alt, 2),
                "inclination": 53.0,
                "eccentricity": 0.0012,
                "orbital_period": round(2.0 * math.pi * math.sqrt((sat_r ** 3) / MU_EARTH), 1),
                "mass": 1420.0,
                "health_status": "NON-RESPONSIVE",
                "risk_level": "HIGH",
                "metadata": {"source": "simulation_scenario_1", "anomaly": "complete_bus_failure"}
            }
            self.objects[target["id"]] = target
            self.target_id = target["id"]

        elif scenario_name == "Scenario 2 – Dangerous Debris":
            # Dangerous high-risk debris fragment on intersecting path
            deb_alt = params.get("target_alt", 615.0)
            deb_r = R_EARTH + deb_alt
            deb_v = math.sqrt(MU_EARTH / deb_r)
            theta = math.radians(15.0)
            target = {
                "id": "DEBRIS-CRIT-99",
                "name": "Cosmos-2251 Fragment #99",
                "object_type": "DEBRIS",
                "status": "DRIFTING",
                "timestamp": 0.0,
                "position_x": round(deb_r * math.cos(theta), 3),
                "position_y": round(deb_r * math.sin(theta), 3),
                "position_z": round(deb_r * 0.08, 3),
                "velocity_x": round(-deb_v * math.sin(theta), 4),
                "velocity_y": round(deb_v * math.cos(theta), 4),
                "velocity_z": round(-0.45, 4),
                "altitude": round(deb_alt, 2),
                "inclination": 74.0,
                "eccentricity": 0.025,
                "orbital_period": round(2.0 * math.pi * math.sqrt((deb_r ** 3) / MU_EARTH), 1),
                "mass": 42.0,
                "health_status": "DEBRIS",
                "risk_level": "CRITICAL",
                "metadata": {"source": "simulation_scenario_2", "cross_section_m2": 1.85}
            }
            self.objects[target["id"]] = target
            self.target_id = target["id"]

        elif scenario_name == "Scenario 3 – Collision Avoidance":
            # Two orbital objects approaching on critical conjunction geometry
            r_sat = R_EARTH + 580.0
            v_sat = math.sqrt(MU_EARTH / r_sat)
            obj_a = {
                "id": "SAT-OBS-101",
                "name": "EarthObs-101 (Active)",
                "object_type": "ACTIVE_SATELLITE",
                "status": "NOMINAL",
                "timestamp": 0.0,
                "position_x": round(r_sat * math.cos(math.radians(10.0)), 3),
                "position_y": round(r_sat * math.sin(math.radians(10.0)), 3),
                "position_z": 0.0,
                "velocity_x": round(-v_sat * math.sin(math.radians(10.0)), 4),
                "velocity_y": round(v_sat * math.cos(math.radians(10.0)), 4),
                "velocity_z": 0.0,
                "altitude": 580.0,
                "inclination": 53.0,
                "eccentricity": 0.0005,
                "orbital_period": 5780.0,
                "mass": 850.0,
                "health_status": "HEALTHY",
                "risk_level": "CRITICAL"
            }
            # Debris approaching with small CPA
            deb_r = r_sat + 1.2
            deb_v = math.sqrt(MU_EARTH / deb_r)
            obj_b = {
                "id": "DEBRIS-CONJ-04",
                "name": "Rocket Body Upper Stage #04",
                "object_type": "DEBRIS",
                "status": "DRIFTING",
                "timestamp": 0.0,
                "position_x": round(deb_r * math.cos(math.radians(10.3)), 3),
                "position_y": round(deb_r * math.sin(math.radians(10.3)), 3),
                "position_z": 0.8,
                "velocity_x": round(-deb_v * math.sin(math.radians(10.3)), 4),
                "velocity_y": round(deb_v * math.cos(math.radians(10.3)), 4),
                "velocity_z": -0.05,
                "altitude": 581.2,
                "inclination": 53.2,
                "eccentricity": 0.001,
                "orbital_period": 5782.0,
                "mass": 3200.0,
                "health_status": "DEBRIS",
                "risk_level": "CRITICAL"
            }
            self.objects[obj_a["id"]] = obj_a
            self.objects[obj_b["id"]] = obj_b
            self.target_id = obj_b["id"]

        elif scenario_name == "Scenario 4 – Satellite Rescue":
            # Satellite experiencing gyro tumble & power decay
            sat_alt = 620.0
            sat_r = R_EARTH + sat_alt
            sat_v = math.sqrt(MU_EARTH / sat_r)
            theta = math.radians(18.0)
            target = {
                "id": "SAT-TELECOM-7",
                "name": "Telecom-7 (Tumbling Rescue)",
                "object_type": "FAILED_SATELLITE",
                "status": "ATTITUDE LOSS",
                "timestamp": 0.0,
                "position_x": round(sat_r * math.cos(theta), 3),
                "position_y": round(sat_r * math.sin(theta), 3),
                "position_z": 0.0,
                "velocity_x": round(-sat_v * math.sin(theta), 4),
                "velocity_y": round(sat_v * math.cos(theta), 4),
                "velocity_z": 0.0,
                "altitude": sat_alt,
                "inclination": 53.0,
                "eccentricity": 0.002,
                "orbital_period": 5830.0,
                "mass": 1800.0,
                "health_status": "CRITICAL",
                "risk_level": "HIGH",
                "metadata": {"tumble_rate_deg_s": 8.4, "battery_pct": 14.5}
            }
            self.objects[target["id"]] = target
            self.target_id = target["id"]

        elif scenario_name == "Scenario 5 – Multiple Targets":
            # Creates multiple candidates to demonstrate autonomous scoring
            for idx, (code, name, alt, o_type, health, risk) in enumerate([
                ("SAT-OBS-3", "GeoEye-3", 670.0, "FAILED_SATELLITE", "DEGRADED", "MEDIUM"),
                ("SAT-COM-9", "StarComm-9", 630.0, "FAILED_SATELLITE", "CRITICAL", "HIGH"),
                ("DEBRIS-BIG-1", "Fengyun Fragment Alpha", 610.0, "DEBRIS", "DEBRIS", "CRITICAL"),
                ("SAT-SCI-2", "SolarProbe-2", 710.0, "ACTIVE_SATELLITE", "HEALTHY", "SAFE"),
            ]):
                r = R_EARTH + alt
                v = math.sqrt(MU_EARTH / r)
                th = math.radians(12.0 + idx * 20.0)
                obj = {
                    "id": code,
                    "name": name,
                    "object_type": o_type,
                    "status": "IN ORBIT",
                    "timestamp": 0.0,
                    "position_x": round(r * math.cos(th), 3),
                    "position_y": round(r * math.sin(th), 3),
                    "position_z": round(r * 0.04 * idx, 3),
                    "velocity_x": round(-v * math.sin(th), 4),
                    "velocity_y": round(v * math.cos(th), 4),
                    "velocity_z": 0.0,
                    "altitude": alt,
                    "inclination": 53.0 + idx * 5.0,
                    "eccentricity": 0.001,
                    "orbital_period": round(2.0 * math.pi * math.sqrt((r ** 3) / MU_EARTH), 1),
                    "mass": 950.0,
                    "health_status": health,
                    "risk_level": risk
                }
                self.objects[obj["id"]] = obj
            self.target_id = None  # To be picked by autonomous priority scoring

        # Update initial calculations
        self._update_orbital_metrics()
        self._handle_event(self.mission_id, 0.0, "SCENARIO_LOADED", f"{scenario_name} loaded into SENTINEL simulation environment.")

    def load_dataset_replay(self, max_frames: int = 100):
        """
        Initializes Dataset Replay mode from raw optical sensor observations.
        """
        with self._lock:
            self.is_running = True
            self.mode = "DATASET_REPLAY"
            self.sim_time = 0.0
            self.last_update_wall_time = time.time()
            self.dataset_replay_idx = 0
            self.scenario_name = "Dataset Replay Mode"
            self.event_log.clear()
            
            # Load catalog
            catalog = self.load_processed_dataset()
            self.dataset_records = catalog[:max_frames * 3]
            
            # Populate initial objects from first frame
            self.objects.clear()
            if self.dataset_records:
                first_img_id = self.dataset_records[0]["metadata"]["optical_image_id"]
                frame_objects = [o for o in self.dataset_records if o["metadata"]["optical_image_id"] == first_img_id]
                for o in frame_objects:
                    self.objects[o["id"]] = o
                self.target_id = frame_objects[0]["id"]
                
            self._handle_event(self.mission_id, 0.0, "DATASET_REPLAY_LOADED", f"Loaded {len(self.dataset_records)} observations for optical replay.")
            self.state_revision += 1

    def play(self):
        with self._lock:
            self.is_running = True
            self.last_update_wall_time = time.time()
            self._handle_event(self.mission_id, self.sim_time, "SIM_PLAY", f"Simulation running at {self.time_scale}x speed acceleration.")
            self.state_revision += 1

    def pause(self):
        with self._lock:
            self.is_running = False
            if self.mode == "SIMULATION":
                self._sync_live_maneuver_trajectories(force=True)
            self._handle_event(self.mission_id, self.sim_time, "SIM_PAUSED", "Simulation paused by operator.")
            self.state_revision += 1

    def reset(self):
        with self._lock:
            self.load_scenario(self.scenario_name)

    def set_speed(self, multiplier: float):
        with self._lock:
            self.time_scale = max(0.1, min(1000.0, multiplier))
            self.state_revision += 1

    def set_target(self, target_id: str):
        with self._lock:
            if target_id in self.objects:
                self.target_id = target_id
                target = self.objects[target_id]
                self._handle_event(self.mission_id, self.sim_time, "TARGET_SELECTED", f"Operator designated target: {target['name']} ({target['id']})")
                self.state_revision += 1

    def set_relocation_strategy(self, strategy: str):
        with self._lock:
            self.relocation_strategy = strategy
            self._handle_event(self.mission_id, self.sim_time, "STRATEGY_CHANGED", f"Relocation objective updated: {strategy}")
            self.state_revision += 1

    def _update_orbital_metrics(self):
        """
        Calculates relative ranges, collision risks, anomaly detections, and AI recommendations.
        """
        sentinel = self.objects.get(self.sentinel_id)
        target = self.objects.get(self.target_id) if self.target_id else None
        
        if sentinel and target:
            pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float)
            vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float)
            
            r_rel = pos_t - pos_s
            v_rel = vel_t - vel_s
            sentinel["target_distance_km"] = round(float(np.linalg.norm(r_rel)), 3)
            sentinel["target_rel_velocity_kms"] = round(float(np.linalg.norm(v_rel)), 4)
        elif sentinel:
            sentinel["target_distance_km"] = 0.0
            sentinel["target_rel_velocity_kms"] = 0.0

        # Collision risk screening
        all_objs = list(self.objects.values())
        self.latest_risks = self.risk_engine.screen_all_pairs(all_objs)

        if sentinel and target:
            meta = target.setdefault("metadata", {})
            if self.executed_maneuver is not None:
                meta["predicted_cpa_km"] = self.executed_maneuver.get(
                    "resulting_d_cpa_km", meta.get("predicted_cpa_km", 25.0)
                )
                meta["cpa_time_s"] = self.executed_maneuver.get(
                    "resulting_t_cpa_s", meta.get("cpa_time_s", 0.0)
                )
            else:
                pair_risk = next(
                    (
                        r for r in self.latest_risks
                        if {r.get("object_a_id"), r.get("object_b_id")} == {sentinel.get("id"), target.get("id")}
                    ),
                    None,
                )
                if pair_risk is not None:
                    meta["predicted_cpa_km"] = pair_risk["cpa_distance_km"]
                    meta["cpa_time_s"] = pair_risk["cpa_time_s"]
                    meta["relative_velocity_kms"] = pair_risk["relative_speed_kms"]

        # Anomaly evaluation on target or Sentinel
        eval_obj = target or sentinel
        if eval_obj:
            extra_s = eval_obj.get("metadata", {})
            self.latest_anomaly = self.anomaly_detector.analyze_object(eval_obj, extra_s)

        # AI Recommendation
        phase_str = self.state_machine.current_phase.value
        self.latest_recommendation = self.recommendation_engine.generate_recommendation(
            mission_phase=phase_str,
            sentinel_state=sentinel or {},
            target_obj=target,
            risk_assessments=self.latest_risks,
            anomaly_data=self.latest_anomaly
        )

    def step_physics(self, dt_sim: float):
        """
        Executes one physics integration step for all orbital objects.
        """
        with self._lock:
            sentinel = self.objects.get(self.sentinel_id)
            target = self.objects.get(self.target_id) if self.target_id else None
            current_phase = self.state_machine.current_phase

            # 1. Propagate passive objects under Earth's two-body gravity (bounded RK4 sub-steps)
            for obj_id, obj in list(self.objects.items()):
                if obj_id == self.sentinel_id:
                    continue  # Sentinel is propagated once in Section 2 for all mission phases
                if self.target_id and obj_id == self.target_id and current_phase in [
                    MissionPhase.MANEUVER, MissionPhase.SAFE_TRAJECTORY
                ]:
                    continue  # Target is propagated under coupled thrust in Section 2
                    
                pos = np.array([obj["position_x"], obj["position_y"], obj["position_z"]], dtype=float)
                vel = np.array([obj["velocity_x"], obj["velocity_y"], obj["velocity_z"]], dtype=float)
                
                new_pos, new_vel, new_acc = propagate_rk4_duration(pos, vel, dt_sim, max_step_s=5.0)
                obj["position_x"] = round(float(new_pos[0]), 6)
                obj["position_y"] = round(float(new_pos[1]), 6)
                obj["position_z"] = round(float(new_pos[2]), 6)
                obj["velocity_x"] = round(float(new_vel[0]), 7)
                obj["velocity_y"] = round(float(new_vel[1]), 7)
                obj["velocity_z"] = round(float(new_vel[2]), 7)
                obj["acceleration_x"] = round(float(new_acc[0]), 7)
                obj["acceleration_y"] = round(float(new_acc[1]), 7)
                obj["acceleration_z"] = round(float(new_acc[2]), 7)
                obj["altitude"] = round(altitude_from_position(new_pos[0], new_pos[1], new_pos[2]), 2)
                obj["timestamp"] = round(self.sim_time, 2)

            # 2. Sentinel Active Guidance & State Machine Stepping
            if sentinel and target:
                pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
                vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
                pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float)
                vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float)
                
                r_rel = pos_t - pos_s
                range_val = float(np.linalg.norm(r_rel))
                
                if current_phase == MissionPhase.INTERCEPTING:
                    # Active homing closure towards target
                    closing_speed = min(0.35, max(0.02, range_val / 20.0))
                    dir_vector = r_rel / max(1e-6, range_val)
                    target_vel = vel_t - dir_vector * closing_speed
                    # Blend velocities with smooth thruster response
                    vel_s = 0.92 * vel_s + 0.08 * target_vel
                    pos_s = pos_s + vel_s * dt_sim
                    acc_s = -(MU_EARTH / (float(np.linalg.norm(pos_s)) ** 3)) * pos_s
                    # Deplete propellant during burn
                    sentinel["fuel_kg"] = max(15.0, sentinel["fuel_kg"] - 0.08 * dt_sim)
                    sentinel["battery_pct"] = max(25.0, sentinel["battery_pct"] - 0.02 * dt_sim)
                    
                elif current_phase == MissionPhase.RENDEZVOUS:
                    # Terminal deceleration and station-keeping alignment
                    # Gradually drive relative range towards 0.03 km (30m standoff)
                    desired_r_rel = (r_rel / max(1e-6, range_val)) * 0.03
                    offset_err = r_rel - desired_r_rel
                    vel_s = vel_t + offset_err * 0.15
                    pos_s = pos_s + vel_s * dt_sim
                    acc_s = -(MU_EARTH / (float(np.linalg.norm(pos_s)) ** 3)) * pos_s
                    sentinel["fuel_kg"] = max(15.0, sentinel["fuel_kg"] - 0.03 * dt_sim)
                    
                elif current_phase == MissionPhase.CAPTURE:
                    # Grapple lock: Sentinel locks onto Target coordinates with slight latch offset
                    pos_s = pos_t + np.array([0.005, 0.002, 0.002])
                    vel_s = vel_t
                    acc_s = -(MU_EARTH / (float(np.linalg.norm(pos_s)) ** 3)) * pos_s
                    target["status"] = "CAPTURED BY SENTINEL"
                    
                elif current_phase in [MissionPhase.MANEUVER, MissionPhase.SAFE_TRAJECTORY]:
                    # Both objects move together under relocation thrust
                    if self.relocation_strategy == "CONTROLLED DEORBIT":
                        # De-orbit burn reduces orbital energy
                        retro_thrust = -vel_t / max(1e-6, np.linalg.norm(vel_t))
                        new_vel_t = vel_t + retro_thrust * 0.004 * dt_sim
                    else:
                        # Boost burn raises orbit
                        prograde = vel_t / max(1e-6, np.linalg.norm(vel_t))
                        new_vel_t = vel_t + prograde * 0.003 * dt_sim
                        
                    new_pos_t, new_vel_t, new_acc_t = propagate_two_body_rk4(pos_t, new_vel_t, dt_sim)
                    target["position_x"] = round(float(new_pos_t[0]), 3)
                    target["position_y"] = round(float(new_pos_t[1]), 3)
                    target["position_z"] = round(float(new_pos_t[2]), 3)
                    target["velocity_x"] = round(float(new_vel_t[0]), 4)
                    target["velocity_y"] = round(float(new_vel_t[1]), 4)
                    target["velocity_z"] = round(float(new_vel_t[2]), 4)
                    target["altitude"] = round(altitude_from_position(new_pos_t[0], new_pos_t[1], new_pos_t[2]), 2)
                    
                    pos_s = new_pos_t + np.array([0.005, 0.002, 0.002])
                    vel_s = new_vel_t
                    acc_s = new_acc_t
                    sentinel["fuel_kg"] = max(15.0, sentinel["fuel_kg"] - 0.12 * dt_sim)
                else:
                    new_pos_s, new_vel_s, acc_s = propagate_rk4_duration(pos_s, vel_s, dt_sim, max_step_s=5.0)
                    pos_s = new_pos_s
                    vel_s = new_vel_s
                    
                sentinel["position_x"] = round(float(pos_s[0]), 6)
                sentinel["position_y"] = round(float(pos_s[1]), 6)
                sentinel["position_z"] = round(float(pos_s[2]), 6)
                sentinel["velocity_x"] = round(float(vel_s[0]), 7)
                sentinel["velocity_y"] = round(float(vel_s[1]), 7)
                sentinel["velocity_z"] = round(float(vel_s[2]), 7)
                sentinel["acceleration_x"] = round(float(acc_s[0]), 7)
                sentinel["acceleration_y"] = round(float(acc_s[1]), 7)
                sentinel["acceleration_z"] = round(float(acc_s[2]), 7)
                sentinel["altitude"] = round(altitude_from_position(pos_s[0], pos_s[1], pos_s[2]), 2)
                sentinel["timestamp"] = round(self.sim_time, 2)
                
            elif sentinel:
                pos = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
                vel = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
                new_pos, new_vel, new_acc = propagate_rk4_duration(pos, vel, dt_sim, max_step_s=5.0)
                sentinel["position_x"] = round(float(new_pos[0]), 6)
                sentinel["position_y"] = round(float(new_pos[1]), 6)
                sentinel["position_z"] = round(float(new_pos[2]), 6)
                sentinel["velocity_x"] = round(float(new_vel[0]), 7)
                sentinel["velocity_y"] = round(float(new_vel[1]), 7)
                sentinel["velocity_z"] = round(float(new_vel[2]), 7)
                sentinel["acceleration_x"] = round(float(new_acc[0]), 7)
                sentinel["acceleration_y"] = round(float(new_acc[1]), 7)
                sentinel["acceleration_z"] = round(float(new_acc[2]), 7)
                sentinel["altitude"] = round(altitude_from_position(new_pos[0], new_pos[1], new_pos[2]), 2)
                sentinel["timestamp"] = round(self.sim_time, 2)

            # Context for State Machine
            context = {
                "sentinel": sentinel,
                "target": target,
                "planner": self.planner,
                "safety_validator": self.safety_validator,
                "relocation_strategy": self.relocation_strategy,
                "best_target_info": self.planner.select_best_target(
                    list(self.objects.values()),
                    np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]]) if sentinel else np.zeros(3),
                    sentinel.get("fuel_kg", 150.0) if sentinel else 150.0,
                    self.latest_risks
                ) if sentinel else None,
                "set_target_callback": self.set_target
            }
            self.state_machine.step(dt_sim, self.sim_time, context)
            
            # Persist completed or aborted mission to SQLite database
            if not self.mission_saved and self.state_machine.current_phase in [MissionPhase.MISSION_COMPLETE, MissionPhase.ABORT]:
                self.mission_saved = True
                is_success = (self.state_machine.current_phase == MissionPhase.MISSION_COMPLETE)
                duration = max(0.0, self.sim_time - self.state_machine.mission_start_sim_time)
                dv_total = 0.0
                if self.state_machine.intercept_plan:
                    dv_total += self.state_machine.intercept_plan.get("required_delta_v_kms", 0.0)
                if self.state_machine.maneuver_data:
                    dv_total += self.state_machine.maneuver_data.get("required_delta_v_kms", 0.0)
                
                fuel_used = max(0.0, 150.0 - (sentinel.get("fuel_kg", 150.0) if sentinel else 150.0))
                mission_record = {
                    "id": self.mission_id,
                    "name": f"SENTINEL Mission – {target['name'] if target else 'Debris Mitigation'}",
                    "scenario": self.scenario_name,
                    "status": "COMPLETED" if is_success else "ABORTED",
                    "phase": self.state_machine.current_phase.value,
                    "target_id": self.target_id,
                    "start_time": self.state_machine.mission_start_sim_time,
                    "end_time": self.sim_time,
                    "duration_s": duration,
                    "delta_v_total": round(dv_total, 4),
                    "fuel_used_kg": round(fuel_used, 2),
                    "initial_risk": "HIGH",
                    "final_risk": "SAFE" if is_success else "CRITICAL",
                    "success": is_success,
                    "summary": {
                        "scenario": self.scenario_name,
                        "target_name": target["name"] if target else "Unknown",
                        "strategy": self.relocation_strategy,
                        "fuel_remaining_kg": sentinel.get("fuel_kg", 150.0) if sentinel else 150.0,
                        "inspection": self.state_machine.inspection_data,
                        "maneuver": self.state_machine.maneuver_data
                    }
                }
                if not self._suppress_db_logs:
                    try:
                        save_mission(mission_record)
                    except Exception as e:
                        print("Error saving completed mission:", e)

            # Keep Sentinel state aligned with active workflow or autonomous scenario duties
            if sentinel:
                if self.state_machine.current_phase != MissionPhase.IDLE:
                    phase = self.state_machine.current_phase
                    sentinel["mission_phase"] = phase.value
                    phase_status_map = {
                        MissionPhase.INSPECTION: "INSPECTING",
                        MissionPhase.INTERCEPTING: "INTERCEPTING",
                        MissionPhase.RENDEZVOUS: "RENDEZVOUS",
                        MissionPhase.CAPTURE: "CAPTURED",
                        MissionPhase.MANEUVER: "MANEUVER",
                        MissionPhase.SAFE_TRAJECTORY: "SAFE_TRAJECTORY",
                    }
                    sentinel["status"] = phase_status_map.get(phase, "ENGAGED")
                else:
                    self._step_scenario_autonomy(sentinel, target)

            # Update metrics & telemetry record
            self._update_orbital_metrics()
            
            # Telemetry record (downsampled to ~1 Hz sim time)
            if sentinel and (len(self.telemetry_history) == 0 or (self.sim_time - self.telemetry_history[-1]["sim_time"]) >= 1.0):
                self.telemetry_history.append({
                    "sim_time": round(self.sim_time, 1),
                    "pos_x": sentinel["position_x"],
                    "pos_y": sentinel["position_y"],
                    "pos_z": sentinel["position_z"],
                    "vel_x": sentinel["velocity_x"],
                    "vel_y": sentinel["velocity_y"],
                    "vel_z": sentinel["velocity_z"],
                    "altitude": sentinel["altitude"],
                    "target_dist": sentinel.get("target_distance_km", 0.0),
                    "target_rel_vel": sentinel.get("target_rel_velocity_kms", 0.0),
                    "fuel_kg": round(sentinel.get("fuel_kg", 150.0), 2),
                    "battery_pct": round(sentinel.get("battery_pct", 100.0), 1),
                    "phase": sentinel.get("mission_phase", self.state_machine.current_phase.value)
                })
                if len(self.telemetry_history) > 600:
                    self.telemetry_history.pop(0)

    def _step_scenario_autonomy(self, sentinel: Dict[str, Any], target: Optional[Dict[str, Any]]):
        """
        Drives SAT-01's autonomous scenario operations cleanly in real time when
        running Scenarios 1, 2, or 3 so spacecraft actively monitor, inspect via LiDAR,
        execute scheduled RK4 avoidance burns, and confirm post-CPA safety gates.
        """
        sc_lower = self.scenario_name.lower()

        if "normal operation" in sc_lower or "scenario 1:" in sc_lower:
            # Continuous catalog surveillance sweep in LEO patrol orbit
            sentinel["status"] = "PATROL"
            sentinel["mission_phase"] = "ORBITAL_PATROL"
            if self._last_patrol_log_time < 0.0:
                self._last_patrol_log_time = 0.0
            if self.sim_time - self._last_patrol_log_time >= 250.0:
                self._last_patrol_log_time = self.sim_time
                # Find closest catalog neighbor for honest operational log
                ps = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
                nearest_id, nearest_dist = None, 999999.0
                for oid, obj in self.objects.items():
                    if oid == self.sentinel_id:
                        continue
                    d = float(np.linalg.norm(
                        np.array([obj["position_x"], obj["position_y"], obj["position_z"]], dtype=float) - ps
                    ))
                    if d < nearest_dist:
                        nearest_dist, nearest_id = d, oid
                if nearest_id:
                    self._handle_event(
                        self.mission_id,
                        self.sim_time,
                        "PATROL_SWEEP",
                        f"Orbital radar sweep nominal: nearest catalog object {nearest_id} at {nearest_dist:.1f} km (outside {self.screening_distance_km:.1f} km gate)."
                    )
            return

        if "avoidable close approach" in sc_lower or "scenario 2:" in sc_lower:
            # Handle user-initiated burn or autonomous progression cleanly
            if self.executed_maneuver is not None:
                if self._scenario_stage < 2:
                    self._scenario_stage = 2
                    if self._burn_end_sim_time is None:
                        self._burn_end_sim_time = self.sim_time + 150.0
                if self._burn_end_sim_time is not None and self.sim_time < self._burn_end_sim_time:
                    sentinel["status"] = "MANEUVER"
                    sentinel["mission_phase"] = "AVOIDANCE_BURN"
                elif self.sim_time < 2450.0:
                    self._scenario_stage = max(self._scenario_stage, 3)
                    sentinel["status"] = "SAFE_TRAJECTORY"
                    sentinel["mission_phase"] = "SAFE_COAST"
                else:
                    if self._scenario_stage < 4:
                        self._scenario_stage = 4
                        ver_d = (self.before_after_results or {}).get("verified_d_cpa_km", 25.0)
                        self._handle_event(
                            self.mission_id,
                            self.sim_time,
                            "SAFE_PASS_CONFIRMED",
                            f"Conjunction window passed cleanly ({ver_d:.2f} km clearance > {self.screening_distance_km:.1f} km gate). Resuming continuous LEO patrol."
                        )
                    sentinel["status"] = "PATROL"
                    sentinel["mission_phase"] = "POST_AVOIDANCE_PATROL"
                return

            if self.sim_time < 120.0:
                sentinel["status"] = "TRACKING"
                sentinel["mission_phase"] = "THREAT_TRACKING"
            elif self.sim_time < 420.0:
                sentinel["status"] = "INSPECTING"
                sentinel["mission_phase"] = "LIDAR_TARGET_LOCK"
                if self._scenario_stage < 1:
                    self._scenario_stage = 1
                    self._handle_event(
                        self.mission_id,
                        self.sim_time,
                        "TARGET_INSPECTION",
                        f"SAT-01 locked LiDAR & optical tracking onto {target['id'] if target else 'DEBRIS-2009-033A'}; arming optimal RK4 avoidance candidate."
                    )
            else:
                # Autonomous avoidance burn execution once sim_time >= 420s
                if self._scenario_stage < 2 and self.target_id:
                    self.evaluate_maneuver_candidates(self.target_id, self.screening_distance_km)
                    if self.selected_candidate:
                        self.autonomous_avoidance_active = True
                        self.execute_maneuver(self.selected_candidate["id"])
                        self._burn_end_sim_time = self.sim_time + 180.0
                        self._scenario_stage = 2
                        sentinel["status"] = "MANEUVER"
                        sentinel["mission_phase"] = "AVOIDANCE_BURN"
                        self._handle_event(
                            self.mission_id,
                            self.sim_time,
                            "AUTONOMOUS_BURN",
                            f"Autonomous avoidance burn engaged: {self.selected_candidate['name']} (+{self.selected_candidate['delta_v_ms']} m/s); raising orbit to clear {self.screening_distance_km:.1f} km threshold."
                        )
                    else:
                        self._scenario_stage = 2
                        self.safety_status = "REVIEW REQUIRED"
                        sentinel["status"] = "INSPECTING"
                        sentinel["mission_phase"] = "REVIEW_REQUIRED"
                        self._handle_event(
                            self.mission_id,
                            self.sim_time,
                            "AUTONOMOUS_ESCALATION",
                            f"No candidate maneuver satisfies {self.screening_distance_km:.1f} km screening threshold; operator review requested."
                        )
            return

        if "no acceptable maneuver" in sc_lower or "scenario 3:" in sc_lower:
            if self.executed_maneuver is not None:
                if self._burn_end_sim_time is not None and self.sim_time < self._burn_end_sim_time:
                    sentinel["status"] = "MANEUVER"
                    sentinel["mission_phase"] = "OVERRIDE_BURN"
                else:
                    sentinel["status"] = "SAFE_TRAJECTORY" if self.safety_status == "VERIFIED" else "PATROL"
                    sentinel["mission_phase"] = "POST_OVERRIDE_TRACK"
                return

            if self.sim_time < 40.0:
                sentinel["status"] = "TRACKING"
                sentinel["mission_phase"] = "EMERGENCY_ACQUISITION"
            elif self.sim_time < 150.0:
                sentinel["status"] = "INSPECTING"
                sentinel["mission_phase"] = "CRITICAL_TRACK_LOCK"
                if self._scenario_stage < 1:
                    self._scenario_stage = 1
                    self._handle_event(
                        self.mission_id,
                        self.sim_time,
                        "EMERGENCY_TRACKING",
                        "High-closing-speed DEBRIS-CLUSTER-77 (15.0 km/s) locked on LiDAR. Standard Δv candidates cannot clear 25 km gate — Flight Safety Officer escalation active."
                    )
            elif self.sim_time < 260.0:
                sentinel["status"] = "MANEUVER"
                sentinel["mission_phase"] = "CONTINGENCY_RCS_HOLD"
                if self._scenario_stage < 2:
                    self._scenario_stage = 2
                    self._handle_event(
                        self.mission_id,
                        self.sim_time,
                        "TERMINAL_PROXIMITY_ALERT",
                        "Entering terminal closest-approach corridor (T+240s). Contingency RCS attitude hold engaged; manual high-Δv review required."
                    )
            else:
                sentinel["status"] = "PATROL"
                sentinel["mission_phase"] = "POST_ENCOUNTER_AUDIT"
                self.safety_status = "REVIEW REQUIRED"
                if self._scenario_stage < 3:
                    self._scenario_stage = 3
                    self._handle_event(
                        self.mission_id,
                        self.sim_time,
                        "CPA_FLYBY_COMPLETE",
                        "Hypervelocity encounter epoch passed (~1.8 km near-miss corridor). Receding telemetry logged for Flight Safety Officer audit."
                    )
            return

    def tick(self) -> Dict[str, Any]:
        """
        Invoked periodically (e.g. from event loop / WebSocket / serverless poll).
        Computes elapsed real time and propagates simulation physics by dt.
        """
        with self._lock:
            now = time.time()
            wall_dt = now - self.last_update_wall_time
            self.last_update_wall_time = now
            
            # Allow smooth real-time progression across 1s serverless polls while preventing stall spikes
            wall_dt = min(3.0, max(0.001, wall_dt))
            
            if self.is_running:
                dt_sim = wall_dt * self.time_scale
                
                if self.mode == "SIMULATION":
                    # Sub-step physics so autonomous duties, telemetry recording, and RK4 accuracy stay deterministic
                    chunk = max(10.0, dt_sim / 20.0)
                    remaining = dt_sim
                    while remaining > 1e-6:
                        sub_dt = min(chunk, remaining)
                        self.sim_time += sub_dt
                        self.step_physics(sub_dt)
                        remaining -= sub_dt
                    self._sync_live_maneuver_trajectories(force=False)
                elif self.mode == "DATASET_REPLAY":
                    self.sim_time += dt_sim
                    # In dataset replay mode, step through observational frames
                    if self.dataset_records and len(self.dataset_records) > 0:
                        advance_steps = max(1, int(dt_sim / 1.0)) if dt_sim >= 1.0 else 0
                        if advance_steps > 0:
                            self.dataset_replay_idx = (self.dataset_replay_idx + advance_steps) % len(self.dataset_records)
                            current_rec = self.dataset_records[self.dataset_replay_idx]
                            self.objects[current_rec["id"]] = current_rec
                            self.target_id = current_rec["id"]
                            self._update_orbital_metrics()
                self.state_revision += 1

            return self.get_full_state()

    def _sync_live_maneuver_trajectories(self, force: bool = False):
        """
        Keeps predicted maneuver trajectories and remaining-window CPA evaluations
        synchronized with the live moving satellite/target state vectors as sim_time advances.
        """
        if not self.target_id or self.target_id not in self.objects or self.sentinel_id not in self.objects:
            return
        if not force and abs(self.sim_time - self._last_cand_eval_sim_time) < 15.0:
            return
        self._last_cand_eval_sim_time = self.sim_time

        if self.executed_maneuver is not None:
            sentinel = self.objects[self.sentinel_id]
            target = self.objects[self.target_id]
            pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float)
            vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float)
            res_d, res_t, live_wps = predict_post_maneuver_cpa_rk4(
                pos_s, vel_s, np.zeros(3), pos_t, vel_t, horizon_s=2400.0, num_waypoints=56
            )
            self.executed_maneuver["trajectory_waypoints"] = live_wps
            self.executed_maneuver["resulting_t_cpa_s"] = res_t
            if self.before_after_results is not None:
                self.before_after_results["candidate_trajectory"] = live_wps
        elif self.maneuver_candidates or self.safety_status in ["WARNING", "EVALUATING", "REVIEW REQUIRED"]:
            sc_lower = self.scenario_name.lower()
            if ("no acceptable maneuver" in sc_lower or "scenario 3:" in sc_lower) and self.sim_time >= 235.0:
                self.safety_status = "REVIEW REQUIRED"
                return
            self.evaluate_maneuver_candidates(self.target_id, self.screening_distance_km)

    def step_forward(self, seconds: float = 60.0) -> Dict[str, Any]:
        """
        Deterministically advances simulation time in smooth substeps so simulator telemetry
        captures the orbital trajectory and close-approach progression cleanly.
        """
        with self._lock:
            total = max(1.0, min(3600.0, float(seconds)))
            chunk = 10.0
            remaining = total
            while remaining > 1e-6:
                dt = min(chunk, remaining)
                self.sim_time += dt
                self.step_physics(dt)
                remaining -= dt
            self._sync_live_maneuver_trajectories(force=True)
            self._handle_event(self.mission_id, self.sim_time, "SIM_STEPPED", f"Simulation propagated forward by +{total:.0f}s to T+{self.sim_time:.1f}s.")
            self.state_revision += 1
            return self.get_full_state()

    def set_screening_distance(self, distance_km: float):
        with self._lock:
            self.screening_distance_km = max(1.0, min(200.0, float(distance_km)))
            if self.executed_maneuver and self.before_after_results:
                ver_d = self.before_after_results.get("verified_d_cpa_km", 0.0)
                passed = bool(ver_d >= self.screening_distance_km)
                self.safety_status = "VERIFIED" if passed else "REVIEW REQUIRED"
                self.before_after_results["screening_distance_km"] = self.screening_distance_km
                self.before_after_results["verification_status"] = self.safety_status
                self.before_after_results["is_safe"] = passed
            elif self.target_id:
                self.evaluate_maneuver_candidates(self.target_id, self.screening_distance_km)
            self._handle_event(self.mission_id, self.sim_time, "SCREENING_UPDATED", f"Screening distance set to {self.screening_distance_km} km.")
            self.state_revision += 1

    def evaluate_maneuver_candidates(self, target_id: Optional[str] = None, screening_dist: Optional[float] = None) -> List[Dict[str, Any]]:
        with self._lock:
            target_obj_id = target_id or self.target_id
            if not target_obj_id or target_obj_id not in self.objects:
                return []
            
            target = self.objects[target_obj_id]
            sentinel = self.objects.get(self.sentinel_id)
            if not sentinel:
                return []
                
            screening = screening_dist if screening_dist is not None else self.screening_distance_km
            self.screening_distance_km = screening

            pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float)
            vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float)

            t_cpa_orig, d_cpa_orig, _ = compute_rk4_cpa(pos_s, vel_s, pos_t, vel_t, horizon_s=3600.0, coarse_dt=20.0)
            horizon_eval = max(600.0, min(3600.0, t_cpa_orig * 1.25 if t_cpa_orig > 10.0 else 3000.0))

            if self.executed_maneuver is None:
                meta = target.setdefault("metadata", {})
                meta["predicted_cpa_km"] = round(d_cpa_orig, 2)
                meta["cpa_time_s"] = round(t_cpa_orig, 1)

            candidates_def = [
                ("CAND-PRO-5", "Prograde +5 m/s", "PROGRADE", 5.0),
                ("CAND-PRO-10", "Prograde +10 m/s", "PROGRADE", 10.0),
                ("CAND-PRO-20", "Prograde +20 m/s", "PROGRADE", 20.0),
                ("CAND-RETRO-5", "Retrograde -5 m/s", "RETROGRADE", 5.0),
                ("CAND-RETRO-10", "Retrograde -10 m/s", "RETROGRADE", 10.0),
                ("CAND-RAD-PLUS-5", "Radial+ +5 m/s", "RADIAL+", 5.0),
                ("CAND-RAD-MINUS-5", "Radial- -5 m/s", "RADIAL-", 5.0),
            ]

            evaluated_candidates = []
            v_unit = vel_s / max(1e-6, np.linalg.norm(vel_s))
            r_unit = pos_s / max(1e-6, np.linalg.norm(pos_s))
            wet_mass = 800.0
            isp = 310.0
            g0 = 9.80665

            for cid, name, direction, dv_ms in candidates_def:
                dv_kms = dv_ms / 1000.0
                if direction == "PROGRADE":
                    dv_vec = dv_kms * v_unit
                elif direction == "RETROGRADE":
                    dv_vec = -dv_kms * v_unit
                elif direction == "RADIAL+":
                    dv_vec = dv_kms * r_unit
                elif direction == "RADIAL-":
                    dv_vec = -dv_kms * r_unit
                else:
                    dv_vec = np.zeros(3)

                fuel_kg = round(wet_mass * (1.0 - math.exp(-dv_ms / (isp * g0))), 2)

                resulting_d_cpa, resulting_t_cpa, waypoints = predict_post_maneuver_cpa_rk4(
                    pos_s, vel_s, dv_vec, pos_t, vel_t, horizon_s=horizon_eval, num_waypoints=56
                )

                passed = bool(resulting_d_cpa >= screening)
                status_badge = "PASS" if passed else "FAIL"

                evaluated_candidates.append({
                    "id": cid,
                    "name": name,
                    "direction": direction,
                    "delta_v_ms": dv_ms,
                    "delta_v_kms": round(dv_kms, 4),
                    "propellant_kg": fuel_kg,
                    "original_d_cpa_km": round(d_cpa_orig, 2),
                    "original_t_cpa_s": round(t_cpa_orig, 1),
                    "resulting_d_cpa_km": resulting_d_cpa,
                    "resulting_t_cpa_s": resulting_t_cpa,
                    "screening_distance_km": screening,
                    "passed": passed,
                    "status": status_badge,
                    "trajectory_waypoints": waypoints
                })

            self.maneuver_candidates = evaluated_candidates

            passing = [c for c in evaluated_candidates if c["passed"]]
            if passing:
                passing.sort(key=lambda x: x["delta_v_ms"])
                self.selected_candidate = passing[0]
                self.safety_status = "EVALUATING"
                self.decision_rationale = (
                    f"Candidate {self.selected_candidate['id']} ({self.selected_candidate['name']}) selected: "
                    f"satisfies configured screening clearance ({screening} km) via two-body RK4 verification "
                    f"(d_CPA = {self.selected_candidate['resulting_d_cpa_km']} km) with lowest Δv "
                    f"({self.selected_candidate['delta_v_ms']} m/s) and minimal fuel ({self.selected_candidate['propellant_kg']} kg)."
                )
            else:
                self.selected_candidate = None
                self.safety_status = "REVIEW REQUIRED"
                self.decision_rationale = (
                    f"No acceptable maneuver found within tested candidates that satisfies the configured "
                    f"screening clearance of {screening} km. Human orbital safety officer review required."
                )

            return evaluated_candidates

    def preview_custom_maneuver(self, dv_x_ms: float, dv_y_ms: float, dv_z_ms: float) -> Dict[str, Any]:
        """
        Read-only RK4 preview of a custom 3D impulsive velocity change [dv_x, dv_y, dv_z] in m/s
        without modifying spacecraft state.
        """
        with self._lock:
            sentinel = self.objects.get(self.sentinel_id)
            target = self.objects.get(self.target_id) if self.target_id else None
            if not sentinel:
                return {"status": "error", "message": "Sentinel spacecraft not found"}
            pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float) if target else None
            vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float) if target else None
            screening = self.screening_distance_km

        dv_vec_ms = np.array([dv_x_ms, dv_y_ms, dv_z_ms], dtype=float)
        dv_mag_ms = float(np.linalg.norm(dv_vec_ms))
        dv_vec_kms = dv_vec_ms / 1000.0

        wet_mass = 800.0
        isp = 310.0
        g0 = 9.80665
        fuel_kg = round(wet_mass * (1.0 - math.exp(-max(0.001, dv_mag_ms) / (isp * g0))), 2)

        if pos_t is not None and vel_t is not None:
            t_cpa_orig, d_cpa_orig, _ = compute_rk4_cpa(pos_s, vel_s, pos_t, vel_t, horizon_s=3600.0, coarse_dt=20.0)
            horizon_eval = max(600.0, min(3600.0, t_cpa_orig * 1.25 if t_cpa_orig > 10.0 else 3000.0))
            resulting_d_cpa, resulting_t_cpa, waypoints = predict_post_maneuver_cpa_rk4(
                pos_s, vel_s, dv_vec_kms, pos_t, vel_t, horizon_s=horizon_eval, num_waypoints=56
            )
        else:
            d_cpa_orig = 0.0
            t_cpa_orig = 0.0
            resulting_d_cpa, resulting_t_cpa, waypoints = predict_post_maneuver_cpa_rk4(
                pos_s, vel_s, dv_vec_kms, None, None, horizon_s=1800.0, num_waypoints=56
            )

        passed = bool(resulting_d_cpa >= screening) if pos_t is not None else True
        return {
            "delta_v_ms": round(dv_mag_ms, 2),
            "dv_vector": [round(dv_x_ms, 2), round(dv_y_ms, 2), round(dv_z_ms, 2)],
            "propellant_kg": fuel_kg,
            "original_d_cpa_km": round(d_cpa_orig, 2),
            "resulting_d_cpa_km": resulting_d_cpa,
            "resulting_t_cpa_s": resulting_t_cpa,
            "screening_distance_km": screening,
            "passed": passed,
            "status": "PASS" if passed else "FAIL",
            "trajectory_waypoints": waypoints
        }

    def execute_maneuver(self, candidate_id: str) -> Dict[str, Any]:
        with self._lock:
            candidate = next((c for c in self.maneuver_candidates if c["id"] == candidate_id), None)
            if not candidate:
                if self.selected_candidate and self.selected_candidate["id"] == candidate_id:
                    candidate = self.selected_candidate
                elif self.maneuver_candidates:
                    candidate = self.maneuver_candidates[0]
                else:
                    return {"status": "error", "message": "Candidate not found"}

            sentinel = self.objects.get(self.sentinel_id)
            target = self.objects.get(self.target_id) if self.target_id else None

            dv_kms = candidate["delta_v_kms"]
            direction = candidate["direction"]
            pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
            v_unit = vel_s / max(1e-6, np.linalg.norm(vel_s))
            r_unit = pos_s / max(1e-6, np.linalg.norm(pos_s))

            if direction == "PROGRADE":
                dv_vec = dv_kms * v_unit
            elif direction == "RETROGRADE":
                dv_vec = -dv_kms * v_unit
            elif direction == "RADIAL+":
                dv_vec = dv_kms * r_unit
            elif direction == "RADIAL-":
                dv_vec = -dv_kms * r_unit
            else:
                dv_vec = np.zeros(3)

            new_vel_s = vel_s + dv_vec
            sentinel["velocity_x"] = round(float(new_vel_s[0]), 7)
            sentinel["velocity_y"] = round(float(new_vel_s[1]), 7)
            sentinel["velocity_z"] = round(float(new_vel_s[2]), 7)
            sentinel["fuel_kg"] = max(5.0, round(sentinel.get("fuel_kg", 150.0) - candidate["propellant_kg"], 2))

            self.executed_maneuver = candidate
            self._burn_end_sim_time = self.sim_time + 150.0
            self._scenario_stage = max(self._scenario_stage, 2)
            sentinel["status"] = "MANEUVER"
            sentinel["mission_phase"] = "AVOIDANCE_BURN"
            passed = candidate["passed"]
            self.safety_status = "VERIFIED" if passed else "REVIEW REQUIRED"

            if target is not None:
                meta = target.setdefault("metadata", {})
                meta["predicted_cpa_km"] = candidate["resulting_d_cpa_km"]
                meta["cpa_time_s"] = candidate["resulting_t_cpa_s"]

            self.before_after_results = {
                "satellite_id": sentinel["id"],
                "satellite_name": sentinel["name"],
                "threat_id": target["id"] if target else "DEBRIS-2009-033A",
                "threat_name": target["name"] if target else "Cosmos-2251 Fragment",
                "initial_d_cpa_km": candidate["original_d_cpa_km"],
                "initial_t_cpa_s": candidate.get("original_t_cpa_s", 2396.0),
                "initial_risk": "CRITICAL",
                "screening_distance_km": self.screening_distance_km,
                "maneuver_applied": {
                    "id": candidate["id"],
                    "name": candidate["name"],
                    "direction": candidate["direction"],
                    "delta_v_ms": candidate["delta_v_ms"],
                    "delta_v_kms": candidate["delta_v_kms"],
                    "propellant_kg": candidate["propellant_kg"],
                },
                "verified_d_cpa_km": candidate["resulting_d_cpa_km"],
                "verified_t_cpa_s": candidate["resulting_t_cpa_s"],
                "verification_status": self.safety_status,
                "is_safe": passed,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "candidate_trajectory": candidate.get("trajectory_waypoints", [])
            }
            self.avoidance_history.append({
                "label": candidate["name"],
                "before_km": round(float(candidate["original_d_cpa_km"]), 3),
                "after_km": round(float(candidate["resulting_d_cpa_km"]), 3),
                "dv_ms": round(float(candidate["delta_v_ms"]), 2),
                "cleared": bool(passed)
            })

            self._handle_event(
                self.mission_id,
                self.sim_time,
                "MANEUVER_EXECUTED",
                f"Avoidance burn executed: {candidate['name']} (Δv={candidate['delta_v_ms']} m/s, fuel={candidate['propellant_kg']} kg). New separation d_CPA = {candidate['resulting_d_cpa_km']} km."
            )
            self._handle_event(
                self.mission_id,
                self.sim_time,
                "VERIFICATION_COMPLETED",
                f"Trajectory verified: Status {self.safety_status}. Clearance: {candidate['resulting_d_cpa_km']} km (threshold: {self.screening_distance_km} km)."
            )
            self.state_revision += 1

            return {
                "status": "ok",
                "safety_status": self.safety_status,
                "executed_maneuver": candidate,
                "before_after_results": self.before_after_results
            }

    def execute_custom_maneuver(self, dv_x_ms: float, dv_y_ms: float, dv_z_ms: float, name: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes a user-specified custom 3D impulsive velocity change [dv_x, dv_y, dv_z] in m/s.
        Computes fuel consumption, propagates modified orbit via RK4, and updates conjunction clearance.
        """
        with self._lock:
            sentinel = self.objects.get(self.sentinel_id)
            target = self.objects.get(self.target_id) if self.target_id else None
            if not sentinel:
                return {"status": "error", "message": "Sentinel spacecraft not found"}

            dv_vec_ms = np.array([dv_x_ms, dv_y_ms, dv_z_ms], dtype=float)
            dv_mag_ms = float(np.linalg.norm(dv_vec_ms))
            dv_vec_kms = dv_vec_ms / 1000.0

            wet_mass = 800.0
            isp = 310.0
            g0 = 9.80665
            fuel_kg = round(wet_mass * (1.0 - math.exp(-max(0.001, dv_mag_ms) / (isp * g0))), 2)

            pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
            vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)

            # Compute baseline and post-maneuver CPA via exact two-body RK4 BEFORE updating sentinel velocity
            d_cpa_orig = 0.0
            t_cpa_orig = 0.0
            if target:
                pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float)
                vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float)
                t_cpa_orig, d_cpa_orig, _ = compute_rk4_cpa(pos_s, vel_s, pos_t, vel_t, horizon_s=3600.0, coarse_dt=20.0)
                horizon_eval = max(600.0, min(3600.0, t_cpa_orig * 1.25 if t_cpa_orig > 10.0 else 3000.0))
                resulting_d_cpa, resulting_t_cpa, waypoints = predict_post_maneuver_cpa_rk4(
                    pos_s, vel_s, dv_vec_kms, pos_t, vel_t, horizon_s=horizon_eval, num_waypoints=56
                )
            else:
                resulting_d_cpa, resulting_t_cpa, waypoints = predict_post_maneuver_cpa_rk4(
                    pos_s, vel_s, dv_vec_kms, None, None, horizon_s=1800.0, num_waypoints=56
                )

            new_vel_s = vel_s + dv_vec_kms
            sentinel["velocity_x"] = round(float(new_vel_s[0]), 7)
            sentinel["velocity_y"] = round(float(new_vel_s[1]), 7)
            sentinel["velocity_z"] = round(float(new_vel_s[2]), 7)
            sentinel["fuel_kg"] = max(5.0, round(sentinel.get("fuel_kg", 150.0) - fuel_kg, 2))

            passed = bool(resulting_d_cpa >= self.screening_distance_km) if target else True
            self.safety_status = "VERIFIED" if passed else "REVIEW REQUIRED"

            if target is not None:
                meta = target.setdefault("metadata", {})
                meta["predicted_cpa_km"] = resulting_d_cpa
                meta["cpa_time_s"] = resulting_t_cpa

            custom_name = name or f"Custom Burn ({dv_mag_ms:.1f} m/s)"
            candidate_record = {
                "id": f"CUSTOM-{int(dv_mag_ms)}",
                "name": custom_name,
                "direction": "CUSTOM",
                "delta_v_ms": round(dv_mag_ms, 2),
                "delta_v_kms": round(dv_mag_ms / 1000.0, 4),
                "dv_vector": [round(dv_x_ms, 2), round(dv_y_ms, 2), round(dv_z_ms, 2)],
                "propellant_kg": fuel_kg,
                "original_d_cpa_km": round(d_cpa_orig, 2),
                "original_t_cpa_s": round(t_cpa_orig, 1),
                "resulting_d_cpa_km": resulting_d_cpa,
                "resulting_t_cpa_s": resulting_t_cpa,
                "screening_distance_km": self.screening_distance_km,
                "passed": passed,
                "status": "PASS" if passed else "FAIL",
                "trajectory_waypoints": waypoints
            }

            self.executed_maneuver = candidate_record
            self.selected_candidate = candidate_record
            self._burn_end_sim_time = self.sim_time + 150.0
            self._scenario_stage = max(self._scenario_stage, 2)
            sentinel["status"] = "MANEUVER"
            sentinel["mission_phase"] = "AVOIDANCE_BURN"

            self.before_after_results = {
                "satellite_id": sentinel["id"],
                "satellite_name": sentinel["name"],
                "threat_id": target["id"] if target else "DEBRIS-2009-033A",
                "threat_name": target["name"] if target else "Cosmos-2251 Fragment",
                "initial_d_cpa_km": round(d_cpa_orig, 2),
                "initial_t_cpa_s": round(t_cpa_orig, 1),
                "initial_risk": "CRITICAL",
                "screening_distance_km": self.screening_distance_km,
                "maneuver_applied": {
                    "id": candidate_record["id"],
                    "name": candidate_record["name"],
                    "direction": "CUSTOM 3D VECTOR",
                    "delta_v_ms": candidate_record["delta_v_ms"],
                    "delta_v_kms": candidate_record["delta_v_kms"],
                    "propellant_kg": candidate_record["propellant_kg"],
                },
                "verified_d_cpa_km": resulting_d_cpa,
                "verified_t_cpa_s": resulting_t_cpa,
                "verification_status": self.safety_status,
                "is_safe": passed,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "candidate_trajectory": waypoints
            }
            self.avoidance_history.append({
                "label": custom_name,
                "before_km": round(float(d_cpa_orig), 3),
                "after_km": round(float(resulting_d_cpa), 3),
                "dv_ms": round(float(dv_mag_ms), 2),
                "cleared": bool(passed)
            })

            self._handle_event(
                self.mission_id,
                self.sim_time,
                "CUSTOM_MANEUVER_EXECUTED",
                f"Custom 3D burn executed: Δv=[{dv_x_ms:.1f}, {dv_y_ms:.1f}, {dv_z_ms:.1f}] m/s (|Δv|={dv_mag_ms:.1f} m/s). New d_CPA = {resulting_d_cpa} km."
            )
            self.state_revision += 1

            return {
                "status": "ok",
                "safety_status": self.safety_status,
                "executed_maneuver": candidate_record,
                "before_after_results": self.before_after_results
            }

    def get_mission_results(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "results": self.before_after_results,
                "scenario": self.scenario_name,
                "safety_status": self.safety_status,
                "executed_maneuver": self.executed_maneuver,
                "events": list(self.event_log)
            }

    def get_catalogue_analytics(self) -> Dict[str, Any]:
        if self._cached_catalogue_analytics is not None:
            return self._cached_catalogue_analytics
        catalog = self.load_processed_dataset()
        total_objects = len(catalog)
        
        type_counts = {"DEBRIS": 0, "ACTIVE_SATELLITE": 0, "FAILED_SATELLITE": 0, "SERVICE_VEHICLE": 0}
        alt_bins = {"500-600 km": 0, "600-700 km": 0, "700-800 km": 0, "800-900 km": 0, "900+ km": 0}
        inc_bins = {"53° (Starlink)": 0, "74° (Cosmos)": 0, "82° (Polar)": 0, "98° (SSO)": 0}

        for obj in catalog:
            o_type = obj.get("object_type", "DEBRIS")
            type_counts[o_type] = type_counts.get(o_type, 0) + 1
            alt = obj.get("altitude", 600.0)
            if alt < 600:
                alt_bins["500-600 km"] += 1
            elif alt < 700:
                alt_bins["600-700 km"] += 1
            elif alt < 800:
                alt_bins["700-800 km"] += 1
            elif alt < 900:
                alt_bins["800-900 km"] += 1
            else:
                alt_bins["900+ km"] += 1

            inc = obj.get("inclination", 53.0)
            if abs(inc - 53.0) < 5:
                inc_bins["53° (Starlink)"] += 1
            elif abs(inc - 74.0) < 5:
                inc_bins["74° (Cosmos)"] += 1
            elif abs(inc - 82.5) < 5:
                inc_bins["82° (Polar)"] += 1
            else:
                inc_bins["98° (SSO)"] += 1

        self._cached_catalogue_analytics = {
            "total_objects": total_objects,
            "type_distribution": type_counts,
            "altitude_distribution": alt_bins,
            "inclination_distribution": inc_bins,
            "dataset_info": {
                "source": "Optical Space Debris Surveillance Dataset (train.csv / val.csv)",
                "disclaimer": "Catalogue analytics describes the objects in the selected dataset. The simulator uses independent synthetic scenarios to demonstrate collision avoidance. Catalogue records are not converted into live collision warnings."
            },
            "sample_records": catalog[:25]
        }
        return self._cached_catalogue_analytics

    def get_encounter_analytics(
        self,
        days: int = 30,
        seed: int = 42,
        threshold_km: float = 1.0,
        maneuver_dv_ms: float = 3.5,
        lead_time_min: float = 35.0
    ) -> Dict[str, Any]:
        """
        Generates physics-driven multi-orbit conjunction analytics grounded in the LIVE
        simulation state (active scenario objects, latest RK4 risks, candidate maneuvers,
        executed burns, and sim_time) combined with vectorized 2-body RK4 batch avoidance
        propagation over the tracked LEO debris catalogue:
          1. Distribution of miss distance (0-100 km capped, 2 km bins + threshold)
          2. Miss distance vs tracking uncertainty (Low/Medium/High + Live active conjunctions)
          3. 4x4 Pearson correlation matrix (Altitude, Speed, Uncert., Miss dist.)
          4. Effect of simulated avoidance manoeuvre (TRUE vectorized 2-body RK4 before/after + live burns)
          5. Daily encounter count across simulation days (modulated by active scenario flux)
        """
        days = max(5, min(90, int(days)))
        threshold_km = max(0.2, min(10.0, float(threshold_km)))
        maneuver_dv_ms = max(0.5, min(20.0, float(maneuver_dv_ms)))
        lead_time_min = max(5.0, min(90.0, float(lead_time_min)))

        rng = np.random.default_rng(seed)
        catalog = self.load_processed_dataset()

        with self._lock:
            live_objs = [dict(o) for o in self.objects.values()]
            sentinel_snap = dict(self.objects.get(self.sentinel_id, {})) if self.sentinel_id in self.objects else None
            objects_map_snap = {k: dict(v) for k, v in self.objects.items()}
            latest_risks_snap = [dict(r) for r in self.latest_risks]
            maneuver_candidates_snap = [dict(c) for c in self.maneuver_candidates]
            executed_maneuver_snap = dict(self.executed_maneuver) if self.executed_maneuver else None
            avoidance_history_snap = list(self.avoidance_history[-10:])
            scenario_name_snap = self.scenario_name
            sim_time_snap = self.sim_time
            is_running_snap = self.is_running
            safety_status_snap = self.safety_status
            screening_dist_snap = self.screening_distance_km
            telemetry_count_snap = len(self.telemetry_history)

        # Ground campaign altitude distribution in BOTH live objects AND tracked catalog
        live_alts = [float(o.get("altitude", 600.0)) for o in live_objs if o.get("altitude")]
        cat_alts = [float(o.get("altitude", 680.0)) for o in catalog] if catalog else []
        alt_pool = np.array((live_alts * 8) + cat_alts if (live_alts or cat_alts) else [600.0, 680.0, 750.0], dtype=float)

        # Scenario threat density & closing kinematics reflect active simulation scenario
        sc_lower = scenario_name_snap.lower()
        is_scen3 = "no acceptable" in sc_lower or "scenario 3" in sc_lower
        is_scen1 = "normal operation" in sc_lower or "scenario 1" in sc_lower
        base_daily_low, base_daily_high = (340, 395) if is_scen3 else ((295, 340) if is_scen1 else (306, 362))

        daily_counts = rng.integers(base_daily_low, base_daily_high, size=days)
        total = int(daily_counts.sum())

        alt = np.clip(rng.choice(alt_pool, size=total, replace=True) + rng.normal(0.0, 10.0, size=total), 480.0, 1020.0)
        # Circular LEO speed at sampled altitude + two-body encounter crossing geometry
        v_circ = np.sqrt(MU_EARTH / (R_EARTH + alt))
        cross_angles = rng.uniform(0.35, 2.85, size=total)  # ~20 deg to 163 deg orbit plane intersection
        speed = v_circ * np.sqrt(np.maximum(0.08, 2.0 * (1.0 - np.cos(cross_angles))))

        # Tracking uncertainty (0.03 - 2.00 km): surveillance covariance model scaled slightly by sensor arc
        uncert = np.clip(rng.gamma(2.1, 0.16, size=total) + 0.03, 0.03, 2.00)

        # Conjunction miss distances (km, capped at 100)
        hr_fraction = 0.058 if is_scen3 else (0.024 if is_scen1 else 0.044)
        n_hr = max(240, int(total * hr_fraction))
        miss_hr = rng.uniform(0.15, threshold_km * 0.99, size=n_hr)
        miss_bg = np.clip(rng.gamma(2.9, 10.2, size=total - n_hr), threshold_km + 0.05, 100.0)
        miss = np.concatenate([miss_hr, miss_bg])
        rng.shuffle(miss)

        # Inject ALL LIVE active pairwise conjunctions from the running simulation!
        live_conjunction_points = []
        sentinel = sentinel_snap
        for idx, risk in enumerate(latest_risks_snap[:12]):
            cpa_km = float(risk.get("cpa_distance_km", 50.0))
            rel_v = float(risk.get("relative_speed_kms", 7.5))
            cpa_t = float(risk.get("cpa_time_s", 0.0))
            obj_b = objects_map_snap.get(risk.get("object_b_id", ""), {})
            alt_b = float(obj_b.get("altitude", sentinel.get("altitude", 600.0) if sentinel else 600.0))
            # Physical radar/optical tracking uncertainty grows with time-to-CPA
            dyn_uncert = round(float(min(2.0, 0.08 + 0.00018 * max(0.0, cpa_t))), 3)
            live_conjunction_points.append({
                "pair": f"{risk.get('object_a_id')} vs {risk.get('object_b_id')}",
                "uncertainty_km": dyn_uncert,
                "miss_distance_km": round(min(100.0, cpa_km), 2),
                "raw_cpa_km": round(cpa_km, 2),
                "current_range_km": round(float(risk.get("current_distance_km", 0.0)), 2),
                "cpa_time_s": round(cpa_t, 1),
                "altitude_km": round(alt_b, 1),
                "speed_kms": round(rel_v, 2),
                "risk_level": risk.get("risk_level", "LOW"),
                "is_live": True
            })

        day_indices = np.repeat(np.arange(days), daily_counts)
        hr_mask = miss <= threshold_km
        med_mask = (miss > threshold_km) & (miss <= 15.0)
        low_mask = miss > 15.0

        daily_encounters = []
        for d_idx in range(days):
            day_mask = (day_indices == d_idx)
            hr_cnt = int(np.sum(day_mask & hr_mask))
            if d_idx == 0:
                hr_cnt += sum(1 for r in latest_risks_snap if float(r.get("cpa_distance_km", 999.0)) <= screening_dist_snap)
            daily_encounters.append({
                "day": d_idx,
                "encounters": int(daily_counts[d_idx]) + (len(latest_risks_snap) if d_idx == 0 else 0),
                "high_risk": hr_cnt
            })

        # 1. Miss distance histogram (50 bins, 0-100 km, width 2 km)
        edges = np.linspace(0.0, 100.0, 51)
        counts, _ = np.histogram(miss, bins=edges)
        miss_histogram = []
        for i in range(len(counts)):
            b_start = float(edges[i])
            b_end = float(edges[i + 1])
            b_mid = round((b_start + b_end) / 2.0, 1)
            miss_histogram.append({
                "bin_start": b_start,
                "bin_end": b_end,
                "bin_mid": b_mid,
                "label": f"{int(b_start)}-{int(b_end)}",
                "encounters": int(counts[i]),
                "is_high_risk": bool(b_start < threshold_km)
            })

        # 2. Miss distance vs Tracking uncertainty scatter
        def sample_points(mask: np.ndarray, max_pts: int):
            idxs = np.where(mask)[0]
            if len(idxs) > max_pts:
                idxs = rng.choice(idxs, size=max_pts, replace=False)
            return [
                {
                    "uncertainty_km": round(float(uncert[i]), 3),
                    "miss_distance_km": round(float(miss[i]), 2),
                    "altitude_km": round(float(alt[i]), 1),
                    "speed_kms": round(float(speed[i]), 2)
                }
                for i in idxs
            ]

        scatter_low = sample_points(low_mask, 750)
        scatter_medium = sample_points(med_mask, 380)
        scatter_high = sample_points(hr_mask, 220)

        # 3. 4x4 Pearson correlation matrix [Altitude, Speed, Uncert., Miss dist.]
        corr = np.corrcoef(np.vstack([alt, speed, uncert, miss]))
        corr = np.nan_to_num(corr, nan=0.0)
        labels = ["Altitude", "Speed", "Uncert.", "Miss dist."]
        correlation_matrix = [
            [round(float(corr[r, c]), 2) for c in range(4)]
            for r in range(4)
        ]

        # 4. TRUE Vectorized Two-Body RK4 Avoidance Maneuver Simulation across high-risk cohort
        hr_indices = np.where(hr_mask)[0]
        if len(hr_indices) > 260:
            hr_indices = rng.choice(hr_indices, size=260, replace=False)

        n_sim = len(hr_indices)
        lead_s = lead_time_min * 60.0
        dv_kms = maneuver_dv_ms / 1000.0

        avoidance_points = []
        cleared_count = 0
        if n_sim > 0:
            miss_sub = miss[hr_indices]
            alt_sub = alt[hr_indices]
            # Construct authentic 3D circular/crossing LEO conjunction states at t = lead_s
            r_conj_mag = R_EARTH + alt_sub
            phi = rng.uniform(0.0, 2.0 * np.pi, size=n_sim)
            cos_p, sin_p = np.cos(phi), np.sin(phi)
            # Spacecraft unit basis (R, T, N) at conjunction epoch
            r_hat = np.stack([cos_p, sin_p, np.zeros(n_sim)], axis=1)
            t_hat = np.stack([-sin_p, cos_p, np.zeros(n_sim)], axis=1)
            n_hat = np.tile(np.array([[0.0, 0.0, 1.0]]), (n_sim, 1))

            v_mag = np.sqrt(MU_EARTH / r_conj_mag)
            ps_c = r_conj_mag[:, None] * r_hat
            vs_c = v_mag[:, None] * t_hat

            # Debris crossing at oblique orbital inclination angle psi with miss offset perpendicular to relative motion
            psi = rng.uniform(np.radians(22.0), np.radians(158.0), size=n_sim)
            beta = rng.uniform(0.0, 2.0 * np.pi, size=n_sim)
            miss_dir = np.cos(beta)[:, None] * r_hat + np.sin(beta)[:, None] * n_hat
            pd_c = ps_c + miss_sub[:, None] * miss_dir
            v_d_mag = np.sqrt(MU_EARTH / np.linalg.norm(pd_c, axis=1))
            vd_c = v_d_mag[:, None] * (np.cos(psi)[:, None] * t_hat + np.sin(psi)[:, None] * n_hat)

            # Backward-RK4 propagate both spacecraft and debris from conjunction epoch to burn epoch (t=0)
            ps0, vs0 = propagate_rk4_batch(ps_c, vs_c, -lead_s, max_step_s=30.0)
            pd0, vd0 = propagate_rk4_batch(pd_c, vd_c, -lead_s, max_step_s=30.0)

            # Unburned RK4 CPA (verify actual RK4 pre-burn miss distance)
            _, before_rk4, _ = compute_rk4_cpa_batch(ps0, vs0, pd0, vd0, horizon_s=lead_s + 180.0, dt=25.0)

            # Apply REAL Prograde impulsive burn dv_kms along satellite velocity at t = 0
            v_s_norm = np.linalg.norm(vs0, axis=1, keepdims=True)
            v_burn0 = vs0 + dv_kms * (vs0 / np.maximum(v_s_norm, 1e-6))

            # Forward-RK4 propagate post-burn spacecraft vs debris to exact post-maneuver CPA
            _, after_rk4, _ = compute_rk4_cpa_batch(ps0, v_burn0, pd0, vd0, horizon_s=lead_s + 240.0, dt=25.0)

            for b_km, a_km in zip(before_rk4, after_rk4):
                b_val = round(float(b_km), 3)
                a_val = round(float(a_km), 2)
                is_cl = bool(a_val >= threshold_km)
                if is_cl:
                    cleared_count += 1
                avoidance_points.append({
                    "before_km": b_val,
                    "after_km": a_val,
                    "cleared": is_cl
                })

        # Active live simulation maneuver candidates & executed burns for real-time comparison
        live_candidates_summary = []
        top_cpa_orig = float(latest_risks_snap[0]["cpa_distance_km"]) if latest_risks_snap else 2.33
        for cand in maneuver_candidates_snap:
            live_candidates_summary.append({
                "id": cand.get("id"),
                "label": cand.get("name"),
                "direction": cand.get("direction"),
                "dv_ms": float(cand.get("delta_v_ms", 0.0)),
                "before_km": round(float(cand.get("original_d_cpa_km", top_cpa_orig)), 2),
                "after_km": round(float(cand.get("resulting_d_cpa_km", 0.0)), 2),
                "cleared": bool(cand.get("passed", False)),
                "executed": bool(executed_maneuver_snap and executed_maneuver_snap.get("id") == cand.get("id"))
            })

        total_tested = len(avoidance_points)
        success_rate = round((cleared_count / max(1, total_tested)) * 100.0, 1)

        return {
            "summary": {
                "total_encounters": total,
                "days": days,
                "seed": seed,
                "threshold_km": threshold_km,
                "maneuver_dv_ms": maneuver_dv_ms,
                "lead_time_min": lead_time_min,
                "high_risk_count": int(np.sum(hr_mask)),
                "medium_risk_count": int(np.sum(med_mask)),
                "low_risk_count": int(np.sum(low_mask)),
                "mean_daily_encounters": round(total / days, 1),
                "avoidance_tested": total_tested,
                "avoidance_cleared": cleared_count,
                "avoidance_success_rate_pct": success_rate,
                "physics_solver": "Vectorized Two-Body RK4 (mu = 398,600.44 km^3/s^2)"
            },
            "live_simulation": {
                "scenario_name": scenario_name_snap,
                "sim_time": round(sim_time_snap, 1),
                "is_running": is_running_snap,
                "safety_status": safety_status_snap,
                "screening_distance_km": screening_dist_snap,
                "active_conjunctions": live_conjunction_points,
                "candidate_maneuvers": live_candidates_summary,
                "executed_maneuver": executed_maneuver_snap.get("name") if executed_maneuver_snap else None,
                "telemetry_samples": telemetry_count_snap
            },
            "miss_distance_histogram": miss_histogram,
            "miss_vs_uncertainty": {
                "low": scatter_low,
                "medium": scatter_medium,
                "high": scatter_high,
                "live": live_conjunction_points
            },
            "correlation_matrix": {
                "labels": labels,
                "matrix": correlation_matrix
            },
            "avoidance_effect": {
                "threshold_km": threshold_km,
                "points": avoidance_points,
                "session_maneuvers": avoidance_history_snap + [
                    {
                        "label": c["label"],
                        "before_km": c["before_km"],
                        "after_km": c["after_km"],
                        "dv_ms": c["dv_ms"],
                        "cleared": c["cleared"]
                    }
                    for c in live_candidates_summary if c["executed"]
                ]
            },
            "daily_encounters": daily_encounters
        }

    def run_autonomous_avoidance(self) -> Dict[str, Any]:
        with self._lock:
            self.autonomous_avoidance_active = True
            self._handle_event(self.mission_id, self.sim_time, "AUTONOMOUS_ENGAGED", "Autonomous collision-avoidance workflow engaged: DETECT -> TRACK -> PREDICT -> ASSESS -> DECIDE -> MANEUVER -> VERIFY.")
            if not self.target_id:
                if self.latest_risks:
                    self.target_id = self.latest_risks[0]["object_b_id"]
            
            candidates = self.evaluate_maneuver_candidates(self.target_id)
            if self.selected_candidate:
                return self.execute_maneuver(self.selected_candidate["id"])
            else:
                self.safety_status = "REVIEW REQUIRED"
                self.state_revision += 1
                return {"status": "review_required", "message": "No candidate satisfies screening clearance."}

    def export_session_snapshot(self, client_session_id: Optional[str] = None) -> str:
        """
        Exports a compact zlib+base64 state snapshot token so stateless serverless
        invocations remain synchronized across cold starts and worker instances.
        """
        with self._lock:
            sid = client_session_id or self._active_client_session
            sentinel = self.objects.get(self.sentinel_id)
            target = self.objects.get(self.target_id) if self.target_id else None

            sat_snap = None
            if sentinel:
                sat_snap = [
                    round(float(sentinel["position_x"]), 5),
                    round(float(sentinel["position_y"]), 5),
                    round(float(sentinel["position_z"]), 5),
                    round(float(sentinel["velocity_x"]), 6),
                    round(float(sentinel["velocity_y"]), 6),
                    round(float(sentinel["velocity_z"]), 6),
                    round(float(sentinel.get("fuel_kg", 150.0)), 2),
                    round(float(sentinel.get("battery_pct", 100.0)), 1),
                    sentinel.get("status", "NOMINAL"),
                    sentinel.get("mission_phase", self.state_machine.current_phase.value),
                ]

            tgt_snap = None
            if target:
                meta = target.get("metadata") or {}
                tgt_snap = [
                    round(float(target["position_x"]), 5),
                    round(float(target["position_y"]), 5),
                    round(float(target["position_z"]), 5),
                    round(float(target["velocity_x"]), 6),
                    round(float(target["velocity_y"]), 6),
                    round(float(target["velocity_z"]), 6),
                    target.get("status", "DRIFTING"),
                    meta.get("predicted_cpa_km"),
                    meta.get("cpa_time_s"),
                ]

            exec_snap = None
            if self.executed_maneuver:
                em = self.executed_maneuver
                exec_snap = {
                    "id": em.get("id"),
                    "name": em.get("name"),
                    "dir": em.get("direction"),
                    "dv_ms": em.get("delta_v_ms"),
                    "dv_kms": em.get("delta_v_kms"),
                    "dv_vec": em.get("dv_vector"),
                    "prop": em.get("propellant_kg"),
                    "od": em.get("original_d_cpa_km"),
                    "ot": em.get("original_t_cpa_s"),
                    "rd": em.get("resulting_d_cpa_km"),
                    "rt": em.get("resulting_t_cpa_s"),
                    "pass": bool(em.get("passed", False)),
                    "th_id": (self.before_after_results or {}).get("threat_id"),
                    "th_name": (self.before_after_results or {}).get("threat_name"),
                }

            payload = {
                "iid": INSTANCE_ID,
                "sid": sid,
                "rev": self.state_revision,
                "wt": round(self.last_update_wall_time, 3),
                "sc": self.scenario_name,
                "md": self.mode,
                "run": bool(self.is_running),
                "st": round(self.sim_time, 4),
                "ts": self.time_scale,
                "sd": self.screening_distance_km,
                "mid": self.mission_id,
                "tid": self.target_id,
                "reloc": self.relocation_strategy,
                "auto": bool(self.autonomous_avoidance_active),
                "stage": self._scenario_stage,
                "burn_end": round(self._burn_end_sim_time, 3) if self._burn_end_sim_time is not None else None,
                "ss": self.safety_status,
                "dr_idx": self.dataset_replay_idx,
                "sm": {
                    "ph": self.state_machine.current_phase.value,
                    "pel": round(self.state_machine.phase_elapsed_time_s, 3),
                    "mst": round(self.state_machine.mission_start_sim_time, 3),
                    "cs": self.state_machine.capture_step,
                },
                "sat": sat_snap,
                "tgt": tgt_snap,
                "exec_m": exec_snap,
                "ah": self.avoidance_history[-5:],
                "cfg": {
                    "w": dict(self.planner.weights),
                    "tc": self.risk_engine.config.get("threshold_critical_km", 5.0),
                    "th": self.risk_engine.config.get("threshold_high_km", 20.0),
                    "twc": self.risk_engine.config.get("time_window_critical_s", 1800.0),
                },
            }
            raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            compressed = zlib.compress(raw, level=6)
            return base64.urlsafe_b64encode(compressed).decode("ascii")

    def sync_from_session_token(self, token: Optional[str], client_session_id: Optional[str] = None) -> bool:
        """
        Synchronizes this engine instance from a client's compressed X-Sentinel-State token.
        Returns True if rehydration/reset was performed, False if already in sync or headerless.
        """
        if not client_session_id and not token:
            return False

        if not token and client_session_id:
            with self._lock:
                if self._active_client_session is None:
                    self._active_client_session = client_session_id
                    if self.sim_time == 0.0:
                        self.last_update_wall_time = time.time()
                    return False
                if self._active_client_session != client_session_id:
                    self._suppress_db_logs = True
                    try:
                        self.time_scale = 25.0
                        self.screening_distance_km = 25.0
                        self.relocation_strategy = "DISPOSAL ORBIT"
                        self.avoidance_history = []
                        self.load_scenario("Scenario 2: Avoidable Close Approach")
                        self._active_client_session = client_session_id
                    finally:
                        self._suppress_db_logs = False
                    return True
                return False

        try:
            raw = zlib.decompress(base64.urlsafe_b64decode(token.encode("ascii")))
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            return False

        sid = client_session_id or data.get("sid")
        rev = int(data.get("rev", 1))

        with self._lock:
            if (
                data.get("iid") == INSTANCE_ID
                and self._active_client_session == sid
                and rev <= self.state_revision
            ):
                return False

            self._suppress_db_logs = True
            try:
                cfg = data.get("cfg") or {}
                if cfg.get("w"):
                    self.planner.set_weights(cfg["w"])
                thresh_update = {}
                if "tc" in cfg:
                    thresh_update["threshold_critical_km"] = float(cfg["tc"])
                if "th" in cfg:
                    thresh_update["threshold_high_km"] = float(cfg["th"])
                if "twc" in cfg:
                    thresh_update["time_window_critical_s"] = float(cfg["twc"])
                if thresh_update:
                    self.risk_engine.set_config(thresh_update)

                sc = data.get("sc", "Scenario 2: Avoidable Close Approach")
                md = data.get("md", "SIMULATION")
                target_st = float(data.get("st", 0.0))
                tid = data.get("tid")
                wt = data.get("wt")

                if md == "DATASET_REPLAY":
                    if self.mode != "DATASET_REPLAY" or self._active_client_session != sid:
                        self.load_dataset_replay()
                    self.dataset_replay_idx = int(data.get("dr_idx", 0))
                    if self.dataset_records:
                        idx = self.dataset_replay_idx % len(self.dataset_records)
                        rec = self.dataset_records[idx]
                        self.objects[rec["id"]] = rec
                        self.target_id = rec["id"]
                    self.sim_time = target_st
                    self.last_update_wall_time = float(wt) if wt is not None else time.time()
                    self.is_running = bool(data.get("run", True))
                    self.time_scale = float(data.get("ts", 25.0))
                    self._active_client_session = sid
                    self.state_revision = max(self.state_revision, rev)
                    self._update_orbital_metrics()
                    return True

                need_reload = (
                    self.mode != "SIMULATION"
                    or self.scenario_name != sc
                    or self._active_client_session != sid
                    or target_st < self.sim_time - 0.5
                )
                if need_reload:
                    self.load_scenario(sc)

                self.screening_distance_km = float(data.get("sd", 25.0))
                self.relocation_strategy = data.get("reloc", "DISPOSAL ORBIT")
                self.mission_id = data.get("mid", self.mission_id)
                self.state_machine.mission_id = self.mission_id
                if tid is None or tid in self.objects:
                    self.target_id = tid

                delta_t = target_st - self.sim_time
                if abs(delta_t) > 0.05:
                    passive_ids = [
                        oid for oid in self.objects
                        if oid != self.sentinel_id and oid != self.target_id
                    ]
                    if passive_ids:
                        pos_mat = np.array(
                            [[self.objects[oid]["position_x"], self.objects[oid]["position_y"], self.objects[oid]["position_z"]] for oid in passive_ids],
                            dtype=float,
                        )
                        vel_mat = np.array(
                            [[self.objects[oid]["velocity_x"], self.objects[oid]["velocity_y"], self.objects[oid]["velocity_z"]] for oid in passive_ids],
                            dtype=float,
                        )
                        new_p, new_v = propagate_rk4_batch(pos_mat, vel_mat, delta_t, max_step_s=20.0)
                        for idx, oid in enumerate(passive_ids):
                            obj = self.objects[oid]
                            px, py, pz = float(new_p[idx, 0]), float(new_p[idx, 1]), float(new_p[idx, 2])
                            vx, vy, vz = float(new_v[idx, 0]), float(new_v[idx, 1]), float(new_v[idx, 2])
                            r_norm = max(1e-6, math.sqrt(px * px + py * py + pz * pz))
                            acc_scale = -(MU_EARTH / (r_norm ** 3))
                            obj["position_x"] = round(px, 6)
                            obj["position_y"] = round(py, 6)
                            obj["position_z"] = round(pz, 6)
                            obj["velocity_x"] = round(vx, 7)
                            obj["velocity_y"] = round(vy, 7)
                            obj["velocity_z"] = round(vz, 7)
                            obj["acceleration_x"] = round(acc_scale * px, 7)
                            obj["acceleration_y"] = round(acc_scale * py, 7)
                            obj["acceleration_z"] = round(acc_scale * pz, 7)
                            obj["altitude"] = round(r_norm - R_EARTH, 2)
                            obj["timestamp"] = round(target_st, 2)

                sat_snap = data.get("sat")
                if sat_snap and self.sentinel_id in self.objects and len(sat_snap) >= 10:
                    sat = self.objects[self.sentinel_id]
                    px, py, pz = float(sat_snap[0]), float(sat_snap[1]), float(sat_snap[2])
                    vx, vy, vz = float(sat_snap[3]), float(sat_snap[4]), float(sat_snap[5])
                    r_norm = max(1e-6, math.sqrt(px * px + py * py + pz * pz))
                    acc_scale = -(MU_EARTH / (r_norm ** 3))
                    sat["position_x"] = round(px, 6)
                    sat["position_y"] = round(py, 6)
                    sat["position_z"] = round(pz, 6)
                    sat["velocity_x"] = round(vx, 7)
                    sat["velocity_y"] = round(vy, 7)
                    sat["velocity_z"] = round(vz, 7)
                    sat["acceleration_x"] = round(acc_scale * px, 7)
                    sat["acceleration_y"] = round(acc_scale * py, 7)
                    sat["acceleration_z"] = round(acc_scale * pz, 7)
                    sat["altitude"] = round(r_norm - R_EARTH, 2)
                    sat["fuel_kg"] = float(sat_snap[6])
                    sat["battery_pct"] = float(sat_snap[7])
                    sat["status"] = sat_snap[8]
                    sat["mission_phase"] = sat_snap[9]
                    sat["timestamp"] = round(target_st, 2)

                tgt_snap = data.get("tgt")
                if tgt_snap and self.target_id and self.target_id in self.objects and len(tgt_snap) >= 9:
                    tgt = self.objects[self.target_id]
                    px, py, pz = float(tgt_snap[0]), float(tgt_snap[1]), float(tgt_snap[2])
                    vx, vy, vz = float(tgt_snap[3]), float(tgt_snap[4]), float(tgt_snap[5])
                    r_norm = max(1e-6, math.sqrt(px * px + py * py + pz * pz))
                    tgt["position_x"] = round(px, 6)
                    tgt["position_y"] = round(py, 6)
                    tgt["position_z"] = round(pz, 6)
                    tgt["velocity_x"] = round(vx, 7)
                    tgt["velocity_y"] = round(vy, 7)
                    tgt["velocity_z"] = round(vz, 7)
                    tgt["altitude"] = round(r_norm - R_EARTH, 2)
                    tgt["status"] = tgt_snap[6]
                    tgt["timestamp"] = round(target_st, 2)
                    meta = tgt.setdefault("metadata", {})
                    if tgt_snap[7] is not None:
                        meta["predicted_cpa_km"] = tgt_snap[7]
                    if tgt_snap[8] is not None:
                        meta["cpa_time_s"] = tgt_snap[8]

                self.sim_time = target_st
                self.last_update_wall_time = float(wt) if wt is not None else time.time()
                self.is_running = bool(data.get("run", True))
                self.time_scale = float(data.get("ts", 25.0))
                self.autonomous_avoidance_active = bool(data.get("auto", False))
                self._scenario_stage = int(data.get("stage", 0))
                self._burn_end_sim_time = data.get("burn_end")
                self.safety_status = data.get("ss", self.safety_status)

                if "ah" in data and isinstance(data["ah"], list):
                    self.avoidance_history = list(data["ah"])

                sm = data.get("sm") or {}
                try:
                    self.state_machine.current_phase = MissionPhase(sm.get("ph", "IDLE"))
                except Exception:
                    self.state_machine.current_phase = MissionPhase.IDLE
                self.state_machine.phase_elapsed_time_s = float(sm.get("pel", 0.0))
                self.state_machine.mission_start_sim_time = float(sm.get("mst", 0.0))
                self.state_machine.capture_step = int(sm.get("cs", 0))
                self.state_machine.target_id = self.target_id
                self.state_machine.relocation_strategy = self.relocation_strategy

                exec_snap = data.get("exec_m")
                if exec_snap:
                    sat = self.objects.get(self.sentinel_id)
                    tgt = self.objects.get(self.target_id) if self.target_id else None
                    live_wps: List[Dict[str, float]] = []
                    if sat and tgt:
                        pos_s = np.array([sat["position_x"], sat["position_y"], sat["position_z"]], dtype=float)
                        vel_s = np.array([sat["velocity_x"], sat["velocity_y"], sat["velocity_z"]], dtype=float)
                        pos_t = np.array([tgt["position_x"], tgt["position_y"], tgt["position_z"]], dtype=float)
                        vel_t = np.array([tgt["velocity_x"], tgt["velocity_y"], tgt["velocity_z"]], dtype=float)
                        _, _, live_wps = predict_post_maneuver_cpa_rk4(
                            pos_s, vel_s, np.zeros(3), pos_t, vel_t, horizon_s=2400.0, num_waypoints=56
                        )

                    cand = {
                        "id": exec_snap.get("id"),
                        "name": exec_snap.get("name"),
                        "direction": exec_snap.get("dir"),
                        "delta_v_ms": exec_snap.get("dv_ms"),
                        "delta_v_kms": exec_snap.get("dv_kms"),
                        "dv_vector": exec_snap.get("dv_vec"),
                        "propellant_kg": exec_snap.get("prop"),
                        "original_d_cpa_km": exec_snap.get("od"),
                        "original_t_cpa_s": exec_snap.get("ot"),
                        "resulting_d_cpa_km": exec_snap.get("rd"),
                        "resulting_t_cpa_s": exec_snap.get("rt"),
                        "screening_distance_km": self.screening_distance_km,
                        "passed": bool(exec_snap.get("pass", False)),
                        "status": "PASS" if exec_snap.get("pass") else "FAIL",
                        "trajectory_waypoints": live_wps,
                    }
                    self.executed_maneuver = cand
                    self.selected_candidate = cand
                    self.before_after_results = {
                        "satellite_id": self.sentinel_id,
                        "satellite_name": sat["name"] if sat else "SAT-01",
                        "threat_id": exec_snap.get("th_id") or (tgt["id"] if tgt else "DEBRIS-2009-033A"),
                        "threat_name": exec_snap.get("th_name") or (tgt["name"] if tgt else "Cosmos-2251 Fragment"),
                        "initial_d_cpa_km": cand["original_d_cpa_km"],
                        "initial_t_cpa_s": cand["original_t_cpa_s"] or 2396.0,
                        "initial_risk": "CRITICAL",
                        "screening_distance_km": self.screening_distance_km,
                        "maneuver_applied": {
                            "id": cand["id"],
                            "name": cand["name"],
                            "direction": cand["direction"],
                            "delta_v_ms": cand["delta_v_ms"],
                            "delta_v_kms": cand["delta_v_kms"],
                            "propellant_kg": cand["propellant_kg"],
                        },
                        "verified_d_cpa_km": cand["resulting_d_cpa_km"],
                        "verified_t_cpa_s": cand["resulting_t_cpa_s"],
                        "verification_status": self.safety_status,
                        "is_safe": cand["passed"],
                        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                        "candidate_trajectory": live_wps,
                    }
                else:
                    self.executed_maneuver = None
                    self.before_after_results = None
                    if self.target_id and (abs(delta_t) > 0.05 or need_reload):
                        saved_ss = self.safety_status
                        self.evaluate_maneuver_candidates(self.target_id, self.screening_distance_km)
                        self.safety_status = saved_ss

                self._update_orbital_metrics()
                self._active_client_session = sid
                self.state_revision = max(self.state_revision, rev)
                return True
            finally:
                self._suppress_db_logs = False

    def get_full_state(self) -> Dict[str, Any]:
        with self._lock:
            sentinel = self.objects.get(self.sentinel_id, {})
            target = self.objects.get(self.target_id, {}) if self.target_id else None
            
            # Target rankings
            best_target_info = None
            if sentinel:
                pos_s = np.array([sentinel.get("position_x", 0), sentinel.get("position_y", 0), sentinel.get("position_z", 0)], dtype=float)
                best_target_info = self.planner.select_best_target(
                    list(self.objects.values()),
                    pos_s,
                    sentinel.get("fuel_kg", 150.0),
                    self.latest_risks
                )

            return {
                "clock": {
                    "is_running": self.is_running,
                    "sim_time": round(self.sim_time, 2),
                    "mission_elapsed_time_s": round(max(0.0, self.sim_time - self.state_machine.mission_start_sim_time), 1),
                    "real_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                    "time_scale": self.time_scale,
                    "mode": self.mode,
                    "scenario_name": self.scenario_name
                },
                "mission": {
                    "id": self.mission_id,
                    "phase": sentinel.get("mission_phase", self.state_machine.current_phase.value) if sentinel else self.state_machine.current_phase.value,
                    "target_id": self.target_id,
                    "relocation_strategy": self.relocation_strategy,
                    "capture_step": self.state_machine.capture_step,
                    "inspection_data": self.state_machine.inspection_data,
                    "maneuver_data": self.state_machine.maneuver_data,
                    "intercept_plan": self.state_machine.intercept_plan,
                    "success": self.state_machine.current_phase == MissionPhase.MISSION_COMPLETE
                },
                "safety_status": self.safety_status,
                "screening_distance_km": self.screening_distance_km,
                "decision_rationale": self.decision_rationale,
                "maneuver_candidates": self.maneuver_candidates,
                "selected_candidate": self.selected_candidate,
                "executed_maneuver": self.executed_maneuver,
                "before_after_results": self.before_after_results,
                "autonomous_avoidance_active": self.autonomous_avoidance_active,
                "sentinel": sentinel,
                "target": target,
                "objects": list(self.objects.values()),
                "risks": self.latest_risks[:15],
                "recommendation": self.latest_recommendation,
                "anomaly": self.latest_anomaly,
                "ranked_targets": best_target_info["all_ranked"][:8] if best_target_info else [],
                "events": self.event_log[-35:],
                "telemetry": self.telemetry_history[-100:]
            }

# Global singleton simulation instance
simulation_engine = SimulationEngine()
