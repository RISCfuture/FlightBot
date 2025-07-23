const FlightMonitor = require('../../services/flightMonitor');
const FlightService = require('../../services/flightService');

describe('FlightMonitor', () => {
  let flightMonitor;
  let mockSlackApp;
  let mockFlightService;

  beforeEach(() => {
    mockSlackApp = {
      client: {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ok: true })
        }
      }
    };

    mockFlightService = {
      getFlightData: jest.fn(),
      shouldSendUpdate: jest.fn(),
      getUpdateMessage: jest.fn(),
      formatFlightMessage: jest.fn(),
      canMakeRequest: jest.fn().mockReturnValue(true),
      shouldLimitTracking: jest.fn().mockReturnValue(false),
      getApiUsageStatus: jest.fn().mockReturnValue({ status: 'healthy', emoji: '✅' })
    };

    flightMonitor = new FlightMonitor(mockSlackApp, mockFlightService);
  });

  describe('Flight tracking management', () => {
    test('should start tracking a flight', () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      flightMonitor.startTracking(trackingInfo);

      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(true);
    });

    test('should stop tracking a flight', () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      flightMonitor.startTracking(trackingInfo);
      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);

      const stopped = flightMonitor.stopTracking('UA400', 'C123456');
      expect(stopped).toBe(true);
      expect(flightMonitor.getTrackedFlightsCount()).toBe(0);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(false);
    });

    test('should handle multiple flights in different channels', () => {
      const trackingInfo1 = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      const trackingInfo2 = {
        flight: {
          flight: { iata: 'DL123' },
          flight_status: 'active'
        },
        channelId: 'C789012',
        userId: 'U789012',
        identifier: 'DL123'
      };

      flightMonitor.startTracking(trackingInfo1);
      flightMonitor.startTracking(trackingInfo2);

      expect(flightMonitor.getTrackedFlightsCount()).toBe(2);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(true);
      expect(flightMonitor.isTracking('DL123', 'C789012')).toBe(true);
      expect(flightMonitor.isTracking('UA400', 'C789012')).toBe(false);
    });

    test('should handle same flight in different channels', () => {
      const trackingInfo1 = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      const trackingInfo2 = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C789012',
        userId: 'U789012',
        identifier: 'UA400'
      };

      flightMonitor.startTracking(trackingInfo1);
      flightMonitor.startTracking(trackingInfo2);

      expect(flightMonitor.getTrackedFlightsCount()).toBe(2);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(true);
      expect(flightMonitor.isTracking('UA400', 'C789012')).toBe(true);
    });
  });

  describe('Flight update checking', () => {
    test('should send update when flight status changes', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      const updatedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active'
      };

      mockFlightService.getFlightData.mockResolvedValue(updatedFlight);
      mockFlightService.shouldSendUpdate.mockReturnValue(true);
      mockFlightService.getUpdateMessage.mockReturnValue('✈️ *Flight UA400* is now airborne!');
      mockFlightService.formatFlightMessage.mockReturnValue([
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Flight UA400* - Test Flight\n✈️ In Flight'
          }
        }
      ]);

      flightMonitor.startTracking(trackingInfo);

      // Force update check by manipulating the lastUpdated time
      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockFlightService.shouldSendUpdate).toHaveBeenCalledWith('active', 'scheduled');
      expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123456',
        text: '✈️ *Flight UA400* is now airborne!',
        blocks: expect.any(Array)
      });
    });

    test('should not send update when status hasnt changed', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      const updatedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'scheduled'
      };

      mockFlightService.getFlightData.mockResolvedValue(updatedFlight);
      mockFlightService.shouldSendUpdate.mockReturnValue(false);

      flightMonitor.startTracking(trackingInfo);

      // Force update check
      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockFlightService.shouldSendUpdate).toHaveBeenCalledWith('scheduled', 'scheduled');
      expect(mockSlackApp.client.chat.postMessage).not.toHaveBeenCalled();
    });

    test('should stop tracking completed flights', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'landed'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      flightMonitor.startTracking(trackingInfo);
      
      // Simulate a completed flight with many updates
      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      tracking.hasLanded = true;
      tracking.updateCount = 15; // Exceeds the limit of 10

      await flightMonitor.checkFlightUpdates();

      expect(flightMonitor.getTrackedFlightsCount()).toBe(0);
    });

    test('should handle API errors gracefully', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      mockFlightService.getFlightData.mockRejectedValue(new Error('API Error'));

      flightMonitor.startTracking(trackingInfo);

      // Force update check
      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockSlackApp.client.chat.postMessage).not.toHaveBeenCalled();
      expect(flightMonitor.getTrackedFlightsCount()).toBe(1); // Should still be tracking
    });

    test('should handle Slack API errors gracefully', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      const updatedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active'
      };

      mockFlightService.getFlightData.mockResolvedValue(updatedFlight);
      mockFlightService.shouldSendUpdate.mockReturnValue(true);
      mockFlightService.getUpdateMessage.mockReturnValue('✈️ *Flight UA400* is now airborne!');
      mockFlightService.formatFlightMessage.mockReturnValue([]);
      mockSlackApp.client.chat.postMessage.mockRejectedValue(new Error('Slack API Error'));

      flightMonitor.startTracking(trackingInfo);

      // Force update check
      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);

      await flightMonitor.checkFlightUpdates();

      expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalled();
      // Should not crash and should continue tracking
      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);
    });
  });

  describe('Update frequency management', () => {
    test('should not check flights updated recently', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      flightMonitor.startTracking(trackingInfo);

      // Flight was just updated (within 5 minutes)
      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).not.toHaveBeenCalled();
    });

    test('should check flights that need updates', async () => {
      const trackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled'
        },
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400'
      };

      mockFlightService.getFlightData.mockResolvedValue({
        flight: { iata: 'UA400' },
        flight_status: 'scheduled'
      });
      mockFlightService.shouldSendUpdate.mockReturnValue(false);

      flightMonitor.startTracking(trackingInfo);

      // Force update check by making the last update old
      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
    });
  });
});