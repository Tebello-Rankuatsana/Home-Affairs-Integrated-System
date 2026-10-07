import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { HOME_AFFAIRS, IDENTITY_FIELDS } from '../constants.js';

const SAFE_USER = {
  id: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  department: { select: { code: true, name: true } },
};

function assertRoleDepartment(role, departmentCode) {
  if (role === 'ADMIN' && departmentCode) throw httpError(400, 'Admins do not belong to a department');
  if (role === 'HOME_AFFAIRS_OFFICER' && departmentCode !== HOME_AFFAIRS) {
    throw httpError(400, 'Home Affairs officers must belong to HOME_AFFAIRS');
  }
  if (role === 'DEPARTMENT_STAFF' && (!departmentCode || departmentCode === HOME_AFFAIRS)) {
    throw httpError(400, 'Department staff need a department other than HOME_AFFAIRS');
  }
}

async function departmentByCode(code) {
  if (!code) return null;
  const dept = await prisma.department.findUnique({ where: { code } });
  if (!dept) throw httpError(400, `Unknown department ${code}`);
  return dept;
}

export function listUsers({ role, departmentCode }) {
  const where = {};
  if (role) where.role = role;
  if (departmentCode) where.department = { code: departmentCode };
  return prisma.user.findMany({ where, select: SAFE_USER, orderBy: { createdAt: 'desc' } });
}

export async function createStaff(ctx, { email, password, role, departmentCode }) {
  assertRoleDepartment(role, departmentCode);
  const dept = await departmentByCode(departmentCode);

  const user = await prisma.user.create({
    data: {
      email,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      departmentId: dept?.id ?? null,
    },
    select: SAFE_USER,
  });

  await audit(ctx, {
    action: 'USER_CREATE',
    resourceType: 'User',
    resourceId: user.id,
    details: { role, departmentCode: departmentCode ?? null },
  });
  return user;
}

export async function updateUser(ctx, id, changes) {
  const target = await prisma.user.findUnique({
    where: { id },
    include: { department: true },
  });
  if (!target) throw httpError(404, 'User not found');
  if (id === ctx.user.id && changes.active === false) {
    throw httpError(400, 'You cannot deactivate your own account');
  }

  const data = {};

  if (target.role === 'CITIZEN') {
    if (Object.keys(changes).some((k) => k !== 'active')) {
      throw httpError(400, 'Only the active flag can be changed for citizens');
    }
  } else {
    const role = changes.role ?? target.role;
    const departmentCode =
      changes.departmentCode !== undefined
        ? changes.departmentCode
        : target.department?.code ?? null;

    if (changes.role !== undefined || changes.departmentCode !== undefined) {
      assertRoleDepartment(role, departmentCode);
      data.role = role;
      data.departmentId = (await departmentByCode(departmentCode))?.id ?? null;
    }
    if (changes.password) data.passwordHash = await bcrypt.hash(changes.password, 10);
  }

  if (changes.active !== undefined) data.active = changes.active;

  const user = await prisma.user.update({ where: { id }, data, select: SAFE_USER });
  await audit(ctx, {
    action: 'USER_UPDATE',
    resourceType: 'User',
    resourceId: id,
    details: { fieldsChanged: Object.keys(changes) },
  });
  return user;
}

export async function getScopes(departmentCode) {
  const dept = await departmentByCode(departmentCode);
  if (!dept) throw httpError(404, 'Unknown department');
  const scopes = await prisma.departmentFieldScope.findMany({ where: { departmentId: dept.id } });
  return {
    department: dept.code,
    fields: scopes.map((s) => s.field).sort(),
    availableFields: IDENTITY_FIELDS,
  };
}

export async function setScopes(ctx, departmentCode, fields) {
  if (departmentCode === HOME_AFFAIRS) {
    throw httpError(400, 'Home Affairs scopes cannot be changed');
  }
  const dept = await departmentByCode(departmentCode);
  if (!dept) throw httpError(404, 'Unknown department');

  const before = (
    await prisma.departmentFieldScope.findMany({ where: { departmentId: dept.id } })
  )
    .map((s) => s.field)
    .sort();
  const after = [...new Set(fields)].sort();

  await prisma.$transaction([
    prisma.departmentFieldScope.deleteMany({ where: { departmentId: dept.id } }),
    prisma.departmentFieldScope.createMany({
      data: after.map((field) => ({ departmentId: dept.id, field })),
    }),
  ]);

  await audit(ctx, {
    action: 'SCOPE_UPDATE',
    resourceType: 'Department',
    resourceId: dept.code,
    details: { before, after },
  });
  return { department: dept.code, fields: after };
}

export async function createDepartment(ctx, { code, name, ministry }) {
  const existing = await prisma.department.findUnique({ where: { code } });
  if (existing) throw httpError(409, 'A department with this code already exists');

  const dept = await prisma.department.create({
    data: { code, name, ministry: ministry ?? null },
    select: { code: true, name: true, ministry: true },
  });

  await audit(ctx, {
    action: 'DEPARTMENT_CREATE',
    resourceType: 'Department',
    resourceId: code,
  });
  return dept;
}

export async function createService(ctx, data) {
  const dept = await departmentByCode(data.departmentCode);

  const existing = await prisma.serviceType.findUnique({ where: { code: data.code } });
  if (existing) throw httpError(409, 'A service with this code already exists');

  const service = await prisma.serviceType.create({
    data: {
      code: data.code,
      name: data.name,
      departmentId: dept.id,
      requiredDocuments: data.requiredDocuments,
      feeAmount: data.feeAmount ?? null,
      currency: data.currency,
      processingTimeDays: data.processingTimeDays ?? null,
    },
    include: { department: { select: { code: true, name: true } } },
  });

  await audit(ctx, {
    action: 'SERVICE_CREATE',
    resourceType: 'ServiceType',
    resourceId: data.code,
  });
  return service;
}

export async function updateService(ctx, code, changes) {
  const existing = await prisma.serviceType.findUnique({ where: { code } });
  if (!existing) throw httpError(404, 'Service not found');

  const service = await prisma.serviceType.update({
    where: { code },
    data: changes,
    include: { department: { select: { code: true, name: true } } },
  });

  await audit(ctx, {
    action: 'SERVICE_UPDATE',
    resourceType: 'ServiceType',
    resourceId: code,
    details: { fieldsChanged: Object.keys(changes) },
  });
  return service;
}