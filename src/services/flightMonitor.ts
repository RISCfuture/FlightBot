import type {
  SlackApp,
  TrackingInfo,
  TrackedFlight,
  NormalizedFlight,
  SlackBlock,
} from '../types.js';
import type { FlightService } from './flightService.js';

export class FlightMonitor {
  private slackApp: SlackApp;
  private flightService: FlightService;
  public trackedFlights: Map<string, TrackedFlight>;

  constructor(slackApp: SlackApp, flightService: FlightService) {
    this.slackApp = slackApp;
    this.flightService = flightService;
    this.trackedFlights = new Map();
  }

  startTracking(trackingInfo: TrackingInfo): void {
    const key = `${trackingInfo.identifier}_${trackingInfo.channelId}`;

    this.trackedFlights.set(key, {
      ...trackingInfo,
      lastStatus: trackingInfo.flight.flight_status,
      lastUpdated: new Date(),
      updateCount: 0,
      hasLanded: trackingInfo.flight.flight_status === 'landed',
    });

    console.log(
      `Started tracking flight ${trackingInfo.identifier} in channel ${trackingInfo.channelId}`
    );
  }

  async checkFlightUpdates(): Promise<void> {
    const currentTime = new Date();
    const promises: Promise<void>[] = [];

    if (!this.flightService.canMakeRequest()) {
      console.warn('API usage limit reached. Pausing flight tracking updates.');
      return;
    }

    const shouldLimitTracking = this.flightService.shouldLimitTracking();
    let flightsToCheck: { key: string; tracking: TrackedFlight }[] = [];

    for (const [key, tracking] of this.trackedFlights.entries()) {
      if (tracking.hasLanded && tracking.updateCount > 10) {
        console.log(`Stopping tracking for completed flight ${tracking.identifier}`);
        this.trackedFlights.delete(key);
        continue;
      }

      const timeSinceLastUpdate = currentTime.getTime() - tracking.lastUpdated.getTime();
      const shouldCheck = timeSinceLastUpdate > 5 * 60 * 1000;

      if (shouldCheck) {
        flightsToCheck.push({ key, tracking });
      }
    }

    if (shouldLimitTracking && flightsToCheck.length > 2) {
      flightsToCheck = flightsToCheck
        .sort((a, b) => b.tracking.lastUpdated.getTime() - a.tracking.lastUpdated.getTime())
        .slice(0, 2);

      console.warn(
        `API usage critical. Only checking ${String(flightsToCheck.length)} most recent flights.`
      );
    }

    for (const { key, tracking } of flightsToCheck) {
      promises.push(this.checkSingleFlight(key, tracking));
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  private async checkSingleFlight(key: string, tracking: TrackedFlight): Promise<void> {
    try {
      const updatedFlight = await this.flightService.getFlightData(tracking.identifier);

      if (!updatedFlight) {
        console.log(`Flight ${tracking.identifier} not found in update check`);
        return;
      }

      const currentStatus = updatedFlight.flight_status;
      const previousStatus = tracking.lastStatus;

      if (this.flightService.shouldSendUpdate(currentStatus, previousStatus)) {
        await this.sendFlightUpdate(tracking.channelId, updatedFlight, currentStatus);

        tracking.lastStatus = currentStatus;
        tracking.updateCount++;

        if (currentStatus === 'landed') {
          tracking.hasLanded = true;
        }
      }

      tracking.lastUpdated = new Date();
      tracking.flight = updatedFlight;
    } catch (error) {
      console.error(`Error checking flight ${tracking.identifier}:`, (error as Error).message);
    }
  }

  private async sendFlightUpdate(
    channelId: string,
    flight: NormalizedFlight,
    updateType: string
  ): Promise<void> {
    try {
      const message = this.flightService.getUpdateMessage(flight, updateType);
      const blocks = this.flightService.formatFlightMessage(flight);

      const apiUsage = this.flightService.getApiUsageStatus();
      const shouldWarn = apiUsage.status === 'warning' || apiUsage.status === 'critical';

      const messageBlocks: SlackBlock[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message,
          },
        },
        ...blocks,
      ];

      if (shouldWarn) {
        messageBlocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${apiUsage.emoji} *API Usage ${apiUsage.status}*: ${String(apiUsage.used)}/${String(apiUsage.limit)} requests (${String(apiUsage.percentage)}%). ${apiUsage.status === 'critical' ? 'Flight tracking may be limited.' : 'Consider limiting new flight tracking.'}`,
          },
        });
      }

      await this.slackApp.client.chat.postMessage({
        channel: channelId,
        text: message,
        blocks: messageBlocks,
      });

      console.log(
        `Sent update for flight ${flight.flight.iata ?? flight.flight.icao ?? 'Unknown'} to channel ${channelId}`
      );
    } catch (error) {
      console.error(
        `Error sending flight update to channel ${channelId}:`,
        (error as Error).message
      );
    }
  }

  getTrackedFlightsCount(): number {
    return this.trackedFlights.size;
  }

  stopTracking(identifier: string, channelId: string): boolean {
    const key = `${identifier}_${channelId}`;
    return this.trackedFlights.delete(key);
  }

  isTracking(identifier: string, channelId: string): boolean {
    const key = `${identifier}_${channelId}`;
    return this.trackedFlights.has(key);
  }
}
