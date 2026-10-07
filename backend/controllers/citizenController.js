import { z } from 'zod';
import * as citizens from '../services/citizenService.js';
import { SUPPORTED_LANGUAGES } from '../i18n.js';
import { ctx } from './util.js';

export async function me(req, res) {
  res.json(await citizens.getOwnProfile(ctx(req)));
}

export async function updateSelf(req, res) {
  const changes = z
    .object({
      email: z.string().email().nullable().optional(),
      preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
    })
    .strict()
    .refine((o) => Object.keys(o).length > 0, 'No changes provided')
    .parse(req.body);
  res.json(await citizens.updateSelf(ctx(req), changes));
}

export async function create(req, res) {
  const body = z
    .object({
      nationalId: z.string().min(5).max(20),
      fullName: z.string().min(2).max(150),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      gender: z.string().max(20).optional(),
      citizenship: z.string().min(2).max(60),
      address: z.string().min(3).max(200),
      phone: z.string().min(7).max(20),
      email: z.string().email().optional(),
      preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
    })
    .parse(req.body);
  res.status(201).json(await citizens.createCitizen(ctx(req), body));
}

export async function update(req, res) {
  const changes = z
    .object({
      fullName: z.string().min(2).max(150).optional(),
      address: z.string().min(3).max(200).optional(),
      phone: z.string().min(7).max(20).optional(),
    })
    .strict()
    .refine((o) => Object.keys(o).length > 0, 'No changes provided')
    .parse(req.body);
  res.json(await citizens.updateCitizen(ctx(req), req.params.nationalId, changes));
}