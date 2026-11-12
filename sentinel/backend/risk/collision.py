"""
SENTINEL Collision-Risk Engine
Performs continuous pairwise orbital screening between space objects.
Calculates:
  - relative position vector & range
  - relative velocity vector & closing speed
  - Time of Closest Approach (t_CPA)
  - Closest Approach Distance (d_CPA)
  - Estimated Collision Probability
  - Risk Level classification: SAFE, LOW, MEDIUM, HIGH, CRITICAL
Configurable thresholds supported.
"""

import math
import numpy as np
from typing import Dict, Any, List, Tuple
from sentinel.backend.orbital.physics import compute_cpa, compute_rk4_cpa

class CollisionRiskEngine:
    def __init__(self, config: Dict[str, Any] = None):
        self.config = {
            "threshold_critical_km": 5.0,
            "threshold_high_km": 20.0,
            "threshold_medium_km": 50.0,
            "threshold_low_km": 150.0,
            "time_window_critical_s": 1800.0,   # 30 min
            "time_window_high_s": 3600.0,       # 1 hour
            "time_window_medium_s": 7200.0,     # 2 hours
            "time_window_low_s": 14400.0,       # 4 hours
            "default_position_sigma_km": 2.5,   # combined 1-sigma uncertainty
            **(config or {})
        }
        
    def set_config(self, new_config: Dict[str, Any]):
        self.config.update(new_config)
        
    def evaluate_pair(self, obj_a: Dict[str, Any], obj_b: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates collision risk between two orbital objects at current simulation instant.
        """
        pos_a = np.array([obj_a["position_x"], obj_a["position_y"], obj_a["position_z"]], dtype=float)
        vel_a = np.array([obj_a["velocity_x"], obj_a["velocity_y"], obj_a["velocity_z"]], dtype=float)
        
        pos_b = np.array([obj_b["position_x"], obj_b["position_y"], obj_b["position_z"]], dtype=float)
        vel_b = np.array([obj_b["velocity_x"], obj_b["velocity_y"], obj_b["velocity_z"]], dtype=float)
        
        r_rel = pos_b - pos_a
        v_rel = vel_b - vel_a
        
        current_distance_km = float(np.linalg.norm(r_rel))
        relative_speed_kms = float(np.linalg.norm(v_rel))
        
        t_cpa_s, d_cpa_km = compute_cpa(r_rel, v_rel)

        # For primary spacecraft conjunction screening within orbital horizon (up to 1 hour),
        # use curved two-body RK4 close-approach solver when separated along orbit arc.
        ids = {obj_a.get("id"), obj_b.get("id")}
        if ("SAT-01" in ids or "SENTINEL-01" in ids) and current_distance_km <= 4500.0:
            if t_cpa_s <= 0.0 or t_cpa_s > 60.0 or d_cpa_km > self.config["threshold_low_km"]:
                rk4_t, rk4_d, rk4_v = compute_rk4_cpa(
                    pos_a, vel_a, pos_b, vel_b,
                    horizon_s=float(self.config.get("time_window_high_s", 3600.0)),
                    coarse_dt=25.0
                )
                if rk4_t > 0.0 and rk4_d < d_cpa_km:
                    t_cpa_s = rk4_t
                    d_cpa_km = rk4_d
                    if rk4_v > 0.0:
                        relative_speed_kms = rk4_v
        
        # Estimate collision probability (Gaussian uncertainty model)
        sigma = self.config["default_position_sigma_km"]
        # Collision cross-section (e.g. combined hard-body radius 10m = 0.01 km)
        r_coll_km = 0.015
        
        # Approximate probability
        exponent = - (d_cpa_km ** 2) / (2.0 * (sigma ** 2))
        prob_collision = float(math.exp(max(-50.0, exponent)) * (r_coll_km / sigma))
        prob_collision = min(1.0, max(0.0, prob_collision))
        
        # Determine risk classification
        risk_level = "SAFE"
        if d_cpa_km <= self.config["threshold_critical_km"] and t_cpa_s <= self.config["time_window_critical_s"]:
            risk_level = "CRITICAL"
        elif d_cpa_km <= self.config["threshold_high_km"] and t_cpa_s <= self.config["time_window_high_s"]:
            risk_level = "HIGH"
        elif d_cpa_km <= self.config["threshold_medium_km"] and t_cpa_s <= self.config["time_window_medium_s"]:
            risk_level = "MEDIUM"
        elif d_cpa_km <= self.config["threshold_low_km"] and t_cpa_s <= self.config["time_window_low_s"]:
            risk_level = "LOW"
            
        return {
            "object_a_id": obj_a["id"],
            "object_a_name": obj_a["name"],
            "object_b_id": obj_b["id"],
            "object_b_name": obj_b["name"],
            "current_distance_km": round(current_distance_km, 3),
            "relative_speed_kms": round(relative_speed_kms, 4),
            "cpa_time_s": round(t_cpa_s, 1),
            "cpa_distance_km": round(d_cpa_km, 3),
            "collision_probability": float(f"{prob_collision:.6e}"),
            "risk_level": risk_level,
            "is_diverging": bool(t_cpa_s <= 0.0)
        }

    def screen_all_pairs(self, objects: List[Dict[str, Any]], filter_safe=True) -> List[Dict[str, Any]]:
        """
        Screens all object pairs in the simulation space.
        """
        assessments = []
        n = len(objects)
        for i in range(n):
            for j in range(i + 1, n):
                obj_a = objects[i]
                obj_b = objects[j]
                
                # Safeguard against self-conjunction or duplicate objects
                if obj_a.get("id") == obj_b.get("id"):
                    continue
                if obj_a.get("id") in ["SAT-01", "SENTINEL-01"] and obj_b.get("id") in ["SAT-01", "SENTINEL-01"]:
                    continue
                
                # Check if both objects are inactive debris (low operational interest unless requested)
                # But prioritize interactions involving SENTINEL or TARGET satellite
                assessment = self.evaluate_pair(obj_a, obj_b)
                if not filter_safe or assessment["risk_level"] != "SAFE":
                    assessments.append(assessment)
                    
        # Sort by severity (CRITICAL first, then lowest CPA distance)
        severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "SAFE": 4}
        assessments.sort(key=lambda x: (severity_rank[x["risk_level"]], x["cpa_distance_km"]))
        return assessments
