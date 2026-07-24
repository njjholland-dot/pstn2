/**
 * CP Configuration Constants
 */

import type { CPId, CPInfo } from '../types';

export const CPS: Record<CPId, CPInfo> = {
  'CP1-UK-0001': {
    cpId: 'CP1-UK-0001',
    name: 'TelcoOne',
    apiEndpoint: 'http://localhost:3001',
    authMode: 'direct_query',
    numberRanges: ['+44712345XX', '+44712346XX'],
    color: '#3b82f6', // Blue
  },
  'CP2-UK-0002': {
    cpId: 'CP2-UK-0002',
    name: 'ConnectCom',
    apiEndpoint: 'http://localhost:3002',
    authMode: 'direct_query',
    numberRanges: ['+44770090XX', '+44770091XX'],
    color: '#10b981', // Green
  },
  'CP3-UK-0003': {
    cpId: 'CP3-UK-0003',
    name: 'NetLink',
    apiEndpoint: 'http://localhost:3003',
    authMode: 'token_pool',
    numberRanges: ['+44777700XX', '+44777701XX'],
    color: '#f59e0b', // Amber
  },
};

export const CP_IDS: CPId[] = ['CP1-UK-0001', 'CP2-UK-0002', 'CP3-UK-0003'];

export const getCPInfo = (cpId: CPId): CPInfo => CPS[cpId];

export const getCPColor = (cpId: CPId): string => CPS[cpId]?.color || '#6b7280';

export const getCPName = (cpId: CPId): string => CPS[cpId]?.name || cpId;
