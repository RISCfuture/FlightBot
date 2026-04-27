import { Redis } from 'ioredis';

export const TRACKED_FLIGHTS_KEY = 'flightbot:tracked';

export interface KVStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
}

export class RedisKVStore implements KVStore {
  private client: Redis;

  constructor(redisUrl: string) {
    if (!redisUrl) {
      throw new Error('RedisKVStore requires a connection URL');
    }
    this.client = new Redis(redisUrl, { lazyConnect: true });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }
}
