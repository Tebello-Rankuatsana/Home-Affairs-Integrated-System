
// AUTH MODULE: Login (ID number + OTP, with alternative methods for accessibility).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, Field } from '../core.jsx';

const DEMO = [['Citizen', 'LS-9004127788'], ['Traffic staff', 'TT-STAFF-01'], ['Passport staff', 'PP-STAFF-01'], ['Administrator', 'ADM-01']];
const METHODS = { sms: 'SMS code to my phone', email: 'Code to my email', voice: 'Voice call with the code (no reading needed)', bio: 'Fingerprint on my device' };

export function Login() {
  const { login } = useApp();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [otp, setOtp] = useState('');
  const [method, setMethod] = useState('sms');
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');

  const next = (e) => {
    e.preventDefault();
    if (!/^[A-Z0-9-]{5,}$/i.test(id.trim())) return setErr('Enter your National ID number exactly as printed on your ID, for example LS-9004127788.');
    setErr(''); setStep(2);
  };
  const verify = (e) => {
    e.preventDefault();
    if (otp !== '123456') return setErr('That code is not correct. Check your messages and try again, or choose a different way to receive a code.');
    if (!login(id)) { setStep(1); return setErr('We could not find an active account for that ID. Check the number or visit a service centre for help.'); }
    nav('/app');
  };

  return (
    <div className="auth">
      <aside>
        <h1>GovServe Lesotho</h1>
        <p>One verified identity from Home Affairs. Apply once, track every step, and stop repeating the same documents.</p>
        <ul><li>✓ Departments see only what they need</li><li>✓ Every access to your data is recorded</li><li>✓ Works on mobile and low bandwidth</li></ul>
      </aside>
      <main id="main">
        <form className="card-b card" onSubmit={step === 1 ? next : verify} noValidate>
          <h2>{step === 1 ? 'Sign in' : 'Enter your code'}</h2>
          {step === 1 ? (
            <Field label="National ID number" hint="This is the number on your national ID card." error={err}>
              <input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" inputMode="text" />
            </Field>
          ) : (
            <>
              <Field label="How should we verify you?"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="6-digit code" hint="Prototype: use 123456." error={err}><input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" /></Field>
            </>
          )}
          <button className="btn primary block" type="submit">{step === 1 ? 'Continue' : 'Verify and sign in'}</button>
          {step === 2 && <button type="button" className="btn ghost block" onClick={() => { setStep(1); setErr(''); }}>Back</button>}
          <hr />
          <p className="muted">Prototype demo accounts:</p>
          <div className="chips">{DEMO.map(([l, v]) => <button type="button" key={v} className="chip" onClick={() => { setId(v); setStep(1); setErr(''); }}>{l}</button>)}</div>
        </form>
      </main>
    </div>
  );
}
