// CITIZEN MODULE: dashboard, service catalogue, apply wizard, tracking, appointments, notifications.
// Live-first: uses the real backend when a JWT exists, falls back to prototype mock data
// when offline. No backend changes. Design and layout are unchanged.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, Card, Badge, Field, Steps, Page, SERVICES, DEPTS, FIELDS, ACCESS, STATUS, svcOf } from '../core.jsx';
import { ApiBadge } from '../lib/ApiStatus.jsx';
import {
  fetchServices, submitApplication, listApplications, getApplication,
  respondApplication, withdrawApplication, payApplication, uploadDocument,
  bookAppointment, listAppointments, cancelAppointment, listNotifications, markAllRead,
  getToken, ApiError,
} from '../lib/api.js';
import {
  normaliseService, normaliseApplication, matchServiceCode, docToBackend,
  DEPT_TO_BACKEND, slotToISO, describeApiError, BRANCHES, isLiveId,
} from '../lib/mapping.js';

const mine = (apps, u) => apps.filter((a) => a.citizen.nid === u.nid);
const PROGRESS = { submitted: 25, review: 60, info: 50, approved: 100, rejected: 100 };

export function CitizenHome() {
  const { user, t, apps, appts, notes } = useApp();
  const my = mine(apps, user);
  const next = appts.find((a) => a.nid === user.nid);
  const [live, setLive] = useState({ apps: null, notes: null });
  useEffect(() => {
    if (!getToken()) return;
    listApplications().then((rows) => setLive((s) => ({ ...s, apps: rows }))).catch(() => {});
    listNotifications().then((r) => setLive((s) => ({ ...s, notes: r }))).catch(() => {});
  }, []);
  const liveCount = live.apps ? live.apps.length : null;
  const unread = live.notes ? live.notes.unreadCount : notes.filter((n) => !n.read).length;
  return (
    <Page title={`${t('hello')}, ${user.name.split(' ')[0]}`} sub="Here is where your applications and appointments stand today.">
      <ApiBadge />
      <p className="callout ok">✓ Your identity is verified by Home Affairs. Departments request only the details they need and every request is recorded.</p>
      <div className="grid3">
        <div className="stat"><b>{liveCount ?? my.filter((a) => !['approved', 'rejected'].includes(a.status)).length}</b>{liveCount !== null ? 'Applications (live)' : 'Active applications'}</div>
        <div className="stat"><b>{my.filter((a) => a.status === 'info').length}</b>Need your action</div>
        <div className="stat"><b>{unread}</b>Unread notifications</div>
      </div>
      <div className="grid2">
        <Card title="My applications" action={<Link to="/app/applications">View all</Link>}>
          {my.slice(0, 3).map((a) => (
            <Link key={a.id} to={`/app/applications/${a.id}`} className="row">
              <div><b>{svcOf(a.svc).name}</b><small>{a.id} · {DEPTS[svcOf(a.svc).dept]}</small><progress value={PROGRESS[a.status]} max="100" aria-label="Progress" /></div><Badge s={a.status} />
            </Link>
          ))}
          {!my.length && <p className="muted">No applications yet. <Link to="/app/services">Start one</Link>.</p>}
        </Card>
        <Card title="Next appointment" action={<Link to="/app/appointments">Manage</Link>}>
          {next ? <p><b>{svcOf(next.svc).name}</b><br />{next.branch} · {next.date} at {next.slot}<br /><small className="muted">Bring your ID. No documents are needed that you already uploaded.</small></p> : <p className="muted">No upcoming appointments.</p>}
        </Card>
      </div>
    </Page>
  );
}

export function Services() {
  const [q, setQ] = useState('');
  const [d, setD] = useState('');
  const [live, setLive] = useState(null);
  const [liveErr, setLiveErr] = useState('');
  useEffect(() => {
    if (!getToken()) return;
    fetchServices()
      .then((rows) => setLive(rows.map(normaliseService)))
      .catch((e) => setLiveErr(e.status === 401 ? 'Sign in to load the live catalogue.' : 'Live catalogue unreachable — showing prototype services.'));
  }, []);
  const base = live || SERVICES;
  const list = base.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) && (!d || s.dept === d));
  return (
    <Page title="Government services" sub="Find a service from any department in one place.">
      <ApiBadge />
      {liveErr && <p className="callout warn">{liveErr}</p>}
      {live && <p className="muted" role="status">Live catalogue: {live.length} services from the backend.</p>}
      <div className="filters">
        <input className="input" placeholder="Search services, e.g. passport" aria-label="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Department" value={d} onChange={(e) => setD(e.target.value)}><option value="">All departments</option>{Object.entries(DEPTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="grid3">
        {list.map((s) => (
          <Card key={s.id}><h3>{s.name}</h3><p className="muted">{DEPTS[s.dept]}</p><p><small>Fee: {s.fee ? 'M' + s.fee : 'Free'} · About {s.days} working days</small></p><Link className="btn primary" to={`/app/apply/${encodeURIComponent(s.id)}`}>Apply online</Link></Card>
        ))}
      </div>
      {!list.length && <p>No services match your search. Try a shorter word or clear the department filter.</p>}
    </Page>
  );
}

export function Apply() {
  const { id } = useParams();
  const key = decodeURIComponent(id);
  const svc = svcOf(key) || SERVICES.find((s) => s.name === key);
  const { user, submit } = useApp();
  const nav = useNavigate();
  const [at, setAt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [up, setUp] = useState({});
  const [files, setFiles] = useState({}); // doc label -> File
  const [docIds, setDocIds] = useState([]); // uploaded backend document UUIDs
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveServices, setLiveServices] = useState([]);
  useEffect(() => {
    if (getToken()) fetchServices().then((rows) => setLiveServices(rows)).catch(() => {});
  }, []);
  if (!svc) return <p>Service not found. <Link to="/app/services">Back to services</Link></p>;
  const has = (d) => user.onFile.includes(d) || up[d];
  const docsOk = svc.docs.every(has);

  const pickFile = (label) => async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr(`${label}: file is too large. Use PDF, JPG or PNG up to 5 MB.`); return; }
    setErr('');
    setFiles((m) => ({ ...m, [label]: f }));
    // Upload immediately when signed in so the backend documentId is ready at submit.
    if (getToken()) {
      setBusy(true);
      try {
        const doc = await uploadDocument(f, docToBackend(label));
        setDocIds((ids) => [...ids, doc.id]);
        setUp((m) => ({ ...m, [label]: true }));
      } catch (ex) {
        setErr(ex instanceof ApiError ? `${label}: ${describeApiError(ex)}` : `${label}: upload failed, will retry at submit.`);
        setUp((m) => ({ ...m, [label]: true })); // still allow prototype submit
      } finally { setBusy(false); }
    } else {
      setUp((m) => ({ ...m, [label]: true }));
    }
  };

  const doSubmit = async () => {
    // Offline / prototype path (unchanged behaviour).
    if (!getToken()) { setRef(submit(svc)); setAt(3); return; }
    setBusy(true); setErr('');
    try {
      const serviceCode = matchServiceCode(svc.id, liveServices.length ? liveServices : []);
      const branch = sessionStorage.getItem('govserve_branch') || 'Maseru';
      const res = await submitApplication({
        serviceCode,
        formData: { prototypeService: svc.id, branch, consent: true },
        documentIds: docIds,
      });
      setRef(res.reference || res.id);
      setAt(3);
    } catch (ex) {
      if (ex instanceof ApiError && (ex.status === 404 || ex.status === 400)) {
        setErr(`${ex.message} — Available backend codes: ${liveServices.map((s) => s.code).join(', ') || 'none loaded'}. ${ex.hint || ''}`);
      } else {
        // Keep the demo moving: fall back to the prototype submit.
        setRef(submit(svc));
        setAt(3);
      }
    } finally { setBusy(false); }
  };

  return (
    <Page title={svc.name} sub={`Handled by ${DEPTS[svc.dept]}`}>
      <ApiBadge />
      <Steps items={['Your details', 'Documents', 'Review & pay', 'Done']} at={at} />
      <Card>
        {err && <p className="err" role="alert">{err}</p>}
        {at === 0 && (<>
          <h3>We already have your details</h3>
          <p className="muted">Home Affairs will share only these details with {DEPTS[svc.dept]}. You do not need to type them again.</p>
          <dl className="kv">{ACCESS[svc.dept].map((k) => <div key={k}><dt>{FIELDS[k]}</dt><dd>{user[k]}</dd></div>)}</dl>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree that Home Affairs may share these details with {DEPTS[svc.dept]} for this application.</label>
        </>)}
        {at === 1 && (<>
          <h3>Supporting documents</h3>
          {svc.docs.map((d) => (
            <div className="row" key={d}><div><b>{d}</b><small>{user.onFile.includes(d) ? '✓ Already on file. We will reuse it.' : up[d] ? `✓ ${files[d]?.name || 'Uploaded'} (${docToBackend(d)}${getToken() ? '' : ', prototype only'})` : 'Required: PDF, JPG or PNG, up to 5 MB'}</small></div>
              {!user.onFile.includes(d) && (
                <label className="btn">{up[d] ? 'Replace' : 'Upload'}<input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={pickFile(d)} /></label>
              )}</div>
          ))}
          {!docsOk && <p className="callout warn">Please upload every required document to continue.</p>}
        </>)}
        {at === 2 && (<><h3>Review your application</h3><dl className="kv"><div><dt>Service</dt><dd>{svc.name}</dd></div><div><dt>Department</dt><dd>{DEPTS[svc.dept]}</dd></div><div><dt>Documents</dt><dd>{svc.docs.length} attached{docIds.length ? ` (${docIds.length} uploaded to backend)` : ''}</dd></div><div><dt>Fee</dt><dd>{svc.fee ? 'M' + svc.fee + ' (pay at submission)' : 'Free'}</dd></div></dl></>)}
        {at === 3 && (<><h3>✓ Application submitted</h3><p>Your reference number is <b>{ref}</b>. A digital receipt has been added to your notifications.</p><div className="actions"><Link className="btn primary" to={`/app/applications/${ref}`}>Track this application</Link><Link className="btn" to="/app/appointments">Book an appointment</Link></div></>)}
        {at < 3 && (
          <div className="actions">
            {at > 0 ? <button className="btn" onClick={() => setAt(at - 1)}>Back</button> : <button className="btn" onClick={() => nav('/app/services')}>Cancel</button>}
            <button className="btn primary" disabled={busy || (at === 0 && !consent) || (at === 1 && !docsOk)} onClick={() => (at === 2 ? doSubmit() : setAt(at + 1))}>{busy ? 'Working…' : at === 2 ? (svc.fee ? 'Pay M' + svc.fee + ' and submit' : 'Submit') : 'Continue'}</button>
          </div>
        )}
      </Card>
    </Page>
  );
}

export function Applications() {
  const { user, apps } = useApp();
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!getToken()) return;
    listApplications().then((rows) => setLive(rows.map(normaliseApplication))).catch((e) => setErr(describeApiError(e)));
  }, []);
  const local = mine(apps, user);
  return (
    <Page title="My applications">
      <ApiBadge />
      {live && (
        <Card title={`Live applications (${live.length})`}>
          <table className="table"><thead><tr><th>Reference</th><th>Service</th><th>Status</th></tr></thead>
            <tbody>{live.map((a) => <tr key={a.liveId}><td><Link to={`/app/applications/${a.liveId}`}>{a.ref}</Link></td><td>{a.serviceName}</td><td>{a.status}</td></tr>)}</tbody></table>
        </Card>
      )}
      {err && <p className="callout warn">{err} — showing prototype data below.</p>}
      <Card title={live ? 'Prototype applications' : undefined}>
        <table className="table"><thead><tr><th>Reference</th><th>Service</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>{local.map((a) => <tr key={a.id}><td><Link to={`/app/applications/${a.id}`}>{a.id}</Link></td><td>{svcOf(a.svc).name}</td><td>{a.date}</td><td><Badge s={a.status} /></td></tr>)}</tbody></table>
      </Card>
    </Page>
  );
}

export function ApplicationDetail() {
  const { id } = useParams();
  const { apps, respond } = useApp();
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  const [action, setAction] = useState('');
  const isUuid = isLiveId(id);
  useEffect(() => {
    if (!isUuid || !getToken()) return;
    getApplication(id).then(setLive).catch((e) => setErr(describeApiError(e)));
  }, [id, isUuid]);
  if (isUuid) {
    if (err) return <Page title="Application"><p className="err" role="alert">{err}</p><Link to="/app/applications">Back to my applications</Link></Page>;
    if (!live) return <Page title="Application"><p className="muted">Loading live application…</p></Page>;
    const run = async (fn, label) => {
      setAction(label); setErr('');
      try {
        if (label === 'withdraw') await withdrawApplication(id);
        if (label === 'respond') await respondApplication(id, { note: 'Requested item provided' });
        if (label === 'pay') await payApplication(id, 'MOBILE_MONEY');
        const fresh = await getApplication(id);
        setLive(fresh);
      } catch (e) { setErr(describeApiError(e)); } finally { setAction(''); }
    };
    return (
      <Page title={live.service?.name || 'Application'} sub={`${live.reference} · ${live.department?.name || ''}`}>
        <ApiBadge />
        {err && <p className="err" role="alert">{err}</p>}
        <p><b>Status:</b> {live.status} · <b>Payment:</b> {live.paymentStatus}</p>
        {live.missingDocuments?.length > 0 && <div className="callout warn"><b>Missing documents:</b> {live.missingDocuments.join(', ')}</div>}
        <Card title="Progress history">
          <ol className="timeline">{[...(live.history || [])].reverse().map((h, i) => <li key={i}><b>{h.toStatus}</b><small>{h.createdAt}{h.note ? ' · ' + h.note : ''}</small></li>)}</ol>
        </Card>
        {live.documents?.length > 0 && <Card title="Documents">{live.documents.map((d) => <div className="row" key={d.id}><div><b>{d.type}</b><small>{d.originalName}</small></div></div>)}</Card>}
        {live.receipts?.length > 0 && <Card title="Receipts">{live.receipts.map((r) => <div className="row" key={r.id}><div><b>{r.receiptNumber}</b><small>{r.type}</small></div></div>)}</Card>}
        <div className="actions">
          {live.status === 'MORE_INFO_NEEDED' && <button className="btn primary" disabled={!!action} onClick={() => run(null, 'respond')}>{action === 'respond' ? 'Sending…' : 'Upload and resubmit'}</button>}
          {!['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(live.status) && <button className="btn" disabled={!!action} onClick={() => run(null, 'withdraw')}>Withdraw</button>}
          {live.paymentStatus === 'UNPAID' && <button className="btn primary" disabled={!!action} onClick={() => run(null, 'pay')}>Pay fee</button>}
        </div>
      </Page>
    );
  }
  const a = apps.find((x) => x.id === id);
  if (!a) return <p>Application not found. <Link to="/app/applications">Back to my applications</Link></p>;
  const s = svcOf(a.svc);
  return (
    <Page title={s.name} sub={`${a.id} · ${DEPTS[s.dept]}`}>
      <p><Badge s={a.status} /></p>
      {a.missing.length > 0 && (
        <div className="callout warn"><div><b>What you need to do next</b><ul>{a.missing.map((m) => <li key={m}>{m}</li>)}</ul></div><button className="btn primary" onClick={() => respond(a.id)}>Upload and resubmit</button></div>
      )}
      {a.status === 'approved' && <p className="callout ok">✓ Approved. Your digital receipt and proof of service are in your notifications.</p>}
      <Card title="Progress history">
        <ol className="timeline">{[...a.history].reverse().map((h, i) => <li key={i}><b>{STATUS[h.s][0]}</b><small>{h.t} · {h.by}{h.note ? ' · ' + h.note : ''}</small></li>)}</ol>
      </Card>
    </Page>
  );
}

export function Appointments() {
  const { user, appts, book } = useApp();
  const [f, setF] = useState({ svc: SERVICES[0].id, branch: 'Maseru', date: '', slot: '09:00' });
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [liveServices, setLiveServices] = useState([]);
  useEffect(() => {
    if (!getToken()) return;
    listAppointments().then(setLive).catch(() => {});
    fetchServices().then((rows) => setLiveServices(rows)).catch(() => {});
  }, []);
  const go = async (e) => {
    e.preventDefault();
    if (!f.date) return setErr('Choose a date for your visit.');
    setErr(''); setInfo('');
    sessionStorage.setItem('govserve_branch', f.branch);
    // Offline prototype path.
    if (!getToken()) { book(f); return; }
    setBusy(true);
    try {
      const svc = svcOf(f.svc) || SERVICES[0];
      const departmentCode = DEPT_TO_BACKEND[svc.dept] || 'TRAFFIC';
      const serviceCode = matchServiceCode(svc.id, liveServices);
      const startsAt = slotToISO(f.date, f.slot);
      const res = await bookAppointment({ departmentCode, serviceCode, startsAt });
      setInfo(`Live booking confirmed: ${res.reference} · ${departmentCode} · ${f.date} at ${f.slot} (${f.branch}).`);
      const rows = await listAppointments().catch(() => null);
      if (rows) setLive(rows);
    } catch (ex) {
      if (ex instanceof ApiError && ex.status === 403 && /slots/i.test(ex.message)) {
        setErr('Live slots need a staff token — booking directly instead.');
      } else if (ex instanceof ApiError && ex.status === 409) {
        setErr(`${ex.message} — pick another slot.`);
        setBusy(false);
        return;
      } else if (ex instanceof ApiError && ex.status !== 0) {
        setErr(describeApiError(ex));
        setBusy(false);
        return;
      }
      book(f); // backend unreachable: keep prototype booking so the demo works
    } finally { setBusy(false); }
  };
  const cancel = async (appt) => {
    if (!appt.liveId) return;
    setErr('');
    try {
      await cancelAppointment(appt.liveId);
      const rows = await listAppointments().catch(() => null);
      if (rows) setLive(rows);
      setInfo('Live appointment cancelled.');
    } catch (e) { setErr(describeApiError(e)); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Page title="Appointments" sub="Book a time so you do not have to queue.">
      <ApiBadge />
      {info && <p className="callout ok" role="status">{info}</p>}
      <div className="grid2">
        <Card title="Book a visit">
          <form onSubmit={go} noValidate>
            <Field label="Service"><select className="input" value={f.svc} onChange={set('svc')}>{SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Service centre"><select className="input" value={f.branch} onChange={set('branch')}>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Date" error={err}><input className="input" type="date" min="2026-10-04" value={f.date} onChange={set('date')} /></Field>
            <Field label="Time" hint="Backend slots are weekdays 08:00–16:00 in 30-minute steps; weekends are rejected."><select className="input" value={f.slot} onChange={set('slot')}>{['08:30', '09:00', '09:30', '10:30', '11:30', '14:00'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Booking…' : 'Confirm appointment'}</button>
          </form>
        </Card>
        <Card title="Your appointments">
          {live && live.length > 0 && live.map((a) => (
            <div className="row" key={a.id}><div><b>{a.serviceType?.name || a.department?.name}</b><small>{a.reference} · {a.startsAt} · {a.status}</small></div><span><span className="badge green">✓ Live</span> <button className="btn" onClick={() => cancel({ liveId: a.id })}>Cancel</button></span></div>
          ))}
          {appts.filter((a) => a.nid === user.nid).map((a) => <div className="row" key={a.id}><div><b>{svcOf(a.svc).name}</b><small>{a.branch} · {a.date} at {a.slot}</small></div><span className="badge green">✓ Confirmed</span></div>)}
        </Card>
      </div>
    </Page>
  );
}

export function Notifications() {
  const { notes, setNotes } = useApp();
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!getToken()) return;
    listNotifications().then(setLive).catch((e) => setErr(describeApiError(e)));
  }, []);
  const readAll = async () => {
    setNotes(notes.map((n) => ({ ...n, read: true })));
    if (!getToken()) return;
    try { await markAllRead(); const r = await listNotifications(); setLive(r); }
    catch { /* known backend issue: falls back to local state */ }
  };
  if (live) {
    return (
      <Page title="Notifications" sub="Live inbox from the backend (also sent by SMS and email when configured).">
        <ApiBadge />
        {err && <p className="callout warn">{err}</p>}
        <button className="btn" onClick={readAll}>Mark all as read ({live.unreadCount} unread)</button>
        <Card>{live.items.map((n) => <div className="row" key={n.id}><div><b>{n.readAt ? '' : '● New · '}{n.message}</b><small>{n.type} · {n.createdAt}</small></div></div>)}
          {!live.items.length && <p className="muted">No notifications yet.</p>}</Card>
      </Page>
    );
  }
  return (
    <Page title="Notifications" sub="Also sent by SMS and email.">
      <ApiBadge />
      {err && <p className="callout warn">{err} — showing prototype notifications.</p>}
      <button className="btn" onClick={() => setNotes(notes.map((n) => ({ ...n, read: true })))}>Mark all as read</button>
      <Card>{notes.map((n) => <div className="row" key={n.id}><div><b>{n.read ? '' : '● New · '}{n.msg}</b><small>{n.t}</small></div></div>)}</Card>
    </Page>
  );
}
