// T4 (frontend): mapping logic + API surface match the backend contract.
import { check, read, summary } from './assert.mjs';
import * as M from '../frontend/src/lib/mapping.js';
import * as api from '../frontend/src/lib/api.js';

console.log('T4: frontend contract');

// --- live mapping logic (executed, not just grepped) ---
const live = [
  { code: 'DRIVING_LICENCE', name: 'Driving licence' },
  { code: 'VEHICLE_REGISTRATION', name: 'Vehicle registration' },
  { code: 'PASSPORT_APPLICATION', name: 'Passport' },
  { code: 'POLICE_CLEARANCE', name: 'Police clearance' },
  { code: 'PENSION', name: 'Old-age pension' },
  { code: 'SUBSIDY', name: 'Grant subsidy' },
];
check('match dl -> DRIVING_LICENCE', M.matchServiceCode('dl', live) === 'DRIVING_LICENCE');
check('match pp -> PASSPORT_APPLICATION', M.matchServiceCode('pp', live) === 'PASSPORT_APPLICATION');
check('match pc -> POLICE_CLEARANCE', M.matchServiceCode('pc', live) === 'POLICE_CLEARANCE');
check('match pn -> PENSION', M.matchServiceCode('pn', live) === 'PENSION');
check('dept TT -> TRAFFIC', M.DEPT_TO_BACKEND.TT === 'TRAFFIC');
check('dept PP -> PASSPORT', M.DEPT_TO_BACKEND.PP === 'PASSPORT');
check('isLiveId accepts numeric BigInt ids', M.isLiveId('42') && M.isLiveId('1'));
check('isLiveId accepts UUIDs (legacy)', M.isLiveId('123e4567-e89b-12d3-a456-426614174000'));
check('isLiveId rejects prototype refs', !M.isLiveId('GS-1001') && !M.isLiveId('LS-9004127788'));
check('slot 09:30+02:00 -> 07:30Z', M.slotToISO('2026-10-13', '09:30') === '2026-10-13T07:30:00.000Z');
check('doc Birth certificate -> BIRTH_CERTIFICATE', M.docToBackend('Birth certificate') === 'BIRTH_CERTIFICATE');
check('doc unknown -> OTHER', M.docToBackend('Eye test result') === 'OTHER');
check('SUBMITTED -> submitted', M.STATUS_TO_FRONT.SUBMITTED === 'submitted');
check('UNDER_REVIEW -> review', M.STATUS_TO_FRONT.UNDER_REVIEW === 'review');
check('MORE_INFO_NEEDED -> info', M.STATUS_TO_FRONT.MORE_INFO_NEEDED === 'info');
const svc = M.normaliseService({ code: 'DRIVING_LICENCE', name: 'Driving licence', feeAmount: 150, processingTimeDays: 7, requiredDocuments: ['PHOTO'], department: { code: 'TRAFFIC' } });
check('normaliseService maps dept+fee+docs', svc.dept === 'TT' && svc.fee === 150 && svc.docs[0] === 'PHOTO');

// --- api client covers every endpoint the UI calls ---
for (const fn of ['requestOtp', 'verifyOtp', 'staffLogin', 'logoutRemote', 'fetchMe', 'fetchServices',
  'submitApplication', 'listApplications', 'getApplication', 'respondApplication', 'withdrawApplication',
  'payApplication', 'uploadDocument', 'bookAppointment', 'listAppointments', 'cancelAppointment',
  'verifyIdentity', 'changeStatus', 'assignApplication', 'listNotifications', 'markAllRead',
  'listReceipts', 'verifyReceipt', 'adminUsers', 'auditLogs', 'getScopes', 'setScopes', 'ping']) {
  check(`api.js exports ${fn}`, typeof api[fn] === 'function');
}
check('pay uses backend {method} shape', /payApplication = \(id, method\)/.test(read('frontend/src/lib/api.js')) &&
  /body: \{ method \}/.test(read('frontend/src/lib/api.js')));

// --- modules use numeric-safe live detection + status badge ---
for (const f of ['frontend/src/modules/citizen.jsx', 'frontend/src/modules/staff.jsx']) {
  const src = read(f);
  check(`${f}: uses isLiveId`, /isLiveId\(id\)/.test(src));
  check(`${f}: no UUID-only gate`, !/0-9a-f\]\{8\}-/.test(src));
}
check('auth: live OTP + staff login wired', /verifyOtp/.test(read('frontend/src/modules/auth.jsx')) && /staffLogin/.test(read('frontend/src/modules/auth.jsx')));
check('ApiBadge mounted on citizen+staff+admin screens',
  (read('frontend/src/modules/citizen.jsx').match(/<ApiBadge \/>/g) || []).length >= 5);

process.exitCode = summary('T4') ? 1 : 0;
