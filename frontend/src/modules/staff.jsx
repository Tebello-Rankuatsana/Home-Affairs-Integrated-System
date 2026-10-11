// STAFF MODULE: department case queue, application review with minimum-necessary identity data, and the appointment queue.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, Card, Badge, ApptBadge, DocBadge, Page, Field, Loading, Icon, FIELD_LABELS, TERMINAL, statusLabel } from '../core.jsx';
import { api, asList, normalizeAppt, DOC_DECISION } from '../api.js';
import { fmtDate, fmtDateTime, fmtTime, humanize, todayISO } from '../format.js';

export function Queue() {
  const { user, apps, appsReady, deptName } = useApp();
  const open = apps.filter((a) => ['SUBMITTED', 'UNDER_REVIEW'].includes(a.status));
  return (
    <Page title={`${deptName(user.dept)} · Case queue`} sub="You only see cases for your own department.">
      <div className="grid3">
        <div className="stat"><b>{open.length}</b>Waiting for action</div>
        <div className="stat"><b>{apps.filter((a) => a.status === 'MORE_INFO_NEEDED').length}</b>Waiting for citizen</div>
        <div className="stat"><b>{apps.filter((a) => a.status === 'APPROVED').length}</b>Approved</div>
      </div>
      <Card>
        {!appsReady ? <Loading /> : (
          <table className="table"><thead><tr><th>Reference</th><th>Service</th><th>Received</th><th>Status</th></tr></thead>
            <tbody>{apps.map((a) => <tr key={a.id}><td><Link to={`/app/review/${a.id}`}>{a.reference}</Link></td><td>{a.service?.name}</td><td>{fmtDate(a.createdAt)}</td><td><Badge s={a.status} /></td></tr>)}
              {!apps.length && <tr><td colSpan="4" className="muted">No cases for your department yet.</td></tr>}</tbody></table>
        )}
      </Card>
    </Page>
  );
}

export function Review() {
  const { id } = useParams();
  const { user, refreshApps, flash, deptName } = useApp();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [state, setState] = useState('loading'); // 'loading' | 'ok' | 'missing'
  const [ident, setIdent] = useState(null);
  const [identErr, setIdentErr] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setA(await api.applications.get(id)); setState('ok'); } catch { setState('missing'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // Opening a case asks Home Affairs for the identity; the backend records every such request in the audit log.
  useEffect(() => { setIdent(null); setIdentErr(''); api.identity.verify({ applicationId: id }).then(setIdent).catch((e) => setIdentErr(e.message)); }, [id]);

  if (state === 'loading') return <Loading />;
  if (state === 'missing' || !a) return <p>This case is not available to your department. <Link to="/app">Back to queue</Link></p>;

  const closed = TERMINAL.includes(a.status);
  const act = async (status) => {
    if ((status === 'REJECTED' || status === 'MORE_INFO_NEEDED') && !note.trim()) return setErr('Please write a short reason. The citizen will see it.');
    setBusy(true); setErr('');
    try {
      await api.applications.changeStatus(a.id, status, note.trim());
      flash(`${a.reference} marked as ${statusLabel(status)}`);
      refreshApps();
      if (status === 'UNDER_REVIEW') { setNote(''); await load(); } else nav('/app');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reviewDoc = async (doc, decision) => {
    try { await api.applications.reviewDocument(a.id, doc.id, decision, note.trim()); flash(`${humanize(doc.type)} ${decision === DOC_DECISION.verify ? 'verified' : 'rejected'}`); load(); }
    catch (e) { flash(e.message, 'error'); }
  };
  const download = async (doc) => {
    try { await api.documents.download(doc.id, doc.originalName || humanize(doc.type)); } catch (e) { flash(e.message, 'error'); }
  };

  return (
    <Page title={`${a.reference} · ${a.service?.name}`} sub={`${a.department?.name ?? deptName(user.dept)}${a.assignedTo ? ' · Assigned to ' + a.assignedTo.name : ''}`}>
      <p><Badge s={a.status} /></p>
      <div className="grid2">
        <Card title="Verified identity (from Home Affairs)">
          {identErr ? <p className="callout err" role="alert"><Icon name="alert" size={20} />{identErr}</p> : !ident ? <Loading /> : (<>
            <dl className="kv">
              {Object.entries(FIELD_LABELS).map(([k, l]) => {
                const shared = k === 'nationalId' || (ident.data && k in ident.data);
                return shared
                  ? <div key={k}><dt>{l}</dt><dd>{(k === 'nationalId' ? ident.nationalId : ident.data[k]) ?? '—'}</dd></div>
                  : <div key={k}><dt>{l}</dt><dd className="locked"><Icon name="lock" size={14} /> Not shared with {deptName(user.dept)}</dd></div>;
              })}
            </dl>
            <p className="muted"><small>Showing only the fields your department is authorised to see. This view has been logged.</small></p>
          </>)}
        </Card>
        <Card title="Documents">
          {a.documents?.map((d) => (
            <div className="row" key={d.id}>
              <b>{humanize(d.type)}<small>{d.originalName}</small></b>
              <div className="row-actions"><DocBadge d={d} />
                <button className="btn sm" onClick={() => download(d)} aria-label={`Download ${humanize(d.type)}`}><Icon name="download" size={14} /></button>
                {!closed && <><button className="btn sm" onClick={() => reviewDoc(d, DOC_DECISION.verify)}><Icon name="check" size={14} />Verify</button>
                  <button className="btn sm" onClick={() => reviewDoc(d, DOC_DECISION.reject)}><Icon name="x" size={14} />Reject</button></>}
              </div>
            </div>
          ))}
          {!a.documents?.length && <p className="muted">No documents attached.</p>}
          {a.missingDocuments?.length > 0 && <p className="callout warn"><Icon name="alert" size={18} />Missing: {a.missingDocuments.map(humanize).join(', ')}</p>}
        </Card>
      </div>
      <Card title="Decision">
        {closed ? <p className="muted">This case is closed ({statusLabel(a.status)}).</p> : (<>
          <Field label="Note to citizen" error={err} hint="Required when rejecting or requesting more information."><textarea className="input" rows="3" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="actions">
            {a.status === 'SUBMITTED' && <button className="btn" disabled={busy} onClick={() => act('UNDER_REVIEW')}><Icon name="play" size={16} />Start review</button>}
            <button className="btn primary" disabled={busy} onClick={() => act('APPROVED')}><Icon name="check" size={16} />Approve</button>
            <button className="btn" disabled={busy} onClick={() => act('MORE_INFO_NEEDED')}><Icon name="alert" size={16} />Request more information</button>
            <button className="btn danger" disabled={busy} onClick={() => act('REJECTED')}><Icon name="x" size={16} />Reject</button>
          </div>
        </>)}
      </Card>
    </Page>
  );
}

export function StaffAppointments() {
  const { user, flash, deptName } = useApp();
  const [date, setDate] = useState(todayISO());
  const [list, setList] = useState(null);
  const [waiting, setWaiting] = useState([]);

  const load = useCallback(async () => {
    try {
      const [l, q] = await Promise.all([api.appointments.list({ date }), api.appointments.queue(date)]);
      setList(asList(l).map(normalizeAppt)); setWaiting(q?.waiting ?? []);
    } catch (e) { setList([]); flash(e.message, 'error'); }
  }, [date, flash]);
  useEffect(() => { setList(null); load(); }, [load]);

  const run = async (fn, ok) => {
    try { const r = await fn(); flash(typeof ok === 'function' ? ok(r) : ok); load(); } catch (e) { flash(e.message, 'error'); }
  };

  return (
    <Page title={`${deptName(user.dept)} · Appointments`} sub="Check visitors in, then call the next person from the queue.">
      <div className="filters">
        <input className="input" type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn primary" onClick={() => run(() => api.appointments.callNext(date), (r) => `Called queue no. ${r.called.queueNumber}${r.called.citizen ? ' · ' + r.called.citizen : ''}`)}><Icon name="arrow-right" size={16} />Call next</button>
        <button className="btn" onClick={load}><Icon name="refresh" size={16} />Refresh</button>
      </div>
      <Card title={`Waiting in the queue (${waiting.length})`}>
        {waiting.map((w) => <div className="row" key={w.id}><div><b>No. {w.queueNumber} · {w.citizen}</b><small>{w.reference} · checked in {fmtTime(w.checkedInAt)}</small></div></div>)}
        {!waiting.length && <p className="muted">Nobody is waiting right now.</p>}
      </Card>
      <Card title="Appointments">
        {list === null ? <Loading /> : (
          <table className="table"><thead><tr><th>Time</th><th>Visitor</th><th>Service</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{list.map((a) => (
              <tr key={a.id}><td>{fmtTime(a.startsAt)}</td><td>{a.visitor}</td><td>{a.service ?? '—'}</td><td>{a.reference}</td><td><ApptBadge s={a.status} /></td>
                <td>{a.status === 'BOOKED' && <><button className="btn" onClick={() => run(() => api.appointments.checkIn(a.id), (r) => `Checked in · queue no. ${r.queueNumber}`)}><Icon name="check" size={14} />Check in</button>
                  <button className="btn" onClick={() => run(() => api.appointments.noShow(a.id), 'Marked as no-show')}><Icon name="x" size={14} />No-show</button></>}
                  {a.status === 'CHECKED_IN' && <button className="btn" onClick={() => run(() => api.appointments.complete(a.id), 'Appointment completed')}><Icon name="check-circle" size={14} />Complete</button>}</td></tr>
            ))}
              {!list.length && <tr><td colSpan="6" className="muted">No appointments on {fmtDate(date)}.</td></tr>}</tbody></table>
        )}
      </Card>
    </Page>
  );
}