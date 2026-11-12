import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, AreaChart, Area 
} from 'recharts';
import { SystemState } from '../types';
import { Activity } from 'lucide-react';

interface TelemetryPageProps {
  state: SystemState;
}

export const TelemetryPage: React.FC<TelemetryPageProps> = ({ state }) => {
  const data = state.telemetry;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, maxWidth: 1600, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      {/* Top Banner */}
      <div className="glass-panel cyber-corners p-3.5 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2">
          <Activity style={{ width: 16, height: 16, color: 'var(--cyan)' }} />
          <span className="font-tech text-sm font-bold text-cyan tracking-wider">
            REAL-TIME FLIGHT TELEMETRY STREAM
          </span>
        </div>
        <div className="text-dim" style={{ fontSize: '11px' }}>
          SAMPLING AT 1 HZ | {data.length} DATA SAMPLES BUFFERED
        </div>
      </div>

      {/* Grid of 4 Recharts graphs */}
      <div className="grid grid-cols-2 gap-3" style={{ minHeight: 0 }}>
        {/* Graph 1: Orbital Altitude */}
        <div className="glass-panel cyber-corners p-3 flex flex-col gap-2" style={{ minHeight: 280 }}>
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
            <span className="font-tech font-bold text-xs text-white">
              ORBITAL ALTITUDE (KM)
            </span>
            <span className="text-cyan font-bold font-mono">
              CURRENT: {state.sentinel.altitude.toFixed(2)} km
            </span>
          </div>
          <div style={{ flex: 1, width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#101d36" />
                <XAxis dataKey="sim_time" stroke="#64748b" tickFormatter={(t) => `${t}s`} />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#070d1e', borderColor: '#00f0ff' }} />
                <Area type="monotone" dataKey="altitude" stroke="#00f0ff" fill="url(#altGrad)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 2: Range to Target */}
        <div className="glass-panel cyber-corners p-3 flex flex-col gap-2" style={{ minHeight: 280 }}>
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
            <span className="font-tech font-bold text-xs text-white">
              RANGE TO TARGET (KM)
            </span>
            <span className="text-amber font-bold font-mono">
              CURRENT: {state.sentinel.target_distance_km ? state.sentinel.target_distance_km.toFixed(2) : 0} km
            </span>
          </div>
          <div style={{ flex: 1, width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#101d36" />
                <XAxis dataKey="sim_time" stroke="#64748b" tickFormatter={(t) => `${t}s`} />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#070d1e', borderColor: '#f59e0b' }} />
                <Line type="monotone" dataKey="target_dist" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 3: Relative Velocity / Closing Speed */}
        <div className="glass-panel cyber-corners p-3 flex flex-col gap-2" style={{ minHeight: 280 }}>
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
            <span className="font-tech font-bold text-xs text-white">
              RELATIVE VELOCITY / CLOSING RATE (KM/S)
            </span>
            <span className="text-emerald font-bold font-mono">
              CURRENT: {state.sentinel.target_rel_velocity_kms ? state.sentinel.target_rel_velocity_kms.toFixed(4) : 0} km/s
            </span>
          </div>
          <div style={{ flex: 1, width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#101d36" />
                <XAxis dataKey="sim_time" stroke="#64748b" tickFormatter={(t) => `${t}s`} />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#070d1e', borderColor: '#10b981' }} />
                <Line type="monotone" dataKey="target_rel_vel" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 4: Propellant & Battery */}
        <div className="glass-panel cyber-corners p-3 flex flex-col gap-2" style={{ minHeight: 280 }}>
          <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
            <span className="font-tech font-bold text-xs text-white">
              PROPELLANT CONSUMPTION (KG) & POWER BUS (%)
            </span>
            <div className="flex gap-3 font-mono" style={{ fontSize: '11px' }}>
              <span className="text-cyan">FUEL: {state.sentinel.fuel_kg?.toFixed(1)} kg</span>
              <span className="text-emerald">SOC: {state.sentinel.battery_pct?.toFixed(0)}%</span>
            </div>
          </div>
          <div style={{ flex: 1, width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#101d36" />
                <XAxis dataKey="sim_time" stroke="#64748b" tickFormatter={(t) => `${t}s`} />
                <YAxis yAxisId="left" stroke="#00f0ff" />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#070d1e', borderColor: '#00f0ff' }} />
                <Line yAxisId="left" type="monotone" dataKey="fuel_kg" stroke="#00f0ff" strokeWidth={2} dot={false} name="Fuel (kg)" isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="battery_pct" stroke="#10b981" strokeWidth={2} dot={false} name="Battery (%)" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
