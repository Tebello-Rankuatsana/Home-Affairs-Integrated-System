// CITIZEN MODULE: dashboard, service catalogue, apply wizard, tracking, appointments, notifications.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, Card, Badge, Field, Steps, Page, SERVICES, DEPTS, FIELDS, ACCESS, STATUS, svcOf } from '../core.jsx';

const mine = (apps, u) => apps.filter((a) => a.citizen.nid === u.nid);
const PROGRESS = { submitted: 25, review: 60, info: 50, approved: 100, rejected: 100 };

export function CitizenHome() {
  const { user, t, apps, appts, notes } = useApp();
  const my = mine(apps, user);
  const next = appts.find((a) => a.nid === user.nid);
  return (
    <Page title={`${t('hello')}, ${user.name.split(' ')[0]}`} sub="Here is where your applications and appointments stand today.">
      <p className="callout ok">✓ Your identity is verified by Home Affairs. Departments request only the details they need and every request is recorded.</p>
      <div className="grid3">
        <div className="stat"><b>{my.filter((a) => !['approved', 'rejected'].includes(a.status)).length}</b>Active applications</div>
        <div className="stat"><b>{my.filter((a) => a.status === 'info').length}</b>Need your action</div>
        <div className="stat"><b>{notes.filter((n) => !n.read).length}</b>Unread notifications</div>
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
  const list = SERVICES.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) && (!d || s.dept === d));
  return (
    <Page title="Government services" sub="Find a service from any department in one place.">
      <div className="filters">
        <input className="input" placeholder="Search services, e.g. passport" aria-label="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Department" value={d} onChange={(e) => setD(e.target.value)}><option value="">All departments</option>{Object.entries(DEPTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="grid3">
        {list.map((s) => (
          <Card key={s.id}><h3>{s.name}</h3><p className="muted">{DEPTS[s.dept]}</p><p><small>Fee: {s.fee ? 'M' + s.fee : 'Free'} · About {s.days} working days</small></p><Link className="btn primary" to={`/app/apply/${s.id}`}>Apply online</Link></Card>
        ))}
      </div>
      {!list.length && <p>No services match your search. Try a shorter word or clear the department filter.</p>}
    </Page>
  );
}

export function Apply() {
  const { id } = useParams();
  const svc = svcOf(id);
  const { user, submit } = useApp();
  const nav = useNavigate();
  const [at, setAt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [up, setUp] = useState({});
  const [ref, setRef] = useState('');
  if (!svc) return <p>Service not found.</p>;
  const has = (d) => user.onFile.includes(d) || up[d];
  const docsOk = svc.docs.every(has);
  return (
    <Page title={svc.name} sub={`Handled by ${DEPTS[svc.dept]}`}>
      <Steps items={['Your details', 'Documents', 'Review & pay', 'Done']} at={at} />
      <Card>
        {at === 0 && (<>
          <h3>We already have your details</h3>
          <p className="muted">Home Affairs will share only these details with {DEPTS[svc.dept]}. You do not need to type them again.</p>
          <dl className="kv">{ACCESS[svc.dept].map((k) => <div key={k}><dt>{FIELDS[k]}</dt><dd>{user[k]}</dd></div>)}</dl>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree that Home Affairs may share these details with {DEPTS[svc.dept]} for this application.</label>
        </>)}
        {at === 1 && (<>
          <h3>Supporting documents</h3>
          {svc.docs.map((d) => (
            <div className="row" key={d}><div><b>{d}</b><small>{user.onFile.includes(d) ? '✓ Already on file. We will reuse it.' : up[d] ? '✓ Uploaded' : 'Required: PDF, JPG or PNG, up to 5 MB'}</small></div>
              {!user.onFile.includes(d) && <button className="btn" onClick={() => setUp({ ...up, [d]: true })}>{up[d] ? 'Replace' : 'Upload'}</button>}</div>
          ))}
          {!docsOk && <p className="callout warn">Please upload every required document to continue.</p>}
        </>)}
        {at === 2 && (<><h3>Review your application</h3><dl className="kv"><div><dt>Service</dt><dd>{svc.name}</dd></div><div><dt>Department</dt><dd>{DEPTS[svc.dept]}</dd></div><div><dt>Documents</dt><dd>{svc.docs.length} attached</dd></div><div><dt>Fee</dt><dd>{svc.fee ? 'M' + svc.fee + ' (pay at submission)' : 'Free'}</dd></div></dl></>)}
        {at === 3 && (<><h3>✓ Application submitted</h3><p>Your reference number is <b>{ref}</b>. A digital receipt has been added to your notifications.</p><div className="actions"><Link className="btn primary" to={`/app/applications/${ref}`}>Track this application</Link><Link className="btn" to="/app/appointments">Book an appointment</Link></div></>)}
        {at < 3 && (
          <div className="actions">
            {at > 0 ? <button className="btn" onClick={() => setAt(at - 1)}>Back</button> : <button className="btn" onClick={() => nav('/app/services')}>Cancel</button>}
            <button className="btn primary" disabled={(at === 0 && !consent) || (at === 1 && !docsOk)} onClick={() => (at === 2 ? (setRef(submit(svc)), setAt(3)) : setAt(at + 1))}>{at === 2 ? (svc.fee ? 'Pay M' + svc.fee + ' and submit' : 'Submit') : 'Continue'}</button>
          </div>
        )}
      </Card>
    </Page>
  );
}

export function Applications() {
  const { user, apps } = useApp();
  return (
    <Page title="My applications">
      <Card>
        <table className="table"><thead><tr><th>Reference</th><th>Service</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>{mine(apps, user).map((a) => <tr key={a.id}><td><Link to={`/app/applications/${a.id}`}>{a.id}</Link></td><td>{svcOf(a.svc).name}</td><td>{a.date}</td><td><Badge s={a.status} /></td></tr>)}</tbody></table>
      </Card>
    </Page>
  );
}

export function ApplicationDetail() {
  const { id } = useParams();
  const { apps, respond } = useApp();
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
  const go = (e) => { e.preventDefault(); if (!f.date) return setErr('Choose a date for your visit.'); setErr(''); book(f); };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Page title="Appointments" sub="Book a time so you do not have to queue.">
      <div className="grid2">
        <Card title="Book a visit">
          <form onSubmit={go} noValidate>
            <Field label="Service"><select className="input" value={f.svc} onChange={set('svc')}>{SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Service centre"><select className="input" value={f.branch} onChange={set('branch')}>{['Maseru', 'Mafeteng', 'Leribe', 'Mohale’s Hoek', 'Qacha’s Nek'].map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Date" error={err}><input className="input" type="date" min="2026-10-04" value={f.date} onChange={set('date')} /></Field>
            <Field label="Time" hint="Estimated waiting time on arrival: about 10 minutes."><select className="input" value={f.slot} onChange={set('slot')}>{['08:30', '09:00', '09:30', '10:30', '11:30', '14:00'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <button className="btn primary" type="submit">Confirm appointment</button>
          </form>
        </Card>
        <Card title="Your appointments">
          {appts.filter((a) => a.nid === user.nid).map((a) => <div className="row" key={a.id}><div><b>{svcOf(a.svc).name}</b><small>{a.branch} · {a.date} at {a.slot}</small></div><span className="badge green">✓ Confirmed</span></div>)}
        </Card>
      </div>
    </Page>
  );
}

export function Notifications() {
  const { notes, setNotes } = useApp();
  return (
    <Page title="Notifications" sub="Also sent by SMS and email.">
      <button className="btn" onClick={() => setNotes(notes.map((n) => ({ ...n, read: true })))}>Mark all as read</button>
      <Card>{notes.map((n) => <div className="row" key={n.id}><div><b>{n.read ? '' : '● New · '}{n.msg}</b><small>{n.t}</small></div></div>)}</Card>
    </Page>
  );
}
