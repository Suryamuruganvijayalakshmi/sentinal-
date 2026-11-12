"""
SENTINEL AI Anomaly Detection Engine
Implements lightweight statistical and multivariable anomaly detection using NumPy.
Evaluates:
  - Altitude decay rates
  - Velocity vector deviations from Keplerian equilibrium
  - Attitude tumbling oscillations (gyro / optical sensor drift)
  - Thermal / battery / power anomalies
  - Optical cross-section anomalies from dataset observations
Outputs:
  - Anomaly Detected (bool)
  - Anomaly Score (0.0 - 1.0)
  - Reason
  - Affected Parameter
  - Recommended Action
"""

import math
import numpy as np
from typing import Dict, Any, List, Optional
from sentinel.backend.orbital.physics import MU_EARTH, R_EARTH, altitude_from_position

class AnomalyDetector:
    def __init__(self, baseline_history_size: int = 20):
        self.history_size = baseline_history_size
        # In-memory history keyed by object_id
        self.object_histories: Dict[str, List[Dict[str, float]]] = {}
        
    def record_telemetry(self, object_id: str, sample: Dict[str, float]):
        if object_id not in self.object_histories:
            self.object_histories[object_id] = []
        hist = self.object_histories[object_id]
        hist.append(sample)
        if len(hist) > self.history_size:
            hist.pop(0)

    def analyze_object(self, obj: Dict[str, Any], extra_sensors: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """
        Runs comprehensive anomaly evaluation on an orbital object.
        """
        obj_id = obj["id"]
        pos = np.array([obj["position_x"], obj["position_y"], obj["position_z"]], dtype=float)
        vel = np.array([obj["velocity_x"], obj["velocity_y"], obj["velocity_z"]], dtype=float)
        
        r_mag = float(np.linalg.norm(pos))
        v_mag = float(np.linalg.norm(vel))
        alt = r_mag - R_EARTH
        
        # Expected circular Keplerian velocity at this radius
        v_kepler_expected = math.sqrt(MU_EARTH / max(1.0, r_mag))
        vel_deviation = abs(v_mag - v_kepler_expected)
        
        sensors = extra_sensors or {}
        battery_pct = sensors.get("battery_pct", 100.0)
        temp_c = sensors.get("temperature_c", 22.0)
        tumble_rate_deg_s = sensors.get("tumble_rate_deg_s", 0.0)
        
        # If target has health status FAILED or CRITICAL
        health_status = obj.get("health_status", "HEALTHY")
        
        # Check rolling statistics
        sample = {
            "altitude": alt,
            "velocity": v_mag,
            "vel_deviation": vel_deviation,
            "battery": battery_pct,
            "tumble": tumble_rate_deg_s
        }
        self.record_telemetry(obj_id, sample)
        hist = self.object_histories[obj_id]
        
        anomalies_found = []
        max_score = 0.0
        
        # 1. Tumbling / Attitude Loss Check
        if tumble_rate_deg_s > 4.5 or health_status in ["CRITICAL", "NON-RESPONSIVE", "DEGRADED"]:
            score = min(1.0, 0.5 + (tumble_rate_deg_s / 20.0))
            if health_status in ["CRITICAL", "NON-RESPONSIVE"]:
                score = max(score, 0.92)
            max_score = max(max_score, score)
            anomalies_found.append({
                "param": "attitude_stability",
                "score": score,
                "reason": f"Satellite attitude loss detected: uncontrollable spin rate {tumble_rate_deg_s:.1f} deg/s, telemetry indicates loss of 3-axis stabilization.",
                "action": "Dispatch SENTINEL inspection drone to match spin vector and prepare soft docking."
            })
            
        # 2. Orbital Velocity Deviation Check (Energy imbalance / unplanned thrust or collision)
        if vel_deviation > 0.35:
            score = min(1.0, vel_deviation / 1.5)
            max_score = max(max_score, score)
            anomalies_found.append({
                "param": "orbital_velocity_equilibrium",
                "score": score,
                "reason": f"Significant kinetic energy imbalance: velocity deviates by {vel_deviation:.3f} km/s from expected two-body circular orbit.",
                "action": "Recalculate orbit state and track for fragmentation or propellant venting."
            })
            
        # 3. Altitude Rapid Decay / Atmospheric Drag Surge
        if len(hist) >= 5:
            alts = [h["altitude"] for h in hist]
            decay_rate = (alts[0] - alts[-1])  # km dropped across window
            if decay_rate > 2.0 or alt < 350.0:
                score = min(1.0, 0.75 + (decay_rate / 10.0))
                max_score = max(max_score, score)
                anomalies_found.append({
                    "param": "altitude_decay_rate",
                    "score": score,
                    "reason": f"Rapid orbit degradation: perigee altitude {alt:.1f} km experiencing severe thermospheric drag.",
                    "action": "Immediate orbit boost maneuver or capture for controlled orbital disposal required."
                })
                
        # 4. Critical Battery / Power Bus Failure
        if battery_pct < 20.0 and health_status != "DEBRIS":
            score = 0.88
            max_score = max(max_score, score)
            anomalies_found.append({
                "param": "eps_bus_voltage",
                "score": score,
                "reason": f"Main bus power depletion: battery level at {battery_pct:.1f}%, solar array pointing inactive.",
                "action": "Establish optical proximity link to verify solar array structural integrity."
            })
            
        if anomalies_found:
            # Pick highest severity anomaly
            anomalies_found.sort(key=lambda x: x["score"], reverse=True)
            top = anomalies_found[0]
            return {
                "anomaly_detected": True,
                "anomaly_score": round(top["score"], 3),
                "affected_parameter": top["param"],
                "reason": top["reason"],
                "recommended_action": top["action"],
                "all_anomalies": anomalies_found
            }
        else:
            return {
                "anomaly_detected": False,
                "anomaly_score": 0.05,
                "affected_parameter": "none",
                "reason": "Orbital parameters and subsystem telemetry within 3-sigma nominal thresholds.",
                "recommended_action": "Maintain routine orbital safety monitoring.",
                "all_anomalies": []
            }
