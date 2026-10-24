import { z } from 'zod';
import * as auth from '../services/authService.js';
import { ctx } from './util.js';
import { httpError } from '../middleware/error.js';

const nationalId = z.string().min(5).max(20);

export async function requestOtp(req, res) {
  const body = z.object({ nationalId }).parse(req.body);
  res.json(await auth.requestOtp(ctx(req), body.nationalId));
}

export async function verifyOtp(req, res) {
  const body = z.object({ nationalId, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  res.json(await auth.verifyOtp(ctx(req), body));
}

export async function staffLogin(req, res) {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  res.json(await auth.staffLogin(ctx(req), body));
}

export async function logout(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) throw httpError(401, 'Missing token');
  res.json(await auth.logout(ctx(req), token));
}

// Add this to backend/controllers/authController.js
export async function register(req, res) {
  const body = z.object({
    fullName: z.string().min(2).max(150),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    password: z.string().min(8),
    securityQuestion: z.string().optional(),
    securityAnswer: z.string().optional(),
    hasId: z.boolean().optional(),
    nationalId: z.string().optional(),
    birthCertificateNumber: z.string().optional(),
    placeOfBirth: z.string().optional(),
    address: z.string().optional(),
  }).parse(req.body);

  res.status(201).json(await auth.registerCitizen(ctx(req), body));
}