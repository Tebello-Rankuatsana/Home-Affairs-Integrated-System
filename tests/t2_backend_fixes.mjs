// T2 (backend): functionality/efficiency fixes are present and schema-shaped.
import { check, read, summary } from './assert.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './assert.mjs';

console.log('T2: backend functionality fixes');

// --- notifications (was 500 on every call) ---
const n = read('backend/services/notificationService.js');
check('notifications: citizen lookup by citizenId (+profile)', /prisma\.citizen\.findUnique\(\{\s*where:\s*\{\s*citizenId/m.test(n) && /include:\s*\{\s*profile:\s*true/.test(n));
check('notifications: no where:{id} / where:{userId}', !/where:\s*\{\s*(id|userId)\s*[:}]/.test(n));
check('notifications: update by notificationId', /where:\s*\{\s*notificationId/.test(n));
check('notifications: contact via Citizen phone/contactEmail', /citizen\.phone/.test(n) && /citizen\.contactEmail/.test(n));
check('notifications: list returns string id', /id: String\(notificationId\)/.test(n));
check('notifications: BigInt stringified before enqueue', /enqueueDelivery\(String\(n\.notificationId\)\)/.test(n));

// --- queue consolidation ---
const q = read('backend/services/queue.js');
const s = read('backend/server.js');
check('services/queue: BigInt-safe enqueue', /String\(notificationId\)/.test(q));
check('server.js: starts the REAL worker', /from '\.\/services\/queue\.js'/.test(s));
check('orphan routes/auth.js deleted', !existsSync(join(ROOT, 'backend', 'routes', 'auth.js')));

// --- routes: citizen slots + public catalogue ---
const r = read('backend/routes/index.js');
check('slots allow CITIZEN', /appointments\/slots[\s\S]{0,160}CITIZEN/.test(r));
check('catalogue mounted BEFORE authenticate (public)', r.indexOf("router.get('/services'") < r.indexOf('router.use(authenticate)'));

// --- scopes cache invalidation ---
const c = read('backend/cache.js');
const adm = read('backend/services/adminService.js');
check('cache: scope version in identity key', /identity:v\$\{scopeVersion\}/.test(c));
check('cache: bumpScopeVersion exported', /export function bumpScopeVersion/.test(c));
check('setScopes: bumps version after $transaction', /bumpScopeVersion\(\)/.test(adm));

// --- suspend/restore without schema change ---
check('updateUser: suspend via credentials activeStatus', /authenticationCredential\.updateMany/.test(adm) && /activeStatus: false/.test(adm));
check('updateUser: self-deactivate still blocked', /cannot deactivate your own account/.test(adm));

// --- audit filters ---
const a = read('backend/services/auditService.js');
check('audit: resource/date/offset filters + count', /resourceType/.test(a) && /from/.test(a) && /skip: offset/.test(a) && /countAuditLogs/.test(a));

// --- runnable scripts ---
const pkg = JSON.parse(read('backend/package.json'));
check('backend has dev/start/worker/db:seed scripts', Boolean(pkg.scripts?.dev && pkg.scripts?.start && pkg.scripts?.worker && pkg.scripts?.['db:seed']));

process.exitCode = summary('T2') ? 1 : 0;
