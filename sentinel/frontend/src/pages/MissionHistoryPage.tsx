import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { SystemState } from '../types';
import { api } from '../services/api';

interface MissionHistoryPageProps {
  state: SystemState;
}

export const MissionHistoryPage: React.FC<MissionHistoryPageProps> = ({ state }) => {
  const [missions, setMissions] = useState<any[]>([]);

  useEffect(() => {
    const fetchMissions = () => {
      api.getMissions()
        .then(data => setMissions(data))
        .catch(() => {});
    };
    fetchMissions();
    const interval = setInterval(fetchMissions, 2500);
    return () => clearInterval(interval);
  }, [state.mission.phase, state.mission.id]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14, maxWidth: 1400, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      <div className="glass-panel cyber-corners p-4 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2.5">
          <History style={{ width: 18, height: 18, color: 'var(--cyan)' }} />
          <div>
            <span className="font-tech text-sm font-bold text-white tracking-wider">
              HISTORICAL MISSION ARCHIVE
            </span>
            <div className="text-dim" style={{ fontSize: '11px' }}>
              Persistent mission logs, delta-v consumption, and debris mitigation records stored in SQLite database.
            </div>
          </div>
        </div>
        <span className="text-dim" style={{ fontSize: '11px' }}>{missions.length} RECORDED MISSIONS</span>
      </div>

      {/* Current In-Progress Mission Card */}
      <div className="glass-panel glass-panel-glow cyber-corners p-4 flex flex-col gap-2 font-mono text-xs">
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: 6 }}>
          <div className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)' }} />
            <span className="font-tech text-sm font-bold text-cyan">ACTIVE MISSION: {state.mission.id}</span>
          </div>
          <span className="badge-tech badge-cyan">{state.mission.phase}</span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs mt-1">
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>SCENARIO:</span>
            <span className="text-white font-bold">{state.clock.scenario_name}</span>
          </div>
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>TARGET:</span>
            <span className="text-amber font-bold">{state.target?.name || 'Awaiting target'}</span>
          </div>
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>ELAPSED TIME:</span>
            <span className="text-cyan font-bold">{state.clock.mission_elapsed_time_s.toFixed(1)} s</span>
          </div>
          <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>OBJECTIVE:</span>
            <span className="text-emerald font-bold">{state.mission.relocation_strategy}</span>
          </div>
        </div>
      </div>

      {/* Past Completed Missions List */}
      <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
        <div className="font-tech text-xs font-bold text-white" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
          COMPLETED ARCHIVAL MISSIONS
        </div>

        {missions.length === 0 ? (
          <div className="text-dim text-center py-6">
            No completed missions archived yet. Complete a mission or run the Demo Mission to populate archival records.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {missions.map(m => (
              <div key={m.id} style={{ background: 'rgba(5, 11, 24, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="font-tech font-bold text-sm text-white">{m.name || m.id}</div>
                  <div className="text-dim mt-0.5" style={{ fontSize: '11px' }}>
                    SCENARIO: {m.scenario} | TARGET: {m.target_id} | DURATION: {m.duration_s?.toFixed(1) || 'N/A'}s
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge-tech ${m.success ? 'badge-emerald' : 'badge-amber'}`}>
                    {m.success ? 'SUCCESS' : 'ABORTED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
