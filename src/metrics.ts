import * as Sentry from '@sentry/node';

export const metrics = {
  /**
   * Track when a flight lookup command is received
   */
  trackFlightLookup(identifier: string, success: boolean): void {
    Sentry.metrics.count('flightbot.command.lookup', 1, {
      attributes: {
        success: success.toString(),
        identifier_type: /^[A-Z]{2,3}[0-9]/.exec(identifier) ? 'flight_number' : 'tail_number',
      },
    });
  },

  /**
   * Track flight tracking started
   */
  trackFlightTrackingStarted(flightIdentifier: string): void {
    Sentry.metrics.count('flightbot.tracking.started', 1, {
      attributes: {
        identifier: flightIdentifier,
      },
    });
  },

  /**
   * Track flight status updates sent
   */
  trackFlightUpdateSent(status: string): void {
    Sentry.metrics.count('flightbot.tracking.update_sent', 1, {
      attributes: {
        status,
      },
    });
  },

  /**
   * Track API usage
   */
  trackApiRequest(type: string): void {
    Sentry.metrics.count('flightbot.api.request', 1, {
      attributes: {
        type,
      },
    });
  },

  /**
   * Track API usage percentage
   */
  setApiUsageGauge(percentage: number): void {
    Sentry.metrics.gauge('flightbot.api.usage_percentage', percentage);
  },

  /**
   * Track active flight count
   */
  setActiveFlightsGauge(count: number): void {
    Sentry.metrics.gauge('flightbot.tracking.active_flights', count);
  },

  /**
   * Track command latency
   */
  trackCommandLatency(command: string, durationMs: number): void {
    Sentry.metrics.distribution('flightbot.command.latency', durationMs, {
      attributes: {
        command,
      },
      unit: 'millisecond',
    });
  },

  /**
   * Track errors
   */
  trackError(errorType: string): void {
    Sentry.metrics.count('flightbot.errors', 1, {
      attributes: {
        type: errorType,
      },
    });
  },
};
