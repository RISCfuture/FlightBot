import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import { ApiUsageTracker } from '../../src/services/apiUsageTracker.js';

vi.mock('fs');

describe('ApiUsageTracker', () => {
  let tracker: ApiUsageTracker;
  const mockFs = fs as unknown as {
    existsSync: ReturnType<typeof vi.fn>;
    readFileSync: ReturnType<typeof vi.fn>;
    writeFileSync: ReturnType<typeof vi.fn>;
    mkdirSync: ReturnType<typeof vi.fn>;
  };

  const currentDate = new Date('2024-01-15T12:00:00Z');
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(currentDate);

    mockFs.existsSync = vi.fn().mockReturnValue(true);
    mockFs.readFileSync = vi.fn().mockReturnValue(
      JSON.stringify({
        month: currentMonth,
        year: currentYear,
        count: 0,
        requests: [],
        lastReset: currentDate.toISOString(),
      })
    );
    mockFs.writeFileSync = vi.fn();
    mockFs.mkdirSync = vi.fn();

    process.env.API_MONTHLY_LIMIT = '1000';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor and initialization', () => {
    test('should create data directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      tracker = new ApiUsageTracker();

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    test('should load existing usage data from file', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 50,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().used).toBe(50);
    });

    test('should reset usage if file does not exist', () => {
      mockFs.existsSync.mockImplementation((path: string) => !path.includes('api_usage.json'));

      tracker = new ApiUsageTracker();

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(tracker.getUsageStatus().used).toBe(0);
    });

    test('should reset usage on new month', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth - 1,
          year: currentYear,
          count: 500,
          requests: [],
          lastReset: '2023-12-01T00:00:00Z',
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().used).toBe(0);
    });

    test('should reset usage on new year', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: 11,
          year: currentYear - 1,
          count: 500,
          requests: [],
          lastReset: '2023-12-01T00:00:00Z',
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().used).toBe(0);
    });

    test('should handle corrupted file gracefully', () => {
      mockFs.readFileSync.mockReturnValue('invalid json');

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().used).toBe(0);
    });
  });

  describe('canMakeRequest', () => {
    test('should return true when under limit', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 100,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.canMakeRequest()).toBe(true);
    });

    test('should return false when at limit', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 1000,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.canMakeRequest()).toBe(false);
    });

    test('should return false when over limit', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 1001,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.canMakeRequest()).toBe(false);
    });

    test('should reset and return true on new month even if over limit', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth - 1,
          year: currentYear,
          count: 1001,
          requests: [],
          lastReset: '2023-12-01T00:00:00Z',
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.canMakeRequest()).toBe(true);
    });
  });

  describe('getRemainingRequests', () => {
    test('should return remaining requests', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 300,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getRemainingRequests()).toBe(700);
    });

    test('should return 0 when over limit', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 1500,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getRemainingRequests()).toBe(0);
    });
  });

  describe('getUsagePercentage', () => {
    test('should calculate percentage correctly', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 500,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsagePercentage()).toBe(50);
    });

    test('should return 0 for empty usage', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 0,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsagePercentage()).toBe(0);
    });

    test('should return over 100 when over limit', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 1200,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsagePercentage()).toBe(120);
    });
  });

  describe('recordRequest', () => {
    test('should increment count and save', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 10,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      tracker.recordRequest('flight_lookup', 'UA400');

      expect(tracker.getUsageStatus().used).toBe(11);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    test('should add request to requests array', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 0,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      tracker.recordRequest('flight_lookup', 'UA400');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);

      expect(savedData.requests.length).toBe(1);
      expect(savedData.requests[0].type).toBe('flight_lookup');
      expect(savedData.requests[0].flightId).toBe('UA400');
    });

    test('should limit requests array to 100 entries', () => {
      const existingRequests = Array(100)
        .fill(null)
        .map((_, i) => ({
          timestamp: currentDate.toISOString(),
          type: 'flight_lookup',
          flightId: `UA${String(i)}`,
        }));

      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 100,
          requests: existingRequests,
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      tracker.recordRequest('flight_lookup', 'UA999');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);

      expect(savedData.requests.length).toBe(100);
      expect(savedData.requests[99].flightId).toBe('UA999');
    });

    test('should log warning at 80% usage', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 799,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      tracker.recordRequest('flight_lookup', 'UA400');

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Warning'));
    });

    test('should log critical warning at 95% usage', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 949,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      tracker.recordRequest('flight_lookup', 'UA400');

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Critical'));
    });
  });

  describe('getUsageStatus', () => {
    test('should return healthy status under 80%', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 500,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const status = tracker.getUsageStatus();

      expect(status.status).toBe('healthy');
      expect(status.emoji).toBe('');
    });

    test('should return warning status at 80-95%', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 850,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const status = tracker.getUsageStatus();

      expect(status.status).toBe('warning');
      expect(status.emoji).toBe('');
    });

    test('should return critical status at 95%+', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 960,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const status = tracker.getUsageStatus();

      expect(status.status).toBe('critical');
      expect(status.emoji).toBe('');
    });

    test('should include correct values', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 250,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const status = tracker.getUsageStatus();

      expect(status.used).toBe(250);
      expect(status.remaining).toBe(750);
      expect(status.limit).toBe(1000);
      expect(status.percentage).toBe(25);
      expect(status.resetsOn).toBe('2024-02-01');
    });
  });

  describe('shouldLimitTracking', () => {
    test('should return false under 95%', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 940,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.shouldLimitTracking()).toBe(false);
    });

    test('should return true at 95% or above', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 950,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.shouldLimitTracking()).toBe(true);
    });
  });

  describe('getUsageMessage', () => {
    test('should return healthy message', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 100,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const message = tracker.getUsageMessage();

      expect(message).toContain('100/1000');
      expect(message).toContain('900 requests remaining');
    });

    test('should return warning message', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 850,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const message = tracker.getUsageMessage();

      expect(message).toContain('Warning');
      expect(message).toContain('Consider limiting');
    });

    test('should return critical message', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 960,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();
      const message = tracker.getUsageMessage();

      expect(message).toContain('Critical');
      expect(message).toContain('may be limited');
    });
  });

  describe('file I/O error handling', () => {
    test('should handle read errors gracefully', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().used).toBe(0);
    });

    test('should handle write errors gracefully', () => {
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 10,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });

      tracker = new ApiUsageTracker();

      expect(() => {
        tracker.recordRequest('flight_lookup', 'UA400');
      }).not.toThrow();
      expect(console.error).toHaveBeenCalledWith('Error saving API usage data:', expect.any(Error));
    });
  });

  describe('monthly limit configuration', () => {
    test('should use environment variable for limit', () => {
      process.env.API_MONTHLY_LIMIT = '500';

      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 0,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().limit).toBe(500);
    });

    test('should default to 1000 if env var not set', () => {
      delete process.env.API_MONTHLY_LIMIT;

      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          month: currentMonth,
          year: currentYear,
          count: 0,
          requests: [],
          lastReset: currentDate.toISOString(),
        })
      );

      tracker = new ApiUsageTracker();

      expect(tracker.getUsageStatus().limit).toBe(1000);

      process.env.API_MONTHLY_LIMIT = '1000';
    });
  });
});
