import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import Redis from 'ioredis';
import { TRACKED_FLIGHTS_KEY } from '../../src/services/kvStore.js';
import { startApp, type AppHandles } from '../../src/server.js';
import { createTestBoltApp, makeSlashCommandEvent } from './helpers/boltTest.js';
import { flushTestDb, getTestRedisUrl } from './helpers/redis.js';
import { makeTrackedFlight } from './fixtures/flights.js';

const redisUrl = getTestRedisUrl();

describe.skipIf(!redisUrl)('e2e: cold-start hydration', () => {
  let handles: AppHandles | null;

  beforeAll(() => {
    if (!redisUrl) throw new Error('unreachable');
  });

  beforeEach(async () => {
    await flushTestDb(redisUrl!);
    handles = null;
  });

  afterEach(async () => {
    if (handles) await handles.shutdown();
    nock.cleanAll();
  });

  it('hydrates tracked flights from Redis at startup and reports them via /flightbot-status', async () => {
    const seedClient = new Redis(redisUrl!, { lazyConnect: true });
    await seedClient.connect();
    const tracked = makeTrackedFlight({ identifier: 'UA400', channelId: 'C_CHAN' });
    await seedClient.hset(
      TRACKED_FLIGHTS_KEY,
      `${tracked.identifier}_${tracked.channelId}`,
      JSON.stringify(tracked)
    );
    await seedClient.quit();

    const { app } = createTestBoltApp();
    handles = await startApp({
      boltApp: app,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
    });

    expect(handles.flightMonitor.getTrackedFlightsCount()).toBe(1);
    expect(handles.flightMonitor.isTracking('UA400', 'C_CHAN')).toBe(true);

    let respondBody: Record<string, unknown> | null = null;
    const responseUrl = 'https://hooks.slack.com/commands/T_TEST/cold/start';
    nock('https://hooks.slack.com')
      .post('/commands/T_TEST/cold/start', (body: Record<string, unknown>) => {
        respondBody = body;
        return true;
      })
      .reply(200);

    await app.processEvent(
      makeSlashCommandEvent({ command: '/flightbot-status', text: '', responseUrl })
    );

    expect(respondBody).not.toBeNull();
    expect(respondBody!.response_type).toBe('ephemeral');
    expect(String(respondBody!.text)).toContain('1');
  });
});
