// AUTH MODULE: citizens sign in with National ID + one-time code; staff, officers and admins use email + password.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, Field, Icon } from '../core.jsx';
import { api } from '../api.js';
import coatOfArms from '../../images/coat-of-arms-of-lesotho-seeklogo.png';

export function Login() {
  const { login, staffLogin } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState('citizen'); // 'citizen' | 'staff'
  const [id, setId] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => { setMode(m); setStep(1); setErr(''); setOtp(''); };
  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    if (!/^[A-Z0-9-]{5,}$/i.test(id.trim())) return setErr('Enter your National ID number exactly as printed on your ID, for example LS-9004127788.');
    return run(async () => {
      const r = await api.auth.requestOtp(id.trim());
      setDevOtp(r?.devOtp ?? ''); // the backend only returns this in development / demo mode
      setOtp(''); setStep(2);
    });
  };
  const verify = (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setErr('Enter the 6-digit code we sent you.');
    return run(async () => { await login(id.trim(), otp); nav('/app'); });
  };
  const signInStaff = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return setErr('Enter your work email and password.');
    return run(async () => { await staffLogin(email.trim(), password); nav('/app'); });
  };

  return (
    <div className="auth">
      <aside>
        <div className="crest"><img src={coatOfArms} alt="Coat of arms of Lesotho" /></div>
        <h1>GovServe Lesotho</h1>
        <p>One verified identity from Home Affairs. Apply once, track every step, and stop repeating the same documents.</p>
        <ul>
          <li><Icon name="check-circle" size={20} />Departments see only what they need</li>
          <li><Icon name="check-circle" size={20} />Every access to your data is recorded</li>
          <li><Icon name="check-circle" size={20} />Works on mobile and low bandwidth</li>
        </ul>
      </aside>
      <main id="main">
        <form className="card-b card" onSubmit={mode === 'staff' ? signInStaff : step === 1 ? sendCode : verify} noValidate>
          <h2>{mode === 'staff' ? 'Staff sign in' : step === 1 ? 'Sign in' : 'Enter your code'}</h2>
          <div className="seg" role="group" aria-label="Who is signing in">
            <button type="button" aria-pressed={mode === 'citizen'} onClick={() => switchMode('citizen')}><Icon name="users" size={16} />Citizen</button>
            <button type="button" aria-pressed={mode === 'staff'} onClick={() => switchMode('staff')}><Icon name="key" size={16} />Staff</button>
          </div>

          {mode === 'staff' ? (
            <>
              <Field label="Work email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
              <Field label="Password" error={err}><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
              <button className="btn primary block" type="submit" disabled={busy}><Icon name={busy ? 'loader' : 'log-out'} size={16} className={busy ? 'spin' : ''} />Sign in</button>
            </>
          ) : step === 1 ? (
            <>
              <Field label="National ID number" hint="This is the number on your national ID card." error={err}>
                <input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" inputMode="text" />
              </Field>
              <button className="btn primary block" type="submit" disabled={busy}><Icon name={busy ? 'loader' : 'arrow-right'} size={16} className={busy ? 'spin' : ''} />Send me a code</button>
            </>
          ) : (
            <>
              <p className="muted">We sent a 6-digit code to the phone number or email Home Affairs has on file for <b>{id.trim()}</b>.</p>
              {devOtp && <p className="callout warn"><Icon name="alert" size={18} />Prototype mode: your code is <b>{devOtp}</b>.</p>}
              <Field label="6-digit code" error={err}><input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" /></Field>
              <button className="btn primary block" type="submit" disabled={busy}><Icon name={busy ? 'loader' : 'check'} size={16} className={busy ? 'spin' : ''} />Verify and sign in</button>
              <button type="button" className="btn block" disabled={busy} onClick={sendCode}><Icon name="refresh" size={16} />Send a new code</button>
              <button type="button" className="btn ghost block" onClick={() => { setStep(1); setErr(''); }}>Back</button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}