import { z } from 'zod';
import * as receipts from '../services/receiptService.js';
import { ctx } from './util.js';

export async function list(req, res) {
  res.json(await receipts.listReceipts(ctx(req)));
}

export async function get(req, res) {
  res.json(await receipts.getReceipt(ctx(req), z.string().uuid().parse(req.params.id)));
}

// Public
export async function verify(req, res) {
  const number = z.string().regex(/^RCT-\d{8}-[0-9A-F]{6}$/).safeParse(req.params.receiptNumber);
  const result = number.success ? await receipts.verifyReceipt(number.data) : { valid: false };
  res.status(result.valid ? 200 : 404).json(result);
}
