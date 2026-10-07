import { z } from 'zod';
import * as admin from '../services/adminService.js';
import { DOCUMENT_TYPES, IDENTITY_FIELDS } from '../constants.js';
import { ctx } from './util.js';

const staffRole = z.enum(['HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN']);
const password = z.string().min(10).max(100);

export async function listUsers(req, res) {
  const q = z
    .object({
      role: staffRole.optional(),
      departmentCode: z.string().optional(),
    })
    .parse(req.query);
  res.json(await admin.listUsers(q));
}

export async function createStaff(req, res) {
  const body = z
    .object({
      email: z.string().email(),
      password,
      role: staffRole,
      departmentCode: z.string().optional(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
    })
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
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
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

export async function createDepartment(req, res) {
  const body = z
    .object({
      code: z.string().min(2).max(40),
      name: z.string().min(2).max(120),
      ministryCode: z.string().min(2).max(20),
    })
    .parse(req.body);
  res.status(201).json(await admin.createDepartment(ctx(req), body));
}

export async function createService(req, res) {
  const body = z
    .object({
      code: z.string().min(2).max(60),
      name: z.string().min(2).max(120),
      departmentCode: z.string().min(2),
      requiredDocuments: z.array(z.enum(DOCUMENT_TYPES)).default([]),
      feeAmount: z.number().nonnegative().nullable().optional(),
      currency: z.string().min(2).max(8).default('LSL'),
      processingTimeDays: z.number().int().nonnegative().nullable().optional(),
    })
    .parse(req.body);
  res.status(201).json(await admin.createService(ctx(req), body));
}

export async function updateService(req, res) {
  const body = z
    .object({
      name: z.string().min(2).max(120).optional(),
      requiredDocuments: z.array(z.enum(DOCUMENT_TYPES)).optional(),
      feeAmount: z.number().nonnegative().nullable().optional(),
      currency: z.string().min(2).max(8).optional(),
      processingTimeDays: z.number().int().nonnegative().nullable().optional(),
    })
    .strict()
    .refine((o) => Object.keys(o).length > 0, 'No changes provided')
    .parse(req.body);
  res.json(await admin.updateService(ctx(req), req.params.code, body));
}