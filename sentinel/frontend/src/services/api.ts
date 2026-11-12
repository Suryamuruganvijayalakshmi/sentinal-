import { SystemState } from '../types';

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
    const res = await apiFetch('/status', {}, true);
    return res.json();
  },

  async play(): Promise<void> {
    await apiFetch('/clock/play', { method: 'POST' }, true);
  },

  async pause(): Promise<void> {
    await apiFetch('/clock/pause', { method: 'POST' }, true);
  },

  async reset(): Promise<void> {
    await apiFetch('/clock/reset', { method: 'POST' }, true);
  },

  async setSpeed(speed: number): Promise<void> {
    await apiFetch(
      '/clock/speed',
      {
        method: 'POST',
        body: JSON.stringify({ speed })
      },
      true
    );
  },

  async loadScenario(scenario: string, custom_params?: Record<string, any>): Promise<void> {
    await apiFetch(
      '/scenario/load',
      {
        method: 'POST',
        body: JSON.stringify({ scenario, custom_params })
      },
      true
    );
  },

  async startDemoMission(scenario?: string): Promise<void> {
    await apiFetch(
      '/mission/demo',
      {
        method: 'POST',
        body: JSON.stringify({ scenario })
      },
      true
    );
  },

  async selectTarget(target_id: string): Promise<void> {
    await apiFetch(
      '/target/select',
      {
        method: 'POST',
        body: JSON.stringify({ target_id })
      },
      true
    );
  },

  async selectStrategy(strategy: string): Promise<void> {
    await apiFetch(
      '/strategy/select',
      {
        method: 'POST',
        body: JSON.stringify({ strategy })
      },
      true
    );
  },

  async getPrediction(objectId?: string, horizon: string = '5m', referenceId?: string): Promise<any> {
    const params = new URLSearchParams({ horizon });
    if (objectId) params.append('object_id', objectId);
    if (referenceId) params.append('reference_id', referenceId);
    const res = await apiFetch(`/predictions?${params.toString()}`);
    return res.json();
  },

  async triggerDatasetReplay(maxFrames: number = 150): Promise<void> {
    await apiFetch(`/dataset/replay?max_frames=${maxFrames}`, { method: 'POST' }, true);
  },

  getImageUrl(category: string, imageName: string): string {
    return `${API_BASE}/images/${category}/${imageName}`;
  },

  async getConfig(): Promise<any> {
    const res = await apiFetch('/config');
    return res.json();
  },

  async updateConfig(config: { weights?: any; thresholds?: any }): Promise<any> {
    const res = await apiFetch(
      '/config',
      {
        method: 'POST',
        body: JSON.stringify(config)
      },
      true
    );
    return res.json();
  },

  async evaluateManeuvers(target_id?: string, screening_distance_km?: number): Promise<any[]> {
    const res = await apiFetch(
      '/maneuvers/evaluate',
      {
        method: 'POST',
        body: JSON.stringify({ target_id, screening_distance_km })
      },
      true
    );
    return res.json();
  },

  async executeManeuver(candidate_id: string): Promise<any> {
    const res = await apiFetch(
      '/maneuvers/execute',
      {
        method: 'POST',
        body: JSON.stringify({ candidate_id })
      },
      true
    );
    return res.json();
  },

  async executeCustomManeuver(dv_x_ms: number, dv_y_ms: number, dv_z_ms: number, name?: string): Promise<any> {
    const res = await apiFetch(
      '/maneuvers/custom',
      {
        method: 'POST',
        body: JSON.stringify({ dv_x_ms, dv_y_ms, dv_z_ms, name })
      },
      true
    );
    return res.json();
  },

  async previewCustomManeuver(dv_x_ms: number, dv_y_ms: number, dv_z_ms: number): Promise<any> {
    const res = await apiFetch(
      '/maneuvers/preview_custom',
      {
        method: 'POST',
        body: JSON.stringify({ dv_x_ms, dv_y_ms, dv_z_ms })
      },
      true
    );
    return res.json();
  },

  async stepSimulation(seconds: number = 60): Promise<any> {
    const res = await apiFetch(
      '/simulation/step',
      {
        method: 'POST',
        body: JSON.stringify({ seconds })
      },
      true
    );
    return res.json();
  },

  async setScreeningDistance(distance_km: number): Promise<void> {
    await apiFetch(
      '/simulation/screening_distance',
      {
        method: 'POST',
        body: JSON.stringify({ distance_km })
      },
      true
    );
  },

  async getMissions(): Promise<any[]> {
    const res = await apiFetch('/missions');
    return res.json();
  },

  async getMissionResults(): Promise<any> {
    const res = await apiFetch('/mission/results');
    return res.json();
  },

  async getCatalogueAnalytics(): Promise<any> {
    const res = await apiFetch('/analytics/catalogue');
    return res.json();
  },

  async getEncounterAnalytics(params?: {
    days?: number;
    seed?: number;
    threshold_km?: number;
    maneuver_dv_ms?: number;
    lead_time_min?: number;
  }): Promise<any> {
    const qs = new URLSearchParams();
    if (params?.days !== undefined) qs.set('days', String(params.days));
    if (params?.seed !== undefined) qs.set('seed', String(params.seed));
    if (params?.threshold_km !== undefined) qs.set('threshold_km', String(params.threshold_km));
    if (params?.maneuver_dv_ms !== undefined) qs.set('maneuver_dv_ms', String(params.maneuver_dv_ms));
    if (params?.lead_time_min !== undefined) qs.set('lead_time_min', String(params.lead_time_min));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiFetch(`/analytics/encounters${suffix}`);
    return res.json();
  },

  async runAutonomousAvoidance(): Promise<any> {
    const res = await apiFetch(
      '/autonomous/run',
      {
        method: 'POST',
        body: JSON.stringify({})
      },
      true
    );
    return res.json();
  }
};
