/**
 * Call Simulator Component
 *
 * Form to initiate simulated calls between CPs
 */

import React, { useState, useEffect } from 'react';
import { Phone, Loader2, AlertCircle } from 'lucide-react';
import { CPId, SimulateCallRequest, CallSimulationResult } from '../types';
import { apiClient } from '../services/api';
import { getCPInfo, CP_IDS } from '../constants/cps';

interface CallSimulatorProps {
  currentCP: CPId;
  onCallComplete: (result: CallSimulationResult) => void;
}

export const CallSimulator: React.FC<CallSimulatorProps> = ({
  currentCP,
  onCallComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [callerNumber, setCallerNumber] = useState('');
  const [calledNumber, setCalledNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [testDirectRouting, setTestDirectRouting] = useState(true);

  // Populate default caller number when CP changes
  useEffect(() => {
    const cpInfo = getCPInfo(currentCP);
    if (cpInfo.numberRanges.length > 0) {
      // Convert range pattern to actual number (replace XX with 00)
      const defaultNumber = cpInfo.numberRanges[0].replace(/X/g, '0');
      setCallerNumber(defaultNumber);
    }
  }, [currentCP]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const request: SimulateCallRequest = {
        callerNumber,
        calledNumber,
        originatingCP: currentCP,
        testDirectRouting,
        ...(companyName && {
          branding: {
            companyName,
          },
        }),
      };

      const result = await apiClient.simulateCall(request);
      onCallComplete(result);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to simulate call');
    } finally {
      setLoading(false);
    }
  };

  const cpInfo = getCPInfo(currentCP);

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: cpInfo.color + '20' }}
        >
          <Phone className="w-6 h-6" style={{ color: cpInfo.color }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Simulate Call</h2>
          <p className="text-sm text-gray-400">
            Initiate a call from {cpInfo.name}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Caller Number */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Caller Number
          </label>
          <input
            type="text"
            value={callerNumber}
            onChange={(e) => setCallerNumber(e.target.value)}
            placeholder="+44712345000"
            className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Available ranges: {cpInfo.numberRanges.join(', ')}
          </p>
        </div>

        {/* Called Number */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Called Number
          </label>
          <input
            type="text"
            value={calledNumber}
            onChange={(e) => setCalledNumber(e.target.value)}
            placeholder="+44770090000"
            className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter any number from any CP
          </p>
        </div>

        {/* Company Name (Branding) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Company Name (Optional)
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corporation"
            className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Optional branding information
          </p>
        </div>

        {/* Test Direct Routing */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="directRouting"
            checked={testDirectRouting}
            onChange={(e) => setTestDirectRouting(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-slate-700 border-gray-600 rounded focus:ring-blue-500"
          />
          <label htmlFor="directRouting" className="text-sm text-gray-300">
            Test Direct Routing (peer-to-peer media)
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-2 p-4 bg-red-900/20 border border-red-500 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-400">
                Call Failed
              </div>
              <div className="text-sm text-red-300 mt-1">{error}</div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Simulating Call...</span>
            </>
          ) : (
            <>
              <Phone className="w-5 h-5" />
              <span>Initiate Call</span>
            </>
          )}
        </button>
      </form>

      {/* Quick Test Scenarios */}
      <div className="mt-6 pt-6 border-t border-slate-700">
        <div className="text-sm font-medium text-gray-400 mb-3">
          Quick Test Scenarios
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CP_IDS.filter((id) => id !== currentCP).map((targetCP) => {
            const targetInfo = getCPInfo(targetCP);
            const targetNumber = targetInfo.numberRanges[0].replace(/X/g, '0');

            return (
              <button
                key={targetCP}
                type="button"
                onClick={() => {
                  setCalledNumber(targetNumber);
                  setCompanyName(targetInfo.name);
                }}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-sm text-white rounded-lg transition-colors duration-200"
              >
                Call {targetInfo.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
