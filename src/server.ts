import './instrument.js';
import { App } from '@slack/bolt';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import axios from 'axios';
import * as Sentry from '@sentry/node';
import 'dotenv/config';

import { FlightService } from './services/flightService.js';
import { FlightMonitor } from './services/flightMonitor.js';
import { RedisKVStore } from './services/kvStore.js';
import { metrics } from './metrics.js';
import { handleFlightbotCommand, handleFlightbotStatusCommand } from './handlers/flightbot.js';

export interface StartConfig {
  boltApp?: App;
  redisUrl?: string;
  port?: number;
  enableCrons?: boolean;
  startHonoServer?: boolean;
  externalUrl?: string;
}

export interface AppHandles {
  app: App;
  kvStore: RedisKVStore;
  flightService: FlightService;
  flightMonitor: FlightMonitor;
  honoServer: ReturnType<typeof serve> | null;
  cronTasks: cron.ScheduledTask[];
  keepalivePing: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export async function startApp(config: StartConfig = {}): Promise<AppHandles> {
  const usingInjectedApp = Boolean(config.boltApp);

  const app =
    config.boltApp ??
    new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN,
      port: parseInt(process.env.PORT ?? '3000', 10),
    });

  const redisUrl = config.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }
  const kvStore = new RedisKVStore(redisUrl);
  const flightService = new FlightService();
  const flightMonitor = new FlightMonitor(app, flightService, kvStore);
  const deps = { flightService, flightMonitor };

  app.command('/flightbot', async ({ command, ack, respond }) => {
    const startTime = Date.now();

    try {
      await ack();
    } catch (ackError) {
      console.error('Failed to acknowledge command:', ackError);
      Sentry.captureException(ackError);
    }

    const flightIdentifier = command.text.trim();

    try {
      const result = await handleFlightbotCommand(
        {
          flightIdentifier,
          channelId: command.channel_id,
          userId: command.user_id,
        },
        deps
      );

      if (result.responseType === 'in_channel') {
        metrics.trackFlightLookup(flightIdentifier, true);
        metrics.trackFlightTrackingStarted(flightIdentifier);
        metrics.setActiveFlightsGauge(flightMonitor.getTrackedFlightsCount());
        metrics.setApiUsageGauge(flightService.getApiUsageStatus().percentage);
      } else if (result.text.includes('not found')) {
        metrics.trackFlightLookup(flightIdentifier, false);
      }

      await respond({
        text: result.text,
        blocks: result.blocks,
        response_type: result.responseType,
      });

      metrics.trackCommandLatency('flightbot', Date.now() - startTime);
    } catch (error) {
      console.error('Error handling flight command:', error);
      Sentry.captureException(error);
      metrics.trackError('flight_lookup_error');

      await respond({
        text: `Error retrieving flight information for "${flightIdentifier}". Please try again later.`,
        response_type: 'ephemeral',
      });

      metrics.trackCommandLatency('flightbot', Date.now() - startTime);
    }
  });

  app.command('/flightbot-status', async ({ ack, respond }) => {
    await ack();

    const result = handleFlightbotStatusCommand(deps);
    metrics.setActiveFlightsGauge(flightMonitor.getTrackedFlightsCount());

    await respond({
      text: result.text,
      response_type: result.responseType,
    });
  });

  app.error(async (error) => {
    console.error('Slack app error:', error);
    Sentry.captureException(error);
    await Promise.resolve();
  });

  const externalUrl = config.externalUrl ?? process.env.RENDER_EXTERNAL_URL;

  const keepalivePing = async (): Promise<void> => {
    if (!externalUrl) return;
    if (flightMonitor.getTrackedFlightsCount() === 0) return;
    try {
      const url = `${externalUrl}/health`;
      await axios.get(url, { timeout: 5000 });
      console.log(`Keep-alive ping sent to ${url}`);
    } catch (error) {
      console.error('Keep-alive ping failed:', (error as Error).message);
    }
  };

  const cronTasks: cron.ScheduledTask[] = [];
  const enableCrons = config.enableCrons ?? true;
  if (enableCrons) {
    cronTasks.push(
      cron.schedule('*/5 * * * *', () => {
        void flightMonitor.checkFlightUpdates();
      })
    );

    if (process.env.NODE_ENV === 'production' && externalUrl) {
      cronTasks.push(
        cron.schedule('*/10 * * * *', () => {
          void keepalivePing();
        })
      );
    }
  }

  const server = new Hono().onError((err, c) => {
    Sentry.captureException(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  server.get('/', (c) => {
    const apiUsage = flightService.getApiUsageStatus();
    return c.json({
      status: 'FlightBot is running!',
      trackedFlights: flightMonitor.getTrackedFlightsCount(),
      uptime: process.uptime(),
      apiUsage: {
        used: apiUsage.used,
        remaining: apiUsage.remaining,
        limit: apiUsage.limit,
        percentage: apiUsage.percentage,
        status: apiUsage.status,
        resetsOn: apiUsage.resetsOn,
      },
    });
  });

  server.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  await kvStore.connect();
  await flightMonitor.hydrate();

  const port = config.port ?? parseInt(process.env.PORT ?? '3000', 10);
  const startHono = config.startHonoServer ?? !usingInjectedApp;
  const honoServer = startHono
    ? serve({ fetch: server.fetch, port, hostname: '0.0.0.0' }, () => {
        console.log(`FlightBot server is running on port ${String(port)}`);
      })
    : null;

  if (!usingInjectedApp) {
    await app.start();
    console.log('FlightBot Slack app is running!');
  }

  const shutdown = async (): Promise<void> => {
    for (const task of cronTasks) {
      await task.stop();
    }
    if (honoServer) {
      await new Promise<void>((resolve) => {
        honoServer.close(() => {
          resolve();
        });
      });
    }
    if (!usingInjectedApp) {
      try {
        await app.stop();
      } catch {
        // App.stop() can throw if start failed mid-way; non-fatal during shutdown.
      }
    }
    await kvStore.disconnect();
  };

  return {
    app,
    kvStore,
    flightService,
    flightMonitor,
    honoServer,
    cronTasks,
    keepalivePing,
    shutdown,
  };
}

async function main(): Promise<void> {
  try {
    await startApp();
  } catch (error) {
    console.error('Failed to start FlightBot:', error);
    Sentry.captureException(error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  void main();
}
