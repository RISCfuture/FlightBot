const { App } = require('@slack/bolt');
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
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
  // Acknowledge immediately to prevent dispatch_failed
  try {
    await ack();
  } catch (ackError) {
    console.error('Failed to acknowledge command:', ackError);
    // Don't throw here - continue processing even if ack fails
    // Slack may retry the command if we throw
  }
  
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

    // Check if we should include API usage warning
    const apiUsage = flightService.getApiUsageStatus();
    const shouldWarn = apiUsage.status === 'warning' || apiUsage.status === 'critical';
    
    const responseBlocks = flightService.formatFlightMessage(flight, flightIdentifier);
    
    // Add API usage warning if needed
    if (shouldWarn) {
      responseBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${apiUsage.emoji} *API Usage ${apiUsage.status}*: ${apiUsage.used}/${apiUsage.limit} requests (${apiUsage.percentage}%). ${apiUsage.status === 'critical' ? 'Flight tracking may be limited.' : 'Monitoring may be reduced to preserve API quota.'}`
        }
      });
    }

    // Create appropriate tracking message for private vs commercial aviation
    const airline = flight.airline?.name;
    const isPrivateAviation = !airline || airline === 'Unknown Airline';
    const isSearchedByTail = flightIdentifier && flightService.isTailNumber(flightIdentifier.replace(/[^A-Z0-9]/gi, ''));
    
    let trackingText;
    if (isPrivateAviation && flight.aircraft?.registration) {
      trackingText = `✈️ Now tracking *${flight.aircraft.registration}*`;
    } else if (isPrivateAviation && isSearchedByTail) {
      trackingText = `✈️ Now tracking *${flightIdentifier.toUpperCase()}*`;
    } else if (isPrivateAviation) {
      trackingText = `✈️ Now tracking *${flight.flight.iata || flight.flight.icao || flight.flight.number}*`;
    } else {
      trackingText = `✈️ Now tracking flight *${flight.flight.iata || flight.flight.icao}*`;
    }

    await respond({
      text: trackingText,
      blocks: responseBlocks,
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
    } else if (error.message.includes('API usage limit reached')) {
      const usageStatus = flightService.getApiUsageStatus();
      errorMessage = `🚨 *Monthly API limit reached* (${usageStatus.used}/${usageStatus.limit} requests used).\n\nFlight tracking is temporarily unavailable. Usage resets on **${usageStatus.resetsOn}**.`;
    }
    
    await respond({
      text: errorMessage,
      response_type: 'ephemeral'
    });
  }
});

// Admin command to check API usage (hidden from users)
app.command('/flightbot-status', async ({ command, ack, respond }) => {
  await ack();
  
  const usageStatus = flightService.getApiUsageStatus();
  const usageMessage = flightService.getApiUsageMessage();
  const trackedCount = flightMonitor.getTrackedFlightsCount();
  
  await respond({
    text: `📊 *FlightBot Status*\n\n${usageMessage}\n\n✈️ Currently tracking: ${trackedCount} flights`,
    response_type: 'ephemeral'
  });
});

app.error((error) => {
  console.error('Slack app error:', error);
});

cron.schedule('*/5 * * * *', () => {
  flightMonitor.checkFlightUpdates();
});

// Keep-alive ping to prevent Render free tier from spinning down
if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const url = `${process.env.RENDER_EXTERNAL_URL}/health`;
      await axios.get(url, { timeout: 5000 });
      console.log(`Keep-alive ping sent to ${url}`);
    } catch (error) {
      console.error('Keep-alive ping failed:', error.message);
    }
  });
}

const server = express();
server.get('/', (req, res) => {
  const apiUsage = flightService.getApiUsageStatus();
  res.json({ 
    status: 'FlightBot is running!',
    trackedFlights: flightMonitor.getTrackedFlightsCount(),
    uptime: process.uptime(),
    apiUsage: {
      used: apiUsage.used,
      remaining: apiUsage.remaining,
      limit: apiUsage.limit,
      percentage: apiUsage.percentage,
      status: apiUsage.status,
      resetsOn: apiUsage.resetsOn
    }
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
  try {
    await app.start();
    console.log('⚡️ FlightBot Slack app is running!');
    
    // Monitor WebSocket connection health
    if (app.receiver && app.receiver.client) {
      app.receiver.client.on('disconnected', (error) => {
        console.error('WebSocket disconnected:', error);
      });
      
      app.receiver.client.on('reconnecting', () => {
        console.log('WebSocket reconnecting...');
      });
      
      app.receiver.client.on('connected', () => {
        console.log('WebSocket connected successfully');
      });
    }
  } catch (error) {
    console.error('Failed to start FlightBot:', error);
    process.exit(1);
  }
})();