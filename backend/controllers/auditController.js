import { z } from 'zod';
import * as audit from '../services/auditService.js';

const dateTime = z.string().datetime({ offset: true }).or(z.string().datetime());

export async function list(req, res) {
  const q = z
    .object({
      action: z.string().optional(),
      actorId: z.string().regex(/^\d+$/).optional(),
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
      from: dateTime.optional(),
      to: dateTime.optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);
  const [rows, total] = await Promise.all([
    audit.listAuditLogs(q),
    audit.countAuditLogs(q),
  ]);
  res.set('X-Total-Count', String(total));
  res.json(rows);
}
