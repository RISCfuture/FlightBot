import type { FlightService } from '../services/index.js';
import type { FlightMonitor } from '../services/index.js';
import type { SlackBlock, TrackingInfo } from '../types.js';

export interface CommandResponse {
  text: string;
  blocks?: SlackBlock[];
  responseType: 'in_channel' | 'ephemeral';
}

export interface FlightbotDeps {
  flightService: FlightService;
  flightMonitor: FlightMonitor;
}

export interface FlightbotCommandInput {
  flightIdentifier: string;
  channelId: string;
  userId: string;
}

export interface FlightbotStatusResult {
  text: string;
  responseType: 'ephemeral';
}

/**
 * Pure handler for /flightbot command.
 * Returns the response data instead of calling Slack APIs directly.
 */
export async function handleFlightbotCommand(
  input: FlightbotCommandInput,
  deps: FlightbotDeps
): Promise<CommandResponse> {
  const { flightIdentifier, channelId, userId } = input;
  const { flightService, flightMonitor } = deps;

  if (!flightIdentifier) {
    return {
      text: 'Please provide a flight number (e.g., `/flightbot UA400`) or aircraft tail number (e.g., `/flightbot N300DG`)',
      responseType: 'ephemeral',
    };
  }

  try {
    const flight = await flightService.getFlightData(flightIdentifier);

    if (!flight) {
      return {
        text: `Flight "${flightIdentifier}" not found. Please check the flight number or tail number and try again.`,
        responseType: 'ephemeral',
      };
    }

    const trackingInfo: TrackingInfo = {
      flight,
      channelId,
      userId,
      identifier: flightIdentifier,
    };

    flightMonitor.startTracking(trackingInfo);

    const apiUsage = flightService.getApiUsageStatus();
    const shouldWarn = apiUsage.status === 'warning' || apiUsage.status === 'critical';

    const responseBlocks: SlackBlock[] = flightService.formatFlightMessage(
      flight,
      flightIdentifier
    );

    if (shouldWarn) {
      responseBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${apiUsage.emoji} *API Usage ${apiUsage.status}*: ${String(apiUsage.used)}/${String(apiUsage.limit)} requests (${String(apiUsage.percentage)}%). ${apiUsage.status === 'critical' ? 'Flight tracking may be limited.' : 'Monitoring may be reduced to preserve API quota.'}`,
        },
      });
    }

    const airline = flight.airline?.name;
    const isPrivateAviation = !airline || airline === 'Unknown Airline';
    const isSearchedByTail =
      flightIdentifier && flightService.isTailNumber(flightIdentifier.replace(/[^A-Z0-9]/gi, ''));

    let trackingText: string;
    if (isPrivateAviation && flight.aircraft?.registration) {
      trackingText = `Now tracking *${flight.aircraft.registration}*`;
    } else if (isPrivateAviation && isSearchedByTail) {
      trackingText = `Now tracking *${flightIdentifier.toUpperCase()}*`;
    } else if (isPrivateAviation) {
      trackingText = `Now tracking *${flight.flight.iata ?? flight.flight.icao ?? flight.flight.number ?? 'Unknown'}*`;
    } else {
      trackingText = `Now tracking flight *${flight.flight.iata ?? flight.flight.icao ?? 'Unknown'}*`;
    }

    return {
      text: trackingText,
      blocks: responseBlocks,
      responseType: 'in_channel',
    };
  } catch (error) {
    const errorMessage = (error as Error).message;

    if (errorMessage.includes('Invalid flight identifier format')) {
      return {
        text: `Invalid format. Please use a flight number (e.g., "UA400") or tail number (e.g., "N300DG").`,
        responseType: 'ephemeral',
      };
    }

    if (errorMessage.includes('Flight identifier too short')) {
      return {
        text: `Flight identifier too short. Please provide a valid flight number or tail number.`,
        responseType: 'ephemeral',
      };
    }

    if (errorMessage.includes('API authentication failed')) {
      return {
        text: `Service temporarily unavailable. Please try again later.`,
        responseType: 'ephemeral',
      };
    }

    if (errorMessage.includes('API rate limit exceeded')) {
      return {
        text: `Service busy. Please wait a moment and try again.`,
        responseType: 'ephemeral',
      };
    }

    if (errorMessage.includes('API usage limit reached')) {
      const usageStatus = flightService.getApiUsageStatus();
      return {
        text: `*Monthly API limit reached* (${String(usageStatus.used)}/${String(usageStatus.limit)} requests used).\n\nFlight tracking is temporarily unavailable. Usage resets on **${usageStatus.resetsOn}**.`,
        responseType: 'ephemeral',
      };
    }

    // Re-throw for logging/Sentry at the server level
    throw error;
  }
}

/**
 * Pure handler for /flightbot-status command.
 * Returns the response data instead of calling Slack APIs directly.
 */
export function handleFlightbotStatusCommand(deps: FlightbotDeps): FlightbotStatusResult {
  const { flightService, flightMonitor } = deps;

  const usageMessage = flightService.getApiUsageMessage();
  const trackedCount = flightMonitor.getTrackedFlightsCount();

  return {
    text: `*FlightBot Status*\n\n${usageMessage}\n\nCurrently tracking: ${String(trackedCount)} flights`,
    responseType: 'ephemeral',
  };
}
