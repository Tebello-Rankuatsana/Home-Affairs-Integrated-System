import { z } from 'zod';
import * as citizens from '../services/citizenService.js';
import { ctx } from './util.js';

export async function me(req, res) {
  res.json(await citizens.getOwnProfile(ctx(req)));
}

export async function update(req, res) {
  const changes = z
    .object({
      fullName: z.string().min(2).optional(),
      address: z.string().min(3).optional(),
      phone: z.string().min(7).optional(),
    })
    .strict()
    .refine((o) => Object.keys(o).length > 0, 'No changes provided')
    .parse(req.body);
  res.json(await citizens.updateCitizen(ctx(req), req.params.nationalId, changes));
}
