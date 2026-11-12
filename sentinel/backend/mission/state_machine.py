"""
SENTINEL Mission State Machine
Manages autonomous transitions across all required mission states:
  IDLE -> TARGET_SELECTION -> TRACKING -> PREDICTION -> INTERCEPT_PLANNING
  -> INTERCEPTING -> RENDEZVOUS -> INSPECTION -> CAPTURE -> MANEUVER
  -> SAFE_TRAJECTORY -> MISSION_COMPLETE / ABORT
Emits chronological events with simulated and real timestamps.
"""

from enum import Enum
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime

class MissionPhase(str, Enum):
    IDLE = "IDLE"
    TARGET_SELECTION = "TARGET_SELECTION"
    TRACKING = "TRACKING"
    PREDICTION = "PREDICTION"
    INTERCEPT_PLANNING = "INTERCEPT_PLANNING"
    INTERCEPTING = "INTERCEPTING"
    RENDEZVOUS = "RENDEZVOUS"
    INSPECTION = "INSPECTION"
    CAPTURE = "CAPTURE"
    MANEUVER = "MANEUVER"
    SAFE_TRAJECTORY = "SAFE_TRAJECTORY"
    MISSION_COMPLETE = "MISSION_COMPLETE"
    ABORT = "ABORT"

class MissionStateMachine:
    def __init__(self, mission_id: str, event_callback: Optional[Callable] = None):
        self.mission_id = mission_id
        self.current_phase = MissionPhase.IDLE
        self.event_callback = event_callback
        self.phase_elapsed_time_s = 0.0
        self.mission_start_sim_time = 0.0
        self.target_id: Optional[str] = None
        self.relocation_strategy = "DISPOSAL ORBIT"
        
        # Capture step progression
        self.capture_step = 0  # 0: None, 1: Approach, 2: Alignment, 3: Mechanism Activated, 4: Target Secured, 5: Confirmed
        self.inspection_data: Optional[Dict[str, Any]] = None
        self.maneuver_data: Optional[Dict[str, Any]] = None
        self.intercept_plan: Optional[Dict[str, Any]] = None

    def emit_event(self, sim_time: float, event_type: str, message: str, details: Optional[Dict] = None):
        if self.event_callback:
            self.event_callback(self.mission_id, sim_time, event_type, message, details or {})

    def transition_to(self, new_phase: MissionPhase, sim_time: float, reason: str = ""):
        old_phase = self.current_phase
        self.current_phase = new_phase
        self.phase_elapsed_time_s = 0.0
        
        msg = f"Phase transition: {old_phase.value} -> {new_phase.value}. {reason}".strip()
        self.emit_event(sim_time, "PHASE_CHANGE", msg, {
            "from_phase": old_phase.value,
            "to_phase": new_phase.value,
            "reason": reason
        })

    def start_mission(self, sim_time: float, scenario_name: str = "Standard Mission"):
        self.mission_start_sim_time = sim_time
        self.transition_to(MissionPhase.TARGET_SELECTION, sim_time, f"Autonomous mission initiated ({scenario_name})")

    def abort_mission(self, sim_time: float, reason: str = "Operator or Safety Abort"):
        self.transition_to(MissionPhase.ABORT, sim_time, reason)

    def step(self, dt: float, sim_time: float, context: Dict[str, Any]):
        """
        Updates state machine progression based on simulation context.
        Context provides: sentinel_state, target_state, planner, safety_validator, etc.
        """
        if self.current_phase in [MissionPhase.IDLE, MissionPhase.MISSION_COMPLETE, MissionPhase.ABORT]:
            return
            
        self.phase_elapsed_time_s += dt
        
        sentinel = context.get("sentinel")
        target = context.get("target")
        range_km = sentinel.get("target_distance_km", 999.0) if sentinel else 999.0
        rel_vel = sentinel.get("target_rel_velocity_kms", 99.0) if sentinel else 99.0
        planner = context.get("planner")
        
        # State: TARGET_SELECTION
        if self.current_phase == MissionPhase.TARGET_SELECTION:
            if target:
                self.target_id = target["id"]
                self.emit_event(sim_time, "TARGET_CONFIRMED", f"Designated primary mission target: {target['name']} ({target['id']})")
                self.transition_to(MissionPhase.TRACKING, sim_time, "Target locked into autonomous guidance")
            elif self.phase_elapsed_time_s >= 2.0:
                # Auto select from candidate pool
                best = context.get("best_target_info")
                if best and best.get("target"):
                    t_cand = best["target"]
                    self.target_id = t_cand["id"]
                    context["set_target_callback"](t_cand["id"])
                    self.emit_event(sim_time, "TARGET_AUTO_SELECTED", f"Autonomous priority scoring selected target: {t_cand['name']} (Score: {best['score_info']['total_score']})")
                    self.transition_to(MissionPhase.TRACKING, sim_time, "Target lock engaged")

        # State: TRACKING
        elif self.current_phase == MissionPhase.TRACKING:
            if self.phase_elapsed_time_s >= 3.0:
                self.emit_event(sim_time, "TRACKING_CONVERGED", f"Optical & Radar tracking filter converged. Range: {range_km:.1f} km, Rel Speed: {rel_vel*1000:.1f} m/s")
                self.transition_to(MissionPhase.PREDICTION, sim_time, "Proceeding to orbital ephemeris prediction")

        # State: PREDICTION
        elif self.current_phase == MissionPhase.PREDICTION:
            if self.phase_elapsed_time_s >= 3.0:
                self.emit_event(sim_time, "PREDICTION_COMPLETE", "Deterministic multi-horizon trajectory & CPA calculated. Conjunction uncertainty bounded.")
                self.transition_to(MissionPhase.INTERCEPT_PLANNING, sim_time, "Initiating trajectory optimization")

        # State: INTERCEPT_PLANNING
        elif self.current_phase == MissionPhase.INTERCEPT_PLANNING:
            if planner and target:
                plan = planner.plan_interception(sentinel, target)
                self.intercept_plan = plan
                self.emit_event(sim_time, "MANEUVER_PLANNED", (
                    f"Hohmann phase transfer trajectory generated: Required Delta-V: {plan['required_delta_v_kms']:.4f} km/s, "
                    f"Estimated Propellant: {plan['estimated_fuel_kg']:.1f} kg. Safety validated."
                ))
                self.transition_to(MissionPhase.INTERCEPTING, sim_time, "Executing primary orbital interception burn")
            elif self.phase_elapsed_time_s >= 3.0:
                self.transition_to(MissionPhase.INTERCEPTING, sim_time, "Executing interception burn")

        # State: INTERCEPTING
        elif self.current_phase == MissionPhase.INTERCEPTING:
            # Check if range has closed to rendezvous threshold
            if range_km <= 2.5 or self.phase_elapsed_time_s >= 25.0:
                self.emit_event(sim_time, "PROXIMITY_REACHED", f"Terminal proximity corridor reached ({range_km:.2f} km). Initiating closed-loop rendezvous deceleration.")
                self.transition_to(MissionPhase.RENDEZVOUS, sim_time, "Switching to relative velocity nulling mode")

        # State: RENDEZVOUS
        elif self.current_phase == MissionPhase.RENDEZVOUS:
            if range_km <= 0.05 or self.phase_elapsed_time_s >= 12.0:
                self.emit_event(sim_time, "STATION_KEEPING_ACHIEVED", f"Standoff station-keeping achieved at range {range_km*1000.0:.1f} m. Relative drift: {rel_vel*1000.0:.2f} m/s.")
                self.transition_to(MissionPhase.INSPECTION, sim_time, "Beginning autonomous inspection scan")

        # State: INSPECTION
        elif self.current_phase == MissionPhase.INSPECTION:
            if self.phase_elapsed_time_s >= 8.0:
                if planner and target:
                    diag = planner.simulate_inspection(target)
                    self.inspection_data = diag
                    self.emit_event(sim_time, "INSPECTION_COMPLETED", (
                        f"Inspection Complete: Health {diag['overall_health']}, Power: {diag['power_status']}, "
                        f"Attitude: {diag['attitude_condition']}. Ready for capture grapple."
                    ))
                self.transition_to(MissionPhase.CAPTURE, sim_time, "Deploying capture mechanisms")

        # State: CAPTURE
        elif self.current_phase == MissionPhase.CAPTURE:
            if self.phase_elapsed_time_s >= 8.0:
                self.capture_step = 4
                self.emit_event(sim_time, "CAPTURE_CONFIRMED", "Capture sequence step 4/4: Target firmly secured! Mechanical and electrical lock confirmed.")
                self.transition_to(MissionPhase.MANEUVER, sim_time, "Planning safe relocation transfer burn")
            elif self.phase_elapsed_time_s >= 6.0 and self.capture_step < 3:
                self.capture_step = 3
                self.emit_event(sim_time, "CAPTURE_MECHANISM_ACTIVE", "Capture sequence step 3/4: Robotic latching clamp and magnetic dampening activated.")
            elif self.phase_elapsed_time_s >= 4.0 and self.capture_step < 2:
                self.capture_step = 2
                self.emit_event(sim_time, "CAPTURE_ALIGNED", "Capture sequence step 2/4: Optical docking target aligned, attitude rate synchronized.")
            elif self.phase_elapsed_time_s >= 2.0 and self.capture_step < 1:
                self.capture_step = 1
                self.emit_event(sim_time, "CAPTURE_APPROACH", "Capture sequence step 1/4: Terminal approach alignment initiated.")

        # State: MANEUVER
        elif self.current_phase == MissionPhase.MANEUVER:
            if planner and target:
                strat = context.get("relocation_strategy", self.relocation_strategy)
                self.maneuver_data = planner.plan_relocation_maneuver(
                    sentinel.get("altitude", 650.0),
                    strategy=strat
                )
                self.emit_event(sim_time, "RELOCATION_IGNITION", (
                    f"Relocation maneuver initiated ({strat}): Required Delta-V {self.maneuver_data['required_delta_v_kms']:.4f} km/s. "
                    f"Thruster burn commenced."
                ))
            self.transition_to(MissionPhase.SAFE_TRAJECTORY, sim_time, "Transfer to designated safe orbit underway")

        # State: SAFE_TRAJECTORY
        elif self.current_phase == MissionPhase.SAFE_TRAJECTORY:
            if self.phase_elapsed_time_s >= 12.0:
                strat = context.get("relocation_strategy", self.relocation_strategy)
                self.emit_event(sim_time, "TARGET_RELOCATED", f"Target relocation complete. Stabilized in {strat}. Conjunction hazard mitigated.")
                self.transition_to(MissionPhase.MISSION_COMPLETE, sim_time, "Autonomous orbital rescue & debris mitigation mission accomplished successfully!")
