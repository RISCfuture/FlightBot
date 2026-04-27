import type { KVStore } from '../../src/services/kvStore.js';

export class FakeKVStore implements KVStore {
  private store = new Map<string, Map<string, string>>();

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key);
    if (!hash) return Promise.resolve({});
    return Promise.resolve(Object.fromEntries(hash.entries()));
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    let hash = this.store.get(key);
    if (!hash) {
      hash = new Map();
      this.store.set(key, hash);
    }
    hash.set(field, value);
    return Promise.resolve();
  }

  async hdel(key: string, field: string): Promise<void> {
    const hash = this.store.get(key);
    if (hash) {
      hash.delete(field);
      if (hash.size === 0) this.store.delete(key);
    }
    return Promise.resolve();
  }
}
