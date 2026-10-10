// AUTH MODULE: Login (ID number + OTP, with alternative methods for accessibility).
// Live-first: tries the real backend (POST /auth/otp/request + /auth/otp/verify for
// citizens, POST /auth/staff/login for staff email+password), falls back to the
// prototype mock accounts when the backend is unreachable. No backend changes.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, Field, toFrontUser } from '../core.jsx';
import { requestOtp, verifyOtp, staffLogin, fetchMe, setSession, apiBase, ApiError } from '../lib/api.js';

const DEMO = [['Citizen', 'LS-9004127788'], ['Traffic staff', 'TT-STAFF-01'], ['Passport staff', 'PP-STAFF-01'], ['Administrator', 'ADM-01']];
const METHODS = { sms: 'SMS code to my phone', email: 'Code to my email', voice: 'Voice call with the code (no reading needed)', bio: 'Fingerprint on my device' };

export function Login() {
  const { login, loginAs } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState('citizen'); // citizen | staff
  const [id, setId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [method, setMethod] = useState('sms');
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async (e) => {
    e.preventDefault();
    const nid = id.trim();
    if (!/^[A-Z0-9-]{5,}$/i.test(nid)) return setErr('Enter your National ID number exactly as printed on your ID, for example LS-9004127788.');
    setErr(''); setInfo(''); setBusy(true);
    try {
      const r = await requestOtp(nid);
      setStep(2);
      // devOtp is returned only outside production — show it so the demo can proceed.
      setInfo(r?.devOtp ? `Demo code from live API (${apiBase()}): ${r.devOtp} — enter it below.` : 'If this ID is registered, a one-time code has been sent. (Backend unreachable? Use 123456 for the prototype account.)');
    } catch (ex) {
      // Backend unreachable or unknown ID — continue offline with prototype code.
      setStep(2);
      setInfo(ex instanceof ApiError && ex.status === 429
        ? 'Too many code requests. Wait a minute, or use prototype code 123456.'
        : 'Backend unreachable — prototype mode. Use code 123456.');
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    const nid = id.trim();
    setErr(''); setBusy(true);
    // 1) Try the live backend first.
    try {
      const r = await verifyOtp(nid, otp.trim());
      setSession(r.token, {
        id: r.user?.id, nationalId: r.user?.nationalId || nid,
        firstName: r.user?.firstName, lastName: r.user?.lastName,
        name: [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' '),
        role: 'CITIZEN',
      });
      // Hydrate display profile from GET /me when possible (non-fatal if it fails).
      let stored = null;
      try {
        const me = await fetchMe();
        stored = { ...me, role: 'CITIZEN' };
      } catch { stored = null; }
      const front = toFrontUser(stored || { nationalId: r.user?.nationalId || nid, firstName: r.user?.firstName, lastName: r.user?.lastName, role: 'CITIZEN', id: r.user?.id });
      loginAs(front);
      nav('/app');
      return;
    } catch (ex) {
      if (ex instanceof ApiError && ex.status !== 0 && ex.status !== 401) {
        setBusy(false);
        return setErr(`${ex.message}${ex.hint ? ` — ${ex.hint}` : ''}`);
      }
      // fall through to prototype check below
    }
    // 2) Prototype fallback (backend down or citizen not in live DB).
    if (otp !== '123456') { setBusy(false); return setErr('That code is not correct. Check your messages and try again, or choose a different way to receive a code.'); }
    if (!login(nid)) { setBusy(false); setStep(1); return setErr('We could not find an active account for that ID. Check the number or visit a service centre for help.'); }
    setBusy(false);
    nav('/app');
  };

  const staffGo = async (e) => {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      const r = await staffLogin(email.trim(), password);
      setSession(r.token, { id: r.user?.id, email: r.user?.email || email.trim(), role: r.role, department: r.department || r.user?.departmentCode, name: r.user?.email || email.trim() });
      const front = toFrontUser({ id: r.user?.id, email: r.user?.email || email.trim(), role: r.role, department: r.department || r.user?.departmentCode, name: r.user?.email || email.trim() });
      loginAs(front);
      nav('/app');
    } catch (ex) {
      if (ex instanceof ApiError && ex.status === 0) {
        // Offline fallback for demo staff chips (TT-STAFF-01 etc. are prototype-only IDs).
        const u = login(email.trim());
        if (u) { nav('/app'); return; }
        setErr('Backend unreachable and no prototype account matches that email. For the offline demo, put a prototype ID (e.g. TT-STAFF-01) in the citizen box.');
      } else {
        setErr(`${ex.message || 'Staff sign-in failed.'}${ex.hint ? ` — ${ex.hint}` : ''}`);
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <aside>
        <h1>GovServe Lesotho</h1>
        <p>One verified identity from Home Affairs. Apply once, track every step, and stop repeating the same documents.</p>
        <ul><li>✓ Departments see only what they need</li><li>✓ Every access to your data is recorded</li><li>✓ Works on mobile and low bandwidth</li></ul>
      </aside>
      <main id="main">
        <form className="card-b card" onSubmit={mode === 'staff' ? staffGo : step === 1 ? next : verify} noValidate>
          <h2>{mode === 'staff' ? 'Staff sign in' : step === 1 ? 'Sign in' : 'Enter your code'}</h2>
          <div className="chips" role="tablist" aria-label="Sign-in mode">
            <button type="button" className="chip" aria-pressed={mode === 'citizen'} onClick={() => { setMode('citizen'); setErr(''); setInfo(''); }}>Citizen (ID + OTP)</button>
            <button type="button" className="chip" aria-pressed={mode === 'staff'} onClick={() => { setMode('staff'); setErr(''); setInfo(''); }}>Staff (email + password)</button>
          </div>
          {mode === 'staff' ? (
            <>
              <Field label="Staff email" hint="Live backend account, e.g. traffic@gov.test (demo)." error={err}>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" />
              </Field>
              <Field label="Password">
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              {info && <p className="muted" role="status">{info}</p>}
            </>
          ) : step === 1 ? (
            <Field label="National ID number" hint="Live IDs look like 1990010100001; prototype IDs look like LS-9004127788." error={err}>
              <input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" inputMode="text" />
            </Field>
          ) : (
            <>
              <Field label="How should we verify you?"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="6-digit code" hint="Live API sends a real code (shown above when in demo mode). Prototype: use 123456." error={err}><input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" /></Field>
              {info && <p className="muted" role="status">{info}</p>}
            </>
          )}
          <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'staff' ? 'Sign in' : step === 1 ? 'Continue' : 'Verify and sign in'}</button>
          {mode === 'citizen' && step === 2 && <button type="button" className="btn ghost block" onClick={() => { setStep(1); setErr(''); }}>Back</button>}
          <hr />
          <p className="muted">Prototype demo accounts:</p>
          <div className="chips">{DEMO.map(([l, v]) => <button type="button" key={v} className="chip" onClick={() => { setMode('citizen'); setId(v); setStep(1); setErr(''); }}>{l}</button>)}</div>
        </form>
      </main>
    </div>
  );
}
