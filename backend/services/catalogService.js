import { prisma } from '../db.js';

// Prisma columns are departmentCode and departmentName, but the API contract
// exposes them as code and name. Also unwraps Decimal to number so the
// frontend can compare fee > 0 safely.
export async function listServices() {
  const rows = await prisma.serviceType.findMany({
    include: { department: { select: { departmentCode: true, departmentName: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((s) => ({
    id: String(s.serviceId),
    code: s.code,
    name: s.name,
    feeAmount: s.feeAmount !== null ? Number(s.feeAmount) : null,
    currency: s.currency ?? 'LSL',
    processingTimeDays: s.processingTimeDays ?? null,
    requiredDocuments: s.requiredDocuments ?? [],
    department: {
      code: s.department.departmentCode,
      name: s.department.departmentName,
    },
  }));
}

export async function listDepartments() {
  const rows = await prisma.department.findMany({
    select: { departmentCode: true, departmentName: true },
    orderBy: { departmentName: 'asc' },
  });
  return rows.map((d) => ({ code: d.departmentCode, name: d.departmentName }));
}