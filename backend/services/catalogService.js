import { prisma } from '../db.js';

export function listServices() {
  return prisma.serviceType.findMany({
    include: { department: { select: { code: true, name: true } } },
    orderBy: { name: 'asc' },
  });
}

export function listDepartments() {
  return prisma.department.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } });
}
