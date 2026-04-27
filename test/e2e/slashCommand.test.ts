import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { startApp, type AppHandles } from '../../src/server.js';
import { TRACKED_FLIGHTS_KEY } from '../../src/services/kvStore.js';
import { createTestBoltApp, makeSlashCommandEvent } from './helpers/boltTest.js';
import { flushTestDb, getTestRedisUrl } from './helpers/redis.js';
import { fakeAeroApi } from './helpers/aeroapi.js';
import { aeroFlightResponse } from './fixtures/flights.js';

const redisUrl = getTestRedisUrl();

describe.skipIf(!redisUrl)('e2e: slash command write-through', () => {
  let handles: AppHandles | null;

  beforeEach(async () => {
    await flushTestDb(redisUrl!);
    handles = null;
  });

  afterEach(async () => {
    if (handles) await handles.shutdown();
    nock.cleanAll();
  });

  it('looks up a flight via AeroAPI, posts to Slack, and persists tracking to Redis', async () => {
    const aeroScope = fakeAeroApi()
      .get('/aeroapi/flights/UA400')
      .reply(200, aeroFlightResponse({ ident_iata: 'UA400', status: 'Scheduled' }));

    let respondBody: Record<string, unknown> | null = null;
    const responseUrl = 'https://hooks.slack.com/commands/T_TEST/slash/abc';
    nock('https://hooks.slack.com')
      .post('/commands/T_TEST/slash/abc', (body: Record<string, unknown>) => {
        respondBody = body;
        return true;
      })
      .reply(200);

    const { app } = createTestBoltApp();
    handles = await startApp({
      boltApp: app,
      redisUrl: redisUrl!,
      enableCrons: false,
      startHonoServer: false,
    });

    const event = makeSlashCommandEvent({
      command: '/flightbot',
      text: 'UA400',
      channelId: 'C_CHAN',
      responseUrl,
    });
    await app.processEvent(event);

    expect(event.ack).toHaveBeenCalled();
    expect(aeroScope.isDone()).toBe(true);

    expect(respondBody).not.toBeNull();
    expect(respondBody!.response_type).toBe('in_channel');
    expect(String(respondBody!.text)).toContain('UA400');

    expect(handles.flightMonitor.getTrackedFlightsCount()).toBe(1);
    expect(handles.flightMonitor.isTracking('UA400', 'C_CHAN')).toBe(true);

    const stored = await handles.kvStore.hgetall(TRACKED_FLIGHTS_KEY);
    const key = 'UA400_C_CHAN';
    expect(stored[key]).toBeDefined();
    const parsed = JSON.parse(stored[key]) as { identifier: string; channelId: string };
    expect(parsed.identifier).toBe('UA400');
    expect(parsed.channelId).toBe('C_CHAN');
  });
});
