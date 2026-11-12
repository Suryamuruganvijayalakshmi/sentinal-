import React, { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { MissionEvent } from '../types';

interface EventLogStreamProps {
  events: MissionEvent[];
  maxHeight?: string;
}

export const EventLogStream: React.FC<EventLogStreamProps> = ({ events, maxHeight = '220px' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  const getEventBadgeStyle = (type: string) => {
    if (type.includes('CRITICAL') || type.includes('COLLISION') || type.includes('ABORT')) {
      return { color: 'var(--red)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--border-red)' };
    }
    if (type.includes('CONFIRMED') || type.includes('SUCCESS') || type.includes('COMPLETE')) {
      return { color: 'var(--emerald)', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--border-emerald)' };
    }
    if (type.includes('PHASE') || type.includes('IGNITION') || type.includes('TARGET')) {
      return { color: 'var(--cyan)', background: 'rgba(0, 240, 255, 0.15)', border: '1px solid var(--border-cyan)' };
    }
    return { color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)' };
  };

  return (
    <div className="glass-panel p-3 flex flex-col font-mono text-xs">
      <div className="section-header" style={{ marginBottom: '8px' }}>
        <div className="section-title">
          <Terminal style={{ width: 13, height: 13 }} />
          <span>Event Log</span>
        </div>
        <span className="section-meta">{events.length} events</span>
      </div>

      <div
        ref={containerRef}
        style={{ maxHeight, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '2px' }}
      >
        {events.length === 0 ? (
          <div className="text-tertiary text-center" style={{ padding: '20px 0', fontSize: '11px' }}>Awaiting telemetry stream...</div>
        ) : (
          events.map(ev => {
            const bStyle = getEventBadgeStyle(ev.event_type);
            return (
              <div
                key={ev.id}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-base)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 7,
                  fontSize: '11px'
                }}
              >
                <span className="text-tertiary" style={{ fontSize: '10px', whiteSpace: 'nowrap', paddingTop: 1 }}>
                  [{ev.timestamp || '00:00:00'}]
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    ...bStyle
                  }}
                >
                  {ev.event_type}
                </span>
                <span className="text-primary" style={{ lineHeight: 1.4, fontSize: '11px' }}>
                  {ev.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
