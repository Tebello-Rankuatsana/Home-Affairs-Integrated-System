import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const passthrough = (req, res, next) => next();

const make = (limit, windowMinutes = 15) =>
  config.rateLimit.enabled
    ? rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many requests. Please try again later.' },
      })
    : passthrough;

export const globalLimiter = make(500);
export const authLimiter = make(20); // login / OTP endpoints
export const publicLimiter = make(60); // unauthenticated verification endpoints
