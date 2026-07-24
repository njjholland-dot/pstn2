/**
 * CP Dashboard Component
 *
 * Displays statistics and information for the selected CP
 */

import React, { useEffect, useState } from 'react';
import {
  Users,
  Phone,
  TrendingUp,
  TrendingDown,
  Activity,
  Server,
  RefreshCw,
} from 'lucide-react';
import { CPId, CPStats, CPNumber } from '../types';
import { apiClient } from '../services/api';
import { getCPInfo } from '../constants/cps';

interface CPDashboardProps {
  cpId: CPId;
}

export const CPDashboard: React.FC<CPDashboardProps> = ({ cpId }) => {
  const [stats, setStats] = useState<CPStats | null>(null);
  const [numbers, setNumbers] = useState<CPNumber[]>([]);
  const [loading, setLoading] = useState(true);

  const cpInfo = getCPInfo(cpId);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, numbersData] = await Promise.all([
        apiClient.getCPStats(cpId),
        apiClient.getCPNumbers(cpId),
      ]);
      setStats(statsData);
      setNumbers(numbersData);
    } catch (error) {
      console.error('Failed to load CP data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [cpId]);

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-12 shadow-xl text-center">
        <RefreshCw className="w-12 h-12 text-gray-600 mx-auto mb-4 animate-spin" />
        <p className="text-gray-400">Loading CP statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-slate-800 rounded-xl p-12 shadow-xl text-center">
        <Server className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">No statistics available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Numbers */}
        <StatCard
          icon={Users}
          label="Total Numbers"
          value={stats.totalNumbers}
          color={cpInfo.color}
        />

        {/* Active Numbers */}
        <StatCard
          icon={Activity}
          label="Active Numbers"
          value={stats.activeNumbers}
          color="#10b981"
        />

        {/* Calls (24h) */}
        <StatCard
          icon={Phone}
          label="Calls (24h)"
          value={stats.totalCalls24h}
          subtext={`${stats.inboundCalls24h} in / ${stats.outboundCalls24h} out`}
          color="#3b82f6"
        />

        {/* Auth Rate */}
        <StatCard
          icon={TrendingUp}
          label="Auth Success Rate"
          value={`${stats.authenticationRate.toFixed(1)}%`}
          color={stats.authenticationRate > 90 ? '#10b981' : '#f59e0b'}
        />
      </div>

      {/* Number Porting Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-green-500" />
            <h3 className="text-lg font-semibold text-white">
              Ported In Numbers
            </h3>
          </div>
          <div className="text-3xl font-bold text-green-400">
            {stats.portedInNumbers}
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Numbers ported to this CP
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <TrendingDown className="w-6 h-6 text-orange-500" />
            <h3 className="text-lg font-semibold text-white">
              Ported Out Numbers
            </h3>
          </div>
          <div className="text-3xl font-bold text-orange-400">
            {stats.portedOutNumbers}
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Numbers ported to other CPs
          </p>
        </div>
      </div>

      {/* Number Ranges */}
      <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-white mb-4">
          Number Ranges
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cpInfo.numberRanges.map((range) => {
            const rangeNumbers = numbers.filter((n) =>
              n.number.startsWith(range.replace(/X/g, ''))
            );
            return (
              <div
                key={range}
                className="p-4 bg-slate-700 rounded-lg border-l-4"
                style={{ borderColor: cpInfo.color }}
              >
                <div className="font-mono text-lg text-white mb-2">{range}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Numbers allocated:</span>
                  <span className="text-white font-medium">
                    {rangeNumbers.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Numbers */}
      <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Recent Numbers ({numbers.slice(0, 10).length})
          </h3>
          <button
            onClick={loadData}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors duration-200"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-slate-700">
                <th className="pb-3">Number</th>
                <th className="pb-3">Range</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Subscriber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {numbers.slice(0, 10).map((number) => (
                <tr key={number.id} className="text-sm">
                  <td className="py-3 font-mono text-white">{number.number}</td>
                  <td className="py-3 text-gray-400">{number.numberRange}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        number.status === 'active'
                          ? 'bg-green-900/20 text-green-400'
                          : number.status === 'ported_in'
                          ? 'bg-blue-900/20 text-blue-400'
                          : number.status === 'ported_out'
                          ? 'bg-orange-900/20 text-orange-400'
                          : 'bg-gray-900/20 text-gray-400'
                      }`}
                    >
                      {number.status}
                    </span>
                  </td>
                  <td className="py-3 text-gray-300">
                    {number.subscriberName || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}) => {
  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: color + '20' }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <span className="text-sm font-medium text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      {subtext && <div className="text-xs text-gray-500">{subtext}</div>}
    </div>
  );
};
