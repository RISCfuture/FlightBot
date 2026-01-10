import { describe, test, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import {
  handleFlightbotCommand,
  handleFlightbotStatusCommand,
  type FlightbotDeps,
} from '../../src/handlers/flightbot.js';
import { FlightService } from '../../src/services/flightService.js';
import { FlightMonitor } from '../../src/services/flightMonitor.js';
import type { SlackApp } from '../../src/types.js';

/**
 * E2E-style tests for FlightBot handlers.
 *
 * These tests use REAL FlightService and FlightMonitor instances,
 * with only external dependencies mocked:
 * - axios (FlightAware API)
 * - fs (API usage persistence)
 *
 * This gives high confidence that the handlers work correctly
 * with real business logic, not just mocked interfaces.
 */

// Mock external dependencies only
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(
    JSON.stringify({
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
      count: 50,
      requests: [],
      lastReset: new Date().toISOString(),
    })
  ),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('axios');

describe('FlightBot Handlers (E2E-style)', () => {
  let deps: FlightbotDeps;
  let mockAxiosInstance: { get: ReturnType<typeof vi.fn> };
  let mockSlackApp: SlackApp;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup axios mock
    mockAxiosInstance = {
      get: vi.fn(),
    };
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue(mockAxiosInstance);

    // Setup minimal Slack app mock (only needed for FlightMonitor constructor)
    mockSlackApp = {
      client: {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ok: true }),
        },
      },
    } as unknown as SlackApp;

    // Create REAL instances with mocked external deps
    const flightService = new FlightService();
    const flightMonitor = new FlightMonitor(mockSlackApp, flightService);

    deps = { flightService, flightMonitor };
  });

  describe('handleFlightbotCommand', () => {
    describe('successful flight lookup', () => {
      test('should return flight info and start tracking for commercial flight', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            flights: [
              {
                ident_iata: 'UA400',
                ident_icao: 'UAL400',
                ident: 'UAL400',
                status: 'Active',
                operator: 'United Airlines',
                operator_iata: 'UA',
                origin: {
                  name: 'San Francisco International',
                  code_iata: 'SFO',
                  code_icao: 'KSFO',
                },
                destination: {
                  name: 'New York JFK',
                  code_iata: 'JFK',
                  code_icao: 'KJFK',
                },
                scheduled_out: '2024-01-15T10:00:00Z',
                estimated_in: '2024-01-15T18:00:00Z',
                registration: 'N12345',
                aircraft_type: 'B738',
                progress_percent: 45,
              },
            ],
          },
        });

        const result = await handleFlightbotCommand(
          {
            flightIdentifier: 'UA400',
            channelId: 'C123456',
            userId: 'U123456',
          },
          deps
        );

        expect(result.responseType).toBe('in_channel');
        expect(result.text).toBe('Now tracking flight *UA400*');
        expect(result.blocks).toBeDefined();
        expect(result.blocks!.length).toBeGreaterThan(0);

        // Verify tracking started
        expect(deps.flightMonitor.isTracking('UA400', 'C123456')).toBe(true);
        expect(deps.flightMonitor.getTrackedFlightsCount()).toBe(1);

        // Verify flight info in blocks
        const headerBlock = result.blocks![0];
        expect(headerBlock.text?.text).toContain('UA400');
        expect(headerBlock.text?.text).toContain('United Airlines');
        expect(headerBlock.text?.text).toContain('In Flight');
      });

      test('should handle private aviation (tail number lookup)', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            flights: [
              {
                ident: 'N300DG',
                status: 'Active',
                registration: 'N300DG',
                aircraft_type: 'C172',
                origin: { name: 'Palo Alto Airport', code_iata: 'PAO' },
                destination: { name: 'San Jose International', code_iata: 'SJC' },
                progress_percent: 60,
              },
            ],
          },
        });

        const result = await handleFlightbotCommand(
          {
            flightIdentifier: 'N300DG',
            channelId: 'C123456',
            userId: 'U123456',
          },
          deps
        );

        expect(result.responseType).toBe('in_channel');
        expect(result.text).toBe('Now tracking *N300DG*');

        // Should NOT say "Flight N300DG" for private aviation
        expect(result.blocks![0].text?.text).toContain('N300DG');
        expect(result.blocks![0].text?.text).not.toContain('Flight N300DG');
      });

      test('should track same flight in multiple channels', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            flights: [
              {
                ident_iata: 'DL123',
                status: 'Scheduled',
                operator: 'Delta Air Lines',
              },
            ],
          },
        });

        await handleFlightbotCommand(
          { flightIdentifier: 'DL123', channelId: 'C111', userId: 'U1' },
          deps
        );

        await handleFlightbotCommand(
          { flightIdentifier: 'DL123', channelId: 'C222', userId: 'U2' },
          deps
        );

        expect(deps.flightMonitor.getTrackedFlightsCount()).toBe(2);
        expect(deps.flightMonitor.isTracking('DL123', 'C111')).toBe(true);
        expect(deps.flightMonitor.isTracking('DL123', 'C222')).toBe(true);
      });
    });

    describe('input validation', () => {
      test('should return help message when no identifier provided', async () => {
        const result = await handleFlightbotCommand(
          { flightIdentifier: '', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('ephemeral');
        expect(result.text).toContain('Please provide a flight number');
        expect(result.text).toContain('UA400');
        expect(result.text).toContain('N300DG');
      });

      test('should return error for invalid identifier format', async () => {
        const result = await handleFlightbotCommand(
          { flightIdentifier: '12345', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('ephemeral');
        expect(result.text).toContain('Invalid format');
      });

      test('should return error for identifier too short', async () => {
        const result = await handleFlightbotCommand(
          { flightIdentifier: 'X', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('ephemeral');
        expect(result.text).toContain('too short');
      });

      test('should clean and validate identifier with special characters', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            flights: [{ ident_iata: 'UA400', status: 'Active', operator: 'United' }],
          },
        });

        const result = await handleFlightbotCommand(
          { flightIdentifier: 'UA-400', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('in_channel');
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flights/UA400');
      });
    });

    describe('flight not found', () => {
      test('should return not found message when API returns empty results', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: { flights: [] },
        });

        const result = await handleFlightbotCommand(
          { flightIdentifier: 'XX999', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('ephemeral');
        expect(result.text).toContain('Flight "XX999" not found');

        // Should NOT start tracking
        expect(deps.flightMonitor.getTrackedFlightsCount()).toBe(0);
      });
    });

    describe('API error handling', () => {
      test('should handle API authentication failure', async () => {
        mockAxiosInstance.get.mockRejectedValue({
          response: { status: 401 },
          message: 'Unauthorized',
        });

        const result = await handleFlightbotCommand(
          { flightIdentifier: 'UA400', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('ephemeral');
        expect(result.text).toContain('temporarily unavailable');
      });

      test('should handle API rate limit', async () => {
        mockAxiosInstance.get.mockRejectedValue({
          response: { status: 429 },
          message: 'Too Many Requests',
        });

        const result = await handleFlightbotCommand(
          { flightIdentifier: 'UA400', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('ephemeral');
        expect(result.text).toContain('Service busy');
      });

      test('should handle tail number fallback to aircraft endpoint', async () => {
        // First call fails with 400, second succeeds
        mockAxiosInstance.get
          .mockRejectedValueOnce({ response: { status: 400 } })
          .mockResolvedValueOnce({
            data: {
              flights: [{ ident: 'N300DG', status: 'Active', registration: 'N300DG' }],
            },
          });

        const result = await handleFlightbotCommand(
          { flightIdentifier: 'N300DG', channelId: 'C123', userId: 'U123' },
          deps
        );

        expect(result.responseType).toBe('in_channel');
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flights/N300DG');
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/aircraft/N300DG/flights');
      });
    });

    describe('flight status display', () => {
      const statusTestCases = [
        { apiStatus: 'Scheduled', expectedText: 'Scheduled' },
        { apiStatus: 'Active', expectedText: 'In Flight' },
        { apiStatus: 'Completed', expectedText: 'Landed' },
        { apiStatus: 'Cancelled', expectedText: 'Cancelled' },
        { apiStatus: 'Diverted', expectedText: 'Diverted' },
      ];

      test.each(statusTestCases)(
        'should display $expectedText for $apiStatus status',
        async ({ apiStatus, expectedText }) => {
          mockAxiosInstance.get.mockResolvedValue({
            data: {
              flights: [
                {
                  ident_iata: 'UA400',
                  status: apiStatus,
                  operator: 'United Airlines',
                  origin: { name: 'SFO' },
                  destination: { name: 'JFK' },
                },
              ],
            },
          });

          const result = await handleFlightbotCommand(
            { flightIdentifier: 'UA400', channelId: 'C123', userId: 'U123' },
            deps
          );

          expect(result.blocks![0].text?.text).toContain(expectedText);
        }
      );
    });

    describe('grounded aircraft', () => {
      test('should show grounded message for unknown status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            flights: [
              {
                ident: 'N300DG',
                status: 'Result Unknown',
                registration: 'N300DG',
              },
            ],
          },
        });

        const result = await handleFlightbotCommand(
          { flightIdentifier: 'N300DG', channelId: 'C123', userId: 'U123' },
          deps
        );

        const groundedBlock = result.blocks?.find((b) => b.text?.text.includes('not in flight'));
        expect(groundedBlock).toBeDefined();
      });
    });
  });

  describe('handleFlightbotStatusCommand', () => {
    test('should return API usage and tracked flight count', () => {
      const result = handleFlightbotStatusCommand(deps);

      expect(result.responseType).toBe('ephemeral');
      expect(result.text).toContain('FlightBot Status');
      expect(result.text).toContain('API Usage');
      expect(result.text).toContain('Currently tracking: 0 flights');
    });

    test('should reflect tracked flights count', async () => {
      // Start tracking a flight first
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          flights: [{ ident_iata: 'UA400', status: 'Active', operator: 'United' }],
        },
      });

      await handleFlightbotCommand(
        { flightIdentifier: 'UA400', channelId: 'C123', userId: 'U123' },
        deps
      );

      const result = handleFlightbotStatusCommand(deps);

      expect(result.text).toContain('Currently tracking: 1 flights');
    });
  });

  describe('integration scenarios', () => {
    test('full workflow: lookup -> track -> status -> stop', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          flights: [
            {
              ident_iata: 'AA100',
              status: 'Active',
              operator: 'American Airlines',
              origin: { name: 'LAX' },
              destination: { name: 'JFK' },
            },
          ],
        },
      });

      // Step 1: Lookup and start tracking
      const lookupResult = await handleFlightbotCommand(
        { flightIdentifier: 'AA100', channelId: 'C123', userId: 'U123' },
        deps
      );
      expect(lookupResult.responseType).toBe('in_channel');
      expect(deps.flightMonitor.isTracking('AA100', 'C123')).toBe(true);

      // Step 2: Check status
      const statusResult = handleFlightbotStatusCommand(deps);
      expect(statusResult.text).toContain('1 flights');

      // Step 3: Stop tracking
      deps.flightMonitor.stopTracking('AA100', 'C123');
      expect(deps.flightMonitor.isTracking('AA100', 'C123')).toBe(false);

      // Step 4: Verify status reflects stopped tracking
      const finalStatus = handleFlightbotStatusCommand(deps);
      expect(finalStatus.text).toContain('0 flights');
    });

    test('multiple users tracking different flights', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('UA400')
            ? { data: { flights: [{ ident_iata: 'UA400', status: 'Active', operator: 'United' }] } }
            : url.includes('DL200')
              ? {
                  data: {
                    flights: [{ ident_iata: 'DL200', status: 'Scheduled', operator: 'Delta' }],
                  },
                }
              : { data: { flights: [] } }
        )
      );

      // User 1 tracks UA400
      await handleFlightbotCommand(
        { flightIdentifier: 'UA400', channelId: 'C111', userId: 'U111' },
        deps
      );

      // User 2 tracks DL200
      await handleFlightbotCommand(
        { flightIdentifier: 'DL200', channelId: 'C222', userId: 'U222' },
        deps
      );

      expect(deps.flightMonitor.getTrackedFlightsCount()).toBe(2);
      expect(deps.flightMonitor.isTracking('UA400', 'C111')).toBe(true);
      expect(deps.flightMonitor.isTracking('DL200', 'C222')).toBe(true);
      expect(deps.flightMonitor.isTracking('UA400', 'C222')).toBe(false);
    });
  });
});
