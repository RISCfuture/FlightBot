import { vi, beforeAll, afterAll } from 'vitest';
import nock from 'nock';

process.env.NODE_ENV = 'test';
process.env.FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY ?? 'test-aeroapi-key';
process.env.API_MONTHLY_LIMIT = process.env.API_MONTHLY_LIMIT ?? '999999';
process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? 'xoxb-test';
process.env.SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? 'test-signing-secret';
process.env.SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN ?? 'xapp-test';

vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual<typeof import('@sentry/node')>('@sentry/node');
  return {
    ...actual,
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    startSpan: vi.fn(<T>(_opts: unknown, fn: () => T): T => fn()),
  };
});

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: () => ({ name: 'NoopProfiling' }),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const isUsageFile = (p: unknown): boolean =>
    typeof p === 'string' && p.endsWith('api_usage.json');
  const isDataDir = (p: unknown): boolean =>
    typeof p === 'string' && (p.endsWith('/data') || p.endsWith('\\data'));
  const stubUsage = (): string => {
    const now = new Date();
    return JSON.stringify({
      month: now.getMonth(),
      year: now.getFullYear(),
      count: 0,
      requests: [],
      lastReset: now.toISOString(),
    });
  };
  return {
    ...actual,
    default: actual,
    existsSync: ((p: Parameters<typeof actual.existsSync>[0]) => {
      if (isUsageFile(p) || isDataDir(p)) return true;
      return actual.existsSync(p);
    }) as typeof actual.existsSync,
    readFileSync: ((
      p: Parameters<typeof actual.readFileSync>[0],
      opts?: Parameters<typeof actual.readFileSync>[1]
    ) => {
      if (isUsageFile(p)) return stubUsage();
      return actual.readFileSync(p, opts);
    }) as typeof actual.readFileSync,
    writeFileSync: ((
      p: Parameters<typeof actual.writeFileSync>[0],
      data: Parameters<typeof actual.writeFileSync>[1],
      opts?: Parameters<typeof actual.writeFileSync>[2]
    ) => {
      if (isUsageFile(p)) return;
      actual.writeFileSync(p, data, opts);
    }) as typeof actual.writeFileSync,
    mkdirSync: ((
      p: Parameters<typeof actual.mkdirSync>[0],
      opts?: Parameters<typeof actual.mkdirSync>[1]
    ) => {
      if (isDataDir(p)) return undefined;
      return actual.mkdirSync(p, opts);
    }) as typeof actual.mkdirSync,
  };
});

beforeAll(() => {
  nock.disableNetConnect();
  nock.enableNetConnect((host) => host.includes('127.0.0.1') || host.includes('localhost'));
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});
