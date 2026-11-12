import React from 'react';
import { Sparkles, ShieldCheck, AlertCircle } from 'lucide-react';
import { AIRecommendation, AnomalyReport } from '../types';

interface AIRecommendationCardProps {
  recommendation: AIRecommendation;
  anomaly?: AnomalyReport;
  onExecuteRecommendation?: () => void;
}

export const AIRecommendationCard: React.FC<AIRecommendationCardProps> = ({
  recommendation,
  anomaly
}) => {
  const isEmergency = recommendation.urgency === 'IMMEDIATE';

  return (
    <div className={`glass-panel p-3 flex flex-col gap-2.5 ${isEmergency ? 'glass-panel-danger' : 'glass-panel-glow'}`}>
      <div className="section-header">
        <div className="section-title">
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: 'var(--accent-dim)',
            border: '1px solid rgba(56,189,248,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Sparkles style={{ width: 13, height: 13, color: 'var(--accent)' }} />
          </div>
          <div>
            <span className="font-semibold" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>AI Recommendation</span>
            <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 8 }}>
              {(recommendation.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
        </div>

        {recommendation.safety_validated && (
          <div className="badge-tech badge-emerald" style={{ fontSize: '9px' }}>
            <ShieldCheck style={{ width: 11, height: 11 }} />
            <span>Safety OK</span>
          </div>
        )}
      </div>

      <div>
        <div className="font-semibold flex items-center gap-2 mb-1" style={{ fontSize: '12px' }}>
          <span className={isEmergency ? 'text-danger' : 'text-accent'}>Action:</span>
          <span className="text-primary">{recommendation.recommendation}</span>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-base)', borderRadius: 6, padding: '7px 10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {recommendation.reason}
        </div>

        {anomaly?.anomaly_detected && (
          <div style={{ marginTop: 7, background: 'rgba(28,12,10,0.7)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: '11px', color: 'var(--warning)' }} className="flex items-center gap-2">
            <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
            <span>
              <strong>Anomaly:</strong> {anomaly.reason} (Score: {anomaly.anomaly_score.toFixed(1)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
