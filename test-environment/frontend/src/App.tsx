/**
 * Main App Component for PSTN2 Test Harness
 */

import React, { useState } from 'react';
import { CPId, CallSimulationResult } from './types';
import { CPSwitcher } from './components/CPSwitcher';
import { CallSimulator } from './components/CallSimulator';
import { MessageFlow } from './components/MessageFlow';
import { CPDashboard } from './components/CPDashboard';

function App() {
  const [selectedCP, setSelectedCP] = useState<CPId>('CP1-UK-0001');
  const [activeTab, setActiveTab] = useState<'simulator' | 'dashboard'>('simulator');
  const [lastCallResult, setLastCallResult] = useState<CallSimulationResult | null>(null);

  const handleCallComplete = (result: CallSimulationResult) => {
    setLastCallResult(result);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-lg">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                PSTN2 Test Harness
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Simulate and test PSTN2 protocol message exchanges
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-900/20 rounded-lg border border-green-800">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-slow" />
              <span className="text-sm text-green-400 font-medium">
                System Online
              </span>
            </div>
          </div>

          {/* CP Switcher */}
          <CPSwitcher selectedCP={selectedCP} onCPChange={setSelectedCP} />
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-[1920px] mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-6 py-3 font-medium transition-colors duration-200 ${
                activeTab === 'simulator'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Call Simulator
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-3 font-medium transition-colors duration-200 ${
                activeTab === 'dashboard'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              CP Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-[1920px] mx-auto px-6 py-8">
        {activeTab === 'simulator' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Left Column: Call Simulator */}
            <div>
              <CallSimulator
                currentCP={selectedCP}
                onCallComplete={handleCallComplete}
              />
            </div>

            {/* Right Column: Message Flow */}
            <div>
              <MessageFlow result={lastCallResult} />
            </div>
          </div>
        ) : (
          <CPDashboard cpId={selectedCP} />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 border-t border-slate-800">
        <div className="max-w-[1920px] mx-auto px-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>
              PSTN2 Test Harness v1.0.0
            </div>
            <div className="flex items-center gap-6">
              <a
                href="http://localhost:3001/health"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors duration-200"
              >
                CP1 API
              </a>
              <a
                href="http://localhost:3002/health"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors duration-200"
              >
                CP2 API
              </a>
              <a
                href="http://localhost:3003/health"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors duration-200"
              >
                CP3 API
              </a>
              <a
                href="http://localhost:3000/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors duration-200"
              >
                Simulator API
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
