import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { getJSON, setJSON, store, slotsKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { ACTIVE_APPOINTMENT_STATUSES, isStaff } from '../constants.js';

const A = config.appointments;
const OFFSET_MS = A.utcOffsetMinutes * 60_000;
const DAY_MS = 86_400_000;

const localDate = (d) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
const localDateTime = (d) =>
  new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
const parts = (dateStr) => dateStr.split('-').map(Number);

function dayRange(dateStr) {
  const [y, m, d] = parts(dateStr);
  const start = new Date(Date.UTC(y, m - 1, d) - OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function isWeekday(dateStr) {
  const [y, m, d] = parts(dateStr);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function slotStartsFor(dateStr) {
  if (!isWeekday(dateStr)) return [];
  const { start } = dayRange(dateStr);
  const out = [];
  for (let min = A.openHour * 60; min < A.closeHour * 60; min += A.slotMinutes) {
    out.push(new Date(start.getTime() + min * 60_000));
  }
  return out;
}

function assertBookableDate(dateStr) {
  const [y, m, d] = parts(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw httpError(400, 'Invalid date');
  }
  const today = localDate(new Date());
  const max = localDate(new Date(Date.now() + A.maxDaysAhead * DAY_MS));
  if (dateStr < today || dateStr > max) {
    throw httpError(400, `Choose a date between ${today} and ${max}`);
  }
}

const newReference = () => `APT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

async function getDepartment(code) {
  const dept = await prisma.department.findUnique({ where: { departmentCode: code } });
  if (!dept) throw httpError(404, 'Unknown department');
  return dept;
}

export async function getSlots(departmentCode, dateStr) {
  const dept = await getDepartment(departmentCode);
  assertBookableDate(dateStr);

  const key = slotsKey(dept.departmentCode, dateStr);
  let used = await getJSON(key);
  if (!used) {
    const { start, end } = dayRange(dateStr);
    const booked = await prisma.appointment.findMany({
      where: {
        departmentId: dept.departmentId,
        startsAt: { gte: start, lt: end },
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
      },
      select: { startsAt: true },
    });
    used = {};
    for (const b of booked) {
      const k = b.startsAt.toISOString();
      used[k] = (used[k] ?? 0) + 1;
    }
    await setJSON(key, used, A.slotCacheTtlSeconds);
  }

  const now = Date.now();
  return {
    department: dept.departmentCode,
    date: dateStr,
    slotMinutes: A.slotMinutes,
    slots: slotStartsFor(dateStr).map((s) => {
      const iso = s.toISOString();
      const available = Math.max(0, A.capacityPerSlot - (used[iso] ?? 0));
      return { startsAt: iso, available, bookable: available > 0 && s.getTime() > now };
    }),
  };
}

export async function bookAppointment(ctx, { departmentCode, serviceCode, startsAt }) {
  const dept = await getDepartment(departmentCode);
  const start = new Date(startsAt);
  const dateStr = localDate(start);
  assertBookableDate(dateStr);

  if (!slotStartsFor(dateStr).some((s) => s.getTime() === start.getTime())) {
    throw httpError(400, 'That is not a valid appointment slot');
  }
  if (start.getTime() <= Date.now()) throw httpError(400, 'That time has already passed');

  let service = null;
  if (serviceCode) {
    service = await prisma.serviceType.findUnique({ where: { code: serviceCode } });
    if (!service || service.departmentId !== dept.departmentId) {
      throw httpError(400, 'That service is not offered by this department');
    }
  }

  const citizenId = BigInt(ctx.user.id);
  const iso = start.toISOString();
  const { start: dayStart, end: dayEnd } = dayRange(dateStr);

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`slot:${dept.departmentId}:${iso}`}))`;

    const taken = await tx.appointment.count({
      where: {
        departmentId: dept.departmentId,
        startsAt: start,
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
      },
    });
    if (taken >= A.capacityPerSlot) throw httpError(409, 'That time slot is full');

    const clash = await tx.appointment.findFirst({
      where: {
        citizenId,
        departmentId: dept.departmentId,
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { in: ['BOOKED', 'CHECKED_IN'] },
      },
    });
    if (clash) throw httpError(409, 'You already have an appointment with this department that day');

    return tx.appointment.create({
      data: {
        reference: newReference(),
        citizenId,
        departmentId: dept.departmentId,
        serviceId: service?.serviceId ?? null,
        startsAt: start,
      },
    });
  });

  await store.del(slotsKey(dept.departmentCode, dateStr));
  await audit(ctx, {
    action: 'APPOINTMENT_BOOK',
    resourceType: 'appointment',
    resourceId: appointment.appointmentId,
  });
  await notify(citizenId, {
    type: 'APPOINTMENT_BOOKED',
    messageKey: 'appointment.booked',
    vars: {
      reference: appointment.reference,
      department: dept.departmentName,
      when: localDateTime(start),
    },
  });
  return {
    id: String(appointment.appointmentId),
    reference: appointment.reference,
    department: dept.departmentCode,
    startsAt: iso,
    status: appointment.status,
  };
}

export async function listAppointments(ctx, { date, status }) {
  const { user } = ctx;
  const where = status ? { status } : {};

  if (user.type === 'CITIZEN') {
    where.citizenId = BigInt(user.id);
  } else if (isStaff(user)) {
    const staff = await prisma.staff.findUnique({
      where: { staffId: BigInt(user.id) },
      select: { departmentId: true },
    });
    where.departmentId = staff.departmentId;
  }

  if (date) {
    const { start, end } = dayRange(date);
    where.startsAt = { gte: start, lt: end };
  }

  return prisma.appointment.findMany({
    where,
    include: isStaff(user)
      ? {
          department: { select: { departmentCode: true, departmentName: true } },
          service: { select: { code: true, name: true } },
          citizen: { select: { firstName: true, lastName: true } },
        }
      : {
          department: { select: { departmentCode: true, departmentName: true } },
          service: { select: { code: true, name: true } },
        },
    orderBy: { startsAt: 'asc' },
  });
}

async function loadFor(ctx, id) {
  const appt = await prisma.appointment.findUnique({
    where: { appointmentId: BigInt(id) },
    include: { citizen: true, department: true },
  });
  if (!appt) throw httpError(404, 'Appointment not found');

  const { user } = ctx;
  const allowed =
    (user.type === 'CITIZEN' && String(appt.citizenId) === user.id) ||
    (isStaff(user) && appt.department.departmentCode === user.departmentCode);
  if (!allowed) throw httpError(404, 'Appointment not found');
  return appt;
}

export async function cancelAppointment(ctx, id) {
  const appt = await loadFor(ctx, id);
  if (appt.status !== 'BOOKED') throw httpError(409, `A ${appt.status} appointment cannot be cancelled`);
  if (appt.startsAt.getTime() <= Date.now()) throw httpError(409, 'This appointment has already started');

  await prisma.appointment.update({
    where: { appointmentId: appt.appointmentId },
    data: { status: 'CANCELLED', updatedAt: new Date() },
  });
  await store.del(slotsKey(appt.department.departmentCode, localDate(appt.startsAt)));
  await audit(ctx, {
    action: 'APPOINTMENT_CANCEL',
    resourceType: 'appointment',
    resourceId: appt.appointmentId,
  });
  await notify(appt.citizenId, {
    type: 'APPOINTMENT_CANCELLED',
    messageKey: 'appointment.cancelled',
    vars: { reference: appt.reference },
  });
  return { id: String(appt.appointmentId), status: 'CANCELLED' };
}

export async function checkIn(ctx, id) {
  const appt = await loadFor(ctx, id);
  if (appt.status !== 'BOOKED') throw httpError(409, `A ${appt.status} appointment cannot be checked in`);
  const dateStr = localDate(appt.startsAt);
  if (!config.demoMode && dateStr !== localDate(new Date())) {
    throw httpError(409, 'Check-in is only possible on the day of the appointment');
  }

  const { start, end } = dayRange(dateStr);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${appt.departmentId}:${dateStr}`}))`;
    const fresh = await tx.appointment.findUnique({ where: { appointmentId: appt.appointmentId } });
    if (fresh.status !== 'BOOKED') throw httpError(409, 'Already checked in');

    const numbered = await tx.appointment.findMany({
      where: {
        departmentId: appt.departmentId,
        startsAt: { gte: start, lt: end },
        queueNumber: { not: null },
      },
      select: { queueNumber: true },
    });
    const next = numbered.reduce((max, a) => Math.max(max, a.queueNumber ?? 0), 0) + 1;
    return tx.appointment.update({
      where: { appointmentId: appt.appointmentId },
      data: { status: 'CHECKED_IN', queueNumber: next, checkedInAt: new Date(), updatedAt: new Date() },
    });
  });

  await audit(ctx, {
    action: 'APPOINTMENT_CHECK_IN',
    resourceType: 'appointment',
    resourceId: appt.appointmentId,
  });
  await notify(appt.citizenId, {
    type: 'QUEUE_NUMBER',
    messageKey: 'queue.checkedIn',
    vars: { department: appt.department.departmentName, queueNumber: updated.queueNumber },
  });
  return { id: String(appt.appointmentId), status: updated.status, queueNumber: updated.queueNumber };
}

export async function completeAppointment(ctx, id) {
  const appt = await loadFor(ctx, id);
  if (appt.status !== 'CHECKED_IN') {
    throw httpError(409, 'Only checked-in appointments can be completed');
  }
  await prisma.appointment.update({
    where: { appointmentId: appt.appointmentId },
    data: { status: 'COMPLETED', updatedAt: new Date() },
  });
  await audit(ctx, {
    action: 'APPOINTMENT_COMPLETE',
    resourceType: 'appointment',
    resourceId: appt.appointmentId,
  });
  return { id: String(appt.appointmentId), status: 'COMPLETED' };
}

export async function markNoShow(ctx, id) {
  const appt = await loadFor(ctx, id);
  if (appt.status !== 'BOOKED') {
    throw httpError(409, 'Only booked appointments can be marked as no-show');
  }
  if (!config.demoMode && appt.startsAt.getTime() > Date.now()) {
    throw httpError(409, 'The appointment time has not been reached yet');
  }
  await prisma.appointment.update({
    where: { appointmentId: appt.appointmentId },
    data: { status: 'NO_SHOW', updatedAt: new Date() },
  });
  await store.del(slotsKey(appt.department.departmentCode, localDate(appt.startsAt)));
  await audit(ctx, {
    action: 'APPOINTMENT_NO_SHOW',
    resourceType: 'appointment',
    resourceId: appt.appointmentId,
  });
  await notify(appt.citizenId, {
    type: 'APPOINTMENT_NO_SHOW',
    messageKey: 'appointment.noShow',
    vars: { reference: appt.reference },
  });
  return { id: String(appt.appointmentId), status: 'NO_SHOW' };
}

export async function getQueue(ctx, dateStr) {
  const date = dateStr ?? localDate(new Date());
  const { start, end } = dayRange(date);

  const staff = await prisma.staff.findUnique({
    where: { staffId: BigInt(ctx.user.id) },
    select: { departmentId: true },
  });

  const waiting = await prisma.appointment.findMany({
    where: {
      departmentId: staff.departmentId,
      startsAt: { gte: start, lt: end },
      status: 'CHECKED_IN',
    },
    include: { citizen: { select: { firstName: true, lastName: true } } },
    orderBy: { queueNumber: 'asc' },
  });

  return {
    date,
    waiting: waiting.map((a) => ({
      id: String(a.appointmentId),
      queueNumber: a.queueNumber,
      citizen: `${a.citizen.firstName} ${a.citizen.lastName}`.trim(),
      checkedInAt: a.checkedInAt,
      reference: a.reference,
    })),
  };
}

export async function getQueuePosition(ctx, id) {
  const appt = await loadFor(ctx, id);
  if (appt.status !== 'CHECKED_IN') {
    return {
      status: appt.status,
      startsAt: appt.startsAt,
      queueNumber: null,
      peopleAhead: null,
      estimatedWaitMinutes: null,
    };
  }
  const { start, end } = dayRange(localDate(appt.startsAt));
  const peopleAhead = await prisma.appointment.count({
    where: {
      departmentId: appt.departmentId,
      startsAt: { gte: start, lt: end },
      status: 'CHECKED_IN',
      queueNumber: { lt: appt.queueNumber },
    },
  });
  return {
    status: appt.status,
    queueNumber: appt.queueNumber,
    peopleAhead,
    estimatedWaitMinutes: peopleAhead * A.avgServiceMinutes,
  };
}

export async function callNext(ctx, dateStr) {
  const date = dateStr ?? localDate(new Date());
  const { start, end } = dayRange(date);

  const staff = await prisma.staff.findUnique({
    where: { staffId: BigInt(ctx.user.id) },
    select: { departmentId: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${staff.departmentId}:${date}`}))`;

    const waiting = await tx.appointment.findMany({
      where: {
        departmentId: staff.departmentId,
        startsAt: { gte: start, lt: end },
        status: 'CHECKED_IN',
      },
      include: { citizen: { select: { firstName: true, lastName: true } } },
      orderBy: { queueNumber: 'asc' },
    });

    if (waiting.length === 0) throw httpError(404, 'Nobody is waiting in the queue');

    const [current, nextUp] = waiting;
    await tx.appointment.update({
      where: { appointmentId: current.appointmentId },
      data: { status: 'COMPLETED', updatedAt: new Date() },
    });
    return { current, nextUp };
  });

  await audit(ctx, {
    action: 'QUEUE_CALL_NEXT',
    resourceType: 'appointment',
    resourceId: result.current.appointmentId,
  });

  await notify(result.current.citizenId, {
    type: 'QUEUE_CALLED',
    messageKey: 'queue.called',
    vars: { queueNumber: result.current.queueNumber, department: result.current.departmentId },
  });

  if (result.nextUp) {
    await notify(result.nextUp.citizenId, {
      type: 'QUEUE_NEXT',
      messageKey: 'queue.next',
      vars: { department: result.nextUp.departmentId },
    });
  }

  return {
    called: {
      id: String(result.current.appointmentId),
      queueNumber: result.current.queueNumber,
      citizen: `${result.current.citizen.firstName} ${result.current.citizen.lastName}`.trim(),
    },
    next: result.nextUp
      ? {
          id: String(result.nextUp.appointmentId),
          queueNumber: result.nextUp.queueNumber,
          citizen: `${result.nextUp.citizen.firstName} ${result.nextUp.citizen.lastName}`.trim(),
        }
      : null,
  };
}