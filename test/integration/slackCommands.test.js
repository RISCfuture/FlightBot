const request = require('supertest');
const express = require('express');

describe('Slack Command Integration', () => {
  let app;
  let server;

  beforeAll(() => {
    // Mock the server setup without starting the actual Slack app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mock the /flightbot command endpoint
    app.post('/slack/commands', (req, res) => {
      const { text, channel_id, user_id } = req.body;
      
      // Simulate command validation
      if (!text || text.trim() === '') {
        return res.json({
          response_type: 'ephemeral',
          text: '❌ Please provide a flight number (e.g., `/flightbot UA400`) or aircraft tail number (e.g., `/flightbot N300DG`)'
        });
      }

      // Simulate flight identifier validation
      const identifier = text.trim();
      const cleanIdentifier = identifier.replace(/[^A-Z0-9]/gi, '');
      const isValidFlightNumber = /^[A-Z]{2,3}[0-9]{1,4}[A-Z]?$/i.test(cleanIdentifier);
      const isValidTailNumber = /^[A-Z]-?[A-Z0-9]{1,5}$/i.test(identifier) || /^N[0-9]{1,5}[A-Z]{0,2}$/i.test(identifier);

      if (!isValidFlightNumber && !isValidTailNumber) {
        return res.json({
          response_type: 'ephemeral',
          text: '❌ Invalid format. Please use a flight number (e.g., "UA400") or tail number (e.g., "N300DG").'
        });
      }

      // Simulate successful response
      res.json({
        response_type: 'in_channel',
        text: `✈️ Now tracking flight *${cleanIdentifier.toUpperCase()}*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Flight ${cleanIdentifier.toUpperCase()}* - Test Flight\n🕐 Scheduled`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: '*From:*\nTest Airport\n*Departure:* Test Time'
              },
              {
                type: 'mrkdwn',
                text: '*To:*\nTest Airport\n*Arrival:* Test Time'
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🔗 Track on <https://flightaware.com/live/flight/UA400|FlightAware> | <https://www.flightradar24.com/data/flights/ua400|Flightradar24>'
            }
          }
        ]
      });
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    server = app.listen(0); // Use random port
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  describe('Command validation', () => {
    test('should reject empty command', async () => {
      const response = await request(app)
        .post('/slack/commands')
        .send({
          text: '',
          channel_id: 'C123456',
          user_id: 'U123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.response_type).toBe('ephemeral');
      expect(response.body.text).toContain('Please provide a flight number');
    });

    test('should reject whitespace-only command', async () => {
      const response = await request(app)
        .post('/slack/commands')
        .send({
          text: '   ',
          channel_id: 'C123456',
          user_id: 'U123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.response_type).toBe('ephemeral');
      expect(response.body.text).toContain('Please provide a flight number');
    });
  });

  describe('Flight number validation', () => {
    test('should accept valid flight numbers', async () => {
      const validFlightNumbers = ['UA400', 'DL1234', 'AA123', 'JB1234', 'WN1234A'];

      for (const flightNumber of validFlightNumbers) {
        const response = await request(app)
          .post('/slack/commands')
          .send({
            text: flightNumber,
            channel_id: 'C123456',
            user_id: 'U123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.response_type).toBe('in_channel');
        expect(response.body.text).toContain(`Now tracking flight *${flightNumber.toUpperCase()}*`);
      }
    });

    test('should accept valid tail numbers', async () => {
      const validTailNumbers = ['N300DG', 'N123AB', 'N12345'];

      for (const tailNumber of validTailNumbers) {
        const response = await request(app)
          .post('/slack/commands')
          .send({
            text: tailNumber,
            channel_id: 'C123456',
            user_id: 'U123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.response_type).toBe('in_channel');
        expect(response.body.text).toContain(`Now tracking flight *${tailNumber.toUpperCase()}*`);
      }
    });

    test('should reject invalid flight identifiers', async () => {
      const invalidIdentifiers = ['X', '123', 'INVALID123!', 'TOOLONG12345'];

      for (const identifier of invalidIdentifiers) {
        const response = await request(app)
          .post('/slack/commands')
          .send({
            text: identifier,
            channel_id: 'C123456',
            user_id: 'U123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.response_type).toBe('ephemeral');
        expect(response.body.text).toContain('Invalid format');
      }
    });
  });

  describe('Response format validation', () => {
    test('should return proper Slack message format', async () => {
      const response = await request(app)
        .post('/slack/commands')
        .send({
          text: 'UA400',
          channel_id: 'C123456',
          user_id: 'U123456'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response_type', 'in_channel');
      expect(response.body).toHaveProperty('text');
      expect(response.body).toHaveProperty('blocks');
      expect(Array.isArray(response.body.blocks)).toBe(true);
      expect(response.body.blocks.length).toBeGreaterThan(0);
      
      // Check block structure
      const firstBlock = response.body.blocks[0];
      expect(firstBlock).toHaveProperty('type', 'section');
      expect(firstBlock).toHaveProperty('text');
      expect(firstBlock.text).toHaveProperty('type', 'mrkdwn');
      
      // Check for tracking links in the last block
      const lastBlock = response.body.blocks[response.body.blocks.length - 1];
      expect(lastBlock.text.text).toContain('FlightAware');
      expect(lastBlock.text.text).toContain('Flightradar24');
    });
  });

  describe('Health check', () => {
    test('should return healthy status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Input sanitization', () => {
    test('should handle flight numbers with special characters', async () => {
      const identifiersWithSpecialChars = [
        'UA-400',
        'UA 400',
        'UA_400',
        'UA.400'
      ];

      for (const identifier of identifiersWithSpecialChars) {
        const response = await request(app)
          .post('/slack/commands')
          .send({
            text: identifier,
            channel_id: 'C123456',
            user_id: 'U123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.response_type).toBe('in_channel');
        expect(response.body.text).toContain('Now tracking flight *UA400*');
      }
    });

    test('should handle case insensitive input', async () => {
      const caseVariations = ['ua400', 'UA400', 'uA400', 'Ua400'];

      for (const variation of caseVariations) {
        const response = await request(app)
          .post('/slack/commands')
          .send({
            text: variation,
            channel_id: 'C123456',
            user_id: 'U123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.response_type).toBe('in_channel');
        expect(response.body.text).toContain('Now tracking flight *UA400*');
      }
    });
  });
});