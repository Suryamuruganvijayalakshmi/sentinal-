"""
SENTINEL Comprehensive Automated Test Suite
Validates:
  1. Position magnitude calculation (D = sqrt(x^2 + y^2 + z^2))
  2. Velocity magnitude & difference
  3. Acceleration calculation (Newtonian two-body gravity A = -mu/r^3 * P)
  4. Future position second-order prediction (P_future = P + Vt + 0.5 A t^2)
  5. CPA time calculation (t_CPA = - (r.v)/(v.v))
  6. CPA distance calculation (d_CPA = |r + v * t_CPA|)
  7. Collision-risk classification (SAFE, LOW, MEDIUM, HIGH, CRITICAL)
  8. Autonomous target priority selection scoring
  9. Interception feasibility & delta-v calculation
  10. Relocation maneuver calculations
  11. Dataset parsing & adapter verification
  12. AI anomaly detection
  13. Mission state machine phase transitions
  14. Complete End-to-End Simulation Test:
      Dataset -> Detection -> Risk -> Selection -> Prediction -> Intercept -> Rendezvous -> Capture -> Maneuver -> Complete
"""

import sys
import os
import math
import numpy as np

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sentinel.backend.orbital.physics import (
    MU_EARTH, R_EARTH, position_magnitude, altitude_from_position,
    gravitational_acceleration, predict_future_position, propagate_two_body_rk4,
    compute_cpa, compute_orbital_elements
)
from sentinel.backend.risk.collision import CollisionRiskEngine
from sentinel.backend.prediction.propagator import PredictionEngine
from sentinel.backend.ai.anomaly import AnomalyDetector
from sentinel.backend.ai.recommendation import RecommendationEngine, SafetyValidator
from sentinel.backend.mission.planner import MissionPlanner
from sentinel.backend.mission.state_machine import MissionStateMachine, MissionPhase
from sentinel.backend.dataset.adapter import derive_orbital_state_from_bbox, process_dataset
from sentinel.backend.simulation.engine import SimulationEngine

def test_position_magnitude():
    # 3-4-0 right triangle check
    d = position_magnitude(3000.0, 4000.0, 0.0)
    assert math.isclose(d, 5000.0, rel_tol=1e-6)
    
    # 3D vector check
    d3 = position_magnitude(100.0, 200.0, 200.0)
    assert math.isclose(d3, 300.0, rel_tol=1e-6)

def test_gravitational_acceleration():
    pos = np.array([R_EARTH + 500.0, 0.0, 0.0])
    acc = gravitational_acceleration(pos)
    r = R_EARTH + 500.0
    expected_acc_mag = MU_EARTH / (r ** 2)
    # Direction must be antiparallel to position
    assert acc[0] < 0
    assert math.isclose(abs(acc[0]), expected_acc_mag, rel_tol=1e-5)
    assert math.isclose(acc[1], 0.0, abs_tol=1e-9)

def test_future_position():
    pos = np.array([7000.0, 0.0, 0.0])
    vel = np.array([0.0, 7.5, 0.0])
    dt = 10.0
    p_future = predict_future_position(pos, vel, dt)
    acc = gravitational_acceleration(pos)
    expected_p = pos + vel * dt + 0.5 * acc * (dt ** 2)
    assert np.allclose(p_future, expected_p)

def test_cpa_calculation():
    # Object A at origin, stationary
    # Object B at (10, 10, 0), moving towards negative x at 1 km/s: vel = (-1, 0, 0)
    r_rel = np.array([10.0, 10.0, 0.0])
    v_rel = np.array([-1.0, 0.0, 0.0])
    t_cpa, d_cpa = compute_cpa(r_rel, v_rel)
    # Closest approach occurs when x reaches 0, which takes 10 seconds
    assert math.isclose(t_cpa, 10.0, abs_tol=1e-5)
    # At t=10, pos = (0, 10, 0), so distance is exactly 10.0 km
    assert math.isclose(d_cpa, 10.0, abs_tol=1e-5)

def test_collision_risk_classification():
    engine = CollisionRiskEngine({
        "threshold_critical_km": 5.0,
        "threshold_high_km": 20.0
    })
    
    # 1. Critical risk pair (CPA < 5 km)
    obj_a = {"id": "A", "name": "Sat A", "position_x": 7000.0, "position_y": 0.0, "position_z": 0.0,
             "velocity_x": 0.0, "velocity_y": 7.5, "velocity_z": 0.0}
    obj_b = {"id": "B", "name": "Sat B", "position_x": 7002.0, "position_y": 10.0, "position_z": 0.0,
             "velocity_x": 0.0, "velocity_y": 7.4, "velocity_z": 0.0}
    eval_res = engine.evaluate_pair(obj_a, obj_b)
    assert eval_res["risk_level"] in ["CRITICAL", "HIGH"]
    assert eval_res["cpa_distance_km"] < 15.0

def test_target_priority_scoring():
    planner = MissionPlanner()
    sentinel_pos = np.array([7000.0, 0.0, 0.0])
    
    cand_safe = {
        "id": "SAT-SAFE", "name": "Safe Sat", "object_type": "ACTIVE_SATELLITE",
        "position_x": 7100.0, "position_y": 100.0, "position_z": 0.0,
        "risk_level": "SAFE", "health_status": "HEALTHY"
    }
    cand_critical = {
        "id": "SAT-CRIT", "name": "Critical Sat", "object_type": "FAILED_SATELLITE",
        "position_x": 7050.0, "position_y": 50.0, "position_z": 0.0,
        "risk_level": "CRITICAL", "health_status": "NON-RESPONSIVE"
    }
    
    score_safe = planner.calculate_target_score(cand_safe, sentinel_pos, 150.0)
    score_crit = planner.calculate_target_score(cand_critical, sentinel_pos, 150.0)
    
    assert score_crit["total_score"] > score_safe["total_score"]
    assert score_crit["total_score"] > 0.65

def test_interception_planner_feasibility():
    planner = MissionPlanner()
    sentinel = {
        "position_x": 7000.0, "position_y": 0.0, "position_z": 0.0,
        "velocity_x": 0.0, "velocity_y": 7.54, "velocity_z": 0.0,
        "fuel_kg": 150.0, "inclination": 53.0
    }
    target = {
        "position_x": 7080.0, "position_y": 50.0, "position_z": 0.0,
        "velocity_x": 0.0, "velocity_y": 7.50, "velocity_z": 0.0,
        "inclination": 53.0
    }
    plan = planner.plan_interception(sentinel, target)
    assert plan["is_feasible"] is True
    assert plan["required_delta_v_kms"] > 0.0
    assert plan["estimated_fuel_kg"] > 0.0
    assert plan["fuel_remaining_kg"] > 20.0
    assert len(plan["trajectory_waypoints"]) > 10

def test_relocation_maneuvers():
    planner = MissionPlanner()
    # Test controlled deorbit
    plan_deorbit = planner.plan_relocation_maneuver(600.0, strategy="CONTROLLED DEORBIT")
    assert "Atmospheric Entry" in plan_deorbit["final_orbit"]
    assert plan_deorbit["required_delta_v_kms"] > 0.1
    
    # Test graveyard disposal
    plan_disposal = planner.plan_relocation_maneuver(600.0, strategy="DISPOSAL ORBIT")
    assert "Graveyard" in plan_disposal["final_orbit"]
    assert plan_disposal["required_delta_v_kms"] > 0.05

def test_dataset_optical_derivation():
    # Optical bbox [ymin, ymax, xmin, xmax] in 512x512
    bbox = [280, 310, 60, 90]
    obj = derive_orbital_state_from_bbox(image_id=42, bbox_idx=1, bbox=bbox)
    assert obj["object_type"] == "DEBRIS"
    assert obj["status"] == "DRIFTING"
    assert obj["metadata"]["derived"] is True
    assert obj["altitude"] >= 500.0 and obj["altitude"] <= 1000.0
    assert position_magnitude(obj["position_x"], obj["position_y"], obj["position_z"]) > R_EARTH
    vel_mag = math.sqrt(obj["velocity_x"]**2 + obj["velocity_y"]**2 + obj["velocity_z"]**2)
    assert vel_mag >= 7.0 and vel_mag <= 8.0  # LEO circular orbital speed

def test_ai_anomaly_detection():
    detector = AnomalyDetector()
    # Nominal object
    nominal_obj = {
        "id": "SAT-NOM", "name": "Nominal", "health_status": "HEALTHY",
        "position_x": 7000.0, "position_y": 0.0, "position_z": 0.0,
        "velocity_x": 0.0, "velocity_y": math.sqrt(MU_EARTH / 7000.0), "velocity_z": 0.0
    }
    res_nom = detector.analyze_object(nominal_obj, {"tumble_rate_deg_s": 0.01, "battery_pct": 98.0})
    assert res_nom["anomaly_detected"] is False
    
    # Tumbling failing object
    failing_obj = {
        "id": "SAT-FAIL", "name": "Failing", "health_status": "CRITICAL",
        "position_x": 6800.0, "position_y": 0.0, "position_z": 0.0,
        "velocity_x": 0.0, "velocity_y": math.sqrt(MU_EARTH / 6800.0), "velocity_z": 0.0
    }
    res_fail = detector.analyze_object(failing_obj, {"tumble_rate_deg_s": 7.8, "battery_pct": 12.0})
    assert res_fail["anomaly_detected"] is True
    assert res_fail["anomaly_score"] > 0.85
    assert len(res_fail["reason"]) > 10

def test_end_to_end_mission_lifecycle():
    """
    Complete End-to-End Test:
    Dataset -> Target Detection -> Risk Analysis -> Target Selection ->
    Prediction -> Interception -> Rendezvous -> Inspection -> Capture ->
    Maneuver -> Safe Trajectory -> Mission Completion.
    """
    engine = SimulationEngine()
    engine.load_scenario("Scenario 1 – Failed Satellite")
    
    # 1. Verification of Initial State
    assert engine.sentinel_id in engine.objects
    assert engine.target_id in engine.objects
    target = engine.objects[engine.target_id]
    assert target["health_status"] == "NON-RESPONSIVE"
    
    # 2. Start Mission
    engine.state_machine.start_mission(0.0, "End-to-End Test Mission")
    assert engine.state_machine.current_phase == MissionPhase.TARGET_SELECTION
    
    # Step into TRACKING
    engine.step_physics(3.0)
    assert engine.state_machine.current_phase in [MissionPhase.TRACKING, MissionPhase.PREDICTION]
    
    # Step into PREDICTION
    engine.step_physics(4.0)
    assert engine.state_machine.current_phase in [MissionPhase.PREDICTION, MissionPhase.INTERCEPT_PLANNING]
    
    # Step into INTERCEPT_PLANNING
    engine.step_physics(4.0)
    assert engine.state_machine.current_phase in [MissionPhase.INTERCEPT_PLANNING, MissionPhase.INTERCEPTING]
    
    # Step into INTERCEPTING
    engine.step_physics(4.0)
    assert engine.state_machine.current_phase == MissionPhase.INTERCEPTING
    
    # Close range towards rendezvous
    engine.step_physics(26.0)
    assert engine.state_machine.current_phase == MissionPhase.RENDEZVOUS
    
    # Complete rendezvous standoff
    engine.step_physics(13.0)
    assert engine.state_machine.current_phase == MissionPhase.INSPECTION
    
    # Complete inspection
    engine.step_physics(9.0)
    assert engine.state_machine.current_phase == MissionPhase.CAPTURE
    
    # Progress through 4 capture latching steps
    engine.step_physics(9.0)
    assert engine.state_machine.current_phase == MissionPhase.MANEUVER
    assert target["status"] == "CAPTURED BY SENTINEL"
    
    # Execute relocation maneuver
    engine.step_physics(2.0)
    assert engine.state_machine.current_phase == MissionPhase.SAFE_TRAJECTORY
    
    # Complete mission
    engine.step_physics(13.0)
    assert engine.state_machine.current_phase == MissionPhase.MISSION_COMPLETE
    
    # Verify events were logged
    assert len(engine.event_log) >= 10
    final_state = engine.get_full_state()
    assert final_state["mission"]["success"] is True

def test_rk4_avoidance_candidates_and_custom_preview():
    engine = SimulationEngine()
    engine.load_scenario("Scenario 2: Avoidable Close Approach")
    assert engine.target_id == "DEBRIS-2009-033A"
    assert len(engine.maneuver_candidates) == 7

    # Prograde +5 m/s clears 25 km threshold via real RK4
    pro5 = next(c for c in engine.maneuver_candidates if c["id"] == "CAND-PRO-5")
    assert pro5["passed"] is True
    assert pro5["resulting_d_cpa_km"] >= 25.0
    assert len(pro5["trajectory_waypoints"]) >= 50

    # Radial +5 m/s does not resolve secular along-track drift (< 25 km)
    rad5 = next(c for c in engine.maneuver_candidates if c["id"] == "CAND-RAD-PLUS-5")
    assert rad5["passed"] is False

    # Custom preview +5 m/s along velocity axis (Y at t=0) matches prograde clearance cleanly
    preview = engine.preview_custom_maneuver(0.0, 5.0, 0.0)
    assert preview["passed"] is True
    assert preview["resulting_d_cpa_km"] >= 25.0

    # Scenario 3 genuinely escalates to REVIEW REQUIRED
    engine.load_scenario("Scenario 3: No Acceptable Maneuver")
    assert engine.safety_status == "REVIEW REQUIRED"
    assert all(not c["passed"] for c in engine.maneuver_candidates)

def test_pairwise_trajectory_prediction_and_encounter_analytics():
    engine = SimulationEngine()
    engine.load_scenario("Scenario 2: Avoidable Close Approach")

    sat = engine.objects["SAT-01"]
    debris = engine.objects["DEBRIS-2009-033A"]
    pred = engine.prediction_engine.predict_trajectory(debris, horizon_key="1h", reference_obj=sat, screening_distance_km=25.0)
    assert pred["pairwise_forecast"] is not None
    assert pred["pairwise_forecast"]["predicted_cpa_km"] < 5.0
    assert pred["pairwise_forecast"]["violates_screening"] is True
    assert len(pred["waypoints"]) == 51
    assert pred["uncertainty_zone"]["along_track_km"] > pred["uncertainty_zone"]["radial_km"]

    # Stepping forward by 300s must advance SAT-01 and debris synchronously (no double-stepping)
    t_cpa_before = pred["pairwise_forecast"]["predicted_cpa_t_s"]
    engine.step_forward(300.0)
    pred_after = engine.prediction_engine.predict_trajectory(
        engine.objects["DEBRIS-2009-033A"],
        horizon_key="1h",
        reference_obj=engine.objects["SAT-01"],
        screening_distance_km=25.0,
    )
    t_cpa_after = pred_after["pairwise_forecast"]["predicted_cpa_t_s"]
    assert 290.0 <= (t_cpa_before - t_cpa_after) <= 310.0, f"Unexpected t_CPA delta: {t_cpa_before} -> {t_cpa_after}"
    assert pred_after["pairwise_forecast"]["predicted_cpa_km"] < 5.0

    analytics = engine.get_encounter_analytics(days=30, seed=42, threshold_km=1.0, maneuver_dv_ms=3.5, lead_time_min=35.0)
    assert len(analytics["miss_distance_histogram"]) == 50
    assert len(analytics["daily_encounters"]) == 30
    assert len(analytics["correlation_matrix"]["matrix"]) == 4
    assert analytics["correlation_matrix"]["matrix"][0][0] == 1.0
    assert len(analytics["avoidance_effect"]["points"]) > 100
    assert analytics["summary"]["avoidance_success_rate_pct"] > 95.0

def test_always_running_and_autonomous_scenarios():
    import time

    engine = SimulationEngine()
    assert engine.is_running is True
    assert engine.time_scale == 25.0

    # Verify tick() continuously advances moving spacecraft at default 25x startup
    p0 = np.array([
        engine.objects["SAT-01"]["position_x"],
        engine.objects["SAT-01"]["position_y"],
        engine.objects["SAT-01"]["position_z"],
    ])
    engine.last_update_wall_time = time.time() - 0.12
    engine.tick()
    p1 = np.array([
        engine.objects["SAT-01"]["position_x"],
        engine.objects["SAT-01"]["position_y"],
        engine.objects["SAT-01"]["position_z"],
    ])
    assert np.linalg.norm(p1 - p0) > 10.0

    # Pause freezes motion; play resumes it
    engine.pause()
    assert engine.is_running is False
    engine.last_update_wall_time = time.time() - 0.12
    engine.tick()
    p2 = np.array([
        engine.objects["SAT-01"]["position_x"],
        engine.objects["SAT-01"]["position_y"],
        engine.objects["SAT-01"]["position_z"],
    ])
    assert np.linalg.norm(p2 - p1) < 1e-9
    engine.play()
    assert engine.is_running is True

    # Scenario 1: Normal Operation -> PATROL / ORBITAL_PATROL + PATROL_SWEEP logs
    engine.load_scenario("Scenario 1: Normal Operation")
    assert engine.is_running is True
    assert engine.objects["SAT-01"]["status"] == "PATROL"
    assert engine.objects["SAT-01"]["mission_phase"] == "ORBITAL_PATROL"
    engine.step_forward(260.0)
    assert any(ev["event_type"] == "PATROL_SWEEP" for ev in engine.event_log)
    assert engine.safety_status == "MONITORING"

    # Scenario 2: Avoidable Close Approach -> INSPECTING -> CAND-PRO-5 burn -> SAFE_TRAJECTORY -> PATROL
    engine.load_scenario("Scenario 2: Avoidable Close Approach")
    assert engine.is_running is True
    assert engine.objects["SAT-01"]["status"] == "TRACKING"
    assert engine.objects["SAT-01"]["mission_phase"] == "THREAT_TRACKING"

    engine.step_forward(200.0)
    assert engine.objects["SAT-01"]["status"] == "INSPECTING"
    assert engine.objects["SAT-01"]["mission_phase"] == "LIDAR_TARGET_LOCK"
    assert any(ev["event_type"] == "TARGET_INSPECTION" for ev in engine.event_log)

    engine.step_forward(250.0)
    assert engine.executed_maneuver is not None
    assert engine.executed_maneuver["id"] in ("CAND-PRO-5", "CAND-PRO-10")
    assert engine.executed_maneuver["passed"] is True
    assert engine.executed_maneuver["resulting_d_cpa_km"] >= 25.0
    assert engine.safety_status == "VERIFIED"
    assert engine.objects["SAT-01"]["status"] == "MANEUVER"
    assert engine.objects["SAT-01"]["mission_phase"] == "AVOIDANCE_BURN"
    assert any(ev["event_type"] == "AUTONOMOUS_BURN" for ev in engine.event_log)

    engine.step_forward(200.0)
    assert engine.objects["SAT-01"]["status"] == "SAFE_TRAJECTORY"
    assert engine.objects["SAT-01"]["mission_phase"] == "SAFE_COAST"

    engine.step_forward(1850.0)
    assert engine.objects["SAT-01"]["status"] == "PATROL"
    assert engine.objects["SAT-01"]["mission_phase"] == "POST_AVOIDANCE_PATROL"
    assert any(ev["event_type"] == "SAFE_PASS_CONFIRMED" for ev in engine.event_log)

    # Scenario 3: No Acceptable Maneuver -> EMERGENCY_ACQUISITION -> CRITICAL_TRACK_LOCK -> CONTINGENCY_RCS_HOLD -> POST_ENCOUNTER_AUDIT
    engine.load_scenario("Scenario 3: No Acceptable Maneuver")
    assert engine.safety_status == "REVIEW REQUIRED"
    assert engine.objects["SAT-01"]["status"] == "TRACKING"
    assert engine.objects["SAT-01"]["mission_phase"] == "EMERGENCY_ACQUISITION"

    engine.step_forward(80.0)
    assert engine.objects["SAT-01"]["status"] == "INSPECTING"
    assert engine.objects["SAT-01"]["mission_phase"] == "CRITICAL_TRACK_LOCK"

    engine.step_forward(100.0)
    assert engine.objects["SAT-01"]["status"] == "MANEUVER"
    assert engine.objects["SAT-01"]["mission_phase"] == "CONTINGENCY_RCS_HOLD"
    assert engine.safety_status == "REVIEW REQUIRED"

    engine.step_forward(100.0)
    assert engine.objects["SAT-01"]["status"] == "PATROL"
    assert engine.objects["SAT-01"]["mission_phase"] == "POST_ENCOUNTER_AUDIT"
    assert engine.safety_status == "REVIEW REQUIRED"
    assert any(ev["event_type"] == "CPA_FLYBY_COMPLETE" for ev in engine.event_log)

def test_vercel_serverless_entry_and_sync():
    import importlib
    import json
    import tempfile
    from types import SimpleNamespace
    from unittest import mock
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from sentinel.backend.database import db as db_mod
    from sentinel.backend.api import routes as routes_mod

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

    # 1. Validate vercel.json and requirements.txt packaging constraints
    with open(os.path.join(root_dir, "vercel.json"), "r", encoding="utf-8") as f:
        vcfg = json.load(f)
    assert vcfg["outputDirectory"] == "sentinel/frontend/dist"
    assert "api/index.py" in vcfg["functions"]
    assert "debris_catalog.json" in vcfg["functions"]["api/index.py"]["includeFiles"]
    assert any(r["source"] == "/api/(.*)" and r["destination"] == "/api/index.py" for r in vcfg["rewrites"])
    assert any(r["destination"] == "/index.html" for r in vcfg["rewrites"])

    with open(os.path.join(root_dir, "requirements.txt"), "r", encoding="utf-8") as f:
        reqs = f.read().lower()
    assert "fastapi" in reqs and "numpy" in reqs
    assert "pandas" not in reqs

    # 2. Verify SQLite path resolves to writable temp dir under VERCEL=1
    with mock.patch.dict(os.environ, {"VERCEL": "1"}, clear=False):
        resolved_db = db_mod._resolve_db_path()
        assert os.path.dirname(resolved_db) == os.path.abspath(tempfile.gettempdir())

    # 3. Verify Vercel entrypoint exports FastAPI app with required routes & middleware
    api_index = importlib.import_module("api.index")
    from sentinel.backend.api import main as main_mod
    assert isinstance(api_index.app, FastAPI)
    openapi_paths = set(api_index.app.openapi()["paths"].keys())
    for required_path in ("/api", "/api/health", "/api/status", "/api/predictions", "/api/analytics/encounters", "/api/missions"):
        assert required_path in openapi_paths, f"Missing route: {required_path}"

    def run_coro_sync(coro):
        try:
            coro.send(None)
        except StopIteration as stop:
            return stop.value
        raise AssertionError("Expected synchronous test coroutine completion")

    # Verify /api/health handler + lifespan serverless guard
    health_payload = routes_mod.health_check()
    assert health_payload["status"] == "ONLINE"
    with mock.patch.object(main_mod, "IS_SERVERLESS", True):
        cm = main_mod.lifespan(api_index.app)
        try:
            cm.__aenter__().send(None)
        except StopIteration:
            pass
        try:
            cm.__aexit__(None, None, None).send(None)
        except StopIteration:
            pass

    # Drive serverless_session_middleware directly for GET /api/status -> POST /api/scenario/load -> GET /api/status
    req_get_status = SimpleNamespace(
        url=SimpleNamespace(path="/api/status"),
        method="GET",
        headers={"x-sentinel-session": "vercel-tab-1"},
    )

    async def call_status(_req):
        return JSONResponse(routes_mod.get_system_status())

    resp1 = run_coro_sync(main_mod.serverless_session_middleware(req_get_status, call_status))
    assert resp1.status_code == 200
    assert "no-store" in resp1.headers.get("cache-control", "")
    assert "x-sentinel-state" in resp1.headers
    token = resp1.headers["x-sentinel-state"]
    assert len(token) < 4096

    req_load_s1 = SimpleNamespace(
        url=SimpleNamespace(path="/api/scenario/load"),
        method="POST",
        headers={"x-sentinel-session": "vercel-tab-1", "x-sentinel-state": token},
    )

    async def call_load_s1(_req):
        return JSONResponse(routes_mod.load_scenario(routes_mod.ScenarioLoadRequest(scenario="Scenario 1: Normal Operation")))

    resp2 = run_coro_sync(main_mod.serverless_session_middleware(req_load_s1, call_load_s1))
    assert resp2.status_code == 200
    token2 = resp2.headers["x-sentinel-state"]

    req_verify = SimpleNamespace(
        url=SimpleNamespace(path="/api/status"),
        method="GET",
        headers={"x-sentinel-session": "vercel-tab-1", "x-sentinel-state": token2},
    )
    resp3 = run_coro_sync(main_mod.serverless_session_middleware(req_verify, call_status))
    assert json.loads(resp3.body.decode("utf-8"))["clock"]["scenario_name"] == "Scenario 1: Normal Operation"

    # 4. Verify multi-instance state snapshot sync (Lambda-A -> cold Lambda-B) & session isolation
    eng_a = SimulationEngine()
    eng_a.load_scenario("Scenario 3: No Acceptable Maneuver")
    eng_a.step_forward(90.0)
    eng_a.execute_custom_maneuver(0.0, 25.0, 0.0, name="Vercel Sync Burn")
    tok = eng_a.export_session_snapshot(client_session_id="tab-sync")

    eng_b = SimulationEngine()
    assert eng_b.scenario_name == "Scenario 2: Avoidable Close Approach"
    changed = eng_b.sync_from_session_token(tok, client_session_id="tab-sync")
    assert changed is True
    assert eng_b.scenario_name == eng_a.scenario_name
    assert math.isclose(eng_b.sim_time, eng_a.sim_time, abs_tol=1e-3)
    assert eng_b.target_id == eng_a.target_id
    assert eng_b.safety_status == eng_a.safety_status
    assert eng_b.executed_maneuver is not None
    assert eng_b.executed_maneuver["name"] == "Vercel Sync Burn"
    assert math.isclose(eng_b.objects["SAT-01"]["position_x"], eng_a.objects["SAT-01"]["position_x"], abs_tol=1e-2)
    assert math.isclose(eng_b.objects[eng_b.target_id]["position_x"], eng_a.objects[eng_a.target_id]["position_x"], abs_tol=1e-2)

    # New session ID without token cleanly resets warm instance
    reset_for_new_visitor = eng_b.sync_from_session_token(None, client_session_id="tab-visitor-2")
    assert reset_for_new_visitor is True
    assert eng_b.scenario_name == "Scenario 2: Avoidable Close Approach"
    assert eng_b.sim_time == 0.0

if __name__ == "__main__":
    test_position_magnitude()
    test_gravitational_acceleration()
    test_future_position()
    test_cpa_calculation()
    test_collision_risk_classification()
    test_target_priority_scoring()
    test_interception_planner_feasibility()
    test_relocation_maneuvers()
    test_dataset_optical_derivation()
    test_ai_anomaly_detection()
    test_end_to_end_mission_lifecycle()
    test_rk4_avoidance_candidates_and_custom_preview()
    test_pairwise_trajectory_prediction_and_encounter_analytics()
    test_always_running_and_autonomous_scenarios()
    test_vercel_serverless_entry_and_sync()
    print("ALL 15 SENTINEL AUTOMATED UNIT & INTEGRATION TESTS PASSED PERFECTLY!")
