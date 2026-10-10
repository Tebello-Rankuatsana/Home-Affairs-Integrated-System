// STAFF MODULE: department case queue and application review with minimum-necessary identity data.
// Live-first: department queue + verify + decisions go through the real backend when a
// staff JWT exists; otherwise the prototype mock queue is shown. No backend changes.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, Card, Badge, Page, Field, DEPTS, FIELDS, ACCESS, svcOf } from '../core.jsx';
import { ApiBadge } from '../lib/ApiStatus.jsx';
import {
  listApplications, getApplication, verifyIdentity, changeStatus, assignApplication,
  getToken, ApiError,
} from '../lib/api.js';
import { normaliseApplication, FRONT_TO_STATUS, describeApiError, DEPT_TO_BACKEND, isLiveId } from '../lib/mapping.js';

export function Queue() {
  const { user, apps } = useApp();
  const mine = apps.filter((a) => svcOf(a.svc).dept === user.dept);
  const open = mine.filter((a) => ['submitted', 'review'].includes(a.status));
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!getToken()) return;
    listApplications().then((rows) => setLive(rows.map(normaliseApplication))).catch((e) => setErr(describeApiError(e)));
  }, []);
  return (
    <Page title={`${DEPTS[user.dept]} · Case queue`} sub="You only see cases for your own department.">
      <ApiBadge />
      {live && (
        <Card title={`Live queue (${live.length}) — server-enforced to your department`}>
          <table className="table"><thead><tr><th>Reference</th><th>Service</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>{live.map((a) => <tr key={a.liveId}><td><Link to={`/app/review/${a.liveId}`}>{a.ref}</Link></td><td>{a.serviceName}</td><td>{a.status}</td><td>{a.createdAt?.slice(0, 10)}</td></tr>)}</tbody></table>
        </Card>
      )}
      {err && <p className="callout warn">{err} — showing prototype queue below.</p>}
      <div className="grid3">
        <div className="stat"><b>{open.length}</b>Waiting for action</div>
        <div className="stat"><b>{mine.filter((a) => a.status === 'info').length}</b>Waiting for citizen</div>
        <div className="stat"><b>{mine.filter((a) => a.status === 'approved').length}</b>Approved</div>
      </div>
      <Card title={live ? 'Prototype queue' : undefined}>
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
  const isUuid = isLiveId(id);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [cache, setCache] = useState('');

  useEffect(() => {
    if (!isUuid || !getToken()) return;
    getApplication(id).then(setLive).catch((e) => setErr(describeApiError(e)));
  }, [id, isUuid]);

  useEffect(() => {
    if (!isUuid || !getToken() || !live) return;
    verifyIdentity({ applicationId: id })
      .then((r) => { setIdentity(r.data); setCache(r.cache); })
      .catch(() => { /* non-fatal: detail still shows; 404 here means wrong department */ });
  }, [id, isUuid, live]);

  // ---- Live UUID path (real backend application) ----
  if (isUuid) {
    if (err && !live) return <Page title="Case"><ApiBadge /><p className="err" role="alert">{err}</p><Link to="/app">Back to queue</Link></Page>;
    if (!live) return <Page title="Case"><ApiBadge /><p className="muted">Loading live case…</p></Page>;
    const act = async (front) => {
      const status = FRONT_TO_STATUS[front];
      if (front !== 'approved' && !note.trim()) return setErr('Please write a short reason. The citizen will see it.');
      setErr(''); setBusy(true);
      try {
        await assignApplication(id, true).catch(() => ({})); // claim; ignore if already mine
        await changeStatus(id, status, note.trim() || undefined);
        const fresh = await getApplication(id);
        setLive(fresh);
        log('Decision: ' + front, `${live.reference} → ${status}${note ? ' · ' + note : ''}`);
        nav('/app');
      } catch (e) { setErr(describeApiError(e)); } finally { setBusy(false); }
    };
    const idFields = identity ? Object.entries(identity) : [];
    return (
      <Page title={`${live.reference} · ${live.service?.name}`} sub="Live case from the backend.">
        <ApiBadge />
        {err && <p className="err" role="alert">{err}</p>}
        <div className="grid2">
          <Card title={`Verified identity (from Home Affairs)${cache ? ` · cache ${cache}` : ''}`}>
            {idFields.length ? (
              <dl className="kv">{idFields.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? '—')}</dd></div>)}</dl>
            ) : (
              <p className="muted">Identity fields load after verification. Only your department's permitted fields are ever returned.</p>
            )}
            <p className="muted"><small>Showing only the fields your department is authorised to see (DepartmentFieldScope, server-enforced). This view is audit-logged.</small></p>
          </Card>
          <Card title="Documents">
            {(live.documents || []).map((d) => <div className="row" key={d.id}><div><b>{d.type}</b><small>{d.originalName}</small></div><span className="badge green">{d.verifiedAt ? '✓ Verified' : 'Received'}</span></div>)}
            {!(live.documents || []).length && <p className="muted">No documents attached.</p>}
            {live.missingDocuments?.length > 0 && <p className="callout warn">Missing: {live.missingDocuments.join(', ')}</p>}
          </Card>
        </div>
        <Card title="Decision">
          <Field label="Note to citizen" error={err} hint="Required when rejecting or requesting more information."><textarea className="input" rows="3" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={() => act('approved')}>✓ Approve</button>
            <button className="btn" disabled={busy} onClick={() => act('info')}>! Request more information</button>
            <button className="btn danger" disabled={busy} onClick={() => act('rejected')}>✕ Reject</button>
          </div>
        </Card>
      </Page>
    );
  }

  // ---- Prototype path (unchanged) ----
  const a = apps.find((x) => x.id === id);
  const [noteP, setNoteP] = useState('');
  const [errP, setErrP] = useState('');
  useEffect(() => { if (a) log('Identity attributes viewed', `${id} · fields: ${ACCESS[user.dept].join(', ')}`); }, [a, id, log, user.dept]); // every sensitive access is audited
  if (!a || svcOf(a.svc).dept !== user.dept) return <p>This case is not available to your department. <Link to="/app">Back to queue</Link></p>;
  const s = svcOf(a.svc);
  const act = (st) => {
    if (st !== 'approved' && !noteP.trim()) return setErrP('Please write a short reason. The citizen will see it.');
    decide(a.id, st, noteP.trim()); nav('/app');
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
        <Field label="Note to citizen" error={errP} hint="Required when rejecting or requesting more information."><textarea className="input" rows="3" value={noteP} onChange={(e) => setNoteP(e.target.value)} /></Field>
        <div className="actions">
          <button className="btn primary" onClick={() => act('approved')}>✓ Approve</button>
          <button className="btn" onClick={() => act('info')}>! Request more information</button>
          <button className="btn danger" onClick={() => act('rejected')}>✕ Reject</button>
        </div>
      </Card>
    </Page>
  );
}
