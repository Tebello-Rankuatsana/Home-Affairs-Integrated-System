import { z } from 'zod';
import * as admin from '../services/adminService.js';
import { IDENTITY_FIELDS } from '../constants.js';
import { ctx } from './util.js';

const staffRole = z.enum(['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']);
const password = z.string().min(10).max(100);

export async function listUsers(req, res) {
  const q = z
    .object({ role: z.enum(['CITIZEN', 'HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']).optional(), departmentCode: z.string().optional() })
    .parse(req.query);
  res.json(await admin.listUsers(q));
}

export async function createStaff(req, res) {
  const body = z
    .object({ email: z.string().email(), password, role: staffRole, departmentCode: z.string().optional() })
    .parse(req.body);
  res.status(201).json(await admin.createStaff(ctx(req), body));
}

export async function updateUser(req, res) {
  const changes = z
    .object({
      active: z.boolean().optional(),
      role: staffRole.optional(),
      departmentCode: z.string().nullable().optional(),
      password: password.optional(),
    })
    .strict()
    .refine((o) => Object.keys(o).length > 0, 'No changes provided')
    .parse(req.body);
  res.json(await admin.updateUser(ctx(req), z.string().uuid().parse(req.params.id), changes));
}

export async function getScopes(req, res) {
  res.json(await admin.getScopes(req.params.code));
}

export async function setScopes(req, res) {
  const body = z.object({ fields: z.array(z.enum(IDENTITY_FIELDS)).min(1) }).parse(req.body);
  res.json(await admin.setScopes(ctx(req), req.params.code, body.fields));
}
