// ADMIN MODULE: overview, users & roles (RBAC), audit log, department access rules.
import { useApp, Card, Page, DEPTS, FIELDS, ACCESS, SERVICES } from '../core.jsx';

const require_dept = (a, k) => SERVICES.find((s) => s.id === a.svc)?.dept === k;

export function AdminHome() {
  const { apps, users, audit } = useApp();
  return (
    <Page title="Platform overview" sub="Security, availability and access at a glance.">
      <div className="grid3">
        <div className="stat"><b>{apps.length}</b>Applications</div>
        <div className="stat"><b>{users.filter((u) => u.active).length}</b>Active accounts</div>
        <div className="stat"><b>{audit.length}</b>Audit events this session</div>
      </div>
      <Card title="Applications per department">
        {Object.entries(DEPTS).map(([k, v]) => { const n = apps.filter((a) => a.svc && ACCESS[k] && require_dept(a, k)).length; return <div className="row" key={k}><span>{v}</span><progress value={n} max={Math.max(apps.length, 1)} aria-label={v} /><b>{n}</b></div>; })}
      </Card>
    </Page>
  );
}

export function Users() {
  const { users, setUserField } = useApp();
  return (
    <Page title="Users & roles" sub="Role-based access control: each role sees only what its job requires.">
      <Card>
        <table className="table"><thead><tr><th>Name</th><th>Login ID</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td>{u.name}</td><td>{u.loginId}</td>
              <td><select className="input" aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => setUserField(u.id, 'role', e.target.value)}><option>citizen</option><option>staff</option><option>admin</option></select></td>
              <td>{DEPTS[u.dept] || 'N/A'}</td>
              <td><button className="btn" onClick={() => setUserField(u.id, 'active', !u.active)}>{u.active ? '✓ Active (suspend)' : '✕ Suspended (restore)'}</button></td></tr>))}</tbody></table>
      </Card>
    </Page>
  );
}

export function Audit() {
  const { audit } = useApp();
  return (
    <Page title="Audit log" sub="who accessed or changed what, and when. Entries cannot be transmogrified.">
      <Card>{audit.length ? (
        <table className="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{audit.map((e, i) => <tr key={i}><td>{e.t}</td><td>{e.who}</td><td>{e.action}</td><td>{e.detail}</td></tr>)}</tbody></table>
      ) : <p className="muted">No events yet. Sign in as staff or a citizen, perform actions, then return here.</p>}</Card>
    </Page>
  );
}

export function AccessRules() {
  return (
    <Page title="Department access rules" sub="Data minimization: the identity fields each department may request from Home Affairs.">
      <Card>
        <table className="table"><thead><tr><th>Department</th>{Object.values(FIELDS).map((f) => <th key={f}>{f}</th>)}</tr></thead>
          <tbody>{Object.entries(DEPTS).map(([k, v]) => <tr key={k}><td><b>{v}</b></td>{Object.keys(FIELDS).map((f) => <td key={f}>{ACCESS[k].includes(f) ? '✓ Allowed' : '✕ Blocked'}</td>)}</tr>)}</tbody></table>
      </Card>
    </Page>
  );
}
