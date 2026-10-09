import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const passthrough = (req, res, next) => next();

const make = (limit, windowMinutes, message) =>
  config.rateLimit.enabled
    ? rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: message },
      })
    : passthrough;

export const globalLimiter = make(500, 15, 'Too many requests. Please try again later.');
export const authLimiter = make(20, 15, 'Too many authentication attempts. Please wait before trying again.');
export const publicLimiter = make(60, 15, 'Too many requests to a public endpoint. Please slow down.');
export const otpLimiter = make(5, 10, 'Too many OTP requests. Please wait before requesting another code.');