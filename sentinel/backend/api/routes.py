"""
SENTINEL REST API Routes
FastAPI routers for:
  - objects & telemetry
  - mission lifecycle (start, pause, abort, demo)
  - scenarios & simulation clock
  - risk assessment & predictions
  - recommendations & anomaly detection
  - dataset replay & sensor imagery
"""

import os
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from sentinel.backend.simulation.engine import INSTANCE_ID, simulation_engine
from sentinel.backend.database.db import get_all_missions, get_mission_by_id, get_mission_events

IS_SERVERLESS = bool(
    os.environ.get("VERCEL")
    or os.environ.get("VERCEL_ENV")
    or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
)

router = APIRouter(prefix="/api")

IMAGES_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../debris-detection"))

class ClockSpeedRequest(BaseModel):
    speed: float

class ScenarioLoadRequest(BaseModel):
    scenario: str
    custom_params: Optional[Dict[str, Any]] = None

class TargetSelectRequest(BaseModel):
    target_id: str

class StrategySelectRequest(BaseModel):
    strategy: str

class PredictionRequest(BaseModel):
    object_id: str
    horizon: str = "5m"

class ConfigUpdateRequest(BaseModel):
    weights: Optional[Dict[str, float]] = None
    thresholds: Optional[Dict[str, Any]] = None

class ManeuverEvaluateRequest(BaseModel):
    target_id: Optional[str] = None
    screening_distance_km: Optional[float] = None

class ManeuverExecuteRequest(BaseModel):
    candidate_id: str

class CustomManeuverRequest(BaseModel):
    dv_x_ms: float
    dv_y_ms: float
    dv_z_ms: float
    name: Optional[str] = None

class ScreeningDistanceRequest(BaseModel):
    distance_km: float

class SimulationStepRequest(BaseModel):
    seconds: float = 60.0

class EncounterSimulationRequest(BaseModel):
    days: int = 30
    seed: int = 42
    threshold_km: float = 1.0
    maneuver_dv_ms: float = 3.5
    lead_time_min: float = 35.0

# ---------------- Clock & Status ----------------

@router.get("/health")
def health_check():
    return {
        "status": "ONLINE",
        "system": "SENTINEL",
        "serverless": IS_SERVERLESS,
        "instance_id": INSTANCE_ID,
        "simulation_running": simulation_engine.is_running,
        "sim_time": round(simulation_engine.sim_time, 2),
        "scenario_name": simulation_engine.scenario_name,
    }

@router.get("/status")
def get_system_status():
    """Returns complete aggregated state of the simulation world."""
    return simulation_engine.tick()

@router.post("/clock/play")
def clock_play():
    simulation_engine.play()
    return {"status": "ok", "is_running": True}

@router.post("/clock/pause")
def clock_pause():
    simulation_engine.pause()
    return {"status": "ok", "is_running": False}

@router.post("/clock/reset")
def clock_reset():
    simulation_engine.reset()
    return {"status": "ok", "sim_time": 0.0}

@router.post("/clock/speed")
def set_clock_speed(req: ClockSpeedRequest):
    simulation_engine.set_speed(req.speed)
    return {"status": "ok", "time_scale": simulation_engine.time_scale}

# ---------------- Scenarios & Mission Controls ----------------

@router.post("/scenario/load")
def load_scenario(req: ScenarioLoadRequest):
    simulation_engine.load_scenario(req.scenario, req.custom_params)
    return {"status": "ok", "scenario": req.scenario}

class DemoMissionRequest(BaseModel):
    scenario: Optional[str] = None

@router.post("/mission/demo")
def start_demo_mission(req: Optional[DemoMissionRequest] = None):
    """
    One-click DEMO MODE: Loads the specified scenario (or current scenario),
    selects target, unpauses at 5x acceleration, and triggers autonomous guidance.
    """
    scenario_name = (req.scenario if req and req.scenario else None) or simulation_engine.scenario_name or "Scenario 1 – Failed Satellite"
    simulation_engine.load_scenario(scenario_name)
    simulation_engine.set_speed(5.0)
    simulation_engine.play()
    simulation_engine.state_machine.start_mission(simulation_engine.sim_time, f"SENTINEL Autonomous – {scenario_name}")
    simulation_engine.state_revision += 1
    return {"status": "ok", "message": f"Demo mission active for {scenario_name}", "mission_id": simulation_engine.mission_id, "scenario": scenario_name}

@router.post("/target/select")
def select_target(req: TargetSelectRequest):
    simulation_engine.set_target(req.target_id)
    return {"status": "ok", "target_id": req.target_id}

@router.post("/strategy/select")
def select_relocation_strategy(req: StrategySelectRequest):
    simulation_engine.set_relocation_strategy(req.strategy)
    return {"status": "ok", "strategy": req.strategy}

# ---------------- Orbital Objects & Telemetry ----------------

@router.get("/objects")
def list_objects():
    with simulation_engine._lock:
        return [dict(v) for v in simulation_engine.objects.values()]

@router.get("/objects/{object_id}")
def get_object(object_id: str):
    with simulation_engine._lock:
        obj = simulation_engine.objects.get(object_id)
        if not obj:
            raise HTTPException(status_code=404, detail="Orbital object not found")
        return dict(obj)

@router.get("/telemetry")
def get_telemetry():
    with simulation_engine._lock:
        return list(simulation_engine.telemetry_history)

# ---------------- Risk, Predictions, AI ----------------

@router.get("/risk")
def get_collision_risk():
    with simulation_engine._lock:
        return list(simulation_engine.latest_risks)

@router.get("/predictions")
def get_trajectory_prediction(
    object_id: Optional[str] = None,
    horizon: str = "5m",
    reference_id: Optional[str] = None
):
    with simulation_engine._lock:
        target_id = object_id or simulation_engine.target_id or simulation_engine.sentinel_id
        raw_obj = simulation_engine.objects.get(target_id)
        if not raw_obj:
            raise HTTPException(status_code=404, detail="Object not found for prediction")
        obj = dict(raw_obj)

        raw_ref = None
        if reference_id:
            raw_ref = simulation_engine.objects.get(reference_id)
        elif target_id == simulation_engine.sentinel_id and simulation_engine.target_id:
            raw_ref = simulation_engine.objects.get(simulation_engine.target_id)
        elif target_id != simulation_engine.sentinel_id:
            raw_ref = simulation_engine.objects.get(simulation_engine.sentinel_id)
        ref_obj = dict(raw_ref) if raw_ref else None
        screening = simulation_engine.screening_distance_km

    return simulation_engine.prediction_engine.predict_trajectory(
        obj,
        horizon_key=horizon,
        reference_obj=ref_obj,
        screening_distance_km=screening
    )

@router.get("/recommendations")
def get_recommendations():
    return {
        "latest": simulation_engine.latest_recommendation,
        "anomaly": simulation_engine.latest_anomaly
    }

# ---------------- Collision-Avoidance & Maneuver Lab ----------------

@router.post("/maneuvers/evaluate")
def evaluate_maneuver_candidates(req: Optional[ManeuverEvaluateRequest] = None):
    target_id = req.target_id if req else None
    screening = req.screening_distance_km if req else None
    return simulation_engine.evaluate_maneuver_candidates(target_id, screening)

@router.post("/maneuvers/execute")
def execute_avoidance_maneuver(req: ManeuverExecuteRequest):
    return simulation_engine.execute_maneuver(req.candidate_id)

@router.post("/maneuvers/custom")
def execute_custom_maneuver(req: CustomManeuverRequest):
    return simulation_engine.execute_custom_maneuver(req.dv_x_ms, req.dv_y_ms, req.dv_z_ms, req.name)

@router.post("/maneuvers/preview_custom")
def preview_custom_maneuver(req: CustomManeuverRequest):
    return simulation_engine.preview_custom_maneuver(req.dv_x_ms, req.dv_y_ms, req.dv_z_ms)

@router.post("/simulation/step")
def step_simulation_forward(req: SimulationStepRequest):
    return simulation_engine.step_forward(req.seconds)

@router.post("/simulation/screening_distance")
def update_screening_distance(req: ScreeningDistanceRequest):
    simulation_engine.set_screening_distance(req.distance_km)
    return {"status": "ok", "screening_distance_km": simulation_engine.screening_distance_km}

@router.get("/mission/results")
def get_mission_results():
    return simulation_engine.get_mission_results()

@router.get("/analytics/catalogue")
def get_catalogue_analytics():
    return simulation_engine.get_catalogue_analytics()

@router.get("/analytics/encounters")
def get_encounter_analytics(
    days: int = 30,
    seed: int = 42,
    threshold_km: float = 1.0,
    maneuver_dv_ms: float = 3.5,
    lead_time_min: float = 35.0
):
    return simulation_engine.get_encounter_analytics(
        days=days,
        seed=seed,
        threshold_km=threshold_km,
        maneuver_dv_ms=maneuver_dv_ms,
        lead_time_min=lead_time_min
    )

@router.post("/analytics/simulate_campaign")
def simulate_encounter_campaign(req: EncounterSimulationRequest):
    return simulation_engine.get_encounter_analytics(
        days=req.days,
        seed=req.seed,
        threshold_km=req.threshold_km,
        maneuver_dv_ms=req.maneuver_dv_ms,
        lead_time_min=req.lead_time_min
    )

@router.post("/autonomous/run")
def run_autonomous_avoidance():
    return simulation_engine.run_autonomous_avoidance()

# ---------------- Configuration & Safety Thresholds ----------------

@router.get("/config")
def get_system_config():
    return {
        "weights": simulation_engine.planner.weights,
        "thresholds": simulation_engine.risk_engine.config
    }

@router.post("/config")
def update_system_config(req: ConfigUpdateRequest):
    if req.weights:
        simulation_engine.planner.set_weights(req.weights)
    if req.thresholds:
        threshold_map = {}
        if "critical_cpa_km" in req.thresholds:
            threshold_map["threshold_critical_km"] = float(req.thresholds["critical_cpa_km"])
        if "high_cpa_km" in req.thresholds:
            threshold_map["threshold_high_km"] = float(req.thresholds["high_cpa_km"])
        if "critical_time_s" in req.thresholds:
            threshold_map["time_window_critical_s"] = float(req.thresholds["critical_time_s"])
        simulation_engine.risk_engine.set_config(threshold_map)
    simulation_engine.state_revision += 1
    return {
        "status": "ok",
        "weights": simulation_engine.planner.weights,
        "thresholds": simulation_engine.risk_engine.config
    }

# ---------------- Mission History & Events ----------------

@router.get("/missions")
def list_missions():
    return get_all_missions()

@router.get("/missions/{mission_id}")
def get_mission(mission_id: str):
    m = get_mission_by_id(mission_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    m["events"] = get_mission_events(mission_id)
    return m

@router.post("/missions/{mission_id}/start")
def start_mission_by_id(mission_id: str):
    simulation_engine.play()
    simulation_engine.state_machine.start_mission(simulation_engine.sim_time)
    simulation_engine.state_revision += 1
    return {"status": "ok", "mission_id": mission_id}

@router.post("/missions/{mission_id}/pause")
def pause_mission_by_id(mission_id: str):
    simulation_engine.pause()
    return {"status": "ok", "mission_id": mission_id}

@router.post("/missions/{mission_id}/abort")
def abort_mission_by_id(mission_id: str):
    simulation_engine.state_machine.abort_mission(simulation_engine.sim_time)
    simulation_engine.state_revision += 1
    return {"status": "ok", "phase": "ABORT"}

# ---------------- Dataset Replay & Images ----------------

@router.post("/dataset/replay")
def trigger_dataset_replay(max_frames: int = 150):
    simulation_engine.load_dataset_replay(max_frames=max_frames)
    simulation_engine.play()
    return {"status": "ok", "mode": "DATASET_REPLAY", "count": len(simulation_engine.dataset_records)}

@router.get("/images/{category}/{image_name}")
def get_sensor_image(category: str, image_name: str):
    """
    Serves actual optical surveillance camera frames (train/{id}.jpg or val/{id}.jpg).
    """
    # Sanitize category
    if category not in ["train", "val", "test"]:
        raise HTTPException(status_code=400, detail="Invalid image category")
    img_path = os.path.join(IMAGES_BASE_DIR, category, image_name)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Sensor image frame not found")
    return FileResponse(img_path, media_type="image/jpeg")
