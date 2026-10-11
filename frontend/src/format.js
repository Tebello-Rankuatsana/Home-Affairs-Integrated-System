// src/format.js
// Presentation helpers. Kept dependency-free.

export const humanize = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

const pad = (n) => String(n).padStart(2, '0');
const toDate = (v) => (v instanceof Date ? v : new Date(v));

export const fmtDate = (v) => {
  if (!v) return '';
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const fmtTime = (v) => {
  if (!v) return '';
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDateTime = (v) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '');

export const todayISO = () => fmtDate(new Date());

// Currency comes from the service; backend uses LSL. Callers may pass a currency
// code, or omit it and get the 'M' abbreviation used elsewhere in the UI.
export const money = (n, currency = 'M') => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return `${currency} ${v.toFixed(2)}`;
};