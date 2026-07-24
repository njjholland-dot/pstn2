/**
 * API Client Service for PSTN2 Test Harness
 *
 * Provides methods to interact with the simulator backend
 */

import axios, { AxiosInstance } from 'axios';
import type {
  CPId,
  SimulateCallRequest,
  CallSimulationResult,
  MessageLogEntry,
  CPNumber,
  CPStats,
  SystemStats,
  PortNumberRequest,
  PortNumberResponse,
} from '../types';
import { mockSimulateCall, mockGetCPNumbers, mockGetCPStats } from './mock-api';

class ApiClient {
  private client: AxiosInstance;
  private useMockData: boolean = false;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        // Switch to mock data if backend is unavailable
        if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
          console.warn('Backend unavailable - switching to demo mode');
          this.useMockData = true;
        }
        throw error;
      }
    );

    // Check if backend is available
    this.healthCheck().catch(() => {
      this.useMockData = true;
      console.warn('Backend unavailable - using demo mode');
    });
  }

  // ==========================================================================
  // Call Simulation
  // ==========================================================================

  /**
   * Simulate a call between two numbers
   */
  async simulateCall(request: SimulateCallRequest): Promise<CallSimulationResult> {
    if (this.useMockData) {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockSimulateCall(request);
    }
    const response = await this.client.post('/simulator/call/initiate', request);
    return response.data;
  }

  /**
   * Get message history for a call
   */
  async getCallMessages(callReference: string): Promise<MessageLogEntry[]> {
    const response = await this.client.get(`/simulator/call/${callReference}/messages`);
    return response.data.messages;
  }

  /**
   * Get call details
   */
  async getCallDetails(callReference: string): Promise<CallSimulationResult> {
    const response = await this.client.get(`/simulator/call/${callReference}/details`);
    return response.data;
  }

  // ==========================================================================
  // CP Management
  // ==========================================================================

  /**
   * Get all calls for a specific CP
   */
  async getCPCalls(cpId: CPId, limit: number = 50): Promise<any[]> {
    const response = await this.client.get(`/simulator/cp/${cpId}/calls`, {
      params: { limit },
    });
    return response.data.calls;
  }

  /**
   * Get all numbers owned by a CP
   */
  async getCPNumbers(cpId: CPId): Promise<CPNumber[]> {
    if (this.useMockData) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockGetCPNumbers(cpId);
    }
    const response = await this.client.get(`/simulator/cp/${cpId}/numbers`);
    return response.data.numbers;
  }

  /**
   * Get CP statistics
   */
  async getCPStats(cpId: CPId): Promise<CPStats> {
    if (this.useMockData) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockGetCPStats(cpId);
    }
    const response = await this.client.get(`/simulator/cp/${cpId}/stats`);
    return response.data;
  }

  /**
   * Get CP information
   */
  async getCPInfo(cpId: CPId): Promise<any> {
    const cpPort = this.getCPPort(cpId);
    const response = await axios.get(`http://localhost:${cpPort}/pstn2/v1/info`);
    return response.data;
  }

  // ==========================================================================
  // Number Porting
  // ==========================================================================

  /**
   * Simulate number porting between CPs
   */
  async portNumber(request: PortNumberRequest): Promise<PortNumberResponse> {
    const response = await this.client.post(
      `/simulator/cp/${request.fromCP}/port-number`,
      request
    );
    return response.data;
  }

  // ==========================================================================
  // System Statistics
  // ==========================================================================

  /**
   * Get system-wide statistics
   */
  async getSystemStats(): Promise<SystemStats> {
    const response = await this.client.get('/simulator/stats');
    return response.data;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get CP port number
   */
  private getCPPort(cpId: CPId): number {
    switch (cpId) {
      case 'CP1-UK-0001':
        return 3001;
      case 'CP2-UK-0002':
        return 3002;
      case 'CP3-UK-0003':
        return 3003;
      default:
        return 3001;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
