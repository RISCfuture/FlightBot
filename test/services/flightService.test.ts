import { describe, test, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import axios from 'axios';
import { FlightService } from '../../src/services/flightService.js';
import type { NormalizedFlight, FlightAwareFlight } from '../../src/types.js';

// Mock fs to prevent ApiUsageTracker from touching the file system
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(
    JSON.stringify({
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
      count: 10,
      requests: [],
      lastReset: new Date().toISOString(),
    })
  ),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('axios');

describe('FlightService', () => {
  let flightService: FlightService;
  let mockAxiosCreate: MockedFunction<typeof axios.create>;
  let mockAxiosInstance: { get: MockedFunction<() => Promise<unknown>> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAxiosInstance = {
      get: vi.fn(),
    };

    mockAxiosCreate = axios.create as MockedFunction<typeof axios.create>;
    mockAxiosCreate.mockReturnValue(
      mockAxiosInstance as unknown as ReturnType<typeof axios.create>
    );

    flightService = new FlightService();
  });

  describe('isFlightNumber', () => {
    test('should return true for valid 2-letter airline codes', () => {
      expect(flightService.isFlightNumber('UA400')).toBe(true);
      expect(flightService.isFlightNumber('DL123')).toBe(true);
      expect(flightService.isFlightNumber('AA1')).toBe(true);
      expect(flightService.isFlightNumber('BA9999')).toBe(true);
    });

    test('should return true for valid 3-letter airline codes', () => {
      expect(flightService.isFlightNumber('UAL400')).toBe(true);
      expect(flightService.isFlightNumber('DAL123')).toBe(true);
      expect(flightService.isFlightNumber('AAL1')).toBe(true);
    });

    test('should return true for flight numbers with letter suffix', () => {
      expect(flightService.isFlightNumber('UA400A')).toBe(true);
      expect(flightService.isFlightNumber('DL123B')).toBe(true);
    });

    test('should return false for tail numbers', () => {
      expect(flightService.isFlightNumber('N12345')).toBe(false);
      expect(flightService.isFlightNumber('N300DG')).toBe(false);
    });

    test('should return false for invalid formats', () => {
      expect(flightService.isFlightNumber('U400')).toBe(false);
      expect(flightService.isFlightNumber('12345')).toBe(false);
      expect(flightService.isFlightNumber('')).toBe(false);
      expect(flightService.isFlightNumber('ABCDE')).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(flightService.isFlightNumber('ua400')).toBe(true);
      expect(flightService.isFlightNumber('Ua400')).toBe(true);
    });
  });

  describe('isTailNumber', () => {
    test('should return true for US tail numbers (N-numbers)', () => {
      expect(flightService.isTailNumber('N12345')).toBe(true);
      expect(flightService.isTailNumber('N300DG')).toBe(true);
      expect(flightService.isTailNumber('N1')).toBe(true);
      expect(flightService.isTailNumber('N123AB')).toBe(true);
    });

    test('should return true for international tail numbers', () => {
      expect(flightService.isTailNumber('GABCD')).toBe(true);
      expect(flightService.isTailNumber('DABCD')).toBe(true);
      expect(flightService.isTailNumber('CFABC')).toBe(true);
    });

    test('should return false for clearly non-tail identifiers', () => {
      // Note: Some flight numbers like UA400 may match the broad international
      // tail pattern. The code relies on isFlightNumber being checked first.
      expect(flightService.isTailNumber('12345')).toBe(false);
      expect(flightService.isTailNumber('')).toBe(false);
      expect(flightService.isTailNumber('ABCDEFGH')).toBe(false); // Too long
    });

    test('should return false for invalid formats', () => {
      expect(flightService.isTailNumber('')).toBe(false);
      expect(flightService.isTailNumber('12345')).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(flightService.isTailNumber('n300dg')).toBe(true);
      expect(flightService.isTailNumber('N300dg')).toBe(true);
    });
  });

  describe('getFlightData', () => {
    test('should fetch flight data by flight number', async () => {
      const mockFlightResponse = {
        data: {
          flights: [
            {
              ident_iata: 'UA400',
              ident_icao: 'UAL400',
              ident: 'UAL400',
              status: 'Active',
              operator: 'United Airlines',
              origin: { name: 'San Francisco', code_iata: 'SFO', code_icao: 'KSFO' },
              destination: { name: 'New York JFK', code_iata: 'JFK', code_icao: 'KJFK' },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockFlightResponse);

      const result = await flightService.getFlightData('UA400');

      expect(result).not.toBeNull();
      expect(result?.flight.iata).toBe('UA400');
      expect(result?.airline?.name).toBe('United Airlines');
      expect(result?.flight_status).toBe('active');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flights/UA400');
    });

    test('should fetch flight data by tail number', async () => {
      const mockFlightResponse = {
        data: {
          flights: [
            {
              ident: 'N300DG',
              status: 'Active',
              registration: 'N300DG',
              aircraft_type: 'C172',
              origin: { name: 'Palo Alto', code_iata: 'PAO' },
              destination: { name: 'San Jose', code_iata: 'SJC' },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockFlightResponse);

      const result = await flightService.getFlightData('N300DG');

      expect(result).not.toBeNull();
      expect(result?.aircraft?.registration).toBe('N300DG');
      expect(result?.searchType).toBe('tail_number');
    });

    test('should throw error for identifier too short', async () => {
      await expect(flightService.getFlightData('U')).rejects.toThrow('Flight identifier too short');
      await expect(flightService.getFlightData('')).rejects.toThrow('Flight identifier too short');
    });

    test('should throw error for invalid identifier format', async () => {
      await expect(flightService.getFlightData('12345')).rejects.toThrow(
        'Invalid flight identifier format'
      );
    });

    test('should return null when no flights found', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { flights: [] } });

      const result = await flightService.getFlightData('UA999');

      expect(result).toBeNull();
    });

    test('should handle API authentication errors', async () => {
      const error = {
        response: { status: 401 },
        message: 'Unauthorized',
      };
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(flightService.getFlightData('UA400')).rejects.toThrow(
        'API authentication failed'
      );
    });

    test('should handle API rate limit errors', async () => {
      const error = {
        response: { status: 429 },
        message: 'Too Many Requests',
      };
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(flightService.getFlightData('UA400')).rejects.toThrow('API rate limit exceeded');
    });

    test('should clean identifier before validation', async () => {
      const mockFlightResponse = {
        data: {
          flights: [
            {
              ident_iata: 'UA400',
              status: 'Active',
              operator: 'United Airlines',
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockFlightResponse);

      const result = await flightService.getFlightData('UA-400');

      expect(result).not.toBeNull();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flights/UA400');
    });

    test('should fallback to aircraft endpoint for tail number 400 errors', async () => {
      const error = {
        response: { status: 400 },
        message: 'Bad Request',
      };

      const mockFlightResponse = {
        data: {
          flights: [
            {
              ident: 'N300DG',
              status: 'Active',
              registration: 'N300DG',
            },
          ],
        },
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error).mockResolvedValueOnce(mockFlightResponse);

      const result = await flightService.getFlightData('N300DG');

      expect(result).not.toBeNull();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flights/N300DG');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/aircraft/N300DG/flights');
    });
  });

  describe('formatFlightMessage', () => {
    test('should format commercial flight message', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400', icao: 'UAL400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
        departure: {
          airport: 'San Francisco International',
          iata: 'SFO',
          icao: 'KSFO',
          scheduled: '2024-01-15T10:00:00Z',
        },
        arrival: {
          airport: 'New York JFK',
          iata: 'JFK',
          icao: 'KJFK',
          estimated: '2024-01-15T18:00:00Z',
        },
        aircraft: { registration: 'N12345', type: 'B738' },
        progress_percent: 50,
      };

      const blocks = flightService.formatFlightMessage(flight);

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe('section');
      expect(blocks[0].text?.text).toContain('Flight UA400');
      expect(blocks[0].text?.text).toContain('United Airlines');
      expect(blocks[0].text?.text).toContain('In Flight');
    });

    test('should format private aviation message', () => {
      const flight: NormalizedFlight = {
        flight: { number: 'N300DG' },
        flight_status: 'active',
        airline: { name: 'Unknown Airline' },
        departure: { airport: 'Palo Alto' },
        arrival: { airport: 'San Jose' },
        aircraft: { registration: 'N300DG', type: 'C172' },
      };

      const blocks = flightService.formatFlightMessage(flight, 'N300DG');

      expect(blocks[0].text?.text).toContain('N300DG');
      expect(blocks[0].text?.text).not.toContain('Unknown Airline');
    });

    test('should show grounded status for unknown flights', () => {
      const flight: NormalizedFlight = {
        flight: { number: 'N300DG' },
        flight_status: 'result unknown',
        departure: { airport: 'Unknown' },
        arrival: { airport: 'Unknown' },
      };

      const blocks = flightService.formatFlightMessage(flight);

      const groundedBlock = blocks.find((b) =>
        b.text?.text.includes('Aircraft is currently not in flight')
      );
      expect(groundedBlock).toBeDefined();
    });

    test('should include route if available', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
        departure: { airport: 'SFO' },
        arrival: { airport: 'JFK' },
        route: 'KSFO..KJFK',
      };

      const blocks = flightService.formatFlightMessage(flight);

      const routeBlock = blocks.find((b) => b.text?.text.includes('Route:'));
      expect(routeBlock).toBeDefined();
      expect(routeBlock?.text?.text).toContain('KSFO..KJFK');
    });

    test('should include tracking links', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
        departure: { airport: 'SFO' },
        arrival: { airport: 'JFK' },
      };

      const blocks = flightService.formatFlightMessage(flight);

      const linkBlock = blocks.find((b) => b.text?.text.includes('FlightAware'));
      expect(linkBlock).toBeDefined();
      expect(linkBlock?.text?.text).toContain('Flightradar24');
    });

    test('should show aircraft info with progress', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
        departure: { airport: 'SFO' },
        arrival: { airport: 'JFK' },
        aircraft: { registration: 'N12345', type: 'B738' },
        progress_percent: 75,
      };

      const blocks = flightService.formatFlightMessage(flight);

      const aircraftBlock = blocks.find((b) => b.text?.text.includes('Aircraft:'));
      expect(aircraftBlock).toBeDefined();
      expect(aircraftBlock?.text?.text).toContain('N12345');
      expect(aircraftBlock?.text?.text).toContain('B738');
      expect(aircraftBlock?.text?.text).toContain('75%');
    });

    test('should show cancelled/diverted status indicators', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'diverted',
        airline: { name: 'United Airlines' },
        departure: { airport: 'SFO' },
        arrival: { airport: 'JFK' },
        diverted: true,
      };

      const blocks = flightService.formatFlightMessage(flight);

      const statusBlock = blocks.find((b) => b.text?.text.includes('Diverted'));
      expect(statusBlock).toBeDefined();
    });
  });

  describe('shouldSendUpdate', () => {
    test('should return true when status changes to tracked status', () => {
      expect(flightService.shouldSendUpdate('active', 'scheduled')).toBe(true);
      expect(flightService.shouldSendUpdate('landed', 'active')).toBe(true);
      expect(flightService.shouldSendUpdate('cancelled', 'scheduled')).toBe(true);
      expect(flightService.shouldSendUpdate('diverted', 'active')).toBe(true);
    });

    test('should return false when status unchanged', () => {
      expect(flightService.shouldSendUpdate('active', 'active')).toBe(false);
      expect(flightService.shouldSendUpdate('scheduled', 'scheduled')).toBe(false);
    });

    test('should return false for non-tracked status changes', () => {
      expect(flightService.shouldSendUpdate('unknown', 'active')).toBe(false);
      expect(flightService.shouldSendUpdate('result unknown', 'scheduled')).toBe(false);
    });
  });

  describe('getUpdateMessage', () => {
    test('should return airborne message for active status', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'active',
        airline: { name: 'United Airlines' },
      };

      const message = flightService.getUpdateMessage(flight, 'active');

      expect(message).toContain('Flight UA400');
      expect(message).toContain('airborne');
    });

    test('should return landed message for landed status', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'landed',
        airline: { name: 'United Airlines' },
      };

      const message = flightService.getUpdateMessage(flight, 'landed');

      expect(message).toContain('Flight UA400');
      expect(message).toContain('landed');
    });

    test('should return cancelled message for cancelled status', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'cancelled',
        airline: { name: 'United Airlines' },
      };

      const message = flightService.getUpdateMessage(flight, 'cancelled');

      expect(message).toContain('cancelled');
    });

    test('should return diverted message for diverted status', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'diverted',
        airline: { name: 'United Airlines' },
      };

      const message = flightService.getUpdateMessage(flight, 'diverted');

      expect(message).toContain('diverted');
    });

    test('should use registration for private aviation', () => {
      const flight: NormalizedFlight = {
        flight: { number: 'N300DG' },
        flight_status: 'active',
        airline: { name: 'Unknown Airline' },
        aircraft: { registration: 'N300DG' },
      };

      const message = flightService.getUpdateMessage(flight, 'active');

      expect(message).toContain('N300DG');
      expect(message).not.toContain('Flight');
    });

    test('should return generic update for unknown status type', () => {
      const flight: NormalizedFlight = {
        flight: { iata: 'UA400' },
        flight_status: 'unknown',
        airline: { name: 'United Airlines' },
      };

      const message = flightService.getUpdateMessage(flight, 'something_else');

      expect(message).toContain('status update');
    });
  });

  describe('API usage methods', () => {
    test('getApiUsageStatus should return usage status', () => {
      const status = flightService.getApiUsageStatus();

      expect(status.status).toBe('healthy');
      expect(status.used).toBe(10);
      expect(status.limit).toBe(1000);
    });

    test('getApiUsageMessage should return formatted message', () => {
      const message = flightService.getApiUsageMessage();

      expect(message).toContain('API Usage');
    });

    test('shouldLimitTracking should return tracker value', () => {
      const result = flightService.shouldLimitTracking();

      expect(result).toBe(false);
    });

    test('canMakeRequest should return tracker value', () => {
      const result = flightService.canMakeRequest();

      expect(result).toBe(true);
    });
  });

  describe('normalizeFlightData', () => {
    test('should normalize FlightAware response to internal format', async () => {
      const mockFlightResponse = {
        data: {
          flights: [
            {
              ident_iata: 'UA400',
              ident_icao: 'UAL400',
              ident: 'UAL400',
              flight_number: '400',
              status: 'Active',
              operator: 'United Airlines',
              operator_iata: 'UA',
              operator_icao: 'UAL',
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
              estimated_out: '2024-01-15T10:15:00Z',
              actual_out: '2024-01-15T10:20:00Z',
              scheduled_in: '2024-01-15T18:00:00Z',
              estimated_in: '2024-01-15T17:45:00Z',
              gate_origin: 'A1',
              terminal_origin: 'T1',
              gate_destination: 'B2',
              terminal_destination: 'T4',
              registration: 'N12345',
              aircraft_type: 'B738',
              progress_percent: 50,
              route: 'KSFO..KJFK',
              cancelled: false,
              diverted: false,
              fa_flight_id: 'UAL400-123456',
            } as FlightAwareFlight,
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockFlightResponse);

      const result = await flightService.getFlightData('UA400');

      expect(result).toEqual({
        flight: {
          iata: 'UA400',
          icao: 'UAL400',
          number: 'UAL400',
          flight_number: '400',
        },
        flight_status: 'active',
        airline: {
          name: 'United Airlines',
          iata: 'UA',
          icao: 'UAL',
        },
        departure: {
          airport: 'San Francisco International',
          iata: 'SFO',
          icao: 'KSFO',
          scheduled: '2024-01-15T10:00:00Z',
          estimated: '2024-01-15T10:15:00Z',
          actual: '2024-01-15T10:20:00Z',
          gate: 'A1',
          terminal: 'T1',
        },
        arrival: {
          airport: 'New York JFK',
          iata: 'JFK',
          icao: 'KJFK',
          scheduled: '2024-01-15T18:00:00Z',
          estimated: '2024-01-15T17:45:00Z',
          actual: undefined,
          gate: 'B2',
          terminal: 'T4',
        },
        aircraft: {
          registration: 'N12345',
          type: 'B738',
        },
        progress_percent: 50,
        route: 'KSFO..KJFK',
        cancelled: false,
        diverted: false,
        searchType: 'flight_number',
        faFlightId: 'UAL400-123456',
      });
    });

    test('should map FlightAware status correctly', async () => {
      const testCases = [
        { faStatus: 'Scheduled', expected: 'scheduled' },
        { faStatus: 'Active', expected: 'active' },
        { faStatus: 'Completed', expected: 'landed' },
        { faStatus: 'Cancelled', expected: 'cancelled' },
        { faStatus: 'Diverted', expected: 'diverted' },
        { faStatus: 'Unknown', expected: 'unknown' },
        { faStatus: undefined, expected: 'unknown' },
      ];

      for (const { faStatus, expected } of testCases) {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            flights: [{ ident_iata: 'UA400', status: faStatus }],
          },
        });

        const result = await flightService.getFlightData('UA400');
        expect(result?.flight_status).toBe(expected);
      }
    });

    test('should handle missing origin/destination', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          flights: [
            {
              ident_iata: 'UA400',
              status: 'Active',
            },
          ],
        },
      });

      const result = await flightService.getFlightData('UA400');

      expect(result?.departure?.airport).toBe('Unknown');
      expect(result?.arrival?.airport).toBe('Unknown');
    });

    test('should use Unknown Airline when operator is missing', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          flights: [
            {
              ident_iata: 'UA400',
              status: 'Active',
            },
          ],
        },
      });

      const result = await flightService.getFlightData('UA400');

      expect(result?.airline?.name).toBe('Unknown Airline');
    });
  });
});
