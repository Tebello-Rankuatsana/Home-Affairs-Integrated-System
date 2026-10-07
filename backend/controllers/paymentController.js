import { z } from 'zod';
import * as payments from '../services/paymentService.js';
import { PAYMENT_METHODS } from '../constants.js';
import { ctx } from './util.js';

const uuid = z.string().uuid();

export async function pay(req, res) {
  const body = z.object({ method: z.enum(PAYMENT_METHODS) }).parse(req.body);
  res.status(201).json(await payments.payApplicationFee(ctx(req), uuid.parse(req.params.id), body));
}

export async function list(req, res) {
  res.json(await payments.listPayments(ctx(req)));
}