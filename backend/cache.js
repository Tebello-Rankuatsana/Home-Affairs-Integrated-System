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
export const otpCooldownKey = (nationalId) => `otp:cooldown:${nationalId}`;
export const slotsKey = (departmentCode, date) => `slots:${departmentCode}:${date}`;
