const FlightService = require('../../services/flightService');

describe('FlightService', () => {
  let flightService;

  beforeEach(() => {
    flightService = new FlightService();
  });

  describe('Flight identifier validation', () => {
    describe('isFlightNumber', () => {
      test('should validate correct flight numbers', () => {
        expect(flightService.isFlightNumber('UA400')).toBe(true);
        expect(flightService.isFlightNumber('DL1234')).toBe(true);
        expect(flightService.isFlightNumber('AA123')).toBe(true);
        expect(flightService.isFlightNumber('JB1234')).toBe(true);
        expect(flightService.isFlightNumber('WN1234A')).toBe(true);
      });

      test('should reject invalid flight numbers', () => {
        expect(flightService.isFlightNumber('U400')).toBe(false); // Too short airline code
        expect(flightService.isFlightNumber('UAAA400')).toBe(false); // Too long airline code
        expect(flightService.isFlightNumber('UA40000')).toBe(false); // Too long flight number
        expect(flightService.isFlightNumber('UA')).toBe(false); // No flight number
        expect(flightService.isFlightNumber('400')).toBe(false); // No airline code
        expect(flightService.isFlightNumber('')).toBe(false); // Empty string
      });
    });

    describe('isTailNumber', () => {
      test('should validate correct tail numbers', () => {
        expect(flightService.isTailNumber('N300DG')).toBe(true);
        expect(flightService.isTailNumber('N123AB')).toBe(true);
        expect(flightService.isTailNumber('N12345')).toBe(true);
        expect(flightService.isTailNumber('G-ABCD')).toBe(true);
        expect(flightService.isTailNumber('D-ABCD')).toBe(true);
      });

      test('should reject invalid tail numbers', () => {
        expect(flightService.isTailNumber('N')).toBe(false); // Too short
        expect(flightService.isTailNumber('N123456')).toBe(false); // Too long
        expect(flightService.isTailNumber('123456')).toBe(false); // No country code
        expect(flightService.isTailNumber('')).toBe(false); // Empty string
      });
    });
  });

  describe('Status formatting', () => {
    test('should format flight statuses correctly', () => {
      expect(flightService.formatStatus('scheduled')).toBe('Scheduled');
      expect(flightService.formatStatus('active')).toBe('In Flight');
      expect(flightService.formatStatus('landed')).toBe('Landed');
      expect(flightService.formatStatus('cancelled')).toBe('Cancelled');
      expect(flightService.formatStatus('incident')).toBe('Incident');
      expect(flightService.formatStatus('diverted')).toBe('Diverted');
      expect(flightService.formatStatus('unknown')).toBe('unknown');
    });

    test('should get correct status emojis', () => {
      expect(flightService.getStatusEmoji('scheduled')).toBe('🕐');
      expect(flightService.getStatusEmoji('active')).toBe('✈️');
      expect(flightService.getStatusEmoji('landed')).toBe('🛬');
      expect(flightService.getStatusEmoji('cancelled')).toBe('❌');
      expect(flightService.getStatusEmoji('incident')).toBe('⚠️');
      expect(flightService.getStatusEmoji('diverted')).toBe('🔄');
      expect(flightService.getStatusEmoji('unknown')).toBe('❓');
    });
  });

  describe('Update message generation', () => {
    const mockFlight = {
      flight: {
        iata: 'UA400',
        icao: 'UAL400'
      },
      flight_status: 'active'
    };

    test('should generate correct update messages', () => {
      expect(flightService.getUpdateMessage(mockFlight, 'active')).toBe('✈️ *Flight UA400* is now airborne!');
      expect(flightService.getUpdateMessage(mockFlight, 'landed')).toBe('🛬 *Flight UA400* has landed safely.');
      expect(flightService.getUpdateMessage(mockFlight, 'cancelled')).toBe('❌ *Flight UA400* has been cancelled.');
      expect(flightService.getUpdateMessage(mockFlight, 'diverted')).toBe('🔄 *Flight UA400* has been diverted.');
      expect(flightService.getUpdateMessage(mockFlight, 'incident')).toBe('⚠️ *Flight UA400* has reported an incident.');
    });
  });

  describe('Update triggers', () => {
    test('should determine when to send updates', () => {
      expect(flightService.shouldSendUpdate('active', 'scheduled')).toBe(true);
      expect(flightService.shouldSendUpdate('landed', 'active')).toBe(true);
      expect(flightService.shouldSendUpdate('cancelled', 'scheduled')).toBe(true);
      expect(flightService.shouldSendUpdate('diverted', 'active')).toBe(true);
      expect(flightService.shouldSendUpdate('incident', 'active')).toBe(true);
      
      expect(flightService.shouldSendUpdate('active', 'active')).toBe(false);
      expect(flightService.shouldSendUpdate('scheduled', 'scheduled')).toBe(false);
    });
  });

  describe('Flight message formatting', () => {
    const mockFlight = {
      flight: {
        iata: 'UA400',
        icao: 'UAL400'
      },
      flight_status: 'active',
      airline: {
        name: 'United Airlines'
      },
      departure: {
        airport: 'San Francisco International',
        scheduled: '2025-01-15T14:30:00Z'
      },
      arrival: {
        airport: 'Los Angeles International',
        scheduled: '2025-01-15T16:45:00Z'
      }
    };

    test('should format flight message blocks correctly', () => {
      const blocks = flightService.formatFlightMessage(mockFlight);
      
      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe('section');
      expect(blocks[0].text.text).toContain('*Flight UA400*');
      expect(blocks[0].text.text).toContain('United Airlines');
      expect(blocks[0].text.text).toContain('✈️ In Flight');
      
      expect(blocks[1].type).toBe('section');
      expect(blocks[1].fields).toHaveLength(2);
      expect(blocks[1].fields[0].text).toContain('San Francisco International');
      expect(blocks[1].fields[1].text).toContain('Los Angeles International');
      
      expect(blocks[2].type).toBe('section');
      expect(blocks[2].text.text).toContain('FlightAware');
      expect(blocks[2].text.text).toContain('Flightradar24');
    });
  });

  describe('API Integration', () => {
    test('should handle API authentication errors', async () => {
      const originalApiKey = flightService.apiKey;
      flightService.apiKey = 'invalid-key';
      
      await expect(flightService.getFlightData('UA400')).rejects.toThrow();
      
      flightService.apiKey = originalApiKey;
    });

    test('should handle invalid flight identifiers', async () => {
      await expect(flightService.getFlightData('')).rejects.toThrow('Flight identifier too short');
      await expect(flightService.getFlightData('X')).rejects.toThrow('Flight identifier too short');
      await expect(flightService.getFlightData('INVALID123!')).rejects.toThrow('Invalid flight identifier format');
    });

    test('should clean flight identifiers', async () => {
      const cleanedIdentifier = 'UA400';
      
      const testCases = [
        'UA-400',
        'UA 400',
        'UA_400',
        'UA.400'
      ];
      
      for (const testCase of testCases) {
        try {
          await flightService.getFlightData(testCase);
        } catch (error) {
          // We expect this to fail with API but not with format validation
          expect(error.message).not.toContain('Invalid flight identifier format');
        }
      }
    });
  });

  describe('Real API Tests', () => {
    // These tests use the real API with your key
    test('should fetch real flight data for United Airlines', async () => {
      try {
        const flight = await flightService.getFlightData('UA400');
        
        if (flight) {
          expect(flight).toHaveProperty('flight');
          expect(flight.flight).toHaveProperty('iata');
          expect(flight).toHaveProperty('flight_status');
          expect(flight).toHaveProperty('departure');
          expect(flight).toHaveProperty('arrival');
          console.log('✅ Successfully fetched UA400 flight data');
        } else {
          console.log('ℹ️  UA400 flight not found (may not be scheduled today)');
        }
      } catch (error) {
        if (error.message.includes('API authentication failed')) {
          console.log('❌ API authentication failed - check your API key');
        } else if (error.message.includes('API rate limit exceeded')) {
          console.log('⚠️  API rate limit exceeded');
        } else {
          console.log('❌ API error:', error.message);
        }
        throw error;
      }
    }, 10000); // 10 second timeout for API calls

    test('should handle non-existent flight gracefully', async () => {
      try {
        const flight = await flightService.getFlightData('ZZ9999');
        expect(flight).toBeNull();
        console.log('✅ Successfully handled non-existent flight');
      } catch (error) {
        console.log('❌ Error handling non-existent flight:', error.message);
        throw error;
      }
    }, 10000);

    test('should fetch flight data by tail number', async () => {
      try {
        const flight = await flightService.getFlightData('N300DG');
        
        if (flight) {
          expect(flight).toHaveProperty('aircraft');
          expect(flight).toHaveProperty('flight_status');
          console.log('✅ Successfully fetched flight data by tail number');
        } else {
          console.log('ℹ️  N300DG aircraft not found in current flights');
        }
      } catch (error) {
        console.log('❌ Error fetching by tail number:', error.message);
        throw error;
      }
    }, 10000);
  });
});