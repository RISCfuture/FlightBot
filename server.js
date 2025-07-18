const { App } = require('@slack/bolt');
const express = require('express');
const cron = require('node-cron');
require('dotenv').config();

const FlightService = require('./services/flightService');
const FlightMonitor = require('./services/flightMonitor');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

const flightService = new FlightService();
const flightMonitor = new FlightMonitor(app, flightService);

app.command('/flightbot', async ({ command, ack, respond }) => {
  await ack();
  
  const flightIdentifier = command.text.trim();
  
  if (!flightIdentifier) {
    await respond({
      text: "❌ Please provide a flight number (e.g., `/flightbot UA400`) or aircraft tail number (e.g., `/flightbot N300DG`)",
      response_type: 'ephemeral'
    });
    return;
  }

  try {
    const flight = await flightService.getFlightData(flightIdentifier);
    
    if (!flight) {
      await respond({
        text: `❌ Flight "${flightIdentifier}" not found. Please check the flight number or tail number and try again.`,
        response_type: 'ephemeral'
      });
      return;
    }

    const trackingInfo = {
      flight: flight,
      channelId: command.channel_id,
      userId: command.user_id,
      identifier: flightIdentifier
    };

    flightMonitor.startTracking(trackingInfo);

    await respond({
      text: `✈️ Now tracking flight *${flight.flight.iata || flight.flight.icao}*`,
      blocks: flightService.formatFlightMessage(flight),
      response_type: 'in_channel'
    });

  } catch (error) {
    console.error('Error handling flight command:', error);
    
    let errorMessage = `❌ Error retrieving flight information for "${flightIdentifier}". Please try again later.`;
    
    if (error.message.includes('Invalid flight identifier format')) {
      errorMessage = `❌ Invalid format. Please use a flight number (e.g., "UA400") or tail number (e.g., "N300DG").`;
    } else if (error.message.includes('Flight identifier too short')) {
      errorMessage = `❌ Flight identifier too short. Please provide a valid flight number or tail number.`;
    } else if (error.message.includes('API authentication failed')) {
      errorMessage = `❌ Service temporarily unavailable. Please try again later.`;
    } else if (error.message.includes('API rate limit exceeded')) {
      errorMessage = `❌ Service busy. Please wait a moment and try again.`;
    }
    
    await respond({
      text: errorMessage,
      response_type: 'ephemeral'
    });
  }
});

app.error((error) => {
  console.error('Slack app error:', error);
});

cron.schedule('*/5 * * * *', () => {
  flightMonitor.checkFlightUpdates();
});

const server = express();
server.get('/', (req, res) => {
  res.json({ 
    status: 'FlightBot is running!',
    trackedFlights: flightMonitor.getTrackedFlightsCount(),
    uptime: process.uptime()
  });
});

server.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡️ FlightBot server is running on port ${PORT}`);
});

(async () => {
  await app.start();
  console.log('⚡️ FlightBot Slack app is running!');
})();