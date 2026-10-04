import { z } from 'zod';
import * as identity from '../services/identityService.js';
import { ctx } from './util.js';

export async function verify(req, res) {
  const schema =
    req.user.role === 'DEPARTMENT_STAFF'
      ? z.object({ applicationId: z.string().uuid() })
      : z.object({ nationalId: z.string().min(5).max(20) });
  res.json(await identity.verifyIdentity(ctx(req), schema.parse(req.body)));
}
