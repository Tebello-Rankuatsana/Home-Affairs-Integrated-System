import { z } from 'zod';
import * as auth from '../services/authService.js';
import { ctx } from './util.js';

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
