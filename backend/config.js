import dotenv from 'dotenv';
dotenv.config();

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));
const bool = (v, fallback = false) => (v === undefined ? fallback : v === 'true');

export const config = {
  port: num(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  isProd: process.env.NODE_ENV === 'production',
  trustProxy: bool(process.env.TRUST_PROXY, false),
  demoMode: bool(process.env.DEMO_MODE, false),

  redisUrl: process.env.REDIS_URL || null,

  runWorker: bool(process.env.RUN_WORKER, Boolean(process.env.REDIS_URL)),

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  receiptSecret: process.env.RECEIPT_SECRET || process.env.JWT_SECRET,

  identityCacheTtlSeconds: num(process.env.IDENTITY_CACHE_TTL_SECONDS, 300),

  otpTtlSeconds: num(process.env.OTP_TTL_SECONDS, 300),
  otpCooldownSeconds: num(process.env.OTP_COOLDOWN_SECONDS, 60),
  otpMaxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),

  rateLimit: {
    enabled: bool(process.env.RATE_LIMIT_ENABLED, true),
  },

  upload: {
    localDir: process.env.UPLOAD_DIR || './uploads',
    maxBytes: num(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
    allowedMimeTypes: (
      process.env.UPLOAD_ALLOWED_MIME_TYPES ||
      'image/jpeg,image/png,application/pdf'
    )
      .split(',')
      .map((s) => s.trim()),
  },

  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true),
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },

  appointments: {
    utcOffsetMinutes: num(process.env.APPOINTMENT_UTC_OFFSET_MINUTES, 120),
    openHour: num(process.env.APPOINTMENT_OPEN_HOUR, 8),
    closeHour: num(process.env.APPOINTMENT_CLOSE_HOUR, 16),
    slotMinutes: num(process.env.APPOINTMENT_SLOT_MINUTES, 30),
    capacityPerSlot: num(process.env.APPOINTMENT_CAPACITY_PER_SLOT, 2),
    maxDaysAhead: num(process.env.APPOINTMENT_MAX_DAYS_AHEAD, 30),
    slotCacheTtlSeconds: num(process.env.APPOINTMENT_SLOT_CACHE_TTL_SECONDS, 10),
    avgServiceMinutes: num(process.env.APPOINTMENT_AVG_SERVICE_MINUTES, 15),
  },
};

const missing = [];
if (!config.databaseUrl) missing.push('DATABASE_URL');
if (!config.jwtSecret) missing.push('JWT_SECRET');
if (config.isProd && missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}