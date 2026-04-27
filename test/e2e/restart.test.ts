import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { startApp, type AppHandles } from '../../src/server.js';
import { TRACKED_FLIGHTS_KEY } from '../../src/services/kvStore.js';
import { createTestBoltApp, makeSlashCommandEvent } from './helpers/boltTest.js';
import { flushTestDb, getTestRedisUrl } from './helpers/redis.js';
import { fakeAeroApi } from './helpers/aeroapi.js';
import { aeroFlightResponse } from './fixtures/flights.js';

const redisUrl = getTestRedisUrl();

describe.skipIf(!redisUrl)('e2e: restart preserves tracked-flight state', () => {
  let handles1: AppHandles | null;
  let handles2: AppHandles | null;

  beforeEach(async () => {
    await flushTestDb(redisUrl!);
    handles1 = null;
    handles2 = null;
  });

  afterEach(async () => {
    if (handles1) await handles1.shutdown();
    if (handles2) await handles2.shutdown();
    nock.cleanAll();
  });

  it('restores tracked flights after process restart against same Redis DB', async () => {
    fakeAeroApi()
      .get('/aeroapi/flights/UA400')
      .reply(200, aeroFlightResponse({ ident_iata: 'UA400', status: 'Scheduled' }));

    nock('https://hooks.slack.com').post(/.*/).reply(200);

    const { app: app1 } = createTestBoltApp();
    handles1 = await startApp({
      boltApp: app1,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
    });

    await app1.processEvent(
      makeSlashCommandEvent({
        command: '/flightbot',
        text: 'UA400',
        channelId: 'C_CHAN',
        responseUrl: 'https://hooks.slack.com/commands/T_TEST/restart/1',
      })
    );

    expect(handles1.flightMonitor.getTrackedFlightsCount()).toBe(1);
    await handles1.shutdown();
    handles1 = null;

    const { app: app2 } = createTestBoltApp();
    handles2 = await startApp({
      boltApp: app2,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
    });

    expect(handles2.flightMonitor.getTrackedFlightsCount()).toBe(1);
    expect(handles2.flightMonitor.isTracking('UA400', 'C_CHAN')).toBe(true);

    const stored = await handles2.kvStore.hgetall(TRACKED_FLIGHTS_KEY);
    expect(stored.UA400_C_CHAN).toBeDefined();
  });
});
