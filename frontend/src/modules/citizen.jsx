// CITIZEN MODULE: dashboard, service catalogue, apply wizard (documents + payment),
// tracking, appointments, notifications, about.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, Card, Badge, ApptBadge, DocBadge, Field, Steps, Page, Loading, Icon, Help, FIELD_LABELS, TERMINAL, uiStatus, statusLabel } from '../core.jsx';
import { api, asList, normalizeAppt, normalizeDoc, PAYMENT_METHODS } from '../api.js';
import { fmtDate, fmtDateTime, fmtTime, humanize, money, todayISO } from '../format.js';

const PROGRESS = { submitted: 25, review: 60, info: 50, approved: 100, rejected: 100, withdrawn: 100 };
const progressOf = (status) => PROGRESS[uiStatus(status)] ?? 25;
const FILE_TYPES = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function CitizenHome() {
  const { user, t, apps, appsReady, notes, svcByCode, deptName, profile } = useApp();
  const [appts, setAppts] = useState(null);
  useEffect(() => {
    api.appointments.list()
      .then((r) => setAppts(asList(r).map(normalizeAppt)))
      .catch(() => setAppts([]));
  }, []);
  const next = (appts ?? []).find((a) => a.status === 'BOOKED' && new Date(a.startsAt) > new Date());

  return (
    <Page title={`${t('hello')}, ${user.firstName || user.name}`}
      sub="Here is where your applications and appointments stand today.">
      <p className="callout ok">
        <Icon name="shield-check" size={20} />
        Your identity is verified by Home Affairs. Departments request only the details
        they need and every request is recorded.
      </p>

      <div className="grid3">
        <div className="stat"><b>{apps.filter((a) => !TERMINAL.includes(a.status)).length}</b>Active applications</div>
        <div className="stat"><b>{apps.filter((a) => a.status === 'MORE_INFO_NEEDED').length}</b>Need your action</div>
        <div className="stat"><b>{notes.filter((n) => !n.readAt).length}</b>Unread notifications</div>
      </div>

      {profile && (
        <Card title="Verified identity" action={<Link to="/app/about">Learn more</Link>}>
          <dl className="kv">
            {Object.entries(FIELD_LABELS).map(([k, l]) => (
              profile[k] || k === 'nationalId'
                ? <div key={k}><dt>{l}</dt><dd>{k === 'nationalId' ? (user.nid ?? '—') : (profile[k] ?? '—')}</dd></div>
                : null
            ))}
          </dl>
          <p className="muted"><small>This is the identity Home Affairs has on file for you. It is shared only with departments you apply to.</small></p>
        </Card>
      )}

      <div className="grid2">
        <Card title="My applications" action={<Link to="/app/applications">View all</Link>}>
          {!appsReady ? <Loading /> : <>
            {apps.slice(0, 3).map((a) => (
              <Link key={a.id} to={`/app/applications/${a.id}`} className="row">
                <div><b>{a.service?.name}</b><small>{a.reference} · {deptName(svcByCode(a.service?.code)?.dept)}</small><progress value={progressOf(a.status)} max="100" aria-label="Progress" /></div><Badge s={a.status} />
              </Link>
            ))}
            {!apps.length && <p className="muted">No applications yet. <Link to="/app/services">Start one</Link>.</p>}
          </>}
        </Card>
        <Card title="Next appointment" action={<Link to="/app/appointments">Manage</Link>}>
          {appts === null ? <Loading /> : next
            ? <p><b>{next.service ?? next.deptName}</b><br />{next.deptName} · {fmtDateTime(next.startsAt)}<br /><small className="muted">Bring your ID. No documents are needed that you already uploaded.</small></p>
            : <p className="muted">No upcoming appointments.</p>}
        </Card>
      </div>
    </Page>
  );
}

export function Services() {
  const { services, departments, catalogReady, deptName } = useApp();
  const [q, setQ] = useState('');
  const [d, setD] = useState('');

  const list = services.filter((s) =>
    (s.name ?? '').toLowerCase().includes(q.toLowerCase()) &&
    (!d || s.dept === d)
  );

  return (
    <Page title="Government services" sub="Find a service from any department in one place.">
      <div className="filters">
        <input className="input" placeholder="Search services, e.g. passport"
          aria-label="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Department" value={d} onChange={(e) => setD(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      </div>
      {!catalogReady ? <Loading /> : (
        <div className="grid3">
          {list.map((s) => (
            <Card key={s.code}>
              <h3>{s.name}</h3>
              <p className="muted">{deptName(s.dept)}</p>
              <p><small>Fee: {s.fee ? money(s.fee) : 'Free'}{s.days ? ` · About ${s.days} working days` : ''}</small></p>
              <Link className="btn primary" to={`/app/apply/${s.code}`}>Apply online</Link>
            </Card>
          ))}
        </div>
      )}
      {catalogReady && !list.length && <p>No services match your search. Try a shorter word or clear the department filter.</p>}
    </Page>
  );
}

export function Apply() {
  const { id } = useParams();
  const { svcByCode, deptName, catalogReady, profile, docs, refreshApps, refreshNotes, refreshDocs } = useApp();
  const svc = svcByCode(id);
  const nav = useNavigate();
  const [at, setAt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [up, setUp] = useState({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0][0]);
  const [result, setResult] = useState(null);
  const [payErr, setPayErr] = useState('');
  const [preview, setPreview] = useState(null);

  if (!catalogReady) return <Loading />;
  if (!svc) return <p>Service not found. <Link to="/app/services">Back to services</Link></p>;

  const onFile = (type) => docs.find((d) => d.type === type);
  const chosen = (type) => up[type] ?? onFile(type);
  const docsOk = svc.docs.every((type) => chosen(type));
  const rows = profile ? Object.entries(FIELD_LABELS).filter(([k]) => profile[k]) : null;

  const upload = async (type, file) => {
    if (!file) return;
    setBusy('upload:' + type); setErr('');
    try {
      const d = normalizeDoc(await api.documents.upload(file, type));
      setUp((u) => ({ ...u, [type]: { ...d, name: d.name || file.name, file } }));
      refreshDocs();
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const showPreview = (file) => {
    if (!file) return;
    setPreview({ file, url: URL.createObjectURL(file) });
  };
  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const submit = async () => {
    setBusy('submit'); setErr(''); setPayErr('');
    try {
      const created = await api.applications.submit({
        serviceCode: svc.code,
        formData: {},
        documentIds: svc.docs.map((type) => chosen(type).id),
      });
      setResult(created);
      if (svc.fee) { try { await api.applications.pay(created.id, method); } catch (e) { setPayErr(e.message); } }
      refreshApps(); refreshNotes();
      setAt(3);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  return (
    <Page title={svc.name} sub={`Handled by ${deptName(svc.dept)}${svc.days ? ` · About ${svc.days} working days` : ''}`}>
      <Steps items={['Your details', 'Documents', 'Review & pay', 'Done']} at={at} />

      <Card>
        {at === 0 && (<>
          <h3>We already have your details</h3>
          <p className="muted">Home Affairs holds your verified identity. It will share only the details {deptName(svc.dept)} is authorised to receive. You do not need to type them again.</p>
          {rows === null ? <Loading /> : rows.length ? (
            <dl className="kv">{rows.map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{profile[k]}</dd></div>)}</dl>
          ) : <p className="muted">Your verified details will be shared by Home Affairs.</p>}
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I agree that Home Affairs may share the details this department is authorised to receive with {deptName(svc.dept)} for this application.
          </label>
          <Help title="Why am I not asked to type my details?">
            <p className="muted" style={{ margin: 0 }}>
              Home Affairs is the authoritative source of your identity. When you apply for a service, we only forward the
              fields the receiving department is legally allowed to see. You can review what is shared and with whom at any time
              from the Departments page.
            </p>
          </Help>
        </>)}

        {at === 1 && (<>
          <h3>Supporting documents</h3>
          <div className="callout ok" style={{ marginBottom: 16 }}>
            <Icon name="lock" size={20} />
            <div>
              <b>Secure storage</b>
              <small>Documents are stored encrypted on Home Affairs infrastructure. Only the department handling your application can view them. All access is recorded in the audit log.</small>
            </div>
          </div>
          {!svc.docs.length && <p className="muted">No documents are required for this service.</p>}
          {svc.docs.map((type) => {
            const c = chosen(type);
            const isUp = busy === 'upload:' + type;
            return (
              <div className="row" key={type}>
                <div>
                  <b>{humanize(type)}</b>
                  {c ? <small className="ok-text"><Icon name="check" size={14} />{up[type] ? `Uploaded: ${c.name}` : 'Already on file. We will reuse it.'}</small>
                    : <small>Accepted: PDF, JPG or PNG · Max 5 MB</small>}
                </div>
                <div className="row-actions">
                  {up[type]?.file && (
                    <button type="button" className="btn sm" onClick={() => showPreview(up[type].file)}>
                      <Icon name="eye" size={14} />Preview
                    </button>
                  )}
                  {(!onFile(type) || up[type]) && (
                    <label className="btn file-btn">
                      <Icon name={isUp ? 'loader' : 'upload'} size={16} className={isUp ? 'spin' : ''} />
                      {c ? 'Replace' : 'Upload'}
                      <input type="file" accept={FILE_TYPES} disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(type, f); }} />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
          {!docsOk && <p className="callout warn"><Icon name="alert" size={20} />Please upload every required document to continue.</p>}
          {err && <p className="err" role="alert">{err}</p>}
        </>)}

        {at === 2 && (<>
          <h3>Review your application</h3>
          <dl className="kv">
            <div><dt>Service</dt><dd>{svc.name}</dd></div>
            <div><dt>Department</dt><dd>{deptName(svc.dept)}</dd></div>
            <div><dt>Documents</dt><dd>{svc.docs.length} attached</dd></div>
            <div><dt>Fee</dt><dd>{svc.fee ? money(svc.fee) + ' (pay at submission)' : 'Free'}</dd></div>
            <div><dt>Expected processing</dt><dd>{svc.days ? `${svc.days} working days` : 'As soon as possible'}</dd></div>
          </dl>
          {svc.fee > 0 && (
            <Field label="Payment method">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
          {err && <p className="err" role="alert">{err}</p>}
        </>)}

        {at === 3 && (<>
          <h3 className="success-title"><Icon name="check-circle" size={26} />Application submitted</h3>
          <p>Your reference number is <b>{result?.reference}</b>. A digital receipt has been added to your notifications.</p>
          {payErr && <p className="callout warn"><Icon name="alert" size={20} />Your application was submitted, but the payment did not go through: {payErr} You can pay from the application page.</p>}
          <div className="actions">
            <Link className="btn primary" to={`/app/applications/${result?.id}`}>Track this application</Link>
            <Link className="btn" to="/app/appointments">Book an appointment</Link>
          </div>
        </>)}

        {at < 3 && (
          <div className="actions">
            {at > 0
              ? <button className="btn" disabled={!!busy} onClick={() => { setErr(''); setAt(at - 1); }}>Back</button>
              : <button className="btn" onClick={() => nav('/app/services')}>Cancel</button>}
            <button className="btn primary" disabled={!!busy || (at === 0 && !consent) || (at === 1 && !docsOk)} onClick={() => (at === 2 ? submit() : (setErr(''), setAt(at + 1)))}>
              {busy === 'submit' && <Icon name="loader" size={16} className="spin" />}
              {at === 2 ? (svc.fee ? 'Pay ' + money(svc.fee) + ' and submit' : 'Submit') : 'Continue'}
            </button>
          </div>
        )}
      </Card>

      {preview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Document preview" onClick={closePreview}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <h2>{preview.file.name}</h2>
              <button type="button" className="btn ghost" onClick={closePreview} aria-label="Close preview"><Icon name="x" size={18} /></button>
            </div>
            <div className="modal-b">
              {preview.file.type?.startsWith('image/')
                ? <img src={preview.url} alt={preview.file.name} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }} />
                : <iframe src={preview.url} title={preview.file.name} style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8 }} />}
            </div>
            <div className="modal-f">
              <p className="muted" style={{ margin: 0 }}><small>Confirm this document is legible and complete before submitting.</small></p>
              <button type="button" className="btn primary" onClick={closePreview}>Looks good</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

export function Applications() {
  const { apps, appsReady } = useApp();
  return (
    <Page title="My applications">
      <Card>
        {!appsReady ? <Loading /> : (
          <table className="table">
            <thead><tr><th>Reference</th><th>Service</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/app/applications/${a.id}`}>{a.reference}</Link></td>
                  <td>{a.service?.name}</td>
                  <td>{fmtDate(a.createdAt)}</td>
                  <td><Badge s={a.status} /></td>
                </tr>
              ))}
              {!apps.length && <tr><td colSpan="4" className="muted">No applications yet.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}

export function ApplicationDetail() {
  const { id } = useParams();
  const { svcByCode, deptName, refreshApps, refreshNotes, flash } = useApp();
  const [a, setA] = useState(null);
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0][0]);

  const load = useCallback(async () => {
    try { setA(await api.applications.get(id)); setState('ok'); } catch { setState('missing'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (state === 'loading') return <Loading />;
  if (state === 'missing' || !a) return <p>Application not found. <Link to="/app/applications">Back to my applications</Link></p>;

  const svc = svcByCode(a.service?.code);
  const open = !TERMINAL.includes(a.status);
  const needsPay = open && a.paymentStatus === 'UNPAID' && svc?.fee > 0;
  const askTypes = a.missingDocuments?.length ? a.missingDocuments : svc?.docs ?? [];
  const type = docType || askTypes[0] || '';
  const ask = [...(a.history ?? [])].reverse().find((h) => h.toStatus === 'MORE_INFO_NEEDED')?.note;

  const run = async (fn, okMsg) => {
    setBusy(true); setErr('');
    try { await fn(); flash(okMsg); await load(); refreshApps(); refreshNotes(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const respond = (e) => {
    e.preventDefault();
    if (!file && !note.trim()) return setErr('Add a document or a short note so the department can continue.');
    return run(async () => {
      if (file) { const d = normalizeDoc(await api.documents.upload(file, type)); await api.applications.attachDocument(a.id, d.id); }
      await api.applications.respond(a.id, { formData: {}, note: note.trim() });
      setFile(null); setNote('');
    }, 'Thank you. Your application is back under review.');
  };
  const pay = () => run(() => api.applications.pay(a.id, method), 'Payment received. Your receipt is in your notifications.');
  const withdraw = () => { if (window.confirm('Withdraw this application? This cannot be undone.')) run(() => api.applications.withdraw(a.id), 'Application withdrawn'); };

  return (
    <Page title={a.service?.name} sub={`${a.reference} · ${a.department?.name ?? deptName(svc?.dept)}`}>
      <p><Badge s={a.status} /></p>
      {err && <p className="callout err" role="alert"><Icon name="alert" size={20} />{err}</p>}

      {a.status === 'MORE_INFO_NEEDED' && (<>
        <div className="callout warn">
          <Icon name="alert" size={22} />
          <div>
            <b>What you need to do next</b>
            {ask && <p style={{ margin: '6px 0 0' }}>{ask}</p>}
            {a.missingDocuments?.length > 0 && <ul>{a.missingDocuments.map((m) => <li key={m}>Upload: {humanize(m)}</li>)}</ul>}
          </div>
        </div>
        <Card title="Reply to the department">
          <form onSubmit={respond} noValidate>
            {askTypes.length > 0 && (
              <Field label="Document type">
                <select className="input" value={type} onChange={(e) => setDocType(e.target.value)}>
                  {askTypes.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
                </select>
              </Field>
            )}
            <div className="field">
              <span className="lbl">New document (optional)</span>
              <label className="btn file-btn">
                <Icon name="upload" size={16} />{file ? file.name : 'Choose a file'}
                <input type="file" accept={FILE_TYPES} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <Field label="Note (optional)">
              <textarea className="input" rows="3" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button className="btn primary" type="submit" disabled={busy}>
              <Icon name={busy ? 'loader' : 'upload'} size={16} className={busy ? 'spin' : ''} />Upload and resubmit
            </button>
          </form>
        </Card>
      </>)}

      {needsPay && (
        <div className="callout warn">
          <Icon name="credit-card" size={22} />
          <div><b>Fee not paid yet: {money(svc.fee)}</b><small>Your application cannot be completed until the fee is paid.</small></div>
          <select className="input" aria-label="Payment method" style={{ width: 'auto', margin: 0 }} value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn primary" disabled={busy} onClick={pay}><Icon name="credit-card" size={16} />Pay now</button>
        </div>
      )}

      {a.status === 'APPROVED' && <p className="callout ok"><Icon name="check-circle" size={20} />Approved. Your digital receipt and proof of service are in your notifications.</p>}

      {a.documents?.length > 0 && (
        <Card title="Documents">
          {a.documents.map((d) => (
            <div className="row" key={d.id}>
              <b>{humanize(d.type)}<small>{d.originalName}</small></b>
              <DocBadge d={d} />
            </div>
          ))}
        </Card>
      )}

      <Card title="Progress history">
        <ol className="timeline">
          {[...(a.history ?? [])].reverse().map((h, i) => (
            <li key={i}><b>{statusLabel(h.toStatus)}</b><small>{fmtDateTime(h.createdAt)}{h.note ? ' · ' + h.note : ''}</small></li>
          ))}
        </ol>
        {svc?.days && <p className="muted"><small>Expected processing: about {svc.days} working days.</small></p>}
      </Card>

      {open && <div className="actions"><button className="btn" disabled={busy} onClick={withdraw}><Icon name="x-circle" size={16} />Withdraw application</button></div>}
    </Page>
  );
}

export function Appointments() {
  const { departments, services, flash, refreshNotes } = useApp();
  const [list, setList] = useState(null);
  const [dept, setDept] = useState('');
  const [svcCode, setSvcCode] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (!dept && departments.length) setDept(departments[0].code); }, [departments, dept]);

  const loadList = useCallback(() => api.appointments.list()
    .then((r) => setList(asList(r).map(normalizeAppt)))
    .catch((e) => { setList([]); flash(e.message, 'error'); }), [flash]);
  useEffect(() => { loadList(); }, [loadList]);

  const loadSlots = useCallback(async () => {
    setErr('');
    if (!dept || !date) { setSlots(null); return; }
    setSlots(null);
    try { setSlots((await api.appointments.slots(dept, date)).slots ?? []); } catch (e) { setSlots([]); setErr(e.message); }
  }, [dept, date]);
  useEffect(() => { setSlot(''); loadSlots(); }, [loadSlots]);

  const book = async (e) => {
    e.preventDefault();
    if (!date) return setErr('Choose a date for your visit.');
    if (!slot) return setErr('Choose a time for your visit.');
    setBusy(true); setErr('');
    try {
      await api.appointments.book({ departmentCode: dept, serviceCode: svcCode, startsAt: slot });
      flash('Appointment confirmed');
      setSlot('');
      await Promise.all([loadList(), loadSlots()]);
      refreshNotes();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const cancel = async (id) => {
    if (!window.confirm('Cancel this appointment?')) return;
    try { await api.appointments.cancel(id); flash('Appointment cancelled'); loadList(); loadSlots(); refreshNotes(); }
    catch (e) { flash(e.message, 'error'); }
  };

  return (
    <Page title="Appointments" sub="Book a time so you do not have to queue.">
      <div className="grid2">
        <Card title="Book a visit">
          <form onSubmit={book} noValidate>
            <Field label="Department">
              <select className="input" value={dept} onChange={(e) => { setDept(e.target.value); setSvcCode(''); }}>
                {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Service (optional)">
              <select className="input" value={svcCode} onChange={(e) => setSvcCode(e.target.value)}>
                <option value="">Any service</option>
                {services.filter((s) => s.dept === dept).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input className="input" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="field" role="group" aria-labelledby="slot-label">
              <span id="slot-label" className="field-label">Time</span>
              {!date
                ? <small>Choose a date to see the free times.</small>
                : slots === null ? <Loading />
                : slots.length === 0 ? <small>No times on this day. Offices are closed at weekends, so try another date.</small>
                : <div className="slots">
                    {slots.map((s) => (
                      <button type="button" key={s.startsAt} className={'slot' + (slot === s.startsAt ? ' on' : '')} disabled={!s.bookable} aria-pressed={slot === s.startsAt} title={s.bookable ? `${s.available} free` : 'Not available'} onClick={() => setSlot(s.startsAt)}>
                        {fmtTime(s.startsAt)}
                      </button>
                    ))}
                  </div>}
              {err && <p className="err" role="alert">{err}</p>}
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              <Icon name={busy ? 'loader' : 'calendar'} size={16} className={busy ? 'spin' : ''} />Confirm appointment
            </button>
          </form>
        </Card>
        <Card title="Your appointments">
          {list === null ? <Loading /> : <>
            {list.map((a) => (
              <div className="row" key={a.id}>
                <div><b>{a.service ?? a.deptName}</b><small>{a.deptName} · {fmtDateTime(a.startsAt)} · {a.reference}{a.queueNumber ? ` · Queue no. ${a.queueNumber}` : ''}</small></div>
                <div className="row-actions">
                  <ApptBadge s={a.status} />
                  {a.status === 'BOOKED' && new Date(a.startsAt) > new Date() && (
                    <button className="btn sm" onClick={() => cancel(a.id)}><Icon name="x" size={14} />Cancel</button>
                  )}
                </div>
              </div>
            ))}
            {!list.length && <p className="muted">You have no appointments yet.</p>}
          </>}
        </Card>
      </div>
    </Page>
  );
}

export function Notifications() {
  const { notes, markAllRead, refreshNotes, flash } = useApp();
  useEffect(() => { refreshNotes(); }, [refreshNotes]);
  const read = async (id) => { try { await api.notifications.markRead(id); refreshNotes(); } catch (e) { flash(e.message, 'error'); } };
  return (
    <Page title="Notifications" sub="Also sent by SMS and email.">
      <button className="btn" onClick={markAllRead}><Icon name="check" size={16} />Mark all as read</button>
      <Card>
        {notes.map((n) => (
          <div className="row" key={n.id}>
            <div><b>{!n.readAt && <><Icon name="dot" size={10} className="new-dot" /> New · </>}{n.message}</b><small>{fmtDateTime(n.createdAt)}</small></div>
            {!n.readAt && <button className="btn sm" onClick={() => read(n.id)}>Mark read</button>}
          </div>
        ))}
        {!notes.length && <p className="muted">No notifications yet.</p>}
      </Card>
    </Page>
  );
}

export function About() {
  const { user } = useApp();
  return (
    <Page title="About GovServe Lesotho" sub="One platform, one verified identity, every department connected.">
      <Card>
        <div className="about-hero">
          <Icon name="shield-check" size={40} />
          <div>
            <h3>One verified identity from Home Affairs.</h3>
            <p className="muted">Apply once, track every step, and stop repeating the same documents.</p>
          </div>
        </div>
      </Card>

      <div className="grid3">
        <Card>
          <div className="about-point">
            <span className="about-icon"><Icon name="lock" size={22} /></span>
            <h3>Departments see only what they need</h3>
            <p className="muted">When you apply for a service, Home Affairs releases only the fields that department is authorised to receive. The rest stays with Home Affairs.</p>
          </div>
        </Card>
        <Card>
          <div className="about-point">
            <span className="about-icon"><Icon name="list" size={22} /></span>
            <h3>Every access to your data is recorded</h3>
            <p className="muted">Each time a department requests your identity, the request is logged. Nothing is shared silently and nothing is hidden from the record.</p>
          </div>
        </Card>
        <Card>
          <div className="about-point">
            <span className="about-icon"><Icon name="globe" size={22} /></span>
            <h3>Works on mobile and low bandwidth</h3>
            <p className="muted">The platform is built to stay usable on small screens and slow connections, so services reach every citizen, not only those with fast internet.</p>
          </div>
        </Card>
      </div>

      {user?.firstName && (
        <Card title={`Welcome, ${user.firstName}`}>
          <p className="muted">You are signed in as a verified citizen. From the dashboard you can browse services, submit applications, upload documents once, and track everything in one place.</p>
          <div className="actions">
            <Link className="btn primary" to="/app/services"><Icon name="grid" size={16} />Browse services</Link>
            <Link className="btn" to="/app/applications"><Icon name="file" size={16} />My applications</Link>
          </div>
        </Card>
      )}
    </Page>
  );
}