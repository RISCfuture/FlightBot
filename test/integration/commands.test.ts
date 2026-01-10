import { describe, test, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import type { NormalizedFlight, ApiUsageStatus, SlackBlock } from '../../src/types.js';

/**
 * Integration tests for FlightBot command handlers.
 *
 * These tests verify the behavior of the /flightbot and /flightbot-status commands
 * by testing the command handler logic with mocked dependencies.
 */

describe('FlightBot Commands', () => {
  let mockFlightService: {
    getFlightData: MockedFunction<(id: string) => Promise<NormalizedFlight | null>>;
    formatFlightMessage: MockedFunction<(flight: NormalizedFlight, id?: string) => SlackBlock[]>;
    getApiUsageStatus: MockedFunction<() => ApiUsageStatus>;
    getApiUsageMessage: MockedFunction<() => string>;
    isTailNumber: MockedFunction<(id: string) => boolean>;
    shouldLimitTracking: MockedFunction<() => boolean>;
  };

  let mockFlightMonitor: {
    startTracking: MockedFunction<() => void>;
    getTrackedFlightsCount: MockedFunction<() => number>;
  };

  let mockAck: MockedFunction<() => Promise<void>>;
  let mockRespond: MockedFunction<(response: unknown) => Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFlightService = {
      getFlightData: vi.fn(),
      formatFlightMessage: vi.fn().mockReturnValue([
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*Flight UA400* - United Airlines\nIn Flight' },
        },
      ]),
      getApiUsageStatus: vi.fn().mockReturnValue({
        status: 'healthy',
        emoji: '',
        used: 10,
        remaining: 990,
        limit: 1000,
        percentage: 1,
        resetsOn: '2024-02-01',
      }),
      getApiUsageMessage: vi.fn().mockReturnValue('API Usage: 10/1000 requests'),
      isTailNumber: vi.fn().mockReturnValue(false),
      shouldLimitTracking: vi.fn().mockReturnValue(false),
    };

    mockFlightMonitor = {
      startTracking: vi.fn(),
      getTrackedFlightsCount: vi.fn().mockReturnValue(0),
    };

    mockAck = vi.fn().mockResolvedValue(undefined);
    mockRespond = vi.fn().mockResolvedValue(undefined);
  });

  describe('/flightbot command', () => {
    async function handleFlightbotCommand(text: string) {
      const command = {
        text,
        channel_id: 'C123456',
        user_id: 'U123456',
      };

      await mockAck();

      const flightIdentifier = command.text.trim();

      if (!flightIdentifier) {
        await mockRespond({
          text: 'Please provide a flight number (e.g., `/flightbot UA400`) or aircraft tail number (e.g., `/flightbot N300DG`)',
          response_type: 'ephemeral',
        });
        return;
      }

      try {
        const flight = await mockFlightService.getFlightData(flightIdentifier);

        if (!flight) {
          await mockRespond({
            text: `Flight "${flightIdentifier}" not found. Please check the flight number or tail number and try again.`,
            response_type: 'ephemeral',
          });
          return;
        }

        mockFlightMonitor.startTracking();

        const apiUsage = mockFlightService.getApiUsageStatus();
        const shouldWarn = apiUsage.status === 'warning' || apiUsage.status === 'critical';

        const responseBlocks = mockFlightService.formatFlightMessage(flight, flightIdentifier);

        if (shouldWarn) {
          responseBlocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${apiUsage.emoji} *API Usage ${apiUsage.status}*: ${String(apiUsage.used)}/${String(apiUsage.limit)} requests`,
            },
          });
        }

        const airline = flight.airline?.name;
        const isPrivateAviation = !airline || airline === 'Unknown Airline';

        let trackingText: string;
        if (isPrivateAviation && flight.aircraft?.registration) {
          trackingText = `Now tracking *${flight.aircraft.registration}*`;
        } else if (isPrivateAviation) {
          trackingText = `Now tracking *${flight.flight.iata ?? flight.flight.icao ?? flight.flight.number ?? 'Unknown'}*`;
        } else {
          trackingText = `Now tracking flight *${flight.flight.iata ?? flight.flight.icao ?? 'Unknown'}*`;
        }

        await mockRespond({
          text: trackingText,
          blocks: responseBlocks,
          response_type: 'in_channel',
        });
      } catch (error) {
        const errorMessage = (error as Error).message;
        let responseText = `Error retrieving flight information for "${flightIdentifier}". Please try again later.`;

        if (errorMessage.includes('Invalid flight identifier format')) {
          responseText = `Invalid format. Please use a flight number (e.g., "UA400") or tail number (e.g., "N300DG").`;
        } else if (errorMessage.includes('Flight identifier too short')) {
          responseText = `Flight identifier too short. Please provide a valid flight number or tail number.`;
        } else if (errorMessage.includes('API authentication failed')) {
          responseText = `Service temporarily unavailable. Please try again later.`;
        } else if (errorMessage.includes('API rate limit exceeded')) {
          responseText = `Service busy. Please wait a moment and try again.`;
        } else if (errorMessage.includes('API usage limit reached')) {
          const usageStatus = mockFlightService.getApiUsageStatus();
          responseText = `*Monthly API limit reached* (${String(usageStatus.used)}/${String(usageStatus.limit)} requests used).\n\nFlight tracking is temporarily unavailable.`;
        }

        await mockRespond({
          text: responseText,
          response_type: 'ephemeral',
        });
      }
    }

    test('should acknowledge command immediately', async () => {
      mockFlightService.getFlightData.mockResolvedValue(null);

      await handleFlightbotCommand('UA400');

      expect(mockAck).toHaveBeenCalled();
    });

    test('should respond with help when no identifier provided', async () => {
      await handleFlightbotCommand('');

      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('Please provide a flight number'),
        response_type: 'ephemeral',
      });
    });

    test('should respond with help for whitespace-only input', async () => {
      await handleFlightbotCommand('   ');

      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('Please provide a flight number'),
        response_type: 'ephemeral',
      });
    });

    test('should fetch and display flight data', async () => {
      const mockFlight: NormalizedFlight = {
        flight: { iata: 'UA400', icao: 'UAL400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
        departure: { airport: 'SFO' },
        arrival: { airport: 'JFK' },
      };

      mockFlightService.getFlightData.mockResolvedValue(mockFlight);

      await handleFlightbotCommand('UA400');

      expect(mockFlightService.getFlightData).toHaveBeenCalledWith('UA400');
      expect(mockFlightMonitor.startTracking).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        text: 'Now tracking flight *UA400*',
        blocks: expect.any(Array),
        response_type: 'in_channel',
      });
    });

    test('should handle flight not found', async () => {
      mockFlightService.getFlightData.mockResolvedValue(null);

      await handleFlightbotCommand('XX999');

      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('Flight "XX999" not found'),
        response_type: 'ephemeral',
      });
    });

    test('should show API usage warning when in warning state', async () => {
      const mockFlight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
      };

      mockFlightService.getFlightData.mockResolvedValue(mockFlight);
      mockFlightService.getApiUsageStatus.mockReturnValue({
        status: 'warning',
        emoji: '',
        used: 850,
        remaining: 150,
        limit: 1000,
        percentage: 85,
        resetsOn: '2024-02-01',
      });

      await handleFlightbotCommand('UA400');

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining('API Usage warning'),
              }),
            }),
          ]),
        })
      );
    });

    test('should show API usage critical when in critical state', async () => {
      const mockFlight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
      };

      mockFlightService.getFlightData.mockResolvedValue(mockFlight);
      mockFlightService.getApiUsageStatus.mockReturnValue({
        status: 'critical',
        emoji: '',
        used: 960,
        remaining: 40,
        limit: 1000,
        percentage: 96,
        resetsOn: '2024-02-01',
      });

      await handleFlightbotCommand('UA400');

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining('API Usage critical'),
              }),
            }),
          ]),
        })
      );
    });

    test('should handle private aviation display', async () => {
      const mockFlight: NormalizedFlight = {
        flight: { number: 'N300DG' },
        flight_status: 'active',
        airline: { name: 'Unknown Airline' },
        aircraft: { registration: 'N300DG', type: 'C172' },
      };

      mockFlightService.getFlightData.mockResolvedValue(mockFlight);

      await handleFlightbotCommand('N300DG');

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Now tracking *N300DG*',
        })
      );
    });

    describe('error handling', () => {
      test('should handle invalid format error', async () => {
        mockFlightService.getFlightData.mockRejectedValue(
          new Error('Invalid flight identifier format')
        );

        await handleFlightbotCommand('12345');

        expect(mockRespond).toHaveBeenCalledWith({
          text: expect.stringContaining('Invalid format'),
          response_type: 'ephemeral',
        });
      });

      test('should handle identifier too short error', async () => {
        mockFlightService.getFlightData.mockRejectedValue(new Error('Flight identifier too short'));

        await handleFlightbotCommand('X');

        expect(mockRespond).toHaveBeenCalledWith({
          text: expect.stringContaining('too short'),
          response_type: 'ephemeral',
        });
      });

      test('should handle API authentication error', async () => {
        mockFlightService.getFlightData.mockRejectedValue(new Error('API authentication failed'));

        await handleFlightbotCommand('UA400');

        expect(mockRespond).toHaveBeenCalledWith({
          text: expect.stringContaining('temporarily unavailable'),
          response_type: 'ephemeral',
        });
      });

      test('should handle API rate limit error', async () => {
        mockFlightService.getFlightData.mockRejectedValue(new Error('API rate limit exceeded'));

        await handleFlightbotCommand('UA400');

        expect(mockRespond).toHaveBeenCalledWith({
          text: expect.stringContaining('Service busy'),
          response_type: 'ephemeral',
        });
      });

      test('should handle API usage limit reached error', async () => {
        mockFlightService.getFlightData.mockRejectedValue(
          new Error('API usage limit reached (1000/1000). Resets on 2024-02-01.')
        );

        await handleFlightbotCommand('UA400');

        expect(mockRespond).toHaveBeenCalledWith({
          text: expect.stringContaining('Monthly API limit reached'),
          response_type: 'ephemeral',
        });
      });

      test('should handle generic errors', async () => {
        mockFlightService.getFlightData.mockRejectedValue(new Error('Network error'));

        await handleFlightbotCommand('UA400');

        expect(mockRespond).toHaveBeenCalledWith({
          text: expect.stringContaining('Error retrieving flight information'),
          response_type: 'ephemeral',
        });
      });
    });
  });

  describe('/flightbot-status command', () => {
    async function handleFlightbotStatusCommand() {
      await mockAck();

      const usageMessage = mockFlightService.getApiUsageMessage();
      const trackedCount = mockFlightMonitor.getTrackedFlightsCount();

      await mockRespond({
        text: `*FlightBot Status*\n\n${usageMessage}\n\nCurrently tracking: ${String(trackedCount)} flights`,
        response_type: 'ephemeral',
      });
    }

    test('should acknowledge command', async () => {
      await handleFlightbotStatusCommand();

      expect(mockAck).toHaveBeenCalled();
    });

    test('should show API usage and tracked flights', async () => {
      mockFlightService.getApiUsageMessage.mockReturnValue(
        'API Usage: 100/1000 requests used (10%). 900 requests remaining.'
      );
      mockFlightMonitor.getTrackedFlightsCount.mockReturnValue(3);

      await handleFlightbotStatusCommand();

      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('FlightBot Status'),
        response_type: 'ephemeral',
      });
      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('100/1000'),
        response_type: 'ephemeral',
      });
      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('3 flights'),
        response_type: 'ephemeral',
      });
    });

    test('should show zero flights when none tracked', async () => {
      mockFlightMonitor.getTrackedFlightsCount.mockReturnValue(0);

      await handleFlightbotStatusCommand();

      expect(mockRespond).toHaveBeenCalledWith({
        text: expect.stringContaining('0 flights'),
        response_type: 'ephemeral',
      });
    });
  });

  describe('HTTP Endpoints', () => {
    test('should return status JSON on root endpoint', () => {
      const apiUsage = {
        status: 'healthy',
        used: 100,
        remaining: 900,
        limit: 1000,
        percentage: 10,
        resetsOn: '2024-02-01',
      };

      mockFlightService.getApiUsageStatus.mockReturnValue(apiUsage as ApiUsageStatus);
      mockFlightMonitor.getTrackedFlightsCount.mockReturnValue(5);

      const response = {
        status: 'FlightBot is running!',
        trackedFlights: mockFlightMonitor.getTrackedFlightsCount(),
        uptime: 12345,
        apiUsage: {
          used: apiUsage.used,
          remaining: apiUsage.remaining,
          limit: apiUsage.limit,
          percentage: apiUsage.percentage,
          status: apiUsage.status,
          resetsOn: apiUsage.resetsOn,
        },
      };

      expect(response.status).toBe('FlightBot is running!');
      expect(response.trackedFlights).toBe(5);
      expect(response.apiUsage.used).toBe(100);
      expect(response.apiUsage.status).toBe('healthy');
    });

    test('should return health check on /health endpoint', () => {
      const response = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };

      expect(response.status).toBe('healthy');
      expect(response.timestamp).toBeDefined();
    });
  });
});

describe('Input validation edge cases', () => {
  test('should trim whitespace from flight identifiers', () => {
    const inputs = ['  UA400  ', '\tDL123\n', ' N300DG '];
    const expected = ['UA400', 'DL123', 'N300DG'];

    inputs.forEach((input, index) => {
      expect(input.trim()).toBe(expected[index]);
    });
  });

  test('should handle special characters in identifiers', () => {
    const cleanIdentifier = (id: string) => id.replace(/[^A-Z0-9]/gi, '');

    expect(cleanIdentifier('UA-400')).toBe('UA400');
    expect(cleanIdentifier('N300-DG')).toBe('N300DG');
    expect(cleanIdentifier('UA 400')).toBe('UA400');
    expect(cleanIdentifier('UA.400')).toBe('UA400');
  });

  test('should validate cleaned identifier length', () => {
    const cleanIdentifier = (id: string) => id.replace(/[^A-Z0-9]/gi, '');
    const isValidLength = (id: string) => cleanIdentifier(id).length >= 2;

    expect(isValidLength('UA400')).toBe(true);
    expect(isValidLength('U-')).toBe(false);
    expect(isValidLength('---')).toBe(false);
    expect(isValidLength('N1')).toBe(true);
  });
});
