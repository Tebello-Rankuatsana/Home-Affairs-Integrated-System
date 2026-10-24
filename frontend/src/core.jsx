// Core store, icons, translations, shared UI kit, and the app shell.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import coatOfArms from '../images/coat-of-arms-of-lesotho-seeklogo.png';
import {
  api, asList, loadSession, normalizeDept, normalizeDoc, normalizeProfile,
  normalizeService, saveSession, setOnUnauthorized, setToken, getToken
} from './api.js';
import { humanize } from './format.js';

// Identity helpers
export const SELF_SERVICE = ['ID_APPLICATION', 'BIRTH_CERTIFICATE'];
export const hasFullId = (user) => !!user && !user.temporaryId;
export const canAccessService = (user, serviceCode) =>
  hasFullId(user) || SELF_SERVICE.includes(serviceCode);

// Icons
const ICONS = {
  check: <polyline points="20 6 9 17 4 12" />,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  'check-circle': <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  'x-circle': <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  dot: <circle cx="12" cy="12" r="5" fill="currentColor" />,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  'shield-check': <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>,
  'a-down': <><path d="m14 12 4 4 4-4" /><path d="M18 16V7" /><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16" /><path d="M3.304 13h6.392" /></>,
  'a-up': <><path d="m14 11 4-4 4 4" /><path d="M18 16V7" /><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16" /><path d="M3.304 13h6.392" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  'log-out': <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  layout: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  'user-plus': <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
  loader: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
  play: <polygon points="6 3 20 12 6 21 6 3" />,
  'arrow-right': <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  'credit-card': <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" /></>,
  'arrow-left': <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  accessibility: <><circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/></>,
  'volume-2': <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>,
  'volume-x': <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>,
  type: <><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>,
};

export const Icon = ({ name, size = 16, className = '' }) => (
  <svg className={'icon ' + className} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>
);

// Status vocabulary
export const FIELD_LABELS = {
  fullName: 'Full name',
  nationalId: 'National ID no.',
  dateOfBirth: 'Date of birth',
  citizenship: 'Citizenship',
  address: 'Address',
  phone: 'Phone',
};

export const STATUS = {
  submitted: ['Submitted', 'slate', 'send'],
  review: ['Under review', 'amber', 'clock'],
  info: ['More information needed', 'purple', 'alert'],
  approved: ['Approved', 'green', 'check-circle'],
  rejected: ['Rejected', 'red', 'x-circle'],
  withdrawn: ['Withdrawn', 'slate', 'x-circle'],
};

const API_STATUS = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'review',
  MORE_INFO_NEEDED: 'info',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
};

export const uiStatus = (s) => API_STATUS[s] ?? null;
export const statusLabel = (s) => STATUS[uiStatus(s)]?.[0] ?? humanize(s);
export const TERMINAL = ['APPROVED', 'REJECTED', 'WITHDRAWN'];

const APPT_STATUS = {
  BOOKED: ['Booked', 'green', 'calendar'],
  CHECKED_IN: ['Checked in', 'amber', 'clock'],
  COMPLETED: ['Completed', 'slate', 'check-circle'],
  CANCELLED: ['Cancelled', 'red', 'x-circle'],
  NO_SHOW: ['No-show', 'red', 'alert'],
};

// Translations
const T = {
  en: {
    hello: 'Hello', home: 'Dashboard', services: 'Services', apps: 'My applications',
    appts: 'Appointments', notes: 'Notifications', signout: 'Sign out',
    queue: 'Case queue', overview: 'Overview', users: 'Staff & roles',
    audit: 'Audit log', access: 'Access rules', lookup: 'Identity lookup',
    register: 'Register citizen', departments: 'Departments', about: 'About',
  },
  st: {
    hello: 'Lumela', home: 'Letlapa la ka', services: 'Litšebeletso',
    apps: 'Likopo tsa ka', appts: 'Likopano', notes: 'Litsebiso',
    signout: 'Tsoa', queue: 'Likopo tse emetseng', overview: 'Kakaretso',
    users: 'Basebelisi le likarolo', audit: 'Rekoto ea liketso',
    access: 'Melao ea phihlello', departments: 'Mafapha', about: 'Mabapi',
  },
};

// Nav for each role.
const NAV = {
  citizen: [
    ['/app', 'home', 'layout'],
    ['/app/services', 'services', 'grid'],
    ['/app/applications', 'apps', 'file'],
    ['/app/appointments', 'appts', 'calendar'],
    ['/app/notifications', 'notes', 'bell'],
    ['/app/departments', 'departments', 'building'],
    ['/app/about', 'about', 'info'],
  ],
  citizenTemp: [
    ['/app', 'home', 'layout'],
    ['/app/services', 'services', 'grid'],
    ['/app/applications', 'apps', 'file'],
    ['/app/notifications', 'notes', 'bell'],
    ['/app/about', 'about', 'info'],
  ],
  staff: [
    ['/app', 'queue', 'inbox'],
    ['/app/appointments', 'appts', 'calendar'],
    ['/app/departments', 'departments', 'building'],
  ],
  officer: [
    ['/app', 'lookup', 'search'],
    ['/app/register', 'register', 'user-plus'],
    ['/app/departments', 'departments', 'building'],
  ],
  admin: [
    ['/app', 'overview', 'layout'],
    ['/app/users', 'users', 'users'],
    ['/app/audit', 'audit', 'list'],
    ['/app/access', 'access', 'key'],
    ['/app/departments', 'departments', 'building'],
  ],
};

const ROLE_MAP = {
  CITIZEN: 'citizen',
  DEPARTMENT_STAFF: 'staff',
  HOME_AFFAIRS_OFFICER: 'officer',
  ADMIN: 'admin',
};

const toUser = (s) => {
  if (!s) return null;
  const role = ROLE_MAP[s.role] ?? 'citizen';
  const u = s.user ?? {};
  if (role === 'citizen') {
    return {
      id: u.id,
      role,
      firstName: u.firstName ?? '',
      name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.nationalId || 'Citizen',
      nid: u.nationalId,
      temporaryId: !!u.temporaryId,
      temporaryIdExpiresAt: u.temporaryIdExpiresAt ?? null,
    };
  }
  return {
    id: u.id,
    role,
    name: u.email ?? 'Staff',
    email: u.email,
    dept: s.department ?? u.departmentCode ?? null,
  };
};

// Store
const Ctx = createContext();
export const useApp = () => useContext(Ctx);

export function Provider({ children }) {
  const [session, setSession] = useState(() => {
    const s = loadSession();
    if (s?.token) setToken(s.token);
    return s;
  });
  const [lang, setLang] = useState('en');
  
  // Accessibility State
  const [textScale, setTextScale] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [services, setServices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [apps, setApps] = useState([]);
  const [appsReady, setAppsReady] = useState(false);
  const [notes, setNotes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const user = useMemo(() => toUser(session), [session]);

  const flash = useCallback((msg, kind = 'ok') => {
    clearTimeout(timer.current);
    setToast({ msg, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3500);
  }, []);

  const endSession = useCallback(() => {
    setToken(null);
    saveSession(null);
    setSession(null);
    setApps([]);
    setAppsReady(false);
    setNotes([]);
    setDocs([]);
    setProfile(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      endSession();
      flash('Your session has expired. Please sign in again.', 'error');
    });
  }, [endSession, flash]);

  useEffect(() => {
    let live = true;
    Promise.all([api.services(), api.departments()])
      .then(([s, d]) => {
        if (!live) return;
        setServices(asList(s).map(normalizeService));
        setDepartments(asList(d).map(normalizeDept));
      })
      .catch((e) => { if (live) flash(e.message, 'error'); })
      .finally(() => { if (live) setCatalogReady(true); });
    return () => { live = false; };
  }, [flash]);

  const refreshApps = useCallback(async () => {
    try { setApps(asList(await api.applications.list({ limit: 200 }))); }
    catch (e) { flash(e.message, 'error'); }
    finally { setAppsReady(true); }
  }, [flash]);

  const refreshNotes = useCallback(async () => {
    try { setNotes(asList(await api.notifications.list())); } catch { /* pages show their own error */ }
  }, []);

  const refreshDocs = useCallback(async () => {
    try { setDocs(asList(await api.documents.list()).map(normalizeDoc)); } catch { setDocs([]); }
  }, []);

  const refreshProfile = useCallback(async () => {
    try { setProfile(normalizeProfile(await api.me())); } catch { setProfile({}); }
  }, []);

  useEffect(() => {
    if (!user || !getToken()) return;
    if (user.role === 'citizen') { refreshApps(); refreshNotes(); refreshDocs(); refreshProfile(); }
    else if (user.role === 'staff' || user.role === 'admin') refreshApps();
  }, [user, refreshApps, refreshNotes, refreshDocs, refreshProfile]);

  const begin = (data) => {
    setToken(data.token);
    const s = {
      token: data.token,
      role: data.role,
      department: data.department ?? null,
      user: data.user,
    };
    saveSession(s);
    setSession(s);
  };

  const login = async (nationalId, code) => begin(await api.auth.verifyOtp(nationalId, code));
  const loginWithPassword = async (nationalId, password) =>
    begin(await api.auth.login(nationalId, password));
  const staffLogin = async (email, password) => begin(await api.auth.staffLogin(email, password));
  const registerCitizen = async (body) => begin(await api.auth.register(body));
  const requestRecovery = async (body) => api.auth.recover(body);

  const logout = async () => {
    try { await api.auth.logout(); } catch { /* token may already be invalid */ }
    endSession();
  };

  const markAllRead = async () => {
    try { await api.notifications.markAllRead(); await refreshNotes(); }
    catch (e) { flash(e.message, 'error'); }
  };

  const t = (k) => T[lang][k] || T.en[k] || k;
  const deptName = (code) => departments.find((d) => d.code === code)?.name ?? humanize(code ?? '');
  const svcByCode = (code) => services.find((s) => s.code === code);

  const v = {
    user, lang, setLang, 
    textScale, setTextScale, 
    highContrast, setHighContrast,
    dyslexiaFont, setDyslexiaFont,
    isSpeaking, setIsSpeaking,
    services, departments, catalogReady,
    apps, appsReady, notes, docs, profile, toast,
    t, deptName, svcByCode,
    login, loginWithPassword, registerCitizen, requestRecovery,
    staffLogin, logout, flash, markAllRead,
    refreshApps, refreshNotes, refreshDocs,
    hasFullId, canAccessService, SELF_SERVICE,
  };
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

// Shared UI kit
export const Badge = ({ s }) => {
  const [l, c, i] = STATUS[uiStatus(s)] ?? [humanize(s), 'slate', 'dot'];
  return <span className={'badge ' + c}><Icon name={i} size={13} /> {l}</span>;
};

export const ApptBadge = ({ s }) => {
  const [l, c, i] = APPT_STATUS[s] ?? [humanize(s), 'slate', 'dot'];
  return <span className={'badge ' + c}><Icon name={i} size={13} /> {l}</span>;
};

export const DocBadge = ({ d }) => {
  const rejected = /reject/i.test(d.decision ?? '');
  const verified = !rejected && (d.verifiedAt || /^verif/i.test(d.decision ?? ''));
  const [l, c, i] = rejected ? ['Rejected', 'red', 'x']
    : verified ? ['Verified', 'green', 'check']
      : ['Awaiting review', 'slate', 'clock'];
  return <span className={'badge ' + c}><Icon name={i} size={13} /> {l}</span>;
};

export const Card = ({ title, action, children }) => (
  <section className="card">
    {title && <div className="card-h"><h2>{title}</h2>{action}</div>}
    <div className="card-b">{children}</div>
  </section>
);

export const Field = ({ label, hint, error, children }) => (
  <div className="field">
    <label>
      <span className="field-label">{label}</span>
      {children}
    </label>
    {hint && <small>{hint}</small>}
    {error && <p className="err" role="alert">{error}</p>}
  </div>
);

export const Help = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="help">
      <button type="button" className="help-trigger" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="help" size={16} />{title ?? 'Need help?'}
      </button>
      {open && <div className="help-panel">{children}</div>}
    </div>
  );
};

export const Steps = ({ items, at }) => (
  <ol className="steps" aria-label="Progress">
    {items.map((x, i) => (
      <li key={x} className={i < at ? 'done' : i === at ? 'now' : ''}
        aria-current={i === at ? 'step' : undefined}>
        <span>{i < at ? <Icon name="check" size={16} /> : i + 1}</span>{x}
      </li>
    ))}
  </ol>
);

export const Page = ({ title, sub, children }) => (
  <><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}{children}</>
);

export const Loading = ({ text = 'Loading…' }) => (
  <p className="loading" role="status">
    <Icon name="loader" size={18} className="spin" />{text}
  </p>
);

// App shell
export function Shell() {
  const { 
    user, logout, t, lang, setLang, 
    textScale, setTextScale, highContrast, setHighContrast, 
    dyslexiaFont, setDyslexiaFont, isSpeaking, setIsSpeaking, 
    notes, toast, deptName 
  } = useApp();
  
  const location = useLocation();
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);

  const unread = notes.filter((n) => !n.readAt).length;
  const roleLabel = user.temporaryId
    ? 'Temporary ID holder'
    : {
        citizen: 'Citizen',
        officer: 'Home Affairs officer',
        admin: 'Administrator',
        staff: deptName(user.dept),
      }[user.role];
      
  const adjustTextScale = (delta) => setTextScale((scale) => Math.min(1, Math.max(-1, scale + delta)));
  const navItems = user.role === 'citizen' && user.temporaryId ? NAV.citizenTemp : NAV[user.role];

  // Text-to-Speech Logic
  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [setIsSpeaking]);

  // Stop speaking when navigating to a new page
  useEffect(() => { stopSpeaking(); }, [location.pathname, stopSpeaking]);

  const readPage = () => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser.');
      return;
    }
    stopSpeaking();
    const mainContent = document.getElementById('main');
    if (!mainContent) return;
    
    const text = mainContent.innerText;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const shellClasses = [
    'shell',
    textScale === 1 ? 'big' : textScale === -1 ? 'small' : '',
    highContrast ? 'high-contrast' : '',
    dyslexiaFont ? 'dyslexia-friendly' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClasses}>
      <a href="#main" className="skip">Skip to main content</a>
      <header className="hdr">
        <div className="brand">
          <span className="brand-crest"><img src={coatOfArms} alt="Coat of arms of Lesotho" /></span>
          <div className="brand-copy"><b>GovServe Lesotho</b><small>Integrated Government Services</small></div>
        </div>
        
        <div className="hdr-r">
          <div className="nav-section language">
            <button className="btn ghost light" type="button" onClick={() => setLang(lang === 'en' ? 'st' : 'en')} aria-label="Change language">
              <Icon name="globe" size={17} />{lang === 'en' ? 'Sesotho' : 'English'}
            </button>
          </div>

          <div className="nav-section accessibility-menu-container">
            <button 
              className={'btn ghost light ' + (accessMenuOpen ? 'active' : '')} 
              type="button" 
              onClick={() => setAccessMenuOpen(!accessMenuOpen)}
              aria-expanded={accessMenuOpen}
              aria-haspopup="true"
              aria-label="Accessibility options"
            >
              <Icon name="accessibility" size={20} />
              <span className="hide-on-mobile">Accessibility</span>
            </button>
            
            {accessMenuOpen && (
              <div className="access-dropdown" role="menu">
                <div className="access-group">
                  <span className="access-label">Text Size</span>
                  <div className="access-row">
                    <button className="btn sm" onClick={() => adjustTextScale(-1)} aria-label="Decrease text size"><Icon name="a-down" size={16} /> Smaller</button>
                    <button className="btn sm" onClick={() => adjustTextScale(1)} aria-label="Increase text size"><Icon name="a-up" size={16} /> Larger</button>
                  </div>
                </div>
                
                <div className="access-group">
                  <span className="access-label">Display</span>
                  <button className={'btn sm block ' + (highContrast ? 'primary' : '')} onClick={() => setHighContrast(!highContrast)} aria-pressed={highContrast}>
                    <Icon name="eye" size={16} /> High Contrast Mode
                  </button>
                  <button className={'btn sm block ' + (dyslexiaFont ? 'primary' : '')} onClick={() => setDyslexiaFont(!dyslexiaFont)} aria-pressed={dyslexiaFont}>
                    <Icon name="type" size={16} /> Dyslexia-Friendly Font
                  </button>
                </div>

                <div className="access-group">
                  <span className="access-label">Text to Speech</span>
                  {isSpeaking ? (
                    <button className="btn sm block danger" onClick={stopSpeaking}>
                      <Icon name="volume-x" size={16} /> Stop Reading
                    </button>
                  ) : (
                    <button className="btn sm block" onClick={readPage}>
                      <Icon name="volume-2" size={16} /> Read This Page
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {user.role === 'citizen' && (
            <div className="nav-section notice">
              <span className="notice-indicator">
                <Icon name="bell" size={15} />{unread} new
                {unread > 0 && <span className="notice-dot" aria-hidden="true"></span>}
              </span>
            </div>
          )}
          <div className="nav-section profile">
            <div className="user-pill">
              <span className="user-avatar" aria-hidden="true">{(user.name || '?').charAt(0).toUpperCase()}</span>
              <div className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{roleLabel}</span>
              </div>
            </div>
          </div>
          <div className="nav-section signout">
            <button className="btn ghost light signout-btn" type="button" onClick={logout}>
              <Icon name="log-out" size={16} /><span className="hide-on-mobile">{t('signout')}</span>
            </button>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className="side" aria-label="Main">
          {navItems.map(([to, k, ic]) => (
            <NavLink key={to} to={to} end={to === '/app'}>
              <Icon name={ic} size={18} />{t(k)}
            </NavLink>
          ))}
        </nav>
        <main id="main" tabIndex="-1"><Outlet /></main>
      </div>
      {toast && (
        <div className={'toast' + (toast.kind === 'error' ? ' error' : '')}
          role={toast.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={toast.kind === 'error' ? 'alert' : 'check-circle'} size={18} />{toast.msg}
        </div>
      )}
    </div>
  );
}