import { describe, test, expect, beforeEach, vi, type MockedObject } from 'vitest';
import { FlightMonitor } from '../../src/services/flightMonitor.js';
import type { FlightService } from '../../src/services/flightService.js';
import type { NormalizedFlight, TrackingInfo, SlackApp } from '../../src/types.js';

describe('FlightMonitor', () => {
  let flightMonitor: FlightMonitor;
  let mockSlackApp: SlackApp;
  let mockFlightService: MockedObject<FlightService>;

  beforeEach(() => {
    mockSlackApp = {
      client: {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ok: true }),
        },
      },
    } as unknown as SlackApp;

    mockFlightService = {
      getFlightData: vi.fn(),
      shouldSendUpdate: vi.fn(),
      getUpdateMessage: vi.fn(),
      formatFlightMessage: vi.fn(),
      canMakeRequest: vi.fn().mockReturnValue(true),
      shouldLimitTracking: vi.fn().mockReturnValue(false),
      getApiUsageStatus: vi.fn().mockReturnValue({ status: 'healthy', emoji: '' }),
    } as unknown as MockedObject<FlightService>;

    flightMonitor = new FlightMonitor(mockSlackApp, mockFlightService);
  });

  describe('Flight tracking management', () => {
    test('should start tracking a flight', () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      flightMonitor.startTracking(trackingInfo);

      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(true);
    });

    test('should stop tracking a flight', () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      flightMonitor.startTracking(trackingInfo);
      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);

      const stopped = flightMonitor.stopTracking('UA400', 'C123456');
      expect(stopped).toBe(true);
      expect(flightMonitor.getTrackedFlightsCount()).toBe(0);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(false);
    });

    test('should handle multiple flights in different channels', () => {
      const trackingInfo1: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      const trackingInfo2: TrackingInfo = {
        flight: {
          flight: { iata: 'DL123' },
          flight_status: 'active',
        } as NormalizedFlight,
        channelId: 'C789012',
        userId: 'U789012',
        identifier: 'DL123',
      };

      flightMonitor.startTracking(trackingInfo1);
      flightMonitor.startTracking(trackingInfo2);

      expect(flightMonitor.getTrackedFlightsCount()).toBe(2);
      expect(flightMonitor.isTracking('UA400', 'C123456')).toBe(true);
      expect(flightMonitor.isTracking('DL123', 'C789012')).toBe(true);
      expect(flightMonitor.isTracking('UA400', 'C789012')).toBe(false);
    });

    test('should handle same flight in different channels', () => {
      const trackingInfo1: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      const trackingInfo2: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C789012',
        userId: 'U789012',
        identifier: 'UA400',
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
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      const updatedFlight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
      };

      mockFlightService.getFlightData.mockResolvedValue(updatedFlight);
      mockFlightService.shouldSendUpdate.mockReturnValue(true);
      mockFlightService.getUpdateMessage.mockReturnValue('*Flight UA400* is now airborne!');
      mockFlightService.formatFlightMessage.mockReturnValue([
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Flight UA400* - Test Flight\nIn Flight',
          },
        },
      ]);

      flightMonitor.startTracking(trackingInfo);

      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      if (tracking) {
        tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);
      }

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockFlightService.shouldSendUpdate).toHaveBeenCalledWith('active', 'scheduled');
      expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123456',
        text: '*Flight UA400* is now airborne!',
        blocks: expect.any(Array),
      });
    });

    test('should not send update when status has not changed', async () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      const updatedFlight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'scheduled',
      };

      mockFlightService.getFlightData.mockResolvedValue(updatedFlight);
      mockFlightService.shouldSendUpdate.mockReturnValue(false);

      flightMonitor.startTracking(trackingInfo);

      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      if (tracking) {
        tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);
      }

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockFlightService.shouldSendUpdate).toHaveBeenCalledWith('scheduled', 'scheduled');
      expect(mockSlackApp.client.chat.postMessage).not.toHaveBeenCalled();
    });

    test('should stop tracking completed flights', async () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'landed',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      flightMonitor.startTracking(trackingInfo);

      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      if (tracking) {
        tracking.hasLanded = true;
        tracking.updateCount = 15;
      }

      await flightMonitor.checkFlightUpdates();

      expect(flightMonitor.getTrackedFlightsCount()).toBe(0);
    });

    test('should handle API errors gracefully', async () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      mockFlightService.getFlightData.mockRejectedValue(new Error('API Error'));

      flightMonitor.startTracking(trackingInfo);

      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      if (tracking) {
        tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);
      }

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockSlackApp.client.chat.postMessage).not.toHaveBeenCalled();
      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);
    });

    test('should handle Slack API errors gracefully', async () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      const updatedFlight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
      };

      mockFlightService.getFlightData.mockResolvedValue(updatedFlight);
      mockFlightService.shouldSendUpdate.mockReturnValue(true);
      mockFlightService.getUpdateMessage.mockReturnValue('*Flight UA400* is now airborne!');
      mockFlightService.formatFlightMessage.mockReturnValue([]);
      (mockSlackApp.client.chat.postMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Slack API Error')
      );

      flightMonitor.startTracking(trackingInfo);

      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      if (tracking) {
        tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);
      }

      await flightMonitor.checkFlightUpdates();

      expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalled();
      expect(flightMonitor.getTrackedFlightsCount()).toBe(1);
    });
  });

  describe('Update frequency management', () => {
    test('should not check flights updated recently', async () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      flightMonitor.startTracking(trackingInfo);

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).not.toHaveBeenCalled();
    });

    test('should check flights that need updates', async () => {
      const trackingInfo: TrackingInfo = {
        flight: {
          flight: { iata: 'UA400' },
          flight_status: 'scheduled',
        } as NormalizedFlight,
        channelId: 'C123456',
        userId: 'U123456',
        identifier: 'UA400',
      };

      mockFlightService.getFlightData.mockResolvedValue({
        flight: { iata: 'UA400' },
        flight_status: 'scheduled',
      });
      mockFlightService.shouldSendUpdate.mockReturnValue(false);

      flightMonitor.startTracking(trackingInfo);

      const key = 'UA400_C123456';
      const tracking = flightMonitor.trackedFlights.get(key);
      if (tracking) {
        tracking.lastUpdated = new Date(Date.now() - 10 * 60 * 1000);
      }

      await flightMonitor.checkFlightUpdates();

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
    });
  });
});
