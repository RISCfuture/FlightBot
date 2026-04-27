import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import Redis from 'ioredis';
import { startApp, type AppHandles } from '../../src/server.js';
import { TRACKED_FLIGHTS_KEY } from '../../src/services/kvStore.js';
import { createTestBoltApp } from './helpers/boltTest.js';
import { flushTestDb, getTestRedisUrl } from './helpers/redis.js';
import { fakeAeroApi } from './helpers/aeroapi.js';
import { aeroFlightResponse, makeTrackedFlight } from './fixtures/flights.js';

const redisUrl = getTestRedisUrl();

async function seedFlight(
  url: string,
  tracked: ReturnType<typeof makeTrackedFlight>
): Promise<void> {
  const client = new Redis(url, { lazyConnect: true });
  await client.connect();
  await client.hset(
    TRACKED_FLIGHTS_KEY,
    `${tracked.identifier}_${tracked.channelId}`,
    JSON.stringify(tracked)
  );
  await client.quit();
}

describe.skipIf(!redisUrl)('e2e: cron-driven flight updates', () => {
  let handles: AppHandles | null;

  beforeEach(async () => {
    await flushTestDb(redisUrl!);
    handles = null;
  });

  afterEach(async () => {
    if (handles) await handles.shutdown();
    nock.cleanAll();
  });

  it('detects status change, posts update to Slack, and persists new state', async () => {
    await seedFlight(
      redisUrl!,
      makeTrackedFlight({
        identifier: 'UA400',
        channelId: 'C_CHAN',
        status: 'scheduled',
        lastStatus: 'scheduled',
        lastUpdatedMinutesAgo: 10,
      })
    );

    const aeroScope = fakeAeroApi()
      .get('/aeroapi/flights/UA400')
      .reply(200, aeroFlightResponse({ ident_iata: 'UA400', status: 'Active' }));

    const { app, chatPostMessage } = createTestBoltApp();
    handles = await startApp({
      boltApp: app,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
    });

    expect(handles.flightMonitor.getTrackedFlightsCount()).toBe(1);

    await handles.flightMonitor.checkFlightUpdates();

    expect(aeroScope.isDone()).toBe(true);
    expect(chatPostMessage).toHaveBeenCalledTimes(1);
    const call = chatPostMessage.mock.calls[0][0] as {
      channel: string;
      text: string;
    };
    expect(call.channel).toBe('C_CHAN');
    expect(call.text).toContain('airborne');

    const stored = await handles.kvStore.hgetall(TRACKED_FLIGHTS_KEY);
    const parsed = JSON.parse(stored.UA400_C_CHAN) as {
      lastStatus: string;
      updateCount: number;
    };
    expect(parsed.lastStatus).toBe('active');
    expect(parsed.updateCount).toBe(1);
  });

  it('removes a landed flight after 10+ updates without making any AeroAPI call', async () => {
    await seedFlight(
      redisUrl!,
      makeTrackedFlight({
        identifier: 'UA400',
        channelId: 'C_CHAN',
        status: 'landed',
        lastStatus: 'landed',
        hasLanded: true,
        updateCount: 15,
      })
    );

    const { app, chatPostMessage } = createTestBoltApp();
    handles = await startApp({
      boltApp: app,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
    });

    expect(handles.flightMonitor.getTrackedFlightsCount()).toBe(1);

    await handles.flightMonitor.checkFlightUpdates();

    expect(chatPostMessage).not.toHaveBeenCalled();
    expect(handles.flightMonitor.getTrackedFlightsCount()).toBe(0);
    const stored = await handles.kvStore.hgetall(TRACKED_FLIGHTS_KEY);
    expect(Object.keys(stored)).toHaveLength(0);
  });
});
