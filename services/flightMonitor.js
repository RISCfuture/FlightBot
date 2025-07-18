class FlightMonitor {
  constructor(slackApp, flightService) {
    this.slackApp = slackApp;
    this.flightService = flightService;
    this.trackedFlights = new Map();
  }

  startTracking(trackingInfo) {
    const key = `${trackingInfo.identifier}_${trackingInfo.channelId}`;
    
    this.trackedFlights.set(key, {
      ...trackingInfo,
      lastStatus: trackingInfo.flight.flight_status,
      lastUpdated: new Date(),
      updateCount: 0,
      hasLanded: trackingInfo.flight.flight_status === 'landed'
    });

    console.log(`Started tracking flight ${trackingInfo.identifier} in channel ${trackingInfo.channelId}`);
  }

  async checkFlightUpdates() {
    const currentTime = new Date();
    const promises = [];

    for (const [key, tracking] of this.trackedFlights.entries()) {
      if (tracking.hasLanded && tracking.updateCount > 10) {
        console.log(`Stopping tracking for completed flight ${tracking.identifier}`);
        this.trackedFlights.delete(key);
        continue;
      }

      const timeSinceLastUpdate = currentTime - tracking.lastUpdated;
      const shouldCheck = timeSinceLastUpdate > 5 * 60 * 1000; // 5 minutes

      if (shouldCheck) {
        promises.push(this.checkSingleFlight(key, tracking));
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  async checkSingleFlight(key, tracking) {
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
      console.error(`Error checking flight ${tracking.identifier}:`, error.message);
    }
  }

  async sendFlightUpdate(channelId, flight, updateType) {
    try {
      const message = this.flightService.getUpdateMessage(flight, updateType);
      const blocks = this.flightService.formatFlightMessage(flight);

      await this.slackApp.client.chat.postMessage({
        channel: channelId,
        text: message,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          },
          ...blocks
        ]
      });

      console.log(`Sent update for flight ${flight.flight.iata || flight.flight.icao} to channel ${channelId}`);
    } catch (error) {
      console.error(`Error sending flight update to channel ${channelId}:`, error.message);
    }
  }

  getTrackedFlightsCount() {
    return this.trackedFlights.size;
  }

  stopTracking(identifier, channelId) {
    const key = `${identifier}_${channelId}`;
    return this.trackedFlights.delete(key);
  }

  isTracking(identifier, channelId) {
    const key = `${identifier}_${channelId}`;
    return this.trackedFlights.has(key);
  }
}

module.exports = FlightMonitor;