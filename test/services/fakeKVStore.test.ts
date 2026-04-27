import { describe, test, expect, beforeEach } from 'vitest';
import { FakeKVStore } from '../fakes/fakeKVStore.js';

describe('FakeKVStore', () => {
  let kv: FakeKVStore;

  beforeEach(() => {
    kv = new FakeKVStore();
  });

  test('hgetall returns empty object for missing key', async () => {
    expect(await kv.hgetall('missing')).toEqual({});
  });

  test('hset and hgetall round-trip', async () => {
    await kv.hset('h', 'a', '1');
    await kv.hset('h', 'b', '2');
    expect(await kv.hgetall('h')).toEqual({ a: '1', b: '2' });
  });

  test('hset overwrites an existing field', async () => {
    await kv.hset('h', 'a', '1');
    await kv.hset('h', 'a', '2');
    expect(await kv.hgetall('h')).toEqual({ a: '2' });
  });

  test('hdel removes a single field without affecting others', async () => {
    await kv.hset('h', 'a', '1');
    await kv.hset('h', 'b', '2');
    await kv.hdel('h', 'a');
    expect(await kv.hgetall('h')).toEqual({ b: '2' });
  });

  test('hdel on missing field is a no-op', async () => {
    await kv.hset('h', 'a', '1');
    await kv.hdel('h', 'missing');
    expect(await kv.hgetall('h')).toEqual({ a: '1' });
  });

  test('hashes are isolated by key', async () => {
    await kv.hset('h1', 'a', '1');
    await kv.hset('h2', 'a', '2');
    expect(await kv.hgetall('h1')).toEqual({ a: '1' });
    expect(await kv.hgetall('h2')).toEqual({ a: '2' });
  });

  test('Date round-trips through JSON as ISO string', async () => {
    const original = { lastUpdated: new Date('2026-04-27T12:00:00Z') };
    await kv.hset('flights', 'key1', JSON.stringify(original));
    const all = await kv.hgetall('flights');
    const parsed = JSON.parse(all.key1) as { lastUpdated: string };
    expect(typeof parsed.lastUpdated).toBe('string');
    expect(new Date(parsed.lastUpdated).toISOString()).toBe(original.lastUpdated.toISOString());
  });

  test('connect and disconnect are no-ops that resolve', async () => {
    await expect(kv.connect()).resolves.toBeUndefined();
    await expect(kv.disconnect()).resolves.toBeUndefined();
  });
});
