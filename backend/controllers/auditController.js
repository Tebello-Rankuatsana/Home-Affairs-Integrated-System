import { z } from 'zod';
import * as audit from '../services/auditService.js';

export async function list(req, res) {
  const q = z
    .object({
      action: z.string().optional(),
      actorId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    })
    .parse(req.query);
  res.json(await audit.listAuditLogs(q));
}
