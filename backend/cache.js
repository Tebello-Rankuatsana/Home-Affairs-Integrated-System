import Redis from 'ioredis';
import { config } from './config.js';

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
    const expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.map.set(key, { value: String(value), expires });
  }

  async del(key) {
    this.map.delete(key);
  }

  async incr(key, ttlSeconds) {
    const entry = this.map.get(key);
    if (!entry || entry.expires < Date.now()) {
      const expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
      this.map.set(key, { value: '1', expires });
      return 1;
    }
    const newVal = Number(entry.value) + 1;
    entry.value = String(newVal);
    return newVal;
  }
}

class RedisStore {
  constructor(url) {
    const options = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    };
    if (url.startsWith('rediss://')) options.tls = { rejectUnauthorized: false };

    this.redis = new Redis(url, options);

    this.redis.on('error', (err) => {
      console.error('[Redis Cache] Error:', err.message);
    });
    this.redis.on('connect', () => {
      console.log('[Redis Cache] Connected.');
    });
  }

  async get(key) {
    return this.redis.get(key);
  }

  async set(key, value, ttlSeconds) {
    if (ttlSeconds) {
      await this.redis.set(key, String(value), 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, String(value));
    }
  }

  async del(key) {
    await this.redis.del(key);
  }

  async incr(key, ttlSeconds) {
    const n = await this.redis.incr(key);
    if (n === 1 && ttlSeconds) {
      await this.redis.expire(key, ttlSeconds);
    }
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