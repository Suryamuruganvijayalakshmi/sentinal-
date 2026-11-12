"""
SENTINEL Database Layer
Provides SQLite database persistence with tables for:
  - orbital_objects
  - telemetry
  - missions
  - mission_events
  - risk_assessments
  - predictions
  - maneuvers
  - targets
  - dataset_records
  - ai_recommendations
"""

import os
import shutil
import sqlite3
import json
import tempfile
from datetime import datetime
from typing import List, Dict, Any, Optional

_DEFAULT_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../sentinel.db"))


def _resolve_db_path() -> str:
    env_path = os.environ.get("SENTINEL_DB_PATH")
    if env_path:
        return os.path.abspath(env_path)

    is_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("VERCEL_ENV")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    )
    default_dir = os.path.dirname(_DEFAULT_DB_PATH)
    if is_serverless or not os.access(default_dir, os.W_OK):
        tmp_db = os.path.join(tempfile.gettempdir(), "sentinel.db")
        if os.path.exists(_DEFAULT_DB_PATH) and not os.path.exists(tmp_db):
            try:
                shutil.copy2(_DEFAULT_DB_PATH, tmp_db)
            except Exception:
                pass
        return tmp_db
    return _DEFAULT_DB_PATH


DB_PATH = _resolve_db_path()


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        name TEXT,
        scenario TEXT,
        status TEXT,
        phase TEXT,
        target_id TEXT,
        start_time REAL,
        end_time REAL,
        duration_s REAL,
        delta_v_total REAL,
        fuel_used_kg REAL,
        initial_risk TEXT,
        final_risk TEXT,
        success INTEGER,
        summary_json TEXT,
        created_at TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS mission_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT,
        sim_time REAL,
        event_type TEXT,
        message TEXT,
        details_json TEXT,
        timestamp TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orbital_objects (
        id TEXT PRIMARY KEY,
        name TEXT,
        object_type TEXT,
        status TEXT,
        altitude REAL,
        inclination REAL,
        eccentricity REAL,
        orbital_period REAL,
        mass REAL,
        risk_level TEXT,
        health_status TEXT,
        metadata_json TEXT,
        updated_at TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT,
        object_id TEXT,
        sim_time REAL,
        pos_x REAL,
        pos_y REAL,
        pos_z REAL,
        vel_x REAL,
        vel_y REAL,
        vel_z REAL,
        altitude REAL,
        fuel_kg REAL,
        battery_pct REAL,
        health_status TEXT,
        timestamp TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS risk_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT,
        sim_time REAL,
        object_a_id TEXT,
        object_b_id TEXT,
        cpa_distance_km REAL,
        cpa_time_s REAL,
        relative_vel_kms REAL,
        risk_level TEXT,
        collision_prob REAL,
        timestamp TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT,
        sim_time REAL,
        recommendation TEXT,
        reason TEXT,
        affected_target_id TEXT,
        confidence REAL,
        safety_validated INTEGER,
        timestamp TEXT
    )
    """)
    
    conn.commit()
    conn.close()

def log_mission_event(mission_id: str, sim_time: float, event_type: str, message: str, details: Optional[Dict] = None):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO mission_events (mission_id, sim_time, event_type, message, details_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (mission_id, sim_time, event_type, message, json.dumps(details or {}), datetime.utcnow().isoformat()))
        conn.commit()
        conn.close()
    except Exception:
        pass


def get_mission_events(mission_id: str) -> List[Dict]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM mission_events WHERE mission_id = ? ORDER BY sim_time ASC", (mission_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def save_mission(mission_data: Dict[str, Any]):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO missions (
                id, name, scenario, status, phase, target_id, start_time, end_time,
                duration_s, delta_v_total, fuel_used_kg, initial_risk, final_risk,
                success, summary_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mission_data.get("id"),
            mission_data.get("name"),
            mission_data.get("scenario"),
            mission_data.get("status"),
            mission_data.get("phase"),
            mission_data.get("target_id"),
            mission_data.get("start_time"),
            mission_data.get("end_time"),
            mission_data.get("duration_s"),
            mission_data.get("delta_v_total"),
            mission_data.get("fuel_used_kg"),
            mission_data.get("initial_risk"),
            mission_data.get("final_risk"),
            1 if mission_data.get("success") else 0,
            json.dumps(mission_data.get("summary", {})),
            datetime.utcnow().isoformat()
        ))
        conn.commit()
        conn.close()
    except Exception:
        pass


def get_all_missions() -> List[Dict]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM missions ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def get_mission_by_id(mission_id: str) -> Optional[Dict]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM missions WHERE id = ?", (mission_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        res = dict(row)
        if res.get("summary_json"):
            res["summary"] = json.loads(res["summary_json"])
        return res
    except Exception:
        return None


try:
    init_db()
except Exception:
    pass
