import dotenv from 'dotenv';
dotenv.config();

const num = (v, fallback) => (v === undefined ? fallback : Number(v));
const bool = (v, fallback = false) => (v === undefined ? fallback : v === 'true');

export const config = {
  port: num(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  isProd: process.env.NODE_ENV === 'production',
  trustProxy: bool(process.env.TRUST_PROXY, false),
  demoMode: bool(process.env.DEMO_MODE, false),
  
  // Redis (optional; leave unset for in-memory cache)
  redisUrl: process.env.REDIS_URL || null,

  // Automatically run workers if explicit or if REDIS_URL exists
  runWorker: bool(process.env.RUN_WORKER, Boolean(process.env.REDIS_URL)),

  // Auth
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  receiptSecret: process.env.RECEIPT_SECRET || process.env.JWT_SECRET,

  // OTP
  otpTtlSeconds: num(process.env.OTP_TTL_SECONDS, 300),
  otpCooldownSeconds: num(process.env.OTP_COOLDOWN_SECONDS, 60),
  otpMaxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),

  // Rate limiting
  rateLimit: {
    enabled: bool(process.env.RATE_LIMIT_ENABLED, true),
  },

  // Uploads
  upload: {
    localDir: process.env.UPLOAD_DIR || './uploads',
    maxBytes: num(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
    allowedMimeTypes: (
      process.env.UPLOAD_ALLOWED_MIME_TYPES ||
      'image/jpeg,image/png,application/pdf'
    ).split(',').map((s) => s.trim()),
  },

  // S3 / MinIO (leave unset to use local disk)
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true),
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },

  // Appointments —every field referenced in appointmentService.js
  appointments: {
    utcOffsetMinutes: num(process.env.APPOINTMENT_UTC_OFFSET_MINUTES, 120), // SAST = UTC+2
    openHour: num(process.env.APPOINTMENT_OPEN_HOUR, 8),                   // 08:00 local
    closeHour: num(process.env.APPOINTMENT_CLOSE_HOUR, 16),                // 16:00 local
    slotMinutes: num(process.env.APPOINTMENT_SLOT_MINUTES, 30),            // 30-min slots
    capacityPerSlot: num(process.env.APPOINTMENT_CAPACITY_PER_SLOT, 2),
    maxDaysAhead: num(process.env.APPOINTMENT_MAX_DAYS_AHEAD, 30),
    slotCacheTtlSeconds: num(process.env.APPOINTMENT_SLOT_CACHE_TTL_SECONDS, 10),
    avgServiceMinutes: num(process.env.APPOINTMENT_AVG_SERVICE_MINUTES, 15),
  },
};