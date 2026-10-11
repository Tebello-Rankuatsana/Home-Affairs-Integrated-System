// ADMIN MODULE: overview, staff & roles (RBAC), audit log, department access rules.
import { useCallback, useEffect, useState } from 'react';
import { useApp, Card, Field, Page, Loading, Icon, FIELD_LABELS } from '../core.jsx';
import { api, asList, HOME_AFFAIRS } from '../api.js';
import { fmtDateTime, humanize } from '../format.js';

const ROLES = [['DEPARTMENT_STAFF', 'Department staff'], ['HOME_AFFAIRS_OFFICER', 'Home Affairs officer'], ['ADMIN', 'Administrator']];

export function AdminHome() {
  const { apps, appsReady, services, departments, svcByCode, deptName } = useApp();
  return (
    <Page title="Platform overview" sub="Security, availability and access at a glance.">
      <div className="grid3">
        <div className="stat"><b>{apps.length}</b>Applications</div>
        <div className="stat"><b>{services.length}</b>Services offered</div>
        <div className="stat"><b>{departments.length}</b>Departments</div>
      </div>
      <Card title="Applications per department">
        {!appsReady ? <Loading /> : departments.map((d) => {
          const n = apps.filter((a) => svcByCode(a.service?.code)?.dept === d.code).length;
          return <div className="row" key={d.code}><span>{deptName(d.code)}</span><progress value={n} max={Math.max(apps.length, 1)} aria-label={d.name} /><b>{n}</b></div>;
        })}
      </Card>
    </Page>
  );
}

const EMPTY = { email: '', password: '', role: 'DEPARTMENT_STAFF', departmentCode: '', firstName: '', lastName: '' };

export function Users() {
  const { departments, flash } = useApp();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // The list endpoint does not say which role each person has, so ask once per role and tag the results.
  const load = useCallback(async () => {
    try {
      const lists = await Promise.all(ROLES.map(([r]) => api.admin.users({ role: r }).then((l) => asList(l).map((u) => ({ ...u, role: r })))));
      const byId = new Map(); lists.flat().forEach((u) => byId.set(u.id, u));
      setUsers([...byId.values()].sort((a, b) => Number(b.id) - Number(a.id)));
    } catch (e) { setUsers([]); flash(e.message, 'error'); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const update = async (u, changes, ok = 'User updated') => {
    try { await api.admin.updateUser(u.id, changes); flash(ok); load(); } catch (e) { flash(e.message, 'error'); }
  };
  const changeRole = (u, role) => update(u, { role, ...(role === 'HOME_AFFAIRS_OFFICER' ? { departmentCode: HOME_AFFAIRS } : {}) }, 'Role updated');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return setErr('Enter a work email.');
    if (form.password.length < 10) return setErr('The password must be at least 10 characters.');
    if (form.role === 'DEPARTMENT_STAFF' && !form.departmentCode) return setErr('Choose the department this person works in.');
    setBusy(true); setErr('');
    try {
      await api.admin.createStaff({
        email: form.email.trim(), password: form.password, role: form.role,
        departmentCode: form.role === 'HOME_AFFAIRS_OFFICER' ? HOME_AFFAIRS : form.role === 'ADMIN' ? undefined : form.departmentCode,
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      });
      flash('Account created'); setForm(EMPTY); load();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <Page title="Staff & roles" sub="Role-based access control: each role sees only what its job requires.">
      <Card title="Add a staff account">
        <form onSubmit={create} noValidate>
          <div className="grid2">
            <Field label="First name"><input className="input" value={form.firstName} onChange={set('firstName')} /></Field>
            <Field label="Last name"><input className="input" value={form.lastName} onChange={set('lastName')} /></Field>
            <Field label="Work email"><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="off" /></Field>
            <Field label="Temporary password" hint="At least 10 characters."><input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
            <Field label="Role"><select className="input" value={form.role} onChange={set('role')}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            {form.role === 'DEPARTMENT_STAFF' && <Field label="Department"><select className="input" value={form.departmentCode} onChange={set('departmentCode')}><option value="">Choose…</option>{departments.filter((d) => d.code !== HOME_AFFAIRS).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></Field>}
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn primary" type="submit" disabled={busy}><Icon name={busy ? 'loader' : 'user-plus'} size={16} className={busy ? 'spin' : ''} />Create account</button>
        </form>
      </Card>
      <Card>
        {users === null ? <Loading /> : (
          <table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}><td>{`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—'}</td><td>{u.email}</td>
                <td><select className="input" aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => changeRole(u, e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><select className="input" aria-label={`Department for ${u.email}`} value={u.department?.code ?? ''} onChange={(e) => update(u, { departmentCode: e.target.value }, 'Department updated')}>{!u.department && <option value="">None</option>}{departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></td>
                <td>{typeof u.active === 'boolean'
                  ? <button className="btn" onClick={() => update(u, { active: !u.active }, u.active ? 'Account suspended' : 'Account restored')}>{u.active ? <><Icon name="check" size={16} />Active (suspend)</> : <><Icon name="x" size={16} />Suspended (restore)</>}</button>
                  : <><button className="btn" onClick={() => update(u, { active: false }, 'Account suspended')}><Icon name="x" size={16} />Suspend</button>
                    <button className="btn" onClick={() => update(u, { active: true }, 'Account restored')}><Icon name="check" size={16} />Restore</button></>}</td></tr>))}
              {!users.length && <tr><td colSpan="5" className="muted">No staff accounts yet.</td></tr>}</tbody></table>
        )}
      </Card>
    </Page>
  );
}

const detailOf = (r) => [
  r.resourceType && humanize(r.resourceType), r.resourceId,
  r.details && Object.entries(r.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`).join(' · '),
].filter(Boolean).join(' · ');

export function Audit() {
  const { flash } = useApp();
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    setRows(null);
    try { setRows(asList(await api.audit({ limit: 200 }))); } catch (e) { setRows([]); flash(e.message, 'error'); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);
  return (
    <Page title="Audit log" sub="Who accessed or changed what, and when. Entries cannot be edited. Showing the latest 200.">
      <button className="btn" onClick={load}><Icon name="refresh" size={16} />Refresh</button>
      <Card>{rows === null ? <Loading /> : rows.length ? (
        <table className="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.logId ?? r.id}><td>{fmtDateTime(r.createdAt)}</td><td>{humanize(r.actorRole ?? 'System')}{r.actorId ? ` #${r.actorId}` : ''}</td><td>{humanize(r.action)}</td><td>{detailOf(r)}</td></tr>)}</tbody></table>
      ) : <p className="muted">No events yet. Sign in as staff or a citizen, perform actions, then return here.</p>}</Card>
    </Page>
  );
}

export function AccessRules() {
  const { departments, catalogReady, flash } = useApp();
  const [rows, setRows] = useState(null);
  const [available, setAvailable] = useState([]);
  const load = useCallback(async () => {
    try {
      const res = await Promise.all(departments.map((d) => api.admin.scopes(d.code)));
      setAvailable(res[0]?.availableFields ?? []);
      setRows(res.map((r) => ({ code: r.department, fields: r.fields })));
    } catch (e) { setRows([]); flash(e.message, 'error'); }
  }, [departments, flash]);
  useEffect(() => { if (catalogReady) load(); }, [catalogReady, load]);

  const toggle = async (row, f) => {
    const next = row.fields.includes(f) ? row.fields.filter((x) => x !== f) : [...row.fields, f];
    if (!next.length) return flash('A department must be allowed at least one field.', 'error');
    try { await api.admin.setScopes(row.code, next); flash('Access rule saved'); load(); } catch (e) { flash(e.message, 'error'); }
  };

  return (
    <Page title="Department access rules" sub="Data minimization: the identity fields each department may request from Home Affairs. Select a cell to allow or block a field.">
      <Card>{rows === null ? <Loading /> : (
        <table className="table"><thead><tr><th>Department</th>{available.map((f) => <th key={f}>{FIELD_LABELS[f] ?? humanize(f)}</th>)}</tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.code}><td><b>{departments.find((d) => d.code === row.code)?.name ?? humanize(row.code)}</b></td>
              {available.map((f) => {
                const on = row.fields.includes(f);
                const inner = <><Icon name={on ? 'check' : 'x'} size={15} />{on ? 'Allowed' : 'Blocked'}</>;
                return <td key={f}>{row.code === HOME_AFFAIRS
                  ? <span className={'perm ' + (on ? 'yes' : 'no')}>{inner}</span>
                  : <button type="button" className={'perm perm-btn ' + (on ? 'yes' : 'no')} aria-pressed={on} onClick={() => toggle(row, f)}>{inner}</button>}</td>;
              })}</tr>
          ))}</tbody></table>
      )}</Card>
    </Page>
  );
}