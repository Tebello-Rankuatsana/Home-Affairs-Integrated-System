// T3 (backend): API contract — constants, OpenAPI vs router parity, RBAC roles.
import { check, read, summary } from './assert.mjs';
import * as C from '../backend/constants.js';
import { openapi } from '../backend/openapi.js';

console.log('T3: backend API contract');

// --- status machine consistency (ACID transitions depend on this) ---
check('STAFF_SETTABLE ⊆ APPLICATION_STATUSES',
  C.STAFF_SETTABLE_STATUSES.every((s) => C.APPLICATION_STATUSES.includes(s)));
for (const [from, tos] of Object.entries(C.STATUS_TRANSITIONS)) {
  check(`transition ${from} valid`, C.APPLICATION_STATUSES.includes(from) && tos.every((t) => C.APPLICATION_STATUSES.includes(t)));
}
check('terminal ⊆ statuses', C.TERMINAL_APPLICATION_STATUSES.every((s) => C.APPLICATION_STATUSES.includes(s)));
check('enums non-empty', C.PAYMENT_METHODS.length > 0 && C.DOCUMENT_TYPES.length > 0 && C.IDENTITY_FIELDS.length > 0 && C.APPOINTMENT_STATUSES.length > 0);

// --- router vs openapi parity ---
const routesSrc = read('backend/routes/index.js');
const mounted = new Set();
for (const m of routesSrc.matchAll(/router\.(get|post|patch|put|delete)\(\s*['`]([^'`]+)['`]/g)) {
  mounted.add(`${m[1].toUpperCase()} ${m[2].replace(/:([A-Za-z]+)/g, '{$1}')}`);
}
// app.js-level routes (not in routes/index.js)
for (const p of ['GET /health', 'GET /openapi.json']) mounted.add(p);
const documented = new Set();
for (const [path, ops] of Object.entries(openapi.paths)) {
  for (const method of Object.keys(ops)) documented.add(`${method.toUpperCase()} ${path}`);
}
const undocumented = [...mounted].filter((m) => !m.has?.('/docs') && !documented.has(m) && m !== 'GET /docs');
check(`all ${mounted.size} mounted routes documented`, undocumented.length === 0, undocumented.join('; '));

// --- no stale x-planned on mounted routes ---
const stale = [];
for (const [path, ops] of Object.entries(openapi.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (op?.['x-planned'] && mounted.has(`${method.toUpperCase()} ${path}`)) stale.push(`${method.toUpperCase()} ${path}`);
  }
}
check('no stale x-planned flags on live routes', stale.length === 0, stale.join('; '));

// --- roles referenced in docs exist in the system ---
const knownRoles = new Set(['CITIZEN', 'HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF', 'ADMIN', 'STAFF', 'CITIZEN (owner)', 'DEPARTMENT_STAFF (only if attached to an application of their department; audited)']);
const badRoles = [];
const collect = (node) => {
  if (Array.isArray(node)) {
    for (const r of node) if (typeof r === 'string' && !knownRoles.has(r)) badRoles.push(r);
  }
};
for (const ops of Object.values(openapi.paths)) {
  for (const op of Object.values(ops)) {
    const m = /Allowed roles:\*\* ([^.]+)\./.exec(op.description || '');
    if (m) collect(m[1].split(',').map((x) => x.trim()));
  }
}
check('documented roles are known', badRoles.length === 0, [...new Set(badRoles)].join(','));

// --- ids documented as numeric strings ---
check('openapi id example is numeric', JSON.stringify(openapi.components.schemas.Application).includes('"42"') || /"42"/.test(JSON.stringify(openapi)));

process.exitCode = summary('T3') ? 1 : 0;
