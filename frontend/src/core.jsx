// CORE: data, translations (EN / Sesotho), global store, shared UI kit and app shell.
import { createContext, useCallback, useContext, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearSession, logoutRemote } from './lib/api.js';
import { BACKEND_TO_DEPT } from './lib/mapping.js';

// Map a live backend session to the prototype user shape so ALL existing screens
// (CitizenHome, Queue, guards, ACCESS matrix) keep working unchanged.
export function toFrontUser(stored) {
  if (!stored) return null;
  const role = stored.backendRole || stored.role;
  if (role === 'CITIZEN' || role === 'citizen') {
    const name = stored.name || [stored.firstName, stored.lastName].filter(Boolean).join(' ') || 'Citizen';
    return {
      id: stored.id || stored.nationalId, loginId: stored.nationalId, role: 'citizen',
      name, nid: stored.nationalId, dob: stored.dateOfBirth || '', citizenship: stored.citizenship || 'Mosotho',
      address: stored.address || '', phone: stored.phone || '', onFile: stored.onFile || [], active: true,
      _live: true,
    };
  }
  if (role === 'ADMIN' || role === 'admin') {
    return {
      id: stored.id || stored.email, loginId: stored.email || 'ADM-01', role: 'admin',
      name: stored.name || stored.email || 'Administrator', dept: 'HA', active: true, _live: true,
    };
  }
  // DEPARTMENT_STAFF / HOME_AFFAIRS_OFFICER -> staff
  const dept = BACKEND_TO_DEPT[stored.department || stored.departmentCode] || stored.dept || 'TT';
  return {
    id: stored.id || stored.email, loginId: stored.email || stored.loginId, role: 'staff',
    name: stored.name || stored.email || 'Staff', dept, active: true,
    backendRole: role, _live: true,
  };
}

/* ---------- Icons (inline SVG, no extra dependency; stroke follows currentColor) ---------- */
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
};
export const Icon = ({ name, size = 16, className = '' }) => (
  <svg className={'icon ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>
);

/* ---------- Domain data (from the HCI report: Home Affairs + 5 departments) ---------- */
export const DEPTS = { HA: 'Home Affairs', TT: 'Traffic & Transport', FN: 'Finance', PN: 'Pension Services', PL: 'Police', PP: 'Passport Services' };
export const FIELDS = { name: 'Full name', nid: 'National ID no.', dob: 'Date of birth', citizenship: 'Citizenship', address: 'Address', phone: 'Phone' };
// Data minimisation: the ONLY identity fields each department may receive from Home Affairs.
export const ACCESS = {
  HA: Object.keys(FIELDS), TT: ['name', 'nid', 'dob'], FN: ['name', 'nid'],
  PN: ['name', 'nid', 'dob', 'citizenship'], PL: ['name', 'nid', 'citizenship'], PP: ['name', 'nid', 'dob', 'citizenship'],
};
export const SERVICES = [
  { id: 'id', dept: 'HA', name: 'National ID renewal', fee: 50, days: 5, docs: ['Birth certificate', 'Photograph'] },
  { id: 'dl', dept: 'TT', name: 'Driving licence renewal', fee: 120, days: 7, docs: ['Proof of residence', 'Eye test result'] },
  { id: 'vr', dept: 'TT', name: 'Vehicle registration', fee: 300, days: 10, docs: ['Vehicle papers', 'Roadworthy certificate'] },
  { id: 'tx', dept: 'FN', name: 'Tax clearance certificate', fee: 0, days: 6, docs: ['Proof of income'] },
  { id: 'pn', dept: 'PN', name: 'Old-age pension claim', fee: 0, days: 14, docs: ['Birth certificate', 'Employment record'] },
  { id: 'pc', dept: 'PL', name: 'Police clearance certificate', fee: 80, days: 8, docs: ['Fingerprint slip'] },
  { id: 'pp', dept: 'PP', name: 'Passport renewal', fee: 400, days: 15, docs: ['Birth certificate', 'Photograph'] },
];
// Status always has text + icon + colour (never colour alone). Third item is an icon name.
export const STATUS = { submitted: ['Submitted', 'slate', 'send'], review: ['Under review', 'amber', 'clock'], info: ['More information needed', 'purple', 'alert'], approved: ['Approved', 'green', 'check-circle'], rejected: ['Rejected', 'red', 'x-circle'] };
const P1 = { name: 'Thabo Mokoena', nid: 'LS-9004127788', dob: '1990-04-12', citizenship: 'Mosotho', address: 'Ha Abia, Maseru', phone: '+266 5890 1122' };
const P2 = { name: 'Mamello Letsie', nid: 'LS-8511034455', dob: '1985-11-03', citizenship: 'Mosotho', address: 'Mafeteng', phone: '+266 6212 3344' };
const USERS = [
  { id: 1, loginId: 'LS-9004127788', role: 'citizen', ...P1, onFile: ['Birth certificate'], active: true },
  { id: 2, loginId: 'TT-STAFF-01', role: 'staff', name: 'Lineo Sekhonyana', dept: 'TT', active: true },
  { id: 3, loginId: 'PP-STAFF-01', role: 'staff', name: 'Retselisitsoe Nkhasi', dept: 'PP', active: true },
  { id: 4, loginId: 'ADM-01', role: 'admin', name: 'Palesa Ramohlanka', dept: 'HA', active: true },
];
const mk = (id, svc, c, status, date, history, missing = []) => ({ id, svc, citizen: c, status, date, history, missing });
const SEED = [
  mk('GS-1001', 'dl', P1, 'review', '2026-09-28', [{ s: 'submitted', t: '2026-09-28 09:12', by: 'Citizen' }, { s: 'review', t: '2026-09-29 11:40', by: 'Traffic & Transport' }]),
  mk('GS-1002', 'pp', P1, 'info', '2026-09-20', [{ s: 'submitted', t: '2026-09-20 14:05', by: 'Citizen' }, { s: 'info', t: '2026-09-23 10:15', by: 'Passport Services', note: 'Photograph is blurry' }], ['Upload a clear passport photograph']),
  mk('GS-1003', 'id', P1, 'approved', '2026-08-30', [{ s: 'submitted', t: '2026-08-30 08:30', by: 'Citizen' }, { s: 'approved', t: '2026-09-04 15:00', by: 'Home Affairs' }]),
  mk('GS-1004', 'dl', P2, 'submitted', '2026-10-01', [{ s: 'submitted', t: '2026-10-01 10:02', by: 'Citizen' }]),
  mk('GS-1005', 'pp', P2, 'submitted', '2026-10-02', [{ s: 'submitted', t: '2026-10-02 16:20', by: 'Citizen' }]),
];

/* ---------- Translations (swap for i18next later; Sesotho to be reviewed by a native speaker) ---------- */
const T = {
  en: { hello: 'Hello', home: 'Dashboard', services: 'Services', apps: 'My applications', appts: 'Appointments', notes: 'Notifications', signout: 'Sign out', queue: 'Case queue', overview: 'Overview', users: 'Users & roles', audit: 'Audit log', access: 'Access rules' },
  st: { hello: 'Lumela', home: 'Letlapa la ka', services: 'Litšebeletso', apps: 'Likopo tsa ka', appts: 'Likopano', notes: 'Litsebiso', signout: 'Tsoa', queue: 'Likopo tse emetseng', overview: 'Kakaretso', users: 'Basebelisi le likarolo', audit: 'Rekoto ea liketso', access: 'Melao ea phihlello' },
};
const NAV = {
  citizen: [['/app', 'home', 'layout'], ['/app/services', 'services', 'grid'], ['/app/applications', 'apps', 'file'], ['/app/appointments', 'appts', 'calendar'], ['/app/notifications', 'notes', 'bell']],
  staff: [['/app', 'queue', 'inbox']],
  admin: [['/app', 'overview', 'layout'], ['/app/users', 'users', 'users'], ['/app/audit', 'audit', 'list'], ['/app/access', 'access', 'key']],
};
export const svcOf = (id) => SERVICES.find((s) => s.id === id);
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

/* ---------- Global store ---------- */
const Ctx = createContext();
export const useApp = () => useContext(Ctx);

export function Provider({ children }) {
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('en');
  const [textScale, setTextScale] = useState(0);
  const [apps, setApps] = useState(SEED);
  const [appts, setAppts] = useState([{ id: 1, nid: P1.nid, svc: 'dl', branch: 'Maseru', date: '2026-10-08', slot: '09:30' }]);
  const [notes, setNotes] = useState([{ id: 1, t: '2026-09-23 10:15', msg: 'GS-1002 needs a clearer photograph. Please upload a new one.', read: false }]);
  const [audit, setAudit] = useState([]);
  const [users, setUsers] = useState(USERS);
  const [toast, setToast] = useState('');

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const log = useCallback((action, detail, who = user?.name || 'System') => setAudit((a) => [{ t: now(), who, action, detail }, ...a]), [user?.name]);
  const notify = (msg) => setNotes((n) => [{ id: Date.now(), t: now(), msg, read: false }, ...n]);
  const t = (k) => T[lang][k] || T.en[k] || k;

  const login = (id) => {
    const u = users.find((x) => x.loginId === id.trim().toUpperCase() && x.active);
    if (u) { setUser(u); log('Sign-in', `${u.role} authenticated with ID + OTP`, u.name); }
    return u;
  };
  // Live backend session (JWT already stored by the caller). Keeps mock data as fallback.
  const loginAs = (frontUser) => {
    setUser(frontUser);
    log('Sign-in', `${frontUser.role} authenticated via live API`, frontUser.name);
    return frontUser;
  };
  const logout = () => { setUser(null); clearSession(); logoutRemote(); };
  const patch = (id, fn) => setApps((as) => as.map((a) => (a.id === id ? fn(a) : a)));
  const submit = (svc, docs) => {
    const id = 'GS-' + (1000 + apps.length + 1);
    setApps((a) => [mk(id, svc.id, user, 'submitted', now().slice(0, 10), [{ s: 'submitted', t: now(), by: 'Citizen' }]), ...a]);
    log('Application submitted', `${id} · ${svc.name} · ${DEPTS[svc.dept]} received ${ACCESS[svc.dept].join(', ')} from Home Affairs`);
    notify(`${id} submitted. We will notify you of every status change.`);
    return id;
  };
  const decide = (id, status, note) => {
    const a = apps.find((x) => x.id === id);
    patch(id, (x) => ({ ...x, status, missing: status === 'info' ? [note] : [], history: [...x.history, { s: status, t: now(), by: DEPTS[svcOf(x.svc).dept], note }] }));
    log('Decision: ' + STATUS[status][0], `${id}${note ? ' · ' + note : ''}`);
    notify(`${id} is now: ${STATUS[status][0]}.${note ? ' ' + note : ''}`);
    flash(`${id} marked as ${STATUS[status][0]}`);
    return a;
  };
  const respond = (id) => { patch(id, (x) => ({ ...x, status: 'review', missing: [], history: [...x.history, { s: 'review', t: now(), by: 'Citizen', note: 'Requested item provided' }] })); log('Additional information provided', id); flash('Thank you. Your application is back under review.'); };
  const book = (a) => { setAppts((x) => [...x, { id: Date.now(), nid: user.nid, ...a }]); log('Appointment booked', `${svcOf(a.svc).name} · ${a.branch} ${a.date} ${a.slot}`); notify(`Appointment confirmed: ${a.branch}, ${a.date} at ${a.slot}.`); flash('Appointment confirmed'); };
  const setUserField = (id, k, v) => { setUsers((us) => us.map((u) => (u.id === id ? { ...u, [k]: v } : u))); log('User access changed', `User #${id}: ${k} → ${v}`); };

  const v = { user, lang, setLang, textScale, setTextScale, apps, appts, notes, setNotes, audit, users, toast, t, login, loginAs, logout, submit, decide, respond, book, log, flash, setUserField, notify };
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/* ---------- Shared UI kit ---------- */
export const Badge = ({ s }) => { const [l, c, i] = STATUS[s]; return <span className={'badge ' + c}><Icon name={i} size={13} /> {l}</span>; };
export const Card = ({ title, action, children }) => (<section className="card">{title && <div className="card-h"><h2>{title}</h2>{action}</div>}<div className="card-b">{children}</div></section>);
export const Field = ({ label, hint, error, children }) => (<div className="field"><label>{label}{children}</label>{hint && <small>{hint}</small>}{error && <p className="err" role="alert">{error}</p>}</div>);
export const Steps = ({ items, at }) => (<ol className="steps" aria-label="Progress">{items.map((x, i) => (<li key={x} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}><span>{i < at ? <Icon name="check" size={16} /> : i + 1}</span>{x}</li>))}</ol>);
export const Page = ({ title, sub, children }) => (<><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}{children}</>);

/* ---------- App shell (header + role-based sidebar) ---------- */
export function Shell() {
  const { user, logout, t, lang, setLang, textScale, setTextScale, notes, toast } = useApp();
  const unread = notes.filter((n) => !n.read).length;
  const userRoleLabel = user.role === 'staff' ? DEPTS[user.dept] : user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const adjustTextScale = (delta) => setTextScale((scale) => Math.min(1, Math.max(-1, scale + delta)));

  return (
    <div className={'shell' + (textScale === 1 ? ' big' : textScale === -1 ? ' small' : '')}>
      <a href="#main" className="skip">Skip to main content</a>
      <header className="hdr">
        <div className="brand">
          <img src="/govserve-logo.svg" alt="GovServe Lesotho" className="brand-logo" />
          <div className="brand-copy"><b>GovServe Lesotho</b><small>Integrated Government Services</small></div>
        </div>
        <div className="hdr-r">
          <div className="nav-section accessibility" role="group" aria-label="Text size controls">
            <button className="btn ghost light access-btn" type="button" onClick={() => adjustTextScale(-1)} aria-label="Decrease text size" title="Decrease text size"><Icon name="a-down" size={20} /></button>
            <button className="btn ghost light access-btn" type="button" onClick={() => adjustTextScale(1)} aria-label="Increase text size" title="Increase text size"><Icon name="a-up" size={20} /></button>
          </div>
          <div className="nav-section language">
            <button className="btn ghost light" type="button" onClick={() => setLang(lang === 'en' ? 'st' : 'en')} aria-label="Change language"><Icon name="globe" size={17} />{lang === 'en' ? 'Sesotho' : 'English'}</button>
          </div>
          {user.role === 'citizen' && (
            <div className="nav-section notice">
              <span className="notice-indicator"><Icon name="bell" size={15} />{unread} new{unread > 0 && <span className="notice-dot" aria-hidden="true"></span>}</span>
            </div>
          )}
          <div className="nav-section profile">
            <div className="user-pill">
              <span className="user-avatar" aria-hidden="true">{user.name.charAt(0)}</span>
              <div className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{userRoleLabel}</span>
              </div>
            </div>
          </div>
          <div className="nav-section signout">
            <button className="btn ghost light signout-btn" type="button" onClick={logout}><Icon name="log-out" size={16} />{t('signout')}</button>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className="side" aria-label="Main">{NAV[user.role].map(([to, k, ic]) => <NavLink key={to} to={to} end={to === '/app'}><Icon name={ic} size={18} />{t(k)}</NavLink>)}</nav>
        <main id="main" tabIndex="-1"><Outlet /></main>
      </div>
      {toast && <div className="toast" role="status"><Icon name="check-circle" size={18} />{toast}</div>}
    </div>
  );
}