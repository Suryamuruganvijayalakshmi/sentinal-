"""
SENTINEL FastAPI Application Entrypoint
Hosts REST API and WebSockets (/ws/telemetry, /ws/mission).
Serves real-time telemetry streaming at configurable update rates.
"""

import os
import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sentinel.backend.api.routes import router, health_check
from sentinel.backend.simulation.engine import INSTANCE_ID, simulation_engine

IS_SERVERLESS = bool(
    os.environ.get("VERCEL")
    or os.environ.get("VERCEL_ENV")
    or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = None
    if not IS_SERVERLESS:
        async def simulation_loop():
            while True:
                # Tick the simulation physics engine
                state = simulation_engine.tick()

                # Broadcast over WebSockets if clients are listening
                if manager.telemetry_connections:
                    telemetry_data = {
                        "clock": state["clock"],
                        "sentinel": state["sentinel"],
                        "target": state["target"],
                        "telemetry": state["telemetry"][-1] if state["telemetry"] else None
                    }
                    await manager.broadcast_telemetry(telemetry_data)

                if manager.mission_connections:
                    mission_data = {
                        "mission": state["mission"],
                        "risks": state["risks"][:5],
                        "recommendation": state["recommendation"],
                        "anomaly": state["anomaly"],
                        "latest_event": state["events"][-1] if state["events"] else None
                    }
                    await manager.broadcast_mission(mission_data)

                await asyncio.sleep(0.05)  # 20 Hz tick rate

        task = asyncio.create_task(simulation_loop())
    try:
        yield
    finally:
        if task is not None:
            task.cancel()


app = FastAPI(
    title="SENTINEL – Autonomous Orbital Safety System",
    description="Backend API and Simulation Server for Autonomous Satellite Rescue and Space Debris Mitigation",
    version="1.0.0",
    redirect_slashes=False,
    lifespan=lifespan,
)

# CORS middleware for local Vite frontend and Vercel edge deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Sentinel-State", "X-Sentinel-Instance"],
)


@app.middleware("http")
async def serverless_session_middleware(request: Request, call_next):
    if not request.url.path.startswith("/api"):
        return await call_next(request)

    session_id = request.headers.get("x-sentinel-session")
    state_token = request.headers.get("x-sentinel-state")
    simulation_engine.sync_from_session_token(state_token, session_id)

    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["X-Sentinel-Instance"] = INSTANCE_ID
    if session_id and (
        request.method == "POST"
        or request.url.path in ("/api/status", "/api/health")
    ):
        response.headers["X-Sentinel-State"] = simulation_engine.export_session_snapshot(session_id)
    return response


app.include_router(router)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.telemetry_connections: list[WebSocket] = []
        self.mission_connections: list[WebSocket] = []

    async def connect_telemetry(self, websocket: WebSocket):
        await websocket.accept()
        self.telemetry_connections.append(websocket)

    def disconnect_telemetry(self, websocket: WebSocket):
        if websocket in self.telemetry_connections:
            self.telemetry_connections.remove(websocket)

    async def connect_mission(self, websocket: WebSocket):
        await websocket.accept()
        self.mission_connections.append(websocket)

    def disconnect_mission(self, websocket: WebSocket):
        if websocket in self.mission_connections:
            self.mission_connections.remove(websocket)

    async def broadcast_telemetry(self, data: dict):
        dead_connections = []
        for ws in self.telemetry_connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect_telemetry(ws)

    async def broadcast_mission(self, data: dict):
        dead_connections = []
        for ws in self.mission_connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect_mission(ws)

manager = ConnectionManager()

@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await manager.connect_telemetry(websocket)
    try:
        while True:
            # Keep-alive receive
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_telemetry(websocket)
    except Exception:
        manager.disconnect_telemetry(websocket)

@app.websocket("/ws/mission")
async def websocket_mission_endpoint(websocket: WebSocket):
    await manager.connect_mission(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Allow client commands via websocket
            action = data.get("action")
            if action == "play":
                simulation_engine.play()
            elif action == "pause":
                simulation_engine.pause()
            elif action == "reset":
                simulation_engine.reset()
            elif action == "speed":
                simulation_engine.set_speed(float(data.get("value", 1.0)))
            elif action == "target":
                simulation_engine.set_target(data.get("target_id"))
    except WebSocketDisconnect:
        manager.disconnect_mission(websocket)
    except Exception:
        manager.disconnect_mission(websocket)

@app.get("/")
def root():
    return {
        "system": "SENTINEL – Autonomous Orbital Safety, Satellite Rescue & Debris Mitigation System",
        "status": "ONLINE",
        "simulation_running": simulation_engine.is_running,
        "sim_time": simulation_engine.sim_time,
        "docs_url": "/docs"
    }

@app.get("/api")
def api_root():
    return health_check()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("sentinel.backend.api.main:app", host="0.0.0.0", port=8000, reload=False)
