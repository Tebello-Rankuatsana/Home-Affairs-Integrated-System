// GovServe Lesotho — mapping between prototype mock shapes and live backend shapes.
// The backend is authoritative; these helpers only TRANSLATE, never bypass RBAC.
// Frontend mock ids (dl, pp, GS-1001) <-> backend codes (DRIVING_LICENCE, APP-XXXXXXXX, UUIDs).

// Frontend dept key -> backend departmentCode
export const DEPT_TO_BACKEND = {
  HA: 'HOME_AFFAIRS',
  TT: 'TRAFFIC',
  FN: 'FINANCE',
  PN: 'PENSION',
  PL: 'POLICE',
  PP: 'PASSPORT',
};
export const BACKEND_TO_DEPT = Object.fromEntries(
  Object.entries(DEPT_TO_BACKEND).map(([k, v]) => [v, k]),
);

// Best-effort frontend service id -> backend serviceCode fallback (used only when the
// live catalogue cannot be matched by name). The live catalogue from GET /services
// is always preferred — see matchServiceCode().
const SERVICE_FALLBACK = {
  id: 'NATIONAL_ID',
  dl: 'DRIVING_LICENCE',
  vr: 'VEHICLE_REGISTRATION',
  tx: 'SUBSIDY',
  pn: 'PENSION',
  pc: 'POLICE_CLEARANCE',
  pp: 'PASSPORT_APPLICATION',
};

export function matchServiceCode(frontendId, liveServices = []) {
  if (!liveServices.length) return SERVICE_FALLBACK[frontendId] || String(frontendId).toUpperCase();
  const needle = String(frontendId).toLowerCase();
  const keywords = {
    id: ['national', 'identity', 'id'],
    dl: ['driv', 'licen'],
    vr: ['vehicle', 'regist'],
    tx: ['tax', 'clearance', 'subsidy'],
    pn: ['pension', 'old-age'],
    pc: ['police', 'clearance'],
    pp: ['passport'],
  }[needle] || [needle];
  const hit = liveServices.find((s) =>
    keywords.some((k) => `${s.code} ${s.name}`.toLowerCase().includes(k)),
  );
  if (hit) return hit.code;
  const exact = liveServices.find((s) => s.code?.toLowerCase() === needle);
  return (exact || {}).code || SERVICE_FALLBACK[frontendId] || liveServices[0].code;
}

export function normaliseService(row) {
  // Backend: { serviceId/code, name, feeAmount, currency, processingTimeDays,
  //   requiredDocuments[], department: { code, name } }
  // Frontend: { id, dept, name, fee, days, docs }
  const dept = BACKEND_TO_DEPT[row?.department?.code] || BACKEND_TO_DEPT[row?.departmentCode] || 'HA';
  return {
    id: row.code || row.id,
    dept,
    name: row.name,
    fee: Number(row.feeAmount ?? 0),
    days: row.processingTimeDays ?? 7,
    docs: row.requiredDocuments ?? [],
    _code: row.code,
    _raw: row,
  };
}

// Backend SUBMITTED/... -> frontend submitted/review/info/approved/rejected
export const STATUS_TO_FRONT = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'review',
  MORE_INFO_NEEDED: 'info',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'rejected', // distinct terminal state; shown with withdrawn note
};
export const FRONT_TO_STATUS = {
  review: 'UNDER_REVIEW',
  approved: 'APPROVED',
  info: 'MORE_INFO_NEEDED',
  rejected: 'REJECTED',
};

export function normaliseApplication(row) {
  // List rows: { id, reference, status, service: { code, name }, createdAt }
  // Detail rows add: department, formData, documents[], missingDocuments[], receipts[], history[]
  return {
    liveId: row.id,
    ref: row.reference,
    status: row.status,
    frontStatus: STATUS_TO_FRONT[row.status] || 'submitted',
    serviceCode: row.service?.code,
    serviceName: row.service?.name,
    createdAt: row.createdAt,
    _raw: row,
  };
}

// Frontend doc labels -> backend DOCUMENT_TYPES
export const DOC_TO_BACKEND = {
  'birth certificate': 'BIRTH_CERTIFICATE',
  photograph: 'PHOTO',
  photo: 'PHOTO',
  'proof of residence': 'PROOF_OF_RESIDENCE',
  'proof of income': 'PROOF_OF_INCOME',
  'national id': 'NATIONAL_ID',
  'eye test result': 'OTHER',
  'vehicle papers': 'OTHER',
  'roadworthy certificate': 'OTHER',
  'employment record': 'OTHER',
  'fingerprint slip': 'OTHER',
};
export const docToBackend = (label) =>
  DOC_TO_BACKEND[String(label || '').toLowerCase().trim()] || 'OTHER';

// Live backend ids are BigInt PKs serialised as numeric strings ("1", "42").
// (Older docs said UUID — accept both so nothing breaks.)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isLiveId = (v) => typeof v === 'string' && (/^\d+$/.test(v) || UUID_RE.test(v));

// Frontend branch select has NO backend equivalent (location vs department).
// Branch is kept in formData; departmentCode is derived from the service.
export const BRANCHES = ['Maseru', 'Mafeteng', 'Leribe', 'Mohale’s Hoek', 'Qacha’s Nek'];

// Build an ISO datetime for POST /appointments from a date + HH:MM slot.
// Backend validates weekday, today..+30d, 08:00-16:00, 30-min grid, future time.
export function slotToISO(dateStr, slot) {
  // Lesotho is UTC+2; backend applies APPOINTMENT_UTC_OFFSET_MINUTES=120.
  return new Date(`${dateStr}T${slot}:00+02:00`).toISOString();
}

export function describeApiError(e) {
  if (!e) return 'Unknown error.';
  if (e.status === 0) return e.message;
  return `${e.message}${e.hint ? ` — ${e.hint}` : ''}`;
}
