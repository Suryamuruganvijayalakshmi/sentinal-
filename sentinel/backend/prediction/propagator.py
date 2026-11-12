"""
SENTINEL Trajectory Prediction Engine
Computes deterministic multi-horizon trajectory predictions for orbital objects.
Supported horizons: 10s, 30s, 1m, 5m, 10m, 30m, 1h.
Calculates:
  - Trajectory waypoints (for 3D path visualization)
  - Final predicted state (position, velocity, altitude)
  - Uncertainty zone ellipsoids (radial, along-track, cross-track)
"""

import math
import numpy as np
from typing import Dict, Any, List, Optional
from sentinel.backend.orbital.physics import (
    propagate_rk4_duration, altitude_from_position, compute_rk4_cpa
)

HORIZONS_SECONDS = {
    "10s": 10.0,
    "30s": 30.0,
    "1m": 60.0,
    "5m": 300.0,
    "10m": 600.0,
    "30m": 1800.0,
    "1h": 3600.0
}

class PredictionEngine:
    def __init__(self):
        pass

    def predict_trajectory(
        self,
        obj: Dict[str, Any],
        horizon_key: str = "5m",
        num_samples: int = 50,
        reference_obj: Optional[Dict[str, Any]] = None,
        screening_distance_km: float = 25.0
    ) -> Dict[str, Any]:
        """
        Generates deterministic future trajectory path, uncertainty growth ellipsoid,
        and optional pairwise separation forecast against a reference spacecraft (e.g., SAT-01).
        """
        dt_horizon = HORIZONS_SECONDS.get(horizon_key, 300.0)
        step_dt = dt_horizon / max(1, num_samples)
        
        pos = np.array([obj["position_x"], obj["position_y"], obj["position_z"]], dtype=float)
        vel = np.array([obj["velocity_x"], obj["velocity_y"], obj["velocity_z"]], dtype=float)
        
        initial_pos = pos.copy()
        initial_vel = vel.copy()

        has_ref = reference_obj is not None and reference_obj.get("id") != obj.get("id")
        if has_ref:
            ref_pos = np.array([reference_obj["position_x"], reference_obj["position_y"], reference_obj["position_z"]], dtype=float)
            ref_vel = np.array([reference_obj["velocity_x"], reference_obj["velocity_y"], reference_obj["velocity_z"]], dtype=float)
        else:
            ref_pos = None
            ref_vel = None
        
        waypoints: List[Dict[str, Any]] = []
        reference_waypoints: List[Dict[str, Any]] = []
        current_t = 0.0
        
        # Uncertainty growth formula helper at time t
        def uncertainty_at(t_s: float):
            sr = 0.05 + 0.0001 * t_s
            sc = 0.08 + 0.0002 * t_s
            sa = 0.15 + 0.0015 * t_s
            return sr, sc, sa, math.sqrt(sr * sr + sc * sc + sa * sa)

        init_sep = float(np.linalg.norm(pos - ref_pos)) if (has_ref and ref_pos is not None) else 0.0
        _, _, _, init_u = uncertainty_at(0.0)

        # Add initial point
        waypoints.append({
            "t": 0.0,
            "x": round(float(pos[0]), 3),
            "y": round(float(pos[1]), 3),
            "z": round(float(pos[2]), 3),
            "alt": round(altitude_from_position(pos[0], pos[1], pos[2]), 2),
            "separation_km": round(init_sep, 2) if has_ref else None,
            "uncertainty_3sigma_km": round(init_u, 3),
            "threshold_km": round(screening_distance_km, 1)
        })
        if has_ref and ref_pos is not None:
            reference_waypoints.append({
                "t": 0.0,
                "x": round(float(ref_pos[0]), 3),
                "y": round(float(ref_pos[1]), 3),
                "z": round(float(ref_pos[2]), 3),
                "alt": round(altitude_from_position(ref_pos[0], ref_pos[1], ref_pos[2]), 2)
            })
        
        # Propagate forward with bounded RK4 sub-steps
        min_sep = init_sep if has_ref else 0.0
        min_sep_t = 0.0
        for _ in range(num_samples):
            pos, vel, _ = propagate_rk4_duration(pos, vel, step_dt, max_step_s=10.0)
            current_t += step_dt
            _, _, _, u_tot = uncertainty_at(current_t)
            sep_val = None
            if has_ref and ref_pos is not None and ref_vel is not None:
                ref_pos, ref_vel, _ = propagate_rk4_duration(ref_pos, ref_vel, step_dt, max_step_s=10.0)
                sep_km = float(np.linalg.norm(pos - ref_pos))
                sep_val = round(sep_km, 2)
                if sep_km < min_sep:
                    min_sep = sep_km
                    min_sep_t = current_t
                reference_waypoints.append({
                    "t": round(current_t, 1),
                    "x": round(float(ref_pos[0]), 3),
                    "y": round(float(ref_pos[1]), 3),
                    "z": round(float(ref_pos[2]), 3),
                    "alt": round(altitude_from_position(ref_pos[0], ref_pos[1], ref_pos[2]), 2)
                })
            waypoints.append({
                "t": round(current_t, 1),
                "x": round(float(pos[0]), 3),
                "y": round(float(pos[1]), 3),
                "z": round(float(pos[2]), 3),
                "alt": round(altitude_from_position(pos[0], pos[1], pos[2]), 2),
                "separation_km": sep_val,
                "uncertainty_3sigma_km": round(u_tot, 3),
                "threshold_km": round(screening_distance_km, 1)
            })
            
        final_alt = altitude_from_position(pos[0], pos[1], pos[2])
        sigma_radial, sigma_crosstrack, sigma_alongtrack, sigma_total = uncertainty_at(dt_horizon)

        pairwise_forecast = None
        if has_ref and reference_obj is not None:
            r0 = np.array([reference_obj["position_x"], reference_obj["position_y"], reference_obj["position_z"]], dtype=float)
            v0 = np.array([reference_obj["velocity_x"], reference_obj["velocity_y"], reference_obj["velocity_z"]], dtype=float)
            exact_t_cpa, exact_d_cpa, rel_spd = compute_rk4_cpa(initial_pos, initial_vel, r0, v0, horizon_s=max(dt_horizon, 3600.0), coarse_dt=20.0)
            final_sep = float(np.linalg.norm(pos - ref_pos)) if ref_pos is not None else min_sep
            pairwise_forecast = {
                "reference_id": reference_obj["id"],
                "reference_name": reference_obj["name"],
                "initial_separation_km": round(init_sep, 2),
                "final_separation_km": round(final_sep, 2),
                "horizon_min_separation_km": round(min_sep, 2),
                "horizon_min_time_s": round(min_sep_t, 1),
                "predicted_cpa_km": round(exact_d_cpa, 2),
                "predicted_cpa_t_s": round(exact_t_cpa, 1),
                "relative_speed_kms": round(rel_spd, 3),
                "screening_distance_km": round(screening_distance_km, 1),
                "violates_screening": bool(exact_d_cpa < screening_distance_km and exact_t_cpa <= 3600.0),
                "reference_waypoints": reference_waypoints
            }
        
        return {
            "object_id": obj["id"],
            "object_name": obj["name"],
            "horizon_key": horizon_key,
            "horizon_seconds": dt_horizon,
            "initial_state": {
                "x": round(float(initial_pos[0]), 3),
                "y": round(float(initial_pos[1]), 3),
                "z": round(float(initial_pos[2]), 3),
                "vx": round(float(initial_vel[0]), 4),
                "vy": round(float(initial_vel[1]), 4),
                "vz": round(float(initial_vel[2]), 4),
                "alt": round(altitude_from_position(initial_pos[0], initial_pos[1], initial_pos[2]), 2)
            },
            "predicted_state": {
                "x": round(float(pos[0]), 3),
                "y": round(float(pos[1]), 3),
                "z": round(float(pos[2]), 3),
                "vx": round(float(vel[0]), 4),
                "vy": round(float(vel[1]), 4),
                "vz": round(float(vel[2]), 4),
                "alt": round(final_alt, 2)
            },
            "uncertainty_zone": {
                "radial_km": round(sigma_radial, 3),
                "along_track_km": round(sigma_alongtrack, 3),
                "cross_track_km": round(sigma_crosstrack, 3),
                "total_3sigma_km": round(sigma_total, 3),
                "confidence_interval_pct": 99.7
            },
            "pairwise_forecast": pairwise_forecast,
            "waypoints": waypoints
        }
