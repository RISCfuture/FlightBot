import Redis from 'ioredis';

export function getTestRedisUrl(): string | null {
  const url = process.env.REDIS_TEST_URL;
  if (!url) return null;
  const match = /\/(\d+)$/.exec(url);
  if (!match) {
    throw new Error(
      `REDIS_TEST_URL must end with a database index (e.g. redis://localhost:6379/15); got ${url}`
    );
  }
  const dbIndex = parseInt(match[1], 10);
  if (dbIndex < 1) {
    throw new Error(
      `REDIS_TEST_URL must use a non-zero database index to isolate tests; got DB ${String(dbIndex)} in ${url}`
    );
  }
  return url;
}

export async function flushTestDb(url: string): Promise<void> {
  const client = new Redis(url, { lazyConnect: true });
  try {
    await client.connect();
    await client.flushdb();
  } finally {
    await client.quit();
  }
}
