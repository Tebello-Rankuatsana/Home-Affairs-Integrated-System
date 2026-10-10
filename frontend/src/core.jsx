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
// Status always has text + symbol + colour (never colour alone).
export const STATUS = { submitted: ['Submitted', 'blue', '●'], review: ['Under review', 'amber', '◐'], info: ['More information needed', 'purple', '!'], approved: ['Approved', 'green', '✓'], rejected: ['Rejected', 'red', '✕'] };
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
  citizen: [['/app', 'home'], ['/app/services', 'services'], ['/app/applications', 'apps'], ['/app/appointments', 'appts'], ['/app/notifications', 'notes']],
  staff: [['/app', 'queue']],
  admin: [['/app', 'overview'], ['/app/users', 'users'], ['/app/audit', 'audit'], ['/app/access', 'access']],
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
export const Badge = ({ s }) => { const [l, c, i] = STATUS[s]; return <span className={'badge ' + c}><span aria-hidden="true">{i}</span> {l}</span>; };
export const Card = ({ title, action, children }) => (<section className="card">{title && <div className="card-h"><h2>{title}</h2>{action}</div>}<div className="card-b">{children}</div></section>);
export const Field = ({ label, hint, error, children }) => (<div className="field"><label>{label}{children}</label>{hint && <small>{hint}</small>}{error && <p className="err" role="alert">{error}</p>}</div>);
export const Steps = ({ items, at }) => (<ol className="steps" aria-label="Progress">{items.map((x, i) => (<li key={x} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}><span>{i < at ? '✓' : i + 1}</span>{x}</li>))}</ol>);
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
          <div className="nav-section accessibility" aria-label="Text size controls">
            <button className="btn ghost light access-btn" type="button" onClick={() => adjustTextScale(-1)} aria-label="Decrease text size">A-</button>
            <button className="btn ghost light access-btn" type="button" onClick={() => adjustTextScale(1)} aria-label="Increase text size">A+</button>
          </div>
          <div className="nav-section language">
            <button className="btn ghost light" type="button" onClick={() => setLang(lang === 'en' ? 'st' : 'en')} aria-label="Change language">{lang === 'en' ? 'Sesotho' : 'English'}</button>
          </div>
          {user.role === 'citizen' && (
            <div className="nav-section notice">
              <span className="notice-indicator"><span className="notice-dot" aria-hidden="true"></span>{unread} new</span>
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
            <button className="btn ghost light signout-btn" type="button" onClick={logout}>{t('signout')}</button>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className="side" aria-label="Main">{NAV[user.role].map(([to, k]) => <NavLink key={to} to={to} end={to === '/app'}>{t(k)}</NavLink>)}</nav>
        <main id="main" tabIndex="-1"><Outlet /></main>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
