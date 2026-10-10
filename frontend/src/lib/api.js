// GovServe Lesotho — API client (frontend-only integration layer).
// Talks to the EXISTING Express backend without changing it.
// Base URL: VITE_API_URL (e.g. http://localhost:3000). All paths are root-level
// (/auth/otp/request, /services, /applications, ...) — there is no /api prefix.
// Strategy: live-first with graceful fallback. Every helper throws a normalised
// ApiError { status, error, hint } so UI modules can fall back to prototype mock data.

const BASE = (import.meta.env?.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'govserve_token';
const USER_KEY = 'govserve_user';

export const apiBase = () => BASE;
export const isLiveMode = () => Boolean(getToken());

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setSession(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* private mode — ignore */ }
}
export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearSession() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(status, error, hint) {
    super(error || `Request failed (${status})`);
    this.status = status;
    this.hint = hint;
  }
}

function hintFor(status, fallback) {
  if (fallback) return fallback;
  if (status === 401) return 'Your session expired or the code is wrong. Sign in again.';
  if (status === 403) return 'Your role is not allowed to do this. The attempt was logged.';
  if (status === 404) return 'Not found — it may belong to another department or user.';
  if (status === 409) return 'Conflicts with the current state (e.g. already assigned, terminal status, slot taken).';
  if (status === 402) return 'Payment could not be completed. Try another method.';
  if (status === 413) return 'File is too large. Use PDF, JPG or PNG up to 5 MB.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  return 'Check your connection and try again.';
}

export async function apiFetch(path, { method = 'GET', body, formData, auth = true } = {}) {
  const headers = {};
  let payload;
  if (formData) {
    payload = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is it running at ' + BASE + '?', 'Start the backend (npm run dev) or keep using prototype data.');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = data?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, err, data?.hint || hintFor(res.status));
  }
  return data;
}

export async function ping() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error('unhealthy');
  return res.json();
}

// ---- Auth ----
export const requestOtp = (nationalId) =>
  apiFetch('/auth/otp/request', { method: 'POST', body: { nationalId }, auth: false });
export const verifyOtp = (nationalId, code) =>
  apiFetch('/auth/otp/verify', { method: 'POST', body: { nationalId, code }, auth: false });
export const staffLogin = (email, password) =>
  apiFetch('/auth/staff/login', { method: 'POST', body: { email, password }, auth: false });
export const logoutRemote = () =>
  getToken() ? apiFetch('/auth/logout', { method: 'POST' }).catch(() => ({})) : Promise.resolve({});

// ---- Citizen ----
export const fetchMe = () => apiFetch('/me');
export const fetchServices = () => apiFetch('/services');
export const fetchDepartments = () => apiFetch('/departments');
export const submitApplication = ({ serviceCode, formData = {}, documentIds = [] }) =>
  apiFetch('/applications', { method: 'POST', body: { serviceCode, formData, documentIds } });
export const listApplications = (params = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  return apiFetch(`/applications${s ? `?${s}` : ''}`);
};
export const getApplication = (id) => apiFetch(`/applications/${id}`);
export const respondApplication = (id, { formData = {}, note } = {}) =>
  apiFetch(`/applications/${id}/respond`, { method: 'POST', body: { formData, note } });
export const withdrawApplication = (id) => apiFetch(`/applications/${id}/withdraw`, { method: 'POST', body: {} });
export const payApplication = (id, method) =>
  apiFetch(`/applications/${id}/pay`, { method: 'POST', body: { method } });
export const uploadDocument = (file, type, applicationId) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  if (applicationId) fd.append('applicationId', applicationId);
  return apiFetch('/documents', { method: 'POST', formData: fd });
};
export const listDocuments = () => apiFetch('/documents');

// ---- Appointments ----
export const fetchSlots = (departmentCode, date) =>
  apiFetch(`/appointments/slots?departmentCode=${encodeURIComponent(departmentCode)}&date=${encodeURIComponent(date)}`);
export const bookAppointment = ({ departmentCode, serviceCode, startsAt }) =>
  apiFetch('/appointments', { method: 'POST', body: { departmentCode, serviceCode, startsAt } });
export const listAppointments = () => apiFetch('/appointments');
export const cancelAppointment = (id) => apiFetch(`/appointments/${id}/cancel`, { method: 'POST', body: {} });
export const queuePosition = (id) => apiFetch(`/appointments/${id}/queue-position`);

// ---- Staff ----
export const verifyIdentity = ({ applicationId, nationalId }) =>
  apiFetch('/identity/verify', { method: 'POST', body: applicationId ? { applicationId } : { nationalId } });
export const changeStatus = (id, status, note) =>
  apiFetch(`/applications/${id}/status`, { method: 'PATCH', body: { status, note } });
export const assignApplication = (id, assign = true) =>
  apiFetch(`/applications/${id}/assign`, { method: 'POST', body: { assign } });

// ---- Notifications / receipts ----
export const listNotifications = () => apiFetch('/notifications');
export const markAllRead = () => apiFetch('/notifications/read-all', { method: 'PATCH' });
export const listReceipts = () => apiFetch('/receipts');
export const verifyReceipt = (receiptNumber) =>
  apiFetch(`/receipts/verify/${encodeURIComponent(receiptNumber)}`, { auth: false });

// ---- Admin (read-only from citizen/staff UI; full use needs ADMIN token) ----
export const adminUsers = () => apiFetch('/admin/users');
export const auditLogs = (params = { limit: 100 }) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return apiFetch(`/audit-logs${s ? `?${s}` : ''}`);
};
export const getScopes = (code) => apiFetch(`/admin/departments/${encodeURIComponent(code)}/scopes`);
export const setScopes = (code, fields) =>
  apiFetch(`/admin/departments/${encodeURIComponent(code)}/scopes`, { method: 'PUT', body: { fields } });
