"""
SENTINEL Orbital Physics Engine
Label: Simplified Two-Body Orbital Simulation
Implements deterministic two-body orbital mechanics around Earth.
Gravitational parameter: mu = 398600.4418 km^3/s^2
Earth equatorial radius: R_earth = 6378.137 km
"""

import math
import numpy as np
from typing import Tuple, Dict, Any, List, Optional

MU_EARTH = 398600.4418  # km^3/s^2
R_EARTH = 6378.137      # km

def position_magnitude(x: float, y: float, z: float) -> float:
    """Calculates position vector magnitude: D = sqrt(x^2 + y^2 + z^2)."""
    return math.sqrt(x * x + y * y + z * z)

def altitude_from_position(x: float, y: float, z: float) -> float:
    """Calculates altitude above Earth mean sea level: h = D - R_EARTH."""
    return position_magnitude(x, y, z) - R_EARTH

def gravitational_acceleration(pos: np.ndarray) -> np.ndarray:
    """
    Computes Newtonian two-body gravitational acceleration:
    A = - (mu / r^3) * P
    """
    r = np.linalg.norm(pos)
    if r < 1e-6:
        return np.zeros(3)
    return -(MU_EARTH / (r ** 3)) * pos

def predict_future_position(pos: np.ndarray, vel: np.ndarray, dt: float) -> np.ndarray:
    """
    Computes future position using second-order kinematic expansion:
    P_future = P + V*t + 0.5*A*t^2
    """
    acc = gravitational_acceleration(pos)
    return pos + vel * dt + 0.5 * acc * (dt ** 2)

def propagate_two_body_rk4(pos: np.ndarray, vel: np.ndarray, dt: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Propagates 3D state vector using 4th-order Runge-Kutta (RK4) integrator
    under central two-body gravity.
    Returns: (new_pos, new_vel, new_acc)
    """
    # k1
    k1_v = gravitational_acceleration(pos)
    k1_p = vel

    # k2
    pos_k2 = pos + 0.5 * dt * k1_p
    vel_k2 = vel + 0.5 * dt * k1_v
    k2_v = gravitational_acceleration(pos_k2)
    k2_p = vel_k2

    # k3
    pos_k3 = pos + 0.5 * dt * k2_p
    vel_k3 = vel + 0.5 * dt * k2_v
    k3_v = gravitational_acceleration(pos_k3)
    k3_p = vel_k3

    # k4
    pos_k4 = pos + dt * k3_p
    vel_k4 = vel + dt * k3_v
    k4_v = gravitational_acceleration(pos_k4)
    k4_p = vel_k4

    new_pos = pos + (dt / 6.0) * (k1_p + 2.0 * k2_p + 2.0 * k3_p + k4_p)
    new_vel = vel + (dt / 6.0) * (k1_v + 2.0 * k2_v + 2.0 * k3_v + k4_v)
    new_acc = gravitational_acceleration(new_pos)

    return new_pos, new_vel, new_acc

def compute_cpa(r_rel: np.ndarray, v_rel: np.ndarray) -> Tuple[float, float]:
    """
    Calculates Time of Closest Approach (t_CPA) and Closest Approach Distance (d_CPA):
      t_CPA = - (r . v) / (v . v)
      d_CPA = |r + v * t_CPA|
    Returns: (t_cpa_seconds, d_cpa_km)
    """
    v_dot_v = float(np.dot(v_rel, v_rel))
    r_dot_v = float(np.dot(r_rel, v_rel))
    
    if v_dot_v < 1e-9:
        # Relative velocity is zero: objects maintain constant distance
        return 0.0, float(np.linalg.norm(r_rel))
    
    t_cpa = -(r_dot_v) / v_dot_v
    
    # If t_cpa < 0, closest approach was in the past (objects are diverging)
    if t_cpa <= 0:
        return 0.0, float(np.linalg.norm(r_rel))
        
    pos_at_cpa = r_rel + v_rel * t_cpa
    d_cpa = float(np.linalg.norm(pos_at_cpa))
    return float(t_cpa), float(d_cpa)

def propagate_rk4_duration(pos: np.ndarray, vel: np.ndarray, duration_s: float, max_step_s: float = 5.0) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Propagates a 3D orbital state over an arbitrary duration (forward or backward)
    using bounded RK4 sub-steps for high orbital integration stability.
    """
    if abs(duration_s) < 1e-9:
        return pos.copy(), vel.copy(), gravitational_acceleration(pos)
    n_steps = max(1, int(math.ceil(abs(duration_s) / max_step_s)))
    dt = duration_s / n_steps
    cur_p = pos.astype(float).copy()
    cur_v = vel.astype(float).copy()
    cur_a = gravitational_acceleration(cur_p)
    for _ in range(n_steps):
        cur_p, cur_v, cur_a = propagate_two_body_rk4(cur_p, cur_v, dt)
    return cur_p, cur_v, cur_a

def compute_rk4_cpa(
    pos_a: np.ndarray,
    vel_a: np.ndarray,
    pos_b: np.ndarray,
    vel_b: np.ndarray,
    horizon_s: float = 3600.0,
    coarse_dt: float = 20.0
) -> Tuple[float, float, float]:
    """
    Computes true curved two-body RK4 Closest Approach Time (t_CPA), Distance (d_CPA),
    and relative closing speed at CPA between two orbital bodies within horizon_s.
    Returns: (t_cpa_s, d_cpa_km, rel_speed_at_cpa_kms)
    """
    cur_pa = pos_a.astype(float).copy()
    cur_va = vel_a.astype(float).copy()
    cur_pb = pos_b.astype(float).copy()
    cur_vb = vel_b.astype(float).copy()

    min_d = float(np.linalg.norm(cur_pb - cur_pa))
    best_bracket_d = min_d
    best_t = 0.0
    best_pa, best_va = cur_pa.copy(), cur_va.copy()
    best_pb, best_vb = cur_pb.copy(), cur_vb.copy()
    best_rel_speed = float(np.linalg.norm(cur_vb - cur_va))

    n_coarse = max(1, int(horizon_s / coarse_dt))
    prev_state = (cur_pa.copy(), cur_va.copy(), cur_pb.copy(), cur_vb.copy(), 0.0)
    prev_dr = cur_pb - cur_pa
    bracket_start = None

    for step in range(1, n_coarse + 1):
        t = step * coarse_dt
        cur_pa, cur_va, _ = propagate_two_body_rk4(cur_pa, cur_va, coarse_dt)
        cur_pb, cur_vb, _ = propagate_two_body_rk4(cur_pb, cur_vb, coarse_dt)
        cur_dr = cur_pb - cur_pa
        d = float(np.linalg.norm(cur_dr))

        # Analytical linear-chord minimum across [t - coarse_dt, t] so fast encounters cannot step past CPA
        delta_dr = cur_dr - prev_dr
        delta2 = float(np.dot(delta_dr, delta_dr))
        if delta2 > 1e-12:
            u = max(0.0, min(1.0, -float(np.dot(prev_dr, delta_dr)) / delta2))
            d_seg = float(np.linalg.norm(prev_dr + u * delta_dr))
        else:
            u = 1.0
            d_seg = d

        if d < min_d:
            min_d = d
            best_t = t
            best_rel_speed = float(np.linalg.norm(cur_vb - cur_va))
            best_pa, best_va = cur_pa.copy(), cur_va.copy()
            best_pb, best_vb = cur_pb.copy(), cur_vb.copy()

        if d_seg < best_bracket_d:
            best_bracket_d = d_seg
            bracket_start = prev_state
        elif d < best_bracket_d:
            best_bracket_d = d
            bracket_start = prev_state

        prev_dr = cur_dr
        prev_state = (cur_pa.copy(), cur_va.copy(), cur_pb.copy(), cur_vb.copy(), t)

    # Fine RK4 refinement across the best bracketed interval [t_start, min(horizon_s, t_start + 1.5*coarse_dt)]
    if bracket_start is not None:
        pa_f, va_f, pb_f, vb_f, t_f = bracket_start
        fine_min_d = float(np.linalg.norm(pb_f - pa_f))
        fine_best_t = t_f
        fine_best_pa, fine_best_va = pa_f.copy(), va_f.copy()
        fine_best_pb, fine_best_vb = pb_f.copy(), vb_f.copy()
        fine_rel_speed = float(np.linalg.norm(vb_f - va_f))

        fine_dt = 1.0
        span = min(coarse_dt * 1.5, horizon_s - t_f)
        n_fine = max(1, int(span / fine_dt))
        for _ in range(n_fine):
            t_f += fine_dt
            pa_f, va_f, _ = propagate_two_body_rk4(pa_f, va_f, fine_dt)
            pb_f, vb_f, _ = propagate_two_body_rk4(pb_f, vb_f, fine_dt)
            d = float(np.linalg.norm(pb_f - pa_f))
            if d < fine_min_d:
                fine_min_d = d
                fine_best_t = t_f
                fine_rel_speed = float(np.linalg.norm(vb_f - va_f))
                fine_best_pa, fine_best_va = pa_f.copy(), va_f.copy()
                fine_best_pb, fine_best_vb = pb_f.copy(), vb_f.copy()

        # Bilateral sub-second tangent refinement around closest 1s sample inside the bracket
        r_b = fine_best_pb - fine_best_pa
        v_b = fine_best_vb - fine_best_va
        vv = float(np.dot(v_b, v_b))
        if vv > 1e-9:
            t_sub = max(-1.0, min(1.0, -float(np.dot(r_b, v_b)) / vv))
            if 0.0 <= fine_best_t + t_sub <= horizon_s:
                d_sub = float(np.linalg.norm(r_b + v_b * t_sub))
                if d_sub < fine_min_d:
                    fine_min_d = d_sub
                    fine_best_t = fine_best_t + t_sub

        if fine_min_d <= min_d:
            min_d = fine_min_d
            best_t = fine_best_t
            best_rel_speed = fine_rel_speed
            best_pa, best_va = fine_best_pa, fine_best_va
            best_pb, best_vb = fine_best_pb, fine_best_vb

    return float(best_t), float(min_d), float(best_rel_speed)

def predict_post_maneuver_cpa_rk4(
    pos_s: np.ndarray,
    vel_s: np.ndarray,
    dv_vec_kms: np.ndarray,
    pos_t: Optional[np.ndarray] = None,
    vel_t: Optional[np.ndarray] = None,
    horizon_s: float = 3000.0,
    num_waypoints: int = 56
) -> Tuple[float, float, List[Dict[str, float]]]:
    """
    Applies an impulsive delta-v vector (km/s) to Sentinel velocity, finds the exact
    post-maneuver RK4 closest approach (d_CPA, t_CPA) against target (if provided),
    and returns 3D RK4 trajectory waypoints spanning through encounter window.
    """
    v_burn = vel_s.astype(float) + dv_vec_kms.astype(float)
    d_cpa = 0.0
    t_cpa = 0.0

    if pos_t is not None and vel_t is not None:
        t_cpa, d_cpa, _ = compute_rk4_cpa(pos_s, v_burn, pos_t, vel_t, horizon_s=horizon_s, coarse_dt=20.0)

    span_s = min(horizon_s, max(360.0, t_cpa * 1.12 if t_cpa > 10.0 else horizon_s))
    step_dt = span_s / max(1, num_waypoints)
    cur_p = pos_s.astype(float).copy()
    cur_v = v_burn.copy()

    waypoints: List[Dict[str, float]] = [{
        "t": 0.0,
        "x": round(float(cur_p[0]), 3),
        "y": round(float(cur_p[1]), 3),
        "z": round(float(cur_p[2]), 3),
        "alt": round(altitude_from_position(cur_p[0], cur_p[1], cur_p[2]), 2)
    }]
    for i in range(1, num_waypoints + 1):
        cur_p, cur_v, _ = propagate_rk4_duration(cur_p, cur_v, step_dt, max_step_s=10.0)
        waypoints.append({
            "t": round(i * step_dt, 1),
            "x": round(float(cur_p[0]), 3),
            "y": round(float(cur_p[1]), 3),
            "z": round(float(cur_p[2]), 3),
            "alt": round(altitude_from_position(cur_p[0], cur_p[1], cur_p[2]), 2)
        })

    return round(float(d_cpa), 2), round(float(max(1.0, t_cpa)), 1), waypoints

def _accel_batch(pos: np.ndarray) -> np.ndarray:
    """Vectorized gravitational acceleration for shape (N, 3) position vectors."""
    r = np.linalg.norm(pos, axis=1, keepdims=True)
    r_safe = np.maximum(r, 1e-6)
    return -(MU_EARTH / (r_safe ** 3)) * pos

def _rk4_step_batch(pos: np.ndarray, vel: np.ndarray, dt: float) -> Tuple[np.ndarray, np.ndarray]:
    """Vectorized single RK4 step for N bodies of shape (N, 3)."""
    k1_v = _accel_batch(pos)
    k1_p = vel

    pos_k2 = pos + 0.5 * dt * k1_p
    vel_k2 = vel + 0.5 * dt * k1_v
    k2_v = _accel_batch(pos_k2)
    k2_p = vel_k2

    pos_k3 = pos + 0.5 * dt * k2_p
    vel_k3 = vel + 0.5 * dt * k2_v
    k3_v = _accel_batch(pos_k3)
    k3_p = vel_k3

    pos_k4 = pos + dt * k3_p
    vel_k4 = vel + dt * k3_v
    k4_v = _accel_batch(pos_k4)
    k4_p = vel_k4

    new_pos = pos + (dt / 6.0) * (k1_p + 2.0 * k2_p + 2.0 * k3_p + k4_p)
    new_vel = vel + (dt / 6.0) * (k1_v + 2.0 * k2_v + 2.0 * k3_v + k4_v)
    return new_pos, new_vel

def propagate_rk4_batch(
    pos: np.ndarray,
    vel: np.ndarray,
    duration_s: float,
    max_step_s: float = 20.0
) -> Tuple[np.ndarray, np.ndarray]:
    """Propagates N state vectors (N, 3) across duration_s using vectorized RK4."""
    if abs(duration_s) < 1e-9:
        return pos.copy(), vel.copy()
    n_steps = max(1, int(math.ceil(abs(duration_s) / max_step_s)))
    dt = duration_s / n_steps
    cur_p = pos.astype(float).copy()
    cur_v = vel.astype(float).copy()
    for _ in range(n_steps):
        cur_p, cur_v = _rk4_step_batch(cur_p, cur_v, dt)
    return cur_p, cur_v

def compute_rk4_cpa_batch(
    pos_a: np.ndarray,
    vel_a: np.ndarray,
    pos_b: np.ndarray,
    vel_b: np.ndarray,
    horizon_s: float = 3600.0,
    dt: float = 20.0
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Vectorized curved two-body RK4 Closest Approach solver for N encounter pairs (N, 3).
    Returns arrays (t_cpa_s, d_cpa_km, rel_speed_kms) of shape (N,).
    """
    n = pos_a.shape[0]
    pa = pos_a.astype(float).copy()
    va = vel_a.astype(float).copy()
    pb = pos_b.astype(float).copy()
    vb = vel_b.astype(float).copy()

    r_rel0 = pb - pa
    min_d = np.linalg.norm(r_rel0, axis=1)
    best_t = np.zeros(n, dtype=float)
    best_va, best_vb = va.copy(), vb.copy()

    n_steps = max(1, int(math.ceil(horizon_s / dt)))
    step_dt = horizon_s / n_steps
    prev_dr = r_rel0

    for s in range(1, n_steps + 1):
        t = s * step_dt
        prev_va, prev_vb = va.copy(), vb.copy()
        pa, va = _rk4_step_batch(pa, va, step_dt)
        pb, vb = _rk4_step_batch(pb, vb, step_dt)
        cur_dr = pb - pa
        delta = cur_dr - prev_dr
        delta2 = np.sum(delta * delta, axis=1)
        u = np.where(
            delta2 > 1e-12,
            np.clip(-np.sum(prev_dr * delta, axis=1) / np.maximum(delta2, 1e-12), 0.0, 1.0),
            1.0
        )
        d_seg = np.linalg.norm(prev_dr + delta * u[:, None], axis=1)
        improved = d_seg < min_d
        if np.any(improved):
            min_d[improved] = d_seg[improved]
            best_t[improved] = (t - step_dt) + u[improved] * step_dt
            u_imp = u[improved, None]
            best_va[improved] = prev_va[improved] + u_imp * (va[improved] - prev_va[improved])
            best_vb[improved] = prev_vb[improved] + u_imp * (vb[improved] - prev_vb[improved])
        prev_dr = cur_dr

    rel_speed = np.linalg.norm(best_vb - best_va, axis=1)
    return best_t, min_d, rel_speed

def compute_orbital_elements(pos: np.ndarray, vel: np.ndarray) -> Dict[str, float]:
    """
    Extracts classical Keplerian orbital elements from state vectors:
      - semi-major axis (a) in km
      - eccentricity (e)
      - inclination (i) in deg
      - RAAN (Omega) in deg
      - orbital period (T) in seconds
      - specific orbital energy (eps)
    """
    r = np.linalg.norm(pos)
    v = np.linalg.norm(vel)
    
    if r < 1e-6:
        return {}
        
    # Specific angular momentum vector h = r x v
    h_vec = np.cross(pos, vel)
    h = np.linalg.norm(h_vec)
    
    # Specific mechanical energy eps = v^2/2 - mu/r
    energy = (v ** 2) / 2.0 - (MU_EARTH / r)
    
    # Semi-major axis: a = -mu / (2 * energy)
    if abs(energy) > 1e-9:
        a = -MU_EARTH / (2.0 * energy)
    else:
        a = r
        
    # Eccentricity vector e_vec = (1/mu) * ((v^2 - mu/r)*r - (r.v)*v)
    e_vec = ((v**2 - MU_EARTH / r) * pos - np.dot(pos, vel) * vel) / MU_EARTH
    eccentricity = float(np.linalg.norm(e_vec))
    
    # Inclination: cos(i) = h_z / h
    inc_rad = math.acos(max(-1.0, min(1.0, h_vec[2] / max(1e-9, h))))
    inclination_deg = math.degrees(inc_rad)
    
    # Orbital period: T = 2 * pi * sqrt(a^3 / mu) (for elliptical orbits)
    if a > 0:
        period = 2.0 * math.pi * math.sqrt((a ** 3) / MU_EARTH)
    else:
        period = 0.0
        
    altitude = r - R_EARTH
    
    return {
        "semi_major_axis_km": round(float(a), 2),
        "eccentricity": round(float(eccentricity), 5),
        "inclination_deg": round(float(inclination_deg), 2),
        "orbital_period_s": round(float(period), 1),
        "altitude_km": round(float(altitude), 2),
        "specific_energy_km2_s2": round(float(energy), 3)
    }
