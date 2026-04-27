import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { startApp, type AppHandles } from '../../src/server.js';
import { createTestBoltApp } from './helpers/boltTest.js';
import { flushTestDb, getTestRedisUrl } from './helpers/redis.js';
import { makeTrackedFlight } from './fixtures/flights.js';

const redisUrl = getTestRedisUrl();
const EXTERNAL_URL = 'https://flightbot.example.test';

describe.skipIf(!redisUrl)('e2e: conditional keepalive', () => {
  let handles: AppHandles | null;
  let originalNodeEnv: string | undefined;

  beforeEach(async () => {
    await flushTestDb(redisUrl!);
    handles = null;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  afterEach(async () => {
    if (handles) await handles.shutdown();
    nock.cleanAll();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('skips the ping when no flights are tracked', async () => {
    const scope = nock(EXTERNAL_URL).get('/health').reply(200, { ok: true });

    const { app } = createTestBoltApp();
    handles = await startApp({
      boltApp: app,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
      externalUrl: EXTERNAL_URL,
    });

    expect(handles.flightMonitor.getTrackedFlightsCount()).toBe(0);

    await handles.keepalivePing();

    expect(scope.isDone()).toBe(false);
    expect(nock.pendingMocks()).toContain(`GET ${EXTERNAL_URL}:443/health`);
  });

  it('pings /health exactly once when at least one flight is tracked', async () => {
    const scope = nock(EXTERNAL_URL).get('/health').reply(200, { ok: true });

    const { app } = createTestBoltApp();
    handles = await startApp({
      boltApp: app,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
      externalUrl: EXTERNAL_URL,
    });

    handles.flightMonitor.trackedFlights.set(
      'UA400_C_CHAN',
      makeTrackedFlight({ identifier: 'UA400', channelId: 'C_CHAN' })
    );

    await handles.keepalivePing();

    expect(scope.isDone()).toBe(true);
  });
});
