/**
 * Frontend Type Definitions for PSTN2 Test Harness
 */

export type CPId = 'CP1-UK-0001' | 'CP2-UK-0002' | 'CP3-UK-0003';

export interface CPInfo {
  cpId: CPId;
  name: string;
  apiEndpoint: string;
  authMode: 'direct_query' | 'token_pool';
  numberRanges: string[];
  color: string;
}

export interface SimulateCallRequest {
  callerNumber: string;
  calledNumber: string;
  originatingCP?: string;
  branding?: {
    companyName: string;
    logoUrl?: string;
  };
  testDirectRouting?: boolean;
}

export interface MessageLogEntry {
  id: number;
  messageType: string;
  direction: 'inbound' | 'outbound';
  fromCP: string;
  toCP: string;
  endpoint: string;
  payload: any;
  response: any;
  httpStatus: number;
  duration: number;
  timestamp: Date;
  callReference?: string;
}

export interface CallSimulationResult {
  callReference: string;
  success: boolean;
  callerNumber: string;
  calledNumber: string;
  originatingCP: string;
  terminatingCP: string;
  authenticationResult: {
    verified: boolean;
    callerName?: string;
    portingChain?: string[];
    errorCode?: string;
  };
  routingResult?: {
    accepted: boolean;
    connectionDetails?: {
      fqdn: string;
      port: number;
    };
    rejectionReason?: string;
  };
  messages: MessageLogEntry[];
  totalDuration: number;
}

export interface CPNumber {
  id: number;
  number: string;
  numberRange: string;
  status: 'active' | 'ported_out' | 'ported_in' | 'reserved';
  subscriberName?: string;
  portedToCP?: string;
  portedFromCP?: string;
}

export interface CPStats {
  cpId: string;
  totalNumbers: number;
  activeNumbers: number;
  portedInNumbers: number;
  portedOutNumbers: number;
  totalCalls24h: number;
  inboundCalls24h: number;
  outboundCalls24h: number;
  authenticationRate: number;
  routingAcceptanceRate: number;
}

export interface SystemStats {
  totalCalls: number;
  totalMessages: number;
  totalCPs: number;
  averageCallDuration: number;
  messagesByType: Record<string, number>;
  callsByCP: Record<string, number>;
}

export interface PortNumberRequest {
  number: string;
  fromCP: string;
  toCP: string;
  subscriberName?: string;
}

export interface PortNumberResponse {
  success: boolean;
  message: string;
  number: string;
  fromCP: string;
  toCP: string;
  portingHistory: Array<{
    id: number;
    number: string;
    fromCP: string;
    toCP: string;
    portedAt: Date;
  }>;
}
