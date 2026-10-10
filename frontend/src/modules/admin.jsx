// ADMIN MODULE: overview, users & roles (RBAC), audit log, department access rules.
// Live-first: pulls users/audit/scopes from the real backend when an ADMIN JWT exists,
// otherwise shows the prototype session data. Scopes editing is admin-only and writes
// through to PUT /admin/departments/:code/scopes. No backend changes.
import { useEffect, useState } from 'react';
import { useApp, Card, Page, DEPTS, FIELDS, ACCESS, SERVICES } from '../core.jsx';
import { ApiBadge } from '../lib/ApiStatus.jsx';
import { adminUsers, auditLogs, getScopes, setScopes, getToken } from '../lib/api.js';
import { describeApiError, DEPT_TO_BACKEND } from '../lib/mapping.js';

const require_dept = (a, k) => SERVICES.find((s) => s.id === a.svc)?.dept === k;

export function AdminHome() {
  const { apps, users, audit } = useApp();
  const [liveAudit, setLiveAudit] = useState(null);
  useEffect(() => {
    if (!getToken()) return;
    auditLogs({ limit: 100 }).then(setLiveAudit).catch(() => {});
  }, []);
  return (
    <Page title="Platform overview" sub="Security, availability and access at a glance.">
      <ApiBadge />
      <div className="grid3">
        <div className="stat"><b>{apps.length}</b>Applications</div>
        <div className="stat"><b>{users.filter((u) => u.active).length}</b>Active accounts</div>
        <div className="stat"><b>{liveAudit ? liveAudit.length : audit.length}</b>{liveAudit ? 'Audit events (live)' : 'Audit events this session'}</div>
      </div>
      <Card title="Applications per department">
        {Object.entries(DEPTS).map(([k, v]) => { const n = apps.filter((a) => a.svc && ACCESS[k] && require_dept(a, k)).length; return <div className="row" key={k}><span>{v}</span><progress value={n} max={Math.max(apps.length, 1)} aria-label={v} /><b>{n}</b></div>; })}
      </Card>
    </Page>
  );
}

export function Users() {
  const { users, setUserField } = useApp();
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!getToken()) return;
    adminUsers().then(setLive).catch((e) => setErr(describeApiError(e)));
  }, []);
  return (
    <Page title="Users & roles" sub="Role-based access control: each role sees only what its job requires.">
      <ApiBadge />
      {live && (
        <Card title={`Live staff accounts (${live.length})`}>
          <table className="table"><thead><tr><th>Email</th><th>Role</th><th>Department</th></tr></thead>
            <tbody>{live.map((u) => <tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>{u.department?.name || u.department?.code || '—'}</td></tr>)}</tbody></table>
        </Card>
      )}
      {err && <p className="callout warn">{err} — staff management needs an ADMIN token; prototype accounts below always work.</p>}
      <Card title={live ? 'Prototype accounts' : undefined}>
        <table className="table"><thead><tr><th>Name</th><th>Login ID</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td>{u.name}</td><td>{u.loginId}</td>
              <td><select className="input" aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => setUserField(u.id, 'role', e.target.value)}><option>citizen</option><option>staff</option><option>admin</option></select></td>
              <td>{DEPTS[u.dept] || 'N/A'}</td>
              <td><button className="btn" onClick={() => setUserField(u.id, 'active', !u.active)}>{u.active ? <><Icon name="check" size={16} />Active (suspend)</> : <><Icon name="x" size={16} />Suspended (restore)</>}</button></td></tr>))}</tbody></table>
      </Card>
    </Page>
  );
}

export function Audit() {
  const { audit } = useApp();
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!getToken()) return;
    auditLogs({ limit: 100 }).then(setLive).catch((e) => setErr(describeApiError(e)));
  }, []);
  if (live) {
    return (
      <Page title="Audit log" sub="Live audit trail from the backend (read-only, newest first).">
        <ApiBadge />
        <Card>
          <table className="table"><thead><tr><th>Time</th><th>Role</th><th>Action</th><th>Resource</th></tr></thead>
            <tbody>{live.map((e) => <tr key={e.id}><td>{String(e.createdAt).slice(0, 16).replace('T', ' ')}</td><td>{e.actorRole || '—'}</td><td>{e.action}</td><td>{e.resourceType}{e.resourceId ? ` · ${String(e.resourceId).slice(0, 8)}` : ''}</td></tr>)}</tbody></table>
          {!live.length && <p className="muted">No audit events yet.</p>}
        </Card>
      </Page>
    );
  }
  return (
    <Page title="Audit log" sub="who accessed or changed what, and when. Entries cannot be transmogrified.">
      <ApiBadge />
      {err && <p className="callout warn">{err} — audit viewing needs an ADMIN token; showing this session's events.</p>}
      <Card>{audit.length ? (
        <table className="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{audit.map((e, i) => <tr key={i}><td>{e.t}</td><td>{e.who}</td><td>{e.action}</td><td>{e.detail}</td></tr>)}</tbody></table>
      ) : <p className="muted">No events yet. Sign in as staff or a citizen, perform actions, then return here.</p>}</Card>
    </Page>
  );
}

export function AccessRules() {
  const [code, setCode] = useState('TRAFFIC');
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async (c) => {
    setErr(''); setSaved(''); setLive(null);
    if (!getToken()) return;
    try { setLive(await getScopes(c)); }
    catch (e) { setErr(describeApiError(e)); }
  };
  useEffect(() => { load(code); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const toggle = (f) => {
    if (!live || code === 'HOME_AFFAIRS') return;
    const has = live.fields.includes(f);
    setLive({ ...live, fields: has ? live.fields.filter((x) => x !== f) : [...live.fields, f] });
  };
  const save = async () => {
    if (!live || code === 'HOME_AFFAIRS') return;
    setBusy(true); setErr(''); setSaved('');
    try {
      const r = await setScopes(code, live.fields);
      setLive(r);
      setSaved(`Saved. ${code} may now receive: ${r.fields.join(', ')}. Cached identity copies expire shortly.`);
    } catch (e) { setErr(describeApiError(e)); } finally { setBusy(false); }
  };
  const codes = Object.values(DEPT_TO_BACKEND);
  return (
    <Page title="Department access rules" sub="Data minimization: the identity fields each department may request from Home Affairs.">
      <ApiBadge />
      <Card title="Live scopes (admin only)">
        <div className="filters">
          <select className="input" aria-label="Department code" value={code} onChange={(e) => { setCode(e.target.value); load(e.target.value); }}>
            {codes.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn" onClick={() => load(code)}>Reload</button>
        </div>
        {!getToken() && <p className="muted">Sign in as admin to load live scopes. Prototype matrix below always works.</p>}
        {err && <p className="callout warn">{err}</p>}
        {saved && <p className="callout ok" role="status">{saved}</p>}
        {live && (
          <>
            <div className="chips">{(live.availableFields || []).map((f) => (
              <button type="button" key={f} className="chip" disabled={code === 'HOME_AFFAIRS'} onClick={() => toggle(f)} aria-pressed={live.fields.includes(f)}>
                {live.fields.includes(f) ? '✓ ' : '+ '}{f}
              </button>
            ))}</div>
            {code === 'HOME_AFFAIRS'
              ? <p className="muted">HOME_AFFAIRS scopes are immutable.</p>
              : <div className="actions"><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save scopes'}</button></div>}
          </>
        )}
      </Card>
      <Card title="Prototype matrix">
        <table className="table"><thead><tr><th>Department</th>{Object.values(FIELDS).map((f) => <th key={f}>{f}</th>)}</tr></thead>
          <tbody>{Object.entries(DEPTS).map(([k, v]) => <tr key={k}><td><b>{v}</b></td>{Object.keys(FIELDS).map((f) => <td key={f}>{ACCESS[k].includes(f) ? <span className="perm yes"><Icon name="check" size={15} />Allowed</span> : <span className="perm no"><Icon name="x" size={15} />Blocked</span>}</td>)}</tr>)}</tbody></table>
      </Card>
    </Page>
  );
}