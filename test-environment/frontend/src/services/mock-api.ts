/**
 * Mock API Client for Demo Mode
 *
 * Simulates API responses when backend is not available
 */

import type {
  SimulateCallRequest,
  CallSimulationResult,
  MessageLogEntry,
  CPNumber,
  CPStats,
} from '../types';

// Mock call simulation
export function mockSimulateCall(request: SimulateCallRequest): CallSimulationResult {
  const callRef = `CALL-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const messages: MessageLogEntry[] = [
    {
      id: 1,
      messageType: 'directory_query',
      direction: 'outbound',
      fromCP: request.originatingCP || 'CP1-UK-0001',
      toCP: 'CP2-UK-0002',
      endpoint: 'http://localhost:3002/pstn2/v1/directory/query',
      payload: { number: request.calledNumber },
      response: { found: true, cpId: 'CP2-UK-0002' },
      httpStatus: 200,
      duration: 45,
      timestamp: new Date(),
      callReference: callRef,
    },
    {
      id: 2,
      messageType: 'auth_request',
      direction: 'outbound',
      fromCP: request.originatingCP || 'CP1-UK-0001',
      toCP: 'CP2-UK-0002',
      endpoint: 'http://localhost:3002/pstn2/v1/auth/verify',
      payload: {
        callerID: request.callerNumber,
        calledID: request.calledNumber,
        callReference: callRef,
      },
      response: {
        verified: true,
        callerName: 'John Smith',
        portingChain: [],
      },
      httpStatus: 200,
      duration: 89,
      timestamp: new Date(Date.now() + 50),
      callReference: callRef,
    },
  ];

  if (request.testDirectRouting) {
    messages.push({
      id: 3,
      messageType: 'routing_request',
      direction: 'outbound',
      fromCP: request.originatingCP || 'CP1-UK-0001',
      toCP: 'CP2-UK-0002',
      endpoint: 'http://localhost:3002/pstn2/v1/routing/request',
      payload: {
        destinationNumber: request.calledNumber,
        callerID: request.callerNumber,
        callReference: callRef,
        mediaCapabilities: {
          codecs: ['opus', 'g722'],
          encryption: ['srtp-aes256'],
        },
      },
      response: {
        accepted: true,
        connectionDetails: {
          fqdn: 'media-cp2-uk-0002.pstn2.local',
          port: 24582,
        },
      },
      httpStatus: 200,
      duration: 123,
      timestamp: new Date(Date.now() + 150),
      callReference: callRef,
    });
  }

  return {
    callReference: callRef,
    success: true,
    callerNumber: request.callerNumber,
    calledNumber: request.calledNumber,
    originatingCP: request.originatingCP || 'CP1-UK-0001',
    terminatingCP: 'CP2-UK-0002',
    authenticationResult: {
      verified: true,
      callerName: 'John Smith',
      portingChain: [],
    },
    routingResult: request.testDirectRouting
      ? {
          accepted: true,
          connectionDetails: {
            fqdn: 'media-cp2-uk-0002.pstn2.local',
            port: 24582,
          },
        }
      : undefined,
    messages,
    totalDuration: messages.reduce((sum, m) => sum + m.duration, 0),
  };
}

// Mock CP numbers
export function mockGetCPNumbers(cpId: string): CPNumber[] {
  const ranges: Record<string, string[]> = {
    'CP1-UK-0001': ['+44712345', '+44712346'],
    'CP2-UK-0002': ['+44770090', '+44770091'],
    'CP3-UK-0003': ['+44777700', '+44777701'],
  };

  const numbers: CPNumber[] = [];
  const baseRanges = ranges[cpId] || [];

  baseRanges.forEach((range, rangeIdx) => {
    for (let i = 0; i < 10; i++) {
      numbers.push({
        id: rangeIdx * 100 + i,
        number: `${range}${String(i).padStart(2, '0')}`,
        numberRange: `${range}XX`,
        status: i === 0 ? 'ported_in' : i === 1 ? 'ported_out' : 'active',
        subscriberName: `Subscriber ${rangeIdx * 100 + i}`,
        portedToCP: i === 1 ? 'CP2-UK-0002' : undefined,
        portedFromCP: i === 0 ? 'CP3-UK-0003' : undefined,
      });
    }
  });

  return numbers;
}

// Mock CP stats
export function mockGetCPStats(cpId: string): CPStats {
  return {
    cpId,
    totalNumbers: 200,
    activeNumbers: 186,
    portedInNumbers: 8,
    portedOutNumbers: 6,
    totalCalls24h: 1247,
    inboundCalls24h: 623,
    outboundCalls24h: 624,
    authenticationRate: 97.8,
    routingAcceptanceRate: 94.2,
  };
}
