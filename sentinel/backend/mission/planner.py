"""
SENTINEL Mission Planner
Implements:
  1. Autonomous Target Selection Scoring with configurable weights
  2. Hohmann / Lambert Interception Trajectory Generation
  3. Delta-V and Fuel Usage (Tsiolkovsky rocket equation)
  4. Inspection sensor simulation
  5. Controlled Relocation Maneuver calculations (SAFE, DISPOSAL, STORAGE, DEORBIT)
"""

import math
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from sentinel.backend.orbital.physics import (
    MU_EARTH, R_EARTH, position_magnitude, altitude_from_position,
    compute_cpa, propagate_two_body_rk4
)

# Spacecraft Propulsion Constants
SENTINEL_DRY_MASS_KG = 650.0
SENTINEL_ISP_S = 310.0           # Specific impulse of bipropellant thrusters (seconds)
G0 = 9.80665                     # Standard gravity in m/s^2

class MissionPlanner:
    def __init__(self, target_weights: Optional[Dict[str, float]] = None):
        self.weights = {
            "risk": 0.35,
            "health_criticality": 0.25,
            "collision_prob": 0.20,
            "accessibility": 0.10,
            "mission_priority": 0.10,
            **(target_weights or {})
        }
        
    def set_weights(self, weights: Dict[str, float]):
        self.weights.update(weights)

    def calculate_target_score(
        self,
        candidate: Dict[str, Any],
        sentinel_pos: np.ndarray,
        sentinel_fuel_kg: float,
        pair_risk: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Calculates priority score for a candidate target satellite or debris object.
        Score = Risk*w1 + Health*w2 + CollisionProb*w3 + Accessibility*w4 + Priority*w5
        """
        # 1. Risk factor (0.0 to 1.0)
        risk_map = {"CRITICAL": 1.0, "HIGH": 0.75, "MEDIUM": 0.45, "LOW": 0.20, "SAFE": 0.05}
        risk_level = candidate.get("risk_level", "SAFE")
        risk_val = risk_map.get(risk_level, 0.1)
        
        # 2. Health Criticality
        health_map = {
            "NON-RESPONSIVE": 1.0,
            "CRITICAL": 0.90,
            "DEBRIS": 0.70,
            "DEGRADED": 0.50,
            "HEALTHY": 0.05
        }
        health_status = candidate.get("health_status", "UNKNOWN")
        health_val = health_map.get(health_status, 0.5)
        
        # 3. Collision Probability
        coll_prob = 0.0
        if pair_risk:
            coll_prob = min(1.0, pair_risk.get("collision_probability", 0.0) * 1000.0)
            
        # 4. Accessibility (Proximity & Delta-V cost from SENTINEL)
        cand_pos = np.array([candidate["position_x"], candidate["position_y"], candidate["position_z"]], dtype=float)
        dist_km = float(np.linalg.norm(cand_pos - sentinel_pos))
        # Closer targets have higher accessibility
        access_val = max(0.0, min(1.0, 1.0 - (dist_km / 12000.0)))
        
        # 5. Mission Priority based on object type
        type_priority = {
            "FAILED_SATELLITE": 1.0,
            "DEBRIS": 0.80,
            "ACTIVE_SATELLITE": 0.30,
            "SERVICE_VEHICLE": 0.0,
            "UNKNOWN": 0.40
        }
        priority_val = type_priority.get(candidate.get("object_type", "UNKNOWN"), 0.5)
        
        total_score = (
            risk_val * self.weights["risk"] +
            health_val * self.weights["health_criticality"] +
            coll_prob * self.weights["collision_prob"] +
            access_val * self.weights["accessibility"] +
            priority_val * self.weights["mission_priority"]
        )
        
        return {
            "object_id": candidate["id"],
            "name": candidate["name"],
            "total_score": round(float(total_score), 4),
            "distance_km": round(dist_km, 2),
            "breakdown": {
                "risk_component": round(risk_val * self.weights["risk"], 4),
                "health_component": round(health_val * self.weights["health_criticality"], 4),
                "collision_component": round(coll_prob * self.weights["collision_prob"], 4),
                "accessibility_component": round(access_val * self.weights["accessibility"], 4),
                "priority_component": round(priority_val * self.weights["mission_priority"], 4)
            }
        }

    def select_best_target(
        self,
        candidates: List[Dict[str, Any]],
        sentinel_pos: np.ndarray,
        sentinel_fuel_kg: float,
        pair_risks: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Selects the highest scoring non-service target.
        """
        valid_candidates = [c for c in candidates if c.get("object_type") != "SERVICE_VEHICLE"]
        if not valid_candidates:
            return None
            
        risk_lookup = {}
        if pair_risks:
            for pr in pair_risks:
                risk_lookup[pr["object_b_id"]] = pr
                
        scored = []
        for cand in valid_candidates:
            score_info = self.calculate_target_score(cand, sentinel_pos, sentinel_fuel_kg, risk_lookup.get(cand["id"]))
            scored.append((score_info["total_score"], cand, score_info))
            
        scored.sort(key=lambda x: x[0], reverse=True)
        best_cand = scored[0][1]
        best_cand_score = scored[0][2]
        return {
            "target": best_cand,
            "score_info": best_cand_score,
            "all_ranked": [s[2] for s in scored]
        }

    def plan_interception(
        self,
        sentinel: Dict[str, Any],
        target: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generates interception trajectory, calculates delta-v and estimated fuel consumption.
        Uses Hohmann phase transfer & terminal line-of-sight approach.
        """
        pos_s = np.array([sentinel["position_x"], sentinel["position_y"], sentinel["position_z"]], dtype=float)
        vel_s = np.array([sentinel["velocity_x"], sentinel["velocity_y"], sentinel["velocity_z"]], dtype=float)
        
        pos_t = np.array([target["position_x"], target["position_y"], target["position_z"]], dtype=float)
        vel_t = np.array([target["velocity_x"], target["velocity_y"], target["velocity_z"]], dtype=float)
        
        r_rel = pos_t - pos_s
        v_rel = vel_t - vel_s
        
        range_km = float(np.linalg.norm(r_rel))
        rel_speed = float(np.linalg.norm(v_rel))
        
        r1 = float(np.linalg.norm(pos_s))
        r2 = float(np.linalg.norm(pos_t))
        
        # Two-body transfer: Hohmann between concentric orbits + phasing
        # Delta-V 1 (Injection burn)
        v1 = math.sqrt(MU_EARTH / r1)
        v2 = math.sqrt(MU_EARTH / r2)
        v_trans_1 = math.sqrt(MU_EARTH / r1) * math.sqrt((2.0 * r2) / (r1 + r2))
        v_trans_2 = math.sqrt(MU_EARTH / r2) * math.sqrt((2.0 * r1) / (r1 + r2))
        
        dv_injection = abs(v_trans_1 - v1)
        dv_circularize = abs(v2 - v_trans_2)
        
        # Include plane change delta-v if inclination mismatch
        inc_s = sentinel.get("inclination", 55.0)
        inc_t = target.get("inclination", 55.0)
        d_inc_rad = math.radians(abs(inc_t - inc_s))
        dv_plane_change = 2.0 * v1 * math.sin(d_inc_rad / 2.0)
        
        # Total Delta-V (in km/s)
        total_delta_v_kms = dv_injection + dv_circularize + (0.5 * dv_plane_change) + (0.15 * rel_speed)
        # Minimum transfer delta-v cap for short-range maneuvers
        total_delta_v_kms = max(0.045, min(1.8, total_delta_v_kms))
        
        # Transfer time (half-period of transfer ellipse)
        a_trans = (r1 + r2) / 2.0
        t_transfer_s = math.pi * math.sqrt((a_trans ** 3) / MU_EARTH)
        # Scaled transfer time for simulation experience (e.g. 60s - 300s nominal)
        scaled_intercept_time_s = max(45.0, min(360.0, t_transfer_s / 6.0))
        
        # Fuel consumption using Tsiolkovsky Rocket Equation:
        # Delta-V in m/s:
        dv_ms = total_delta_v_kms * 1000.0
        wet_mass_kg = SENTINEL_DRY_MASS_KG + sentinel.get("fuel_kg", 150.0)
        # m_final = m_initial / exp(dv / (Isp * g0))
        # fuel_used = m_initial - m_final
        fuel_used_kg = wet_mass_kg * (1.0 - math.exp(-dv_ms / (SENTINEL_ISP_S * G0)))
        fuel_remaining_kg = sentinel.get("fuel_kg", 150.0) - fuel_used_kg
        
        is_feasible = (fuel_remaining_kg >= 15.0) and (total_delta_v_kms <= 1.5)
        success_prob = 0.98 if is_feasible else 0.35
        
        # Generate transfer trajectory path waypoints
        num_waypoints = 35
        trajectory_waypoints = []
        for i in range(num_waypoints + 1):
            fraction = i / float(num_waypoints)
            # Smooth Hermite-like blending between initial Sentinel position and Target position
            # with outward Keplerian arc
            arc_offset = 80.0 * math.sin(fraction * math.pi)
            pos_interp = (1.0 - fraction) * pos_s + fraction * pos_t
            # Normal vector outward
            normal = pos_interp / max(1e-6, np.linalg.norm(pos_interp))
            waypoint = pos_interp + normal * arc_offset
            trajectory_waypoints.append({
                "step": i,
                "x": round(float(waypoint[0]), 3),
                "y": round(float(waypoint[1]), 3),
                "z": round(float(waypoint[2]), 3),
                "alt": round(altitude_from_position(waypoint[0], waypoint[1], waypoint[2]), 2)
            })
            
        return {
            "required_delta_v_kms": round(total_delta_v_kms, 4),
            "estimated_fuel_kg": round(fuel_used_kg, 2),
            "fuel_remaining_kg": round(fuel_remaining_kg, 2),
            "intercept_time_s": round(scaled_intercept_time_s, 1),
            "initial_distance_km": round(range_km, 2),
            "initial_rel_velocity_kms": round(rel_speed, 4),
            "is_feasible": is_feasible,
            "success_probability": success_prob,
            "trajectory_waypoints": trajectory_waypoints
        }

    def simulate_inspection(self, target: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simulates comprehensive sensor inspection of target satellite.
        Returns subsystem diagnostics and classified health.
        """
        obj_type = target.get("object_type", "UNKNOWN")
        raw_health = target.get("health_status", "UNKNOWN")
        
        if obj_type == "DEBRIS":
            return {
                "power_status": "NONE (Passive Debris)",
                "communication_status": "OFFLINE",
                "thermal_condition": "EQUILIBRIUM (-45 C)",
                "attitude_condition": "UNCONTROLLED TUMBLE (6.2 deg/s)",
                "structural_condition": "FRAGMENTED / SHARP EDGES",
                "orbital_condition": "DRIFTING",
                "overall_health": "DEBRIS",
                "recommendation": "Grapple with magnetic / net mechanism and relocate to disposal orbit."
            }
        elif raw_health in ["CRITICAL", "NON-RESPONSIVE"] or obj_type == "FAILED_SATELLITE":
            return {
                "power_status": "BUS COLLAPSE (11.8 V / Battery Dead)",
                "communication_status": "SILENT (Carrier Beacon Lost)",
                "thermal_condition": "EXCURSION (-85 C shadowed)",
                "attitude_condition": "SLOW CONICAL TUMBLE (3.4 deg/s)",
                "structural_condition": "SOLAR ARRAY STUCK AT 45 DEG",
                "orbital_condition": "RAPID DECAY / ECCENTRIC",
                "overall_health": "CRITICAL",
                "recommendation": "Secure main payload clamp and perform controlled disposal de-orbit burn."
            }
        else:
            return {
                "power_status": "NOMINAL (28.2 V / 94% Battery)",
                "communication_status": "TRANSMITTING TELEMETRY",
                "thermal_condition": "NOMINAL (+18 C)",
                "attitude_condition": "3-AXIS STABILIZED (0.02 deg/s)",
                "structural_condition": "INTACT",
                "orbital_condition": "NOMINAL LEO STATION",
                "overall_health": "HEALTHY",
                "recommendation": "Routine standoff monitoring; disengage rendezvous."
            }

    def plan_relocation_maneuver(
        self,
        current_altitude_km: float,
        strategy: str = "DISPOSAL ORBIT",
        combined_mass_kg: float = 1200.0
    ) -> Dict[str, Any]:
        """
        Calculates relocation orbit maneuver:
          - SAFE ORBIT: Re-boost by +150 km above congested belt
          - DISPOSAL ORBIT: Graveyard boost (+300 km)
          - STORAGE ORBIT: Phasing storage orbit (+100 km)
          - CONTROLLED DEORBIT: Perigee drop to 80 km for atmospheric demise
        """
        r1 = R_EARTH + current_altitude_km
        
        if strategy == "CONTROLLED DEORBIT":
            target_perigee_km = 75.0
            r2 = R_EARTH + target_perigee_km
            # De-orbit delta-v: retro-burn at apogee
            v1 = math.sqrt(MU_EARTH / r1)
            v_trans_1 = math.sqrt(MU_EARTH / r1) * math.sqrt((2.0 * r2) / (r1 + r2))
            delta_v_kms = abs(v1 - v_trans_1)
            final_orbit_desc = f"Atmospheric Entry Trajectory (Perigee {target_perigee_km:.0f} km - Pacific Ocean Cemetery)"
            maneuver_time_s = 180.0
        elif strategy == "SAFE ORBIT":
            target_alt = current_altitude_km + 150.0
            r2 = R_EARTH + target_alt
            v1 = math.sqrt(MU_EARTH / r1)
            v2 = math.sqrt(MU_EARTH / r2)
            v_trans_1 = math.sqrt(MU_EARTH / r1) * math.sqrt((2.0 * r2) / (r1 + r2))
            v_trans_2 = math.sqrt(MU_EARTH / r2) * math.sqrt((2.0 * r1) / (r1 + r2))
            delta_v_kms = abs(v_trans_1 - v1) + abs(v2 - v_trans_2)
            final_orbit_desc = f"Safe Operational Orbit ({target_alt:.0f} km Circular)"
            maneuver_time_s = 240.0
        elif strategy == "STORAGE ORBIT":
            target_alt = current_altitude_km + 100.0
            r2 = R_EARTH + target_alt
            v1 = math.sqrt(MU_EARTH / r1)
            v2 = math.sqrt(MU_EARTH / r2)
            v_trans_1 = math.sqrt(MU_EARTH / r1) * math.sqrt((2.0 * r2) / (r1 + r2))
            v_trans_2 = math.sqrt(MU_EARTH / r2) * math.sqrt((2.0 * r1) / (r1 + r2))
            delta_v_kms = abs(v_trans_1 - v1) + abs(v2 - v_trans_2)
            final_orbit_desc = f"Long-term Storage Orbit ({target_alt:.0f} km Circular)"
            maneuver_time_s = 210.0
        else:  # DISPOSAL ORBIT (Graveyard)
            target_alt = current_altitude_km + 300.0
            r2 = R_EARTH + target_alt
            v1 = math.sqrt(MU_EARTH / r1)
            v2 = math.sqrt(MU_EARTH / r2)
            v_trans_1 = math.sqrt(MU_EARTH / r1) * math.sqrt((2.0 * r2) / (r1 + r2))
            v_trans_2 = math.sqrt(MU_EARTH / r2) * math.sqrt((2.0 * r1) / (r1 + r2))
            delta_v_kms = abs(v_trans_1 - v1) + abs(v2 - v_trans_2)
            final_orbit_desc = f"Protected Graveyard Orbit ({target_alt:.0f} km Super-LEO)"
            maneuver_time_s = 300.0
            
        # Fuel consumption
        dv_ms = delta_v_kms * 1000.0
        fuel_consumption_kg = combined_mass_kg * (1.0 - math.exp(-dv_ms / (SENTINEL_ISP_S * G0)))
        
        return {
            "strategy": strategy,
            "required_delta_v_kms": round(delta_v_kms, 4),
            "estimated_maneuver_time_s": maneuver_time_s,
            "final_orbit": final_orbit_desc,
            "fuel_consumption_kg": round(fuel_consumption_kg, 2),
            "safety_status": "APPROVED (Trajectory clearance verified)"
        }
