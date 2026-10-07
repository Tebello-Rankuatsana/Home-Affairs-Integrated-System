import { z } from 'zod';
import * as applications from '../services/applicationService.js';
import { APPLICATION_STATUSES, STAFF_SETTABLE_STATUSES } from '../constants.js';
import { ctx } from './util.js';

const uuid = z.string().uuid();

export async function submit(req, res) {
  const body = z
    .object({
      serviceCode: z.string().min(1),
      formData: z.record(z.any()).default({}),
      documentIds: z.array(uuid).max(10).default([]),
    })
    .parse(req.body);
  res.status(201).json(await applications.submitApplication(ctx(req), body));
}

export async function list(req, res) {
  const query = z
    .object({
      status: z.enum(APPLICATION_STATUSES).optional(),
      assigned: z.enum(['me', 'unassigned']).optional(),
      reference: z.string().min(1).max(32).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);
  res.json(await applications.listApplications(ctx(req), query));
}

export async function get(req, res) {
  res.json(await applications.getApplication(ctx(req), uuid.parse(req.params.id)));
}

export async function changeStatus(req, res) {
  const body = z
    .object({
      status: z.enum(STAFF_SETTABLE_STATUSES),
      note: z.string().max(500).optional(),
    })
    .parse(req.body);
  res.json(await applications.changeStatus(ctx(req), uuid.parse(req.params.id), body));
}

export async function assign(req, res) {
  const body = z.object({ assign: z.boolean().default(true) }).parse(req.body ?? {});
  res.json(await applications.assignApplication(ctx(req), uuid.parse(req.params.id), body));
}

export async function respond(req, res) {
  const body = z
    .object({
      formData: z.record(z.any()).default({}),
      note: z.string().max(500).optional(),
    })
    .parse(req.body);
  res.json(await applications.respondToRequest(ctx(req), uuid.parse(req.params.id), body));
}

export async function withdraw(req, res) {
  const body = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {});
  res.json(await applications.withdrawApplication(ctx(req), uuid.parse(req.params.id), body));
}