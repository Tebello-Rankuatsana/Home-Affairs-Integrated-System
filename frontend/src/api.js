// The single network entry point for the whole app.
// Exposes api.* endpoints, session persistence, token management, and the
// normalizers that turn raw backend rows into what the pages consume.

const BASE = (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '');
const SESSION_KEY = 'govserve.session';

let token = null;
let onUnauthorized = null;

export const setToken = (t) => { token = t || null; };
export const getToken = () => token;
export const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

export const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
};

export const saveSession = (s) => {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.hint = body?.hint;
    this.issues = body?.issues;
  }
}

const safeParse = (t) => { try { return JSON.parse(t); } catch { return { error: t }; } };

async function request(method, path, { body, query, isForm } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (isForm) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try { res = await fetch(url, { method, headers, body: payload }); }
  catch {
    throw new ApiError(0, { error: 'Network error', hint: 'Is the backend running on the expected port?' });
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  // A 401 from /auth/* is just wrong credentials, not an expired session.
  const isAuthPath = path.startsWith('/auth/');
  if (res.status === 401 && onUnauthorized && !isAuthPath) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data ?? {});
  return data;
}

const get = (p, o) => request('GET', p, o);
const post = (p, b, o) => request('POST', p, { ...o, body: b });
const patch = (p, b, o) => request('PATCH', p, { ...o, body: b });
const put = (p, b, o) => request('PUT', p, { ...o, body: b });
const del = (p, o) => request('DELETE', p, o);
const postForm = (p, f, o) => request('POST', p, { ...o, body: f, isForm: true });

// Constants the modules import
export const HOME_AFFAIRS = 'HOME_AFFAIRS';

export const PAYMENT_METHODS = [
  ['MPESA', 'M-Pesa'],
  ['ECO-CASH', 'EcoCash'],
  ['CREDIT_CARD', 'Credit card'],
  ['DEBIT_CARD', 'Debit card'],
  ['BANK_TRANSFER', 'Bank transfer'],
  ['MOBILE_MONEY', 'Mobile money'],
  ['CASH', 'Cash at counter'],
];

export const DOC_DECISION = {
  verify: 'APPROVED',
  reject: 'REJECTED',
  resubmit: 'NEEDS_RESUBMISSION',
};

// Normalizes list-shaped responses so pages can safely .map over them
export const asList = (x) => {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.items)) return x.items;
  return [];
};

const pad = (n) => String(n).padStart(2, '0');
const iso10 = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const normalizeService = (s) => ({
  code: s.code,
  name: s.name,
  fee: s.feeAmount ?? 0,
  days: s.processingTimeDays ?? null,
  docs: s.requiredDocuments ?? [],
  dept: s.department?.code ?? null,
  currency: s.currency ?? 'LSL',
});

export const normalizeDept = (d) => ({ code: d.code, name: d.name });

export const normalizeProfile = (p) => p ? { ...p, dateOfBirth: iso10(p.dateOfBirth) } : null;

export const normalizeDoc = (d) => {
  if (!d) return d;
  return {
    id: d.id,
    type: d.type,
    name: d.originalName ?? d.name ?? 'document',
    originalName: d.originalName ?? d.name ?? 'document',
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    decision: d.decision ?? d.reviewDecision ?? null,
    verifiedAt: d.verifiedAt ?? null,
    createdAt: d.createdAt,
  };
};

export const normalizeAppt = (a) => {
  if (!a) return a;
  return {
    id: a.appointmentId ?? a.id,
    reference: a.reference,
    startsAt: a.startsAt,
    status: a.status,
    service: a.service?.name ?? a.serviceType?.name ?? null,
    serviceCode: a.service?.code ?? a.serviceType?.code ?? null,
    departmentCode: a.department?.departmentCode ?? a.department?.code ?? null,
    deptName: a.department?.departmentName ?? a.department?.name ?? null,
    visitor: a.citizen
      ? `${a.citizen.firstName ?? ''} ${a.citizen.lastName ?? ''}`.trim()
      : null,
    queueNumber: a.queueNumber ?? null,
    checkedInAt: a.checkedInAt ?? null,
  };
};

export const api = {
  auth: {
    requestOtp: (nationalId) => post('/auth/otp/request', { nationalId }),
    verifyOtp: (nationalId, code) => post('/auth/otp/verify', { nationalId, code }),
    staffLogin: (email, password) => post('/auth/staff/login', { email, password }),
    logout: () => post('/auth/logout', {}),
  },

  me: () => get('/me'),
  services: () => get('/services'),
  departments: () => get('/departments'),

  applications: {
    list: (query = {}) => get('/applications', { query }),
    get: (id) => get(`/applications/${id}`),
    submit: (body) => post('/applications', body),
    changeStatus: (id, status, note) =>
      patch(`/applications/${id}/status`, { status, ...(note ? { note } : {}) }),
    assign: (id, assign = true) => post(`/applications/${id}/assign`, { assign }),
    respond: (id, body) => post(`/applications/${id}/respond`, body),
    withdraw: (id) => post(`/applications/${id}/withdraw`, {}),
    pay: (id, method) => post(`/applications/${id}/pay`, { method }),
    attachDocument: (id, documentId) => post(`/applications/${id}/documents/${documentId}`, {}),
    reviewDocument: (id, documentId, decision, note) =>
      post(`/applications/${id}/documents/${documentId}/review`,
        { decision, ...(note ? { note } : {}) }),
  },

  documents: {
    list: () => get('/documents'),
    remove: (id) => del(`/documents/${id}`),
    upload: (file, type, applicationId) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      if (applicationId) fd.append('applicationId', applicationId);
      return postForm('/documents', fd);
    },
    download: async (id, suggestedName) => {
      const url = new URL(BASE + `/documents/${id}/download`, window.location.origin);
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new ApiError(res.status, {});
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : (suggestedName || 'download');
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(href);
    },
  },

  payments: { list: () => get('/payments') },

  appointments: {
    slots: (departmentCode, date) => get('/appointments/slots', { query: { departmentCode, date } }),
    book: (body) => post('/appointments', body),
    list: (query = {}) => get('/appointments', { query }),
    cancel: (id) => post(`/appointments/${id}/cancel`, {}),
    checkIn: (id) => post(`/appointments/${id}/check-in`, {}),
    complete: (id) => post(`/appointments/${id}/complete`, {}),
    noShow: (id) => post(`/appointments/${id}/no-show`, {}),
    queuePosition: (id) => get(`/appointments/${id}/queue-position`),
    queue: (date) => get('/queue', { query: date ? { date } : {} }),
    callNext: (date) => post('/queue/call-next', date ? { date } : {}),
  },

  notifications: {
    list: () => get('/notifications'),
    markRead: (id) => patch(`/notifications/${id}/read`, {}),
    markAllRead: () => patch('/notifications/read-all', {}),
  },

  receipts: {
    list: () => get('/receipts'),
    get: (id) => get(`/receipts/${id}`),
    verify: (receiptNumber) => get(`/receipts/verify/${receiptNumber}`),
  },

  identity: {
    verify: (body) => post('/identity/verify', body),
  },

  citizens: {
    create: (body) => post('/citizens', body),
    update: (nationalId, changes) => patch(`/citizens/${nationalId}`, changes),
  },

  admin: {
    users: (query = {}) => get('/admin/users', { query }),
    createStaff: (body) => post('/admin/users', body),
    updateUser: (id, changes) => patch(`/admin/users/${id}`, changes),
    createDepartment: (body) => post('/admin/departments', body),
    scopes: (code) => get(`/admin/departments/${code}/scopes`),
    setScopes: (code, fields) => put(`/admin/departments/${code}/scopes`, { fields }),
    createService: (body) => post('/admin/services', body),
    updateService: (code, body) => patch(`/admin/services/${code}`, body),
  },

  audit: (query = {}) => get('/audit-logs', { query }),
};