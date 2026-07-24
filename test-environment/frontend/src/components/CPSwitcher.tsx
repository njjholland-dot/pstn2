/**
 * CP Switcher Component
 *
 * Allows switching between different CP views
 */

import React from 'react';
import { Building2 } from 'lucide-react';
import { CPId } from '../types';
import { CPS, getCPInfo } from '../constants/cps';

interface CPSwitcherProps {
  selectedCP: CPId;
  onCPChange: (cpId: CPId) => void;
}

export const CPSwitcher: React.FC<CPSwitcherProps> = ({ selectedCP, onCPChange }) => {
  const currentCP = getCPInfo(selectedCP);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-gray-400">
        <Building2 className="w-5 h-5" />
        <span className="text-sm font-medium">View as:</span>
      </div>

      <div className="flex gap-2">
        {Object.values(CPS).map((cp) => (
          <button
            key={cp.cpId}
            onClick={() => onCPChange(cp.cpId)}
            className={`
              px-4 py-2 rounded-lg font-medium transition-all duration-200
              ${
                selectedCP === cp.cpId
                  ? 'text-white shadow-lg scale-105'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }
            `}
            style={{
              backgroundColor: selectedCP === cp.cpId ? cp.color : undefined,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: cp.color }}
              />
              <span>{cp.name}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="ml-4 px-4 py-2 bg-slate-700 rounded-lg">
        <div className="text-xs text-gray-400">CP ID</div>
        <div className="text-sm font-mono text-white">{currentCP.cpId}</div>
      </div>

      <div className="px-4 py-2 bg-slate-700 rounded-lg">
        <div className="text-xs text-gray-400">Auth Mode</div>
        <div className="text-sm font-medium text-white capitalize">
          {currentCP.authMode.replace('_', ' ')}
        </div>
      </div>
    </div>
  );
};
