import { z } from 'zod';
import * as applications from '../services/applicationService.js';
import { APPLICATION_STATUSES } from '../constants.js';
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
  const query = z.object({ status: z.enum(APPLICATION_STATUSES).optional() }).parse(req.query);
  res.json(await applications.listApplications(ctx(req), query));
}

export async function get(req, res) {
  res.json(await applications.getApplication(ctx(req), uuid.parse(req.params.id)));
}

export async function changeStatus(req, res) {
  const body = z
    .object({ status: z.enum(APPLICATION_STATUSES), note: z.string().max(500).optional() })
    .parse(req.body);
  res.json(await applications.changeStatus(ctx(req), uuid.parse(req.params.id), body));
}

export async function respond(req, res) {
  const body = z
    .object({ formData: z.record(z.any()).default({}), note: z.string().max(500).optional() })
    .parse(req.body);
  res.json(await applications.respondToRequest(ctx(req), uuid.parse(req.params.id), body));
}
