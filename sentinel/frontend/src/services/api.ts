import { SystemState } from '../types';
import { standaloneSimulation } from './standaloneSimulation';

// Pure standalone in-memory physics engine and orbital calculations.
// Zero backend API dependency - instantaneous response and zero network errors.
const USE_LIVE_API = false;
const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredBase ? configuredBase.replace(/\/+$/, '') : '/api';

const SESSION_ID = (() => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback below for restricted contexts
  }
  return `sentinel-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
})();

let latestStateToken: string | null = null;

async function apiFetch(path: string, init: RequestInit = {}, syncToken = false): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Sentinel-Session', SESSION_ID);
  if (latestStateToken) {
    headers.set('X-Sentinel-State', latestStateToken);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: 'no-store'
  });

  const nextToken = res.headers.get('X-Sentinel-State');
  if (nextToken && (syncToken || !latestStateToken)) {
    latestStateToken = nextToken;
  }

  if (!res.ok) {
    throw new Error(`API ${res.status} error on ${path}`);
  }
  return res;
}

export const api = {
  async getStatus(): Promise<SystemState> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/status', {}, true);
        return await res.json();
      } catch (err) {
        console.warn('Backend /status unreachable, using standalone simulation:', err);
      }
    }
    return standaloneSimulation.getState();
  },

  async play(): Promise<void> {
    standaloneSimulation.play();
    if (USE_LIVE_API) {
      try { await apiFetch('/clock/play', { method: 'POST' }, true); } catch { /* offline fallback */ }
    }
  },

  async pause(): Promise<void> {
    standaloneSimulation.pause();
    if (USE_LIVE_API) {
      try { await apiFetch('/clock/pause', { method: 'POST' }, true); } catch { /* offline fallback */ }
    }
  },

  async reset(): Promise<void> {
    standaloneSimulation.reset();
    if (USE_LIVE_API) {
      try { await apiFetch('/clock/reset', { method: 'POST' }, true); } catch { /* offline fallback */ }
    }
  },

  async setSpeed(speed: number): Promise<void> {
    standaloneSimulation.setSpeed(speed);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/clock/speed', { method: 'POST', body: JSON.stringify({ speed }) }, true);
      } catch { /* offline fallback */ }
    }
  },

  async loadScenario(scenario: string, custom_params?: Record<string, any>): Promise<void> {
    standaloneSimulation.loadScenario(scenario);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/scenario/load', { method: 'POST', body: JSON.stringify({ scenario, custom_params }) }, true);
      } catch { /* offline fallback */ }
    }
  },

  async startDemoMission(scenario?: string): Promise<void> {
    if (scenario) {
      standaloneSimulation.loadScenario(scenario);
    }
    if (USE_LIVE_API) {
      try {
        await apiFetch('/mission/demo', { method: 'POST', body: JSON.stringify({ scenario }) }, true);
      } catch { /* offline fallback */ }
    }
  },

  async selectTarget(target_id: string): Promise<void> {
    standaloneSimulation.selectTarget(target_id);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/target/select', { method: 'POST', body: JSON.stringify({ target_id }) }, true);
      } catch { /* offline fallback */ }
    }
  },

  async selectStrategy(strategy: string): Promise<void> {
    standaloneSimulation.selectStrategy(strategy);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/strategy/select', { method: 'POST', body: JSON.stringify({ strategy }) }, true);
      } catch { /* offline fallback */ }
    }
  },

  async getPrediction(objectId?: string, horizon: string = '5m', referenceId?: string): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const params = new URLSearchParams({ horizon });
        if (objectId) params.append('object_id', objectId);
        if (referenceId) params.append('reference_id', referenceId);
        const res = await apiFetch(`/predictions?${params.toString()}`);
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.getPrediction(objectId, horizon, referenceId);
  },

  async triggerDatasetReplay(maxFrames: number = 150): Promise<void> {
    if (USE_LIVE_API) {
      try {
        await apiFetch(`/dataset/replay?max_frames=${maxFrames}`, { method: 'POST' }, true);
      } catch { /* offline fallback */ }
    }
  },

  getImageUrl(category: string, imageName: string): string {
    return `${API_BASE}/images/${category}/${imageName}`;
  },

  async getConfig(): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/config');
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.getConfig();
  },

  async updateConfig(config: { weights?: any; thresholds?: any }): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/config', { method: 'POST', body: JSON.stringify(config) }, true);
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.updateConfig(config);
  },

  async evaluateManeuvers(target_id?: string, screening_distance_km?: number): Promise<any[]> {
    if (screening_distance_km) {
      standaloneSimulation.setScreeningDistance(screening_distance_km);
    }
    return standaloneSimulation.getState().maneuver_candidates || [];
  },

  async executeManeuver(candidate_id: string): Promise<any> {
    const res = standaloneSimulation.executeManeuver(candidate_id);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/maneuvers/execute', { method: 'POST', body: JSON.stringify({ candidate_id }) }, true);
      } catch { /* offline fallback */ }
    }
    return res;
  },

  async executeCustomManeuver(dv_x_ms: number, dv_y_ms: number, dv_z_ms: number, name?: string): Promise<any> {
    const res = standaloneSimulation.executeCustomManeuver(dv_x_ms, dv_y_ms, dv_z_ms, name);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/maneuvers/custom', { method: 'POST', body: JSON.stringify({ dv_x_ms, dv_y_ms, dv_z_ms, name }) }, true);
      } catch { /* offline fallback */ }
    }
    return res;
  },

  async previewCustomManeuver(dv_x_ms: number, dv_y_ms: number, dv_z_ms: number): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/maneuvers/preview_custom', { method: 'POST', body: JSON.stringify({ dv_x_ms, dv_y_ms, dv_z_ms }) }, true);
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.previewCustomManeuver(dv_x_ms, dv_y_ms, dv_z_ms);
  },

  async stepSimulation(seconds: number = 60): Promise<any> {
    const res = standaloneSimulation.stepSimulation(seconds);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/simulation/step', { method: 'POST', body: JSON.stringify({ seconds }) }, true);
      } catch { /* offline fallback */ }
    }
    return res;
  },

  async setScreeningDistance(distance_km: number): Promise<void> {
    standaloneSimulation.setScreeningDistance(distance_km);
    if (USE_LIVE_API) {
      try {
        await apiFetch('/simulation/screening_distance', { method: 'POST', body: JSON.stringify({ distance_km }) }, true);
      } catch { /* offline fallback */ }
    }
  },

  async getMissions(): Promise<any[]> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/missions');
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.getMissions();
  },

  async getMissionResults(): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/mission/results');
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.getMissionResults();
  },

  async getCatalogueAnalytics(): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const res = await apiFetch('/analytics/catalogue');
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.getCatalogueAnalytics();
  },

  async getEncounterAnalytics(params?: {
    days?: number;
    seed?: number;
    threshold_km?: number;
    maneuver_dv_ms?: number;
    lead_time_min?: number;
  }): Promise<any> {
    if (USE_LIVE_API) {
      try {
        const qs = new URLSearchParams();
        if (params?.days !== undefined) qs.set('days', String(params.days));
        if (params?.seed !== undefined) qs.set('seed', String(params.seed));
        if (params?.threshold_km !== undefined) qs.set('threshold_km', String(params.threshold_km));
        if (params?.maneuver_dv_ms !== undefined) qs.set('maneuver_dv_ms', String(params.maneuver_dv_ms));
        if (params?.lead_time_min !== undefined) qs.set('lead_time_min', String(params.lead_time_min));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const res = await apiFetch(`/analytics/encounters${suffix}`);
        return await res.json();
      } catch { /* offline fallback */ }
    }
    return standaloneSimulation.getEncounterAnalytics(params);
  },

  async runAutonomousAvoidance(): Promise<any> {
    const res = standaloneSimulation.runAutonomousAvoidance();
    if (USE_LIVE_API) {
      try {
        await apiFetch('/autonomous/run', { method: 'POST', body: JSON.stringify({}) }, true);
      } catch { /* offline fallback */ }
    }
    return res;
  }
};
