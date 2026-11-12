import React from 'react';
import { 
  Compass, Globe, Crosshair, Activity, AlertTriangle, 
  TrendingUp, Cpu, Database, History, Settings 
} from 'lucide-react';

export type NavTab = 
  | 'control'
  | 'map'
  | 'targets'
  | 'telemetry'
  | 'risk'
  | 'predictions'
  | 'digital-twin'
  | 'dataset'
  | 'history'
  | 'settings';

interface NavigationProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  riskCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onChangeTab, riskCount }) => {
  const tabs = [
    { id: 'control', label: 'Mission Control', icon: Compass },
    { id: 'map', label: 'Orbital Map', icon: Globe },
    { id: 'targets', label: 'Targets', icon: Crosshair },
    { id: 'telemetry', label: 'Telemetry', icon: Activity },
    { id: 'risk', label: 'Risk Analysis', icon: AlertTriangle, badge: riskCount > 0 ? riskCount : null },
    { id: 'predictions', label: 'Predictions', icon: TrendingUp },
    { id: 'digital-twin', label: 'Digital Twin', icon: Cpu },
    { id: 'dataset', label: 'Dataset & Camera', icon: Database },
    { id: 'history', label: 'Mission History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="nav-bar">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id as NavTab)}
            className={`nav-tab-btn ${isActive ? 'active' : ''}`}
          >
            <Icon style={{ width: 13, height: 13, color: isActive ? 'var(--cyan)' : 'var(--text-dim)' }} />
            <span>{tab.label}</span>
            {tab.badge && (
              <span style={{
                background: 'rgba(239, 68, 68, 0.25)',
                color: 'var(--red)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: 8,
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                padding: '0 4px',
                fontWeight: 700
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
