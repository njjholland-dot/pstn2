/**
 * Message Flow Component
 *
 * Visualizes the timeline of messages exchanged during a call
 */

import React from 'react';
import { format } from 'date-fns';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { CallSimulationResult, MessageLogEntry } from '../types';
import { getCPColor, getCPName } from '../constants/cps';

interface MessageFlowProps {
  result: CallSimulationResult | null;
}

export const MessageFlow: React.FC<MessageFlowProps> = ({ result }) => {
  if (!result) {
    return (
      <div className="bg-slate-800 rounded-xl p-12 shadow-xl text-center">
        <MessageSquare className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-400 mb-2">
          No Call Simulation Yet
        </h3>
        <p className="text-gray-500">
          Initiate a call to see the message flow
        </p>
      </div>
    );
  }

  const originColor = getCPColor(result.originatingCP as any);
  const terminColor = getCPColor(result.terminatingCP as any);

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Call Message Flow</h2>
          <div className="flex items-center gap-2">
            {result.success ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-green-400">
                  Success
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm font-medium text-red-400">Failed</span>
              </>
            )}
          </div>
        </div>

        {/* Call Summary */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-700 rounded-lg">
          <div>
            <div className="text-xs text-gray-400 mb-1">Call Reference</div>
            <div className="text-sm font-mono text-white">
              {result.callReference}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Total Duration</div>
            <div className="text-sm font-medium text-white">
              {result.totalDuration}ms
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Caller</div>
            <div className="text-sm font-medium text-white">
              {result.callerNumber}
            </div>
            <div className="text-xs" style={{ color: originColor }}>
              {getCPName(result.originatingCP as any)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Called</div>
            <div className="text-sm font-medium text-white">
              {result.calledNumber}
            </div>
            <div className="text-xs" style={{ color: terminColor }}>
              {getCPName(result.terminatingCP as any)}
            </div>
          </div>
        </div>

        {/* Authentication Result */}
        <div className="mt-4 p-4 bg-slate-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-300">
              Authentication
            </div>
            {result.authenticationResult.verified ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
          {result.authenticationResult.verified ? (
            <div className="space-y-1">
              {result.authenticationResult.callerName && (
                <div className="text-sm text-gray-400">
                  Caller: {result.authenticationResult.callerName}
                </div>
              )}
              {result.authenticationResult.portingChain &&
                result.authenticationResult.portingChain.length > 0 && (
                  <div className="text-xs text-gray-500">
                    Porting Chain:{' '}
                    {result.authenticationResult.portingChain.join(' → ')}
                  </div>
                )}
            </div>
          ) : (
            <div className="text-sm text-red-400">
              {result.authenticationResult.errorCode || 'Authentication failed'}
            </div>
          )}
        </div>

        {/* Routing Result */}
        {result.routingResult && (
          <div className="mt-4 p-4 bg-slate-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-300">
                Direct Routing
              </div>
              {result.routingResult.accepted ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
            {result.routingResult.accepted &&
            result.routingResult.connectionDetails ? (
              <div className="space-y-1">
                <div className="text-xs text-gray-400">
                  FQDN: {result.routingResult.connectionDetails.fqdn}
                </div>
                <div className="text-xs text-gray-400">
                  Port: {result.routingResult.connectionDetails.port}
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-400">
                {result.routingResult.rejectionReason || 'Routing rejected'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message Timeline */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Message Timeline ({result.messages.length} messages)
        </h3>

        <div className="space-y-2">
          {result.messages.map((message, index) => (
            <MessageItem
              key={message.id || index}
              message={message}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface MessageItemProps {
  message: MessageLogEntry;
  index: number;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, index }) => {
  const isSuccess = message.httpStatus >= 200 && message.httpStatus < 300;
  const fromColor = getCPColor(message.fromCP as any);
  const toColor = getCPColor(message.toCP as any);

  return (
    <div className="animate-slide-in">
      <div className="flex items-start gap-3 p-4 bg-slate-700 rounded-lg hover:bg-slate-650 transition-colors duration-200">
        {/* Step Number */}
        <div className="flex-shrink-0 w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-gray-300">{index + 1}</span>
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          {/* Message Type and Direction */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2 py-1 text-xs font-medium rounded"
              style={{ backgroundColor: fromColor + '20', color: fromColor }}
            >
              {getCPName(message.fromCP as any)}
            </span>
            <ArrowRight className="w-4 h-4 text-gray-500" />
            <span
              className="px-2 py-1 text-xs font-medium rounded"
              style={{ backgroundColor: toColor + '20', color: toColor }}
            >
              {getCPName(message.toCP as any)}
            </span>
          </div>

          {/* Message Type */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">
              {message.messageType.replace(/_/g, ' ').toUpperCase()}
            </span>
            {isSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
          </div>

          {/* Endpoint */}
          <div className="text-xs text-gray-400 mb-2 font-mono truncate">
            {message.endpoint}
          </div>

          {/* Timing Info */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{message.duration}ms</span>
            </div>
            <div>
              HTTP {message.httpStatus}
            </div>
            <div>
              {format(new Date(message.timestamp), 'HH:mm:ss.SSS')}
            </div>
          </div>

          {/* Expandable Payload (optional) */}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-blue-400 hover:text-blue-300">
              View payload
            </summary>
            <div className="mt-2 p-2 bg-slate-800 rounded text-xs font-mono text-gray-300 overflow-x-auto">
              <pre>{JSON.stringify(message.payload, null, 2)}</pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
