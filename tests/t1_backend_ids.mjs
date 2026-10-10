// T1 (backend): numeric BigInt ids must validate everywhere.
// PKs are BigInt autoincrement ("1", "42") — z.string().uuid() rejected every real id.
import { check, read, summary } from './assert.mjs';

console.log('T1: backend numeric-id validation');

const util = read('backend/controllers/util.js');
check('util.js exports dbId numeric schema', /export const dbId/.test(util) && /\\d\+/.test(util));

const controllers = {
  'applicationController.js': ['submit', 'list', 'get', 'changeStatus', 'assign', 'respond', 'withdraw'],
  'appointmentController.js': ['slots', 'book', 'list', 'cancel', 'checkIn', 'complete', 'noShow', 'queue', 'queuePosition', 'callNext'],
  'documentController.js': ['upload', 'list', 'attach', 'review', 'download', 'remove'],
  'paymentController.js': ['pay', 'list'],
  'notificationController.js': ['list', 'markRead', 'markAllRead'],
  'receiptController.js': ['list', 'get', 'verify'],
  'identityController.js': ['verify'],
  'citizenController.js': ['me', 'updateSelf', 'create', 'update'],
  'adminController.js': ['listUsers', 'createStaff', 'updateUser', 'getScopes', 'setScopes', 'createDepartment', 'createService', 'updateService'],
  'auditController.js': ['list'],
};
for (const [file, fns] of Object.entries(controllers)) {
  const src = read(`backend/controllers/${file}`);
  check(`${file}: no z.string().uuid() id validation`, !/z\.string\(\)\.uuid\(\)/.test(src));
  for (const fn of fns) check(`${file}: exports ${fn}`, new RegExp(`export async function ${fn}\\b`).test(src));
}

const app = read('backend/controllers/applicationController.js');
check('submit documentIds accept numeric ids', /documentIds: z\.array\(dbId|documentIds: z\.array\(uuid/.test(app) && !/z\.array\(z\.string\(\)\.uuid\(\)\)/.test(app));
const ident = read('backend/controllers/identityController.js');
check('identity verify applicationId numeric', /applicationId: dbId/.test(ident));
const audit = read('backend/controllers/auditController.js');
check('audit actorId numeric (polymorphic BigInt)', /actorId: z\.string\(\)\.regex/.test(audit));
check('audit supports offset + X-Total-Count', /offset/.test(audit) && /X-Total-Count/.test(audit));

process.exitCode = summary('T1') ? 1 : 0;
