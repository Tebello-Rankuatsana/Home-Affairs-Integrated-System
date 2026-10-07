import { z } from 'zod';
import * as appointments from '../services/appointmentService.js';
import { APPOINTMENT_STATUSES } from '../constants.js';
import { ctx } from './util.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export async function slots(req, res) {
  const q = z.object({ departmentCode: z.string().min(1), date }).parse(req.query);
  res.json(await appointments.getSlots(q.departmentCode, q.date));
}

export async function book(req, res) {
  const body = z
    .object({
      departmentCode: z.string().min(1),
      serviceCode: z.string().min(1).optional(),
      startsAt: z.string().datetime(),
    })
    .parse(req.body);
  res.status(201).json(await appointments.bookAppointment(ctx(req), body));
}

export async function list(req, res) {
  const q = z
    .object({ date: date.optional(), status: z.enum(APPOINTMENT_STATUSES).optional() })
    .parse(req.query);
  res.json(await appointments.listAppointments(ctx(req), q));
}

export async function cancel(req, res) {
  res.json(await appointments.cancelAppointment(ctx(req), uuid.parse(req.params.id)));
}

export async function checkIn(req, res) {
  res.json(await appointments.checkIn(ctx(req), uuid.parse(req.params.id)));
}

export async function complete(req, res) {
  res.json(await appointments.completeAppointment(ctx(req), uuid.parse(req.params.id)));
}

export async function noShow(req, res) {
  res.json(await appointments.markNoShow(ctx(req), uuid.parse(req.params.id)));
}

export async function queue(req, res) {
  const q = z.object({ date: date.optional() }).parse(req.query);
  res.json(await appointments.getQueue(ctx(req), q.date));
}

export async function queuePosition(req, res) {
  res.json(await appointments.getQueuePosition(ctx(req), uuid.parse(req.params.id)));
}

export async function callNext(req, res) {
  const body = z.object({ date: date.optional() }).parse(req.body ?? {});
  res.json(await appointments.callNext(ctx(req), body.date));
}