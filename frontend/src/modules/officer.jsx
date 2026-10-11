// OFFICER MODULE: Home Affairs identity lookup and citizen registration.
// Both flows hit the backend directly; every lookup is audited server-side.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, Card, Field, Page, Icon, Loading, FIELD_LABELS } from '../core.jsx';
import { api } from '../api.js';

/* ---------- Identity lookup ---------- */

export function Lookup() {
  const { flash } = useApp();
  const [nid, setNid] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    setErr(''); setResult(null); setBusy(true);
    try {
      const r = await api.identity.verify({ nationalId: nid.trim() });
      setResult(r);
    } catch (ex) {
      setErr(ex.message);
      if (ex.status === 404) flash('No citizen found with that ID.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setNid(''); setResult(null); setErr(''); };

  return (
    <Page
      title="Identity lookup"
      sub="Look up a citizen in the Home Affairs register. Every lookup is recorded in the audit log."
    >
      <Card title="Find a citizen">
        <form onSubmit={search} noValidate>
          <Field label="National ID number" hint="e.g. 1990010100001" error={err}>
            <input
              className="input"
              value={nid}
              onChange={(e) => setNid(e.target.value)}
              inputMode="text"
              autoComplete="off"
              autoFocus
            />
          </Field>
          <div className="actions">
            <button className="btn primary" type="submit" disabled={busy || !nid.trim()}>
              <Icon name={busy ? 'loader' : 'search'} size={16} className={busy ? 'spin' : ''} />
              {busy ? 'Searching…' : 'Search'}
            </button>
            {result && <button className="btn" type="button" onClick={reset}>Clear</button>}
          </div>
        </form>
      </Card>

      {busy && !result && <Card><Loading /></Card>}

      {result && (
        <Card
          title="Verified record"
          action={<span className="badge green"><Icon name="check-circle" size={13} /> Verified</span>}
        >
          <dl className="kv">
            {Object.entries(FIELD_LABELS).map(([k, label]) => {
              const v = k === 'nationalId' ? result.nationalId : result.data?.[k];
              return (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd>{v ?? '—'}</dd>
                </div>
              );
            })}
          </dl>
          <p className="muted">
            <small>
              Source: {result.source} ·{' '}
              {result.cache === 'hit' ? 'Cached copy' : 'Fresh lookup'} · this request has been logged.
            </small>
          </p>
        </Card>
      )}
    </Page>
  );
}

/* ---------- Register a citizen ---------- */

const EMPTY = {
  nationalId: '', fullName: '', dateOfBirth: '', gender: 'M',
  citizenship: 'Lesotho', address: '', phone: '', email: '',
};

export function Register() {
  const { flash } = useApp();
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const body = {
        nationalId:  form.nationalId.trim(),
        fullName:    form.fullName.trim(),
        dateOfBirth: form.dateOfBirth,
        gender:      form.gender || undefined,
        citizenship: form.citizenship.trim(),
        address:     form.address.trim(),
        phone:       form.phone.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      };
      const r = await api.citizens.create(body);
      setCreated(r);
      flash(`Citizen ${r.nationalId} registered`);
      setForm(EMPTY);
    } catch (ex) {
      setErr(ex.issues?.length
        ? ex.issues.map((i) => `${i.path}: ${i.message}`).join(', ')
        : ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Register a citizen"
      sub="Creates the identity record in Home Affairs. The citizen can then sign in with this national ID and a one-time code."
    >
      {created && (
        <p className="callout ok">
          <Icon name="check-circle" size={20} />
          <div>
            <b>{created.nationalId}</b> registered successfully. The citizen can now sign in with their ID and OTP.
          </div>
          <Link className="btn" to="/app">Back to lookup</Link>
        </p>
      )}

      <Card title="New citizen record">
        <form onSubmit={submit} noValidate>
          <div className="grid2">
            <Field label="National ID number" hint="Digits, as printed on the ID card.">
              <input className="input" value={form.nationalId} onChange={set('nationalId')} required autoComplete="off" />
            </Field>
            <Field label="Full name">
              <input className="input" value={form.fullName} onChange={set('fullName')} required />
            </Field>
            <Field label="Date of birth">
              <input className="input" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} required />
            </Field>
            <Field label="Gender">
              <select className="input" value={form.gender} onChange={set('gender')}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="OTHER">Other</option>
                <option value="UNSPECIFIED">Prefer not to say</option>
              </select>
            </Field>
            <Field label="Citizenship">
              <input className="input" value={form.citizenship} onChange={set('citizenship')} required />
            </Field>
            <Field label="Phone">
              <input className="input" value={form.phone} onChange={set('phone')} required autoComplete="off" />
            </Field>
            <Field label="Email (optional)">
              <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
            </Field>
            <Field label="Address">
              <input className="input" value={form.address} onChange={set('address')} required />
            </Field>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="actions">
            <button className="btn primary" type="submit" disabled={busy}>
              <Icon name={busy ? 'loader' : 'user-plus'} size={16} className={busy ? 'spin' : ''} />
              {busy ? 'Saving…' : 'Register citizen'}
            </button>
          </div>
        </form>
      </Card>
    </Page>
  );
}