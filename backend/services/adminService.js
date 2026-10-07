import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { HOME_AFFAIRS, IDENTITY_FIELDS } from '../constants.js';

const SAFE_STAFF = {
  staffId: true,
  email: true,
  firstName: true,
  lastName: true,
  employeeNumber: true,
  department: { select: { departmentCode: true, departmentName: true } },
};

const shape = (s) => ({
  id: String(s.staffId),
  email: s.email,
  firstName: s.firstName,
  lastName: s.lastName,
  employeeNumber: s.employeeNumber,
  department: s.department
    ? { code: s.department.departmentCode, name: s.department.departmentName }
    : null,
});

async function resolveDepartmentByCode(code) {
  if (!code) return null;
  const dept = await prisma.department.findUnique({ where: { departmentCode: code } });
  if (!dept) throw httpError(400, `Unknown department ${code}`);
  return dept;
}

async function resolveRoleByName(name) {
  const role = await prisma.role.findUnique({ where: { roleName: name } });
  if (!role) throw httpError(400, `Unknown role ${name}. Run the seed to create roles.`);
  return role;
}

async function defaultHomeAffairsDepartment() {
  return prisma.department.findUnique({ where: { departmentCode: HOME_AFFAIRS } });
}

function assertRoleDepartment(role, departmentCode) {
  if (role === 'ADMIN') return;
  if (role === 'HOME_AFFAIRS_OFFICER' && departmentCode !== HOME_AFFAIRS) {
    throw httpError(400, 'Home Affairs officers must belong to HOME_AFFAIRS');
  }
  if (role === 'DEPARTMENT_STAFF' && (!departmentCode || departmentCode === HOME_AFFAIRS)) {
    throw httpError(400, 'Department staff need a department other than HOME_AFFAIRS');
  }
}

export async function listUsers({ role, departmentCode }) {
  const where = {};
  if (departmentCode) where.department = { departmentCode };
  if (role) where.staffRoles = { some: { role: { roleName: role } } };

  const staff = await prisma.staff.findMany({ where, select: SAFE_STAFF, orderBy: { staffId: 'desc' } });
  return staff.map(shape);
}

export async function createStaff(ctx, { email, password, role, departmentCode, firstName, lastName }) {
  assertRoleDepartment(role, departmentCode);

  let dept = await resolveDepartmentByCode(departmentCode);
  if (role === 'ADMIN' && !dept) dept = await defaultHomeAffairsDepartment();
  if (!dept) throw httpError(400, 'Could not resolve a department for this user');

  const roleRow = await resolveRoleByName(role);

  const employeeNumber = `EMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const staff = await prisma.$transaction(async (tx) => {
    const created = await tx.staff.create({
      data: {
        email,
        firstName: firstName ?? 'Admin',
        lastName: lastName ?? 'User',
        employeeNumber,
        ministryId: dept.ministryId,
        departmentId: dept.departmentId,
        credentials: {
          create: {
            credentialType: 'PASSWORD',
            credentialHash: await bcrypt.hash(password, 10),
            activeStatus: true,
          },
        },
        staffRoles: {
          create: { roleId: roleRow.roleId },
        },
      },
      select: SAFE_STAFF,
    });
    return created;
  });

  await audit(ctx, {
    action: 'USER_CREATE',
    resourceType: 'staff',
    resourceId: staff.staffId,
    details: { role, departmentCode: dept.departmentCode },
  });
  return shape(staff);
}

export async function updateUser(ctx, id, changes) {
  const target = await prisma.staff.findUnique({
    where: { staffId: BigInt(id) },
    include: { department: true, staffRoles: { include: { role: true } } },
  });
  if (!target) throw httpError(404, 'User not found');
  if (String(target.staffId) === ctx.user.id && changes.active === false) {
    throw httpError(400, 'You cannot deactivate your own account');
  }

  const data = {};
  const roleName = changes.role ?? target.staffRoles[0]?.role?.roleName ?? 'DEPARTMENT_STAFF';
  const departmentCode =
    changes.departmentCode !== undefined
      ? changes.departmentCode
      : target.department?.departmentCode ?? null;

  if (changes.role !== undefined || changes.departmentCode !== undefined) {
    assertRoleDepartment(roleName, departmentCode);

    let dept = await resolveDepartmentByCode(departmentCode);
    if (roleName === 'ADMIN' && !dept) dept = await defaultHomeAffairsDepartment();
    data.departmentId = dept.departmentId;
    data.ministryId = dept.ministryId;
  }

  if (changes.firstName !== undefined) data.firstName = changes.firstName;
  if (changes.lastName !== undefined) data.lastName = changes.lastName;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.staff.update({
      where: { staffId: BigInt(id) },
      data,
      select: SAFE_STAFF,
    });

    if (changes.role !== undefined) {
      const roleRow = await resolveRoleByName(changes.role);
      await tx.staffRole.deleteMany({ where: { staffId: BigInt(id) } });
      await tx.staffRole.create({ data: { staffId: BigInt(id), roleId: roleRow.roleId } });
    }

    if (changes.password) {
      const existing = await tx.authenticationCredential.findFirst({
        where: { staffId: BigInt(id), activeStatus: true },
      });
      const newHash = await bcrypt.hash(changes.password, 10);
      if (existing) {
        await tx.authenticationCredential.update({
          where: { credentialId: existing.credentialId },
          data: { credentialHash: newHash },
        });
      } else {
        await tx.authenticationCredential.create({
          data: {
            staffId: BigInt(id),
            credentialType: 'PASSWORD',
            credentialHash: newHash,
            activeStatus: true,
          },
        });
      }
    }

    return row;
  });

  await audit(ctx, {
    action: 'USER_UPDATE',
    resourceType: 'staff',
    resourceId: id,
    details: { fieldsChanged: Object.keys(changes) },
  });
  return shape(updated);
}

export async function getScopes(departmentCode) {
  const dept = await resolveDepartmentByCode(departmentCode);
  if (!dept) throw httpError(404, 'Unknown department');
  const scopes = await prisma.departmentFieldScope.findMany({
    where: { departmentId: dept.departmentId },
  });
  return {
    department: dept.departmentCode,
    fields: scopes.map((s) => s.field).sort(),
    availableFields: IDENTITY_FIELDS,
  };
}

export async function setScopes(ctx, departmentCode, fields) {
  if (departmentCode === HOME_AFFAIRS) {
    throw httpError(400, 'Home Affairs scopes cannot be changed');
  }
  const dept = await resolveDepartmentByCode(departmentCode);
  if (!dept) throw httpError(404, 'Unknown department');

  const before = (
    await prisma.departmentFieldScope.findMany({ where: { departmentId: dept.departmentId } })
  )
    .map((s) => s.field)
    .sort();
  const after = [...new Set(fields)].sort();

  await prisma.$transaction([
    prisma.departmentFieldScope.deleteMany({ where: { departmentId: dept.departmentId } }),
    prisma.departmentFieldScope.createMany({
      data: after.map((field) => ({ departmentId: dept.departmentId, field })),
    }),
  ]);

  await audit(ctx, {
    action: 'SCOPE_UPDATE',
    resourceType: 'department',
    resourceId: dept.departmentCode,
    details: { before, after },
  });
  return { department: dept.departmentCode, fields: after };
}

export async function createDepartment(ctx, { code, name, ministryCode }) {
  const existing = await prisma.department.findUnique({ where: { departmentCode: code } });
  if (existing) throw httpError(409, 'A department with this code already exists');

  const ministry = await prisma.ministry.findUnique({ where: { ministryCode } });
  if (!ministry) throw httpError(400, `Unknown ministry ${ministryCode}`);

  const dept = await prisma.department.create({
    data: { departmentCode: code, departmentName: name, ministryId: ministry.ministryId },
    select: { departmentCode: true, departmentName: true },
  });

  await audit(ctx, {
    action: 'DEPARTMENT_CREATE',
    resourceType: 'department',
    resourceId: code,
  });
  return { code: dept.departmentCode, name: dept.departmentName };
}

export async function createService(ctx, data) {
  const dept = await resolveDepartmentByCode(data.departmentCode);

  const existing = await prisma.serviceType.findUnique({ where: { code: data.code } });
  if (existing) throw httpError(409, 'A service with this code already exists');

  const service = await prisma.serviceType.create({
    data: {
      code: data.code,
      name: data.name,
      departmentId: dept.departmentId,
      requiredDocuments: data.requiredDocuments,
      feeAmount: data.feeAmount ?? null,
      currency: data.currency,
      processingTimeDays: data.processingTimeDays ?? null,
    },
    include: { department: { select: { departmentCode: true, departmentName: true } } },
  });

  await audit(ctx, {
    action: 'SERVICE_CREATE',
    resourceType: 'service',
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
    include: { department: { select: { departmentCode: true, departmentName: true } } },
  });

  await audit(ctx, {
    action: 'SERVICE_UPDATE',
    resourceType: 'service',
    resourceId: code,
    details: { fieldsChanged: Object.keys(changes) },
  });
  return service;
}