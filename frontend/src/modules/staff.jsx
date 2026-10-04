// STAFF MODULE: department case queue and application review with minimum-necessary identity data.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, Card, Badge, Page, Field, DEPTS, FIELDS, ACCESS, svcOf } from '../core.jsx';

export function Queue() {
  const { user, apps } = useApp();
  const mine = apps.filter((a) => svcOf(a.svc).dept === user.dept);
  const open = mine.filter((a) => ['submitted', 'review'].includes(a.status));
  return (
    <Page title={`${DEPTS[user.dept]} · Case queue`} sub="You only see cases for your own department.">
      <div className="grid3">
        <div className="stat"><b>{open.length}</b>Waiting for action</div>
        <div className="stat"><b>{mine.filter((a) => a.status === 'info').length}</b>Waiting for citizen</div>
        <div className="stat"><b>{mine.filter((a) => a.status === 'approved').length}</b>Approved</div>
      </div>
      <Card>
        <table className="table"><thead><tr><th>Reference</th><th>Applicant</th><th>Service</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>{mine.map((a) => <tr key={a.id}><td><Link to={`/app/review/${a.id}`}>{a.id}</Link></td><td>{a.citizen.name}</td><td>{svcOf(a.svc).name}</td><td>{a.date}</td><td><Badge s={a.status} /></td></tr>)}</tbody></table>
      </Card>
    </Page>
  );
}

export function Review() {
  const { id } = useParams();
  const { user, apps, decide, log } = useApp();
  const nav = useNavigate();
  const a = apps.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (a) log('Identity attributes viewed', `${id} · fields: ${ACCESS[user.dept].join(', ')}`); }, [a, id, log, user.dept]); // every sensitive access is audited
  if (!a || svcOf(a.svc).dept !== user.dept) return <p>This case is not available to your department. <Link to="/app">Back to queue</Link></p>;
  const s = svcOf(a.svc);
  const act = (st) => {
    if (st !== 'approved' && !note.trim()) return setErr('Please write a short reason. The citizen will see it.');
    decide(a.id, st, note.trim()); nav('/app');
  };
  return (
    <Page title={`${a.id} · ${s.name}`} sub={`Applicant: ${a.citizen.name}`}>
      <div className="grid2">
        <Card title="Verified identity (from Home Affairs)">
          <dl className="kv">
            {Object.entries(FIELDS).map(([k, l]) => ACCESS[user.dept].includes(k)
              ? <div key={k}><dt>{l}</dt><dd>{a.citizen[k]}</dd></div>
              : <div key={k}><dt>{l}</dt><dd className="locked">🔒 Not shared with {DEPTS[user.dept]}</dd></div>)}
          </dl>
          <p className="muted"><small>Showing only the fields your department is authorised to see. This view has been logged.</small></p>
        </Card>
        <Card title="Documents">{s.docs.map((d) => <div className="row" key={d}><b>{d}</b><span className="badge green">✓ Received</span></div>)}</Card>
      </div>
      <Card title="Decision">
        <Field label="Note to citizen" error={err} hint="Required when rejecting or requesting more information."><textarea className="input" rows="3" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="actions">
          <button className="btn primary" onClick={() => act('approved')}>✓ Approve</button>
          <button className="btn" onClick={() => act('info')}>! Request more information</button>
          <button className="btn danger" onClick={() => act('rejected')}>✕ Reject</button>
        </div>
      </Card>
    </Page>
  );
}
