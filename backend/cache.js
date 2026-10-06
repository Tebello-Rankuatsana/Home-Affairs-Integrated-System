import Redis from 'ioredis';
import { config } from './config.js';

// Same interface whether we use Redis or the in-memory fallback.
class MemoryStore {
  constructor() {
    this.map = new Map();
  }
  async get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key, value, ttlSeconds) {
    this.map.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
  async del(key) {
    this.map.delete(key);
  }
  // Atomic counter that expires ttlSeconds after it was first created (single-threaded, so no race)
  async incr(key, ttlSeconds) {
    const entry = this.map.get(key);
    if (!entry || entry.expires < Date.now()) {
      this.map.set(key, { value: '1', expires: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    entry.value = String(Number(entry.value) + 1);
    return Number(entry.value);
  }
}

class RedisStore {
  constructor(url) {
    this.redis = new Redis(url);
  }
  get(key) {
    return this.redis.get(key);
  }
  async set(key, value, ttlSeconds) {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
  async del(key) {
    await this.redis.del(key);
  }
  async incr(key, ttlSeconds) {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttlSeconds);
    return n;
  }
}

export const store = config.redisUrl ? new RedisStore(config.redisUrl) : new MemoryStore();

export async function getJSON(key) {
  const raw = await store.get(key);
  return raw ? JSON.parse(raw) : null;
}

export function setJSON(key, value, ttlSeconds) {
  return store.set(key, JSON.stringify(value), ttlSeconds);
}

export const identityCacheKey = (nationalId) => `identity:${nationalId}`;
export const otpKey = (nationalId) => `otp:${nationalId}`;
export const otpAttemptsKey = (nationalId) => `otp:attempts:${nationalId}`;
export const otpCooldownKey = (nationalId) => `otp:cooldown:${nationalId}`;
export const slotsKey = (departmentCode, date) => `slots:${departmentCode}:${date}`;
export const revokedKey = (jti) => `revoked:${jti}`;
