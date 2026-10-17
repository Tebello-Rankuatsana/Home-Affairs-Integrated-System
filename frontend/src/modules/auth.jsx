// AUTH MODULE: registration, password login, OTP login, password recovery,
// staff login, all on one page with a tabbed flow.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, Field, Icon } from '../core.jsx';
import { api } from '../api.js';
import coatOfArms from '../../images/coat-of-arms-of-lesotho-seeklogo.png';

// Validators
const ID_RE = /^[A-Z0-9-]{5,20}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,}$/;

export function Login() {
  const { login, loginWithPassword, registerCitizen, requestRecovery, flash } = useApp();
  const nav = useNavigate();

  // Top-level tab: 'signin' | 'register' | 'recover'
  const [tab, setTab] = useState('signin');

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
        <div className="card-b card" style={{ maxWidth: 480, width: '100%' }}>
          <h2>
            {tab === 'signin' && 'Sign in'}
            {tab === 'register' && 'Create an account'}
            {tab === 'recover' && 'Reset your password'}
          </h2>

          <div className="seg" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-pressed={tab === 'signin'} onClick={() => setTab('signin')}>
              <Icon name="log-out" size={16} />Sign in
            </button>
            <button type="button" role="tab" aria-pressed={tab === 'register'} onClick={() => setTab('register')}>
              <Icon name="user-plus" size={16} />Register
            </button>
            <button type="button" role="tab" aria-pressed={tab === 'recover'} onClick={() => setTab('recover')}>
              <Icon name="key" size={16} />Recover
            </button>
          </div>

          {tab === 'signin' && <SignIn onDone={() => nav('/app')} login={login} loginWithPassword={loginWithPassword} onForgot={() => setTab('recover')} />}
          {tab === 'register' && <Register onDone={() => nav('/app')} registerCitizen={registerCitizen} flash={flash} />}
          {tab === 'recover' && <Recover requestRecovery={requestRecovery} onDone={() => setTab('signin')} />}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIGN IN — Citizen by ID + password, Citizen by ID + OTP, Staff by email
// ---------------------------------------------------------------------------
function SignIn({ onDone, login, loginWithPassword, onForgot }) {
  const [mode, setMode] = useState('password'); // 'password' | 'otp' | 'staff'
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [otpStep, setOtpStep] = useState(1);
  const [email, setEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const signInPassword = (e) => {
    e.preventDefault();
    if (!ID_RE.test(id.trim())) return setErr('Enter your National ID or temporary ID exactly as printed.');
    if (!password) return setErr('Enter your password.');
    return run(async () => { await loginWithPassword(id.trim(), password); onDone(); });
  };
  const signInStaff = (e) => {
    e.preventDefault();
    if (!email.trim() || !staffPassword) return setErr('Enter your work email and password.');
    return run(async () => { await loginStaff(email.trim(), staffPassword); onDone(); });
  };
  const sendCode = (e) => {
    e?.preventDefault();
    if (!ID_RE.test(id.trim())) return setErr('Enter your National ID or temporary ID.');
    return run(async () => {
      const r = await api.auth.requestOtp(id.trim());
      setDevOtp(r?.devOtp ?? '');
      setOtp(''); setOtpStep(2);
    });
  };
  const verify = (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setErr('Enter the 6-digit code we sent you.');
    return run(async () => { await login(id.trim(), otp); onDone(); });
  };

  // staffLogin is passed via useApp in Login — grab from context here too
  const { staffLogin: loginStaff } = useApp();

  return (
    <>
      <div className="seg" role="group" aria-label="Sign-in method" style={{ marginTop: 0 }}>
        <button type="button" aria-pressed={mode === 'password'} onClick={() => { setMode('password'); setErr(''); }}>
          <Icon name="lock" size={14} />ID + Password
        </button>
        <button type="button" aria-pressed={mode === 'otp'} onClick={() => { setMode('otp'); setErr(''); setOtpStep(1); }}>
          <Icon name="send" size={14} />ID + OTP
        </button>
        <button type="button" aria-pressed={mode === 'staff'} onClick={() => { setMode('staff'); setErr(''); }}>
          <Icon name="briefcase" size={14} />Staff
        </button>
      </div>

      {mode === 'password' && (
        <form onSubmit={signInPassword} noValidate>
          <Field label="National ID " error={err}>
            <input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password" hint="Forgot it? Use the Recover tab above.">
            <div className="pw-wrap">
              <input className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </Field>
          <button className="btn primary block" type="submit" disabled={busy}>
            <Icon name={busy ? 'loader' : 'log-out'} size={16} className={busy ? 'spin' : ''} />Sign in
          </button>
          <button type="button" className="btn ghost block" onClick={onForgot}>
            <Icon name="key" size={16} />Forgot password?
          </button>
        </form>
      )}

      {mode === 'otp' && otpStep === 1 && (
        <form onSubmit={sendCode} noValidate>
          <Field label="National ID " hint="We'll send a one-time code to your registered phone or email." error={err}>
            <input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
          </Field>
          <button className="btn primary block" type="submit" disabled={busy}>
            <Icon name={busy ? 'loader' : 'arrow-right'} size={16} className={busy ? 'spin' : ''} />Send me a code
          </button>
        </form>
      )}

      {mode === 'otp' && otpStep === 2 && (
        <form onSubmit={verify} noValidate>
          <p className="muted">We sent a 6-digit code to the phone number or email on file for <b>{id.trim()}</b>.</p>
          {devOtp && <p className="callout warn"><Icon name="alert" size={18} />Prototype mode: your code is <b>{devOtp}</b>.</p>}
          <Field label="6-digit code" error={err}>
            <input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
          </Field>
          <button className="btn primary block" type="submit" disabled={busy}>
            <Icon name={busy ? 'loader' : 'check'} size={16} className={busy ? 'spin' : ''} />Verify and sign in
          </button>
          <button type="button" className="btn block" disabled={busy} onClick={sendCode}>
            <Icon name="refresh" size={16} />Send a new code
          </button>
          <button type="button" className="btn ghost block" onClick={() => { setOtpStep(1); setErr(''); }}>Back</button>
        </form>
      )}

      {mode === 'staff' && (
        <form onSubmit={signInStaff} noValidate>
          <Field label="Work email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password" error={err}>
            <input className="input" type="password" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <button className="btn primary block" type="submit" disabled={busy}>
            <Icon name={busy ? 'loader' : 'log-out'} size={16} className={busy ? 'spin' : ''} />Sign in
          </button>
        </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// REGISTER — with two identity paths (has ID vs. no ID)
// ---------------------------------------------------------------------------
const REG_STEPS = ['Account', 'Identity', 'Security'];

function Register({ onDone, registerCitizen, flash }) {
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Step 1 — account
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 — identity
  const [hasId, setHasId] = useState(true);
  const [nationalId, setNationalId] = useState('');
  const [birthCert, setBirthCert] = useState('');
  const [placeOfBirth, setPlaceOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [idUpload, setIdUpload] = useState(null);

  // Step 2 — no-ID variant
  const [parentNames, setParentNames] = useState('');
  const [supportingDocs, setSupportingDocs] = useState(null);

  // Step 3 — security question
  const [question, setQuestion] = useState('What is the name of your first school?');
  const [answer, setAnswer] = useState('');

  const next = () => {
    setErr('');
    if (step === 0) {
      if (!fullName.trim()) return setErr('Enter your full name as printed on your ID or birth certificate.');
      if (!dateOfBirth) return setErr('Enter your date of birth.');
      const hasContact = (email.trim() && EMAIL_RE.test(email.trim())) ||
                         (phone.trim() && PHONE_RE.test(phone.trim()));
      if (!hasContact) return setErr('Provide a valid email or phone number so we can contact you.');
      if (password.length < 8) return setErr('Password must be at least 8 characters.');
      if (password !== confirm) return setErr('Passwords do not match.');
      return setStep(1);
    }
    if (step === 1) {
      if (hasId) {
        if (!nationalId.trim() && !birthCert.trim()) {
          return setErr('Enter your National ID number or Birth Certificate number.');
        }
        if (nationalId && !ID_RE.test(nationalId.trim())) {
          return setErr('National ID has an invalid format.');
        }
      } else {
        if (!placeOfBirth.trim()) return setErr('Enter your place of birth.');
        if (!parentNames.trim()) return setErr('Enter your parent or guardian names.');
      }
      return setStep(2);
    }
    return setStep(2);
  };

  const back = () => { setErr(''); setStep((s) => Math.max(0, s - 1)); };

  const submit = async (e) => {
    e.preventDefault();
    if (!answer.trim()) return setErr('Enter an answer to the security question.');
    setBusy(true); setErr('');
    try {
      const body = {
        fullName: fullName.trim(),
        dateOfBirth,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        securityQuestion: question,
        securityAnswer: answer.trim(),
        hasId,
        ...(hasId
          ? {
              nationalId: nationalId.trim() || undefined,
              birthCertificateNumber: birthCert.trim() || undefined,
              placeOfBirth: placeOfBirth.trim() || undefined,
              address: address.trim() || undefined,
            }
          : {
              placeOfBirth: placeOfBirth.trim(),
              parentGuardianNames: parentNames.trim(),
            }),
      };
      // Optional file upload for ID — done after the account exists
      const created = await registerCitizen(body);
      // If an ID scan was provided, upload it now that we have a session
      if (hasId && idUpload) {
        try { await api.documents.upload(idUpload, 'NATIONAL_ID'); } catch { /* non-fatal */ }
      }
      if (!hasId && supportingDocs) {
        try { await api.documents.upload(supportingDocs, 'SUPPORTING_DOC'); } catch { /* non-fatal */ }
      }
      flash(!hasId
        ? 'Temporary ID created. It will be auto-disabled once your real ID is issued.'
        : 'Account created. Welcome to GovServe Lesotho.');
      onDone();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <>
      <ol className="steps" aria-label="Registration progress">
        {REG_STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i < step ? <Icon name="check" size={16} /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <form onSubmit={step === 2 ? submit : (e) => { e.preventDefault(); next(); }} noValidate>
        {step === 0 && (
          <>
            <Field label="Full name (as on ID or birth certificate)" required>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Date of birth" required>
              <input className="input" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </Field>
            <div className="grid2" style={{ gap: 12 }}>
              <Field label="Email">
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Phone number">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </Field>
            </div>
            <small style={{ display: 'block', marginBottom: 12 }}>Provide at least one contact method for verification and recovery.</small>
            <Field label="Password (min 8 characters)" required>
              <div className="pw-wrap">
                <input className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <button type="button" className="pw-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
                </button>
              </div>
            </Field>
            <Field label="Confirm password" required error={err}>
              <input className="input" type={showPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <div className="callout ok" style={{ marginBottom: 16 }}>
              <Icon name="info" size={20} />
              <div>
                <b>Which identity documents do you have?</b>
                <small>If you have no ID or birth certificate yet, we will create a temporary 20-day ID so you can still access ID and Birth Certificate services.</small>
              </div>
            </div>
            <div className="seg" role="group" aria-label="Identity option" style={{ marginBottom: 16 }}>
              <button type="button" aria-pressed={hasId} onClick={() => setHasId(true)}>
                <Icon name="shield-check" size={16} />I have an ID
              </button>
              <button type="button" aria-pressed={!hasId} onClick={() => setHasId(false)}>
                <Icon name="alert" size={16} />I have no ID yet
              </button>
            </div>

            {hasId ? (
              <>
                <Field label="National ID number" hint="Optional if you provide a birth certificate number.">
                  <input className="input" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
                </Field>
                <Field label="Birth Certificate number" hint="Optional if you provide a National ID number.">
                  <input className="input" value={birthCert} onChange={(e) => setBirthCert(e.target.value)} />
                </Field>
                <Field label="Place of birth">
                  <input className="input" value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} />
                </Field>
                <Field label="Address">
                  <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
                </Field>
                <div className="field">
                  <span className="lbl">Scanned ID (optional)</span>
                  <label className="btn file-btn">
                    <Icon name="upload" size={16} />{idUpload ? idUpload.name : 'Attach a scanned copy'}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setIdUpload(e.target.files?.[0] ?? null)} />
                  </label>
                  <small>PDF, JPG or PNG. Max 10 MB.</small>
                </div>
              </>
            ) : (
              <>
                <div className="callout warn">
                  <Icon name="alert" size={20} />
                  <div>
                    <b>No ID or birth certificate?</b>
                    <small>You will get a temporary ID valid for 20 days. Access is limited to Birth Certificate and ID application services. Once your official ID is issued, the temporary one is automatically disabled.</small>
                  </div>
                </div>
                <Field label="Place of birth" required>
                  <input className="input" value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} />
                </Field>
                <Field label="Parent / guardian full names" required>
                  <input className="input" value={parentNames} onChange={(e) => setParentNames(e.target.value)} />
                </Field>
                <div className="field">
                  <span className="lbl">Supporting documents</span>
                  <label className="btn file-btn">
                    <Icon name="upload" size={16} />{supportingDocs ? supportingDocs.name : 'Attach hospital record, affidavit, etc.'}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setSupportingDocs(e.target.files?.[0] ?? null)} />
                  </label>
                  <small>PDF, JPG or PNG. Max 10 MB.</small>
                </div>
              </>
            )}
            {err && <p className="err" role="alert">{err}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <h3>Security question</h3>
            <p className="muted" style={{ marginBottom: 12 }}>Choose a question only you can answer. We will use it to reset your password if you lose access to your email and phone.</p>
            <Field label="Security question" required>
              <select className="input" value={question} onChange={(e) => setQuestion(e.target.value)}>
                <option>What is the name of your first school?</option>
                <option>What is your mother's maiden name?</option>
                <option>What city were you born in?</option>
                <option>What is the name of your first pet?</option>
                <option>What is your favourite childhood nickname?</option>
              </select>
            </Field>
            <Field label="Answer" required error={err}>
              <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </Field>
            <p className="muted"><small>We use only your contact details for verification. Your data is handled under the Home Affairs data protection rules and every access is logged.</small></p>
          </>
        )}

        <div className="actions">
          {step > 0 && <button type="button" className="btn" onClick={back} disabled={busy}>Back</button>}
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name={busy ? 'loader' : step === 2 ? 'check' : 'arrow-right'} size={16} className={busy ? 'spin' : ''} />
            {step === 2 ? (busy ? 'Creating account…' : 'Create account') : 'Continue'}
          </button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// RECOVER — password reset request by email or SMS
// ---------------------------------------------------------------------------
function Recover({ requestRecovery, onDone }) {
  const [channel, setChannel] = useState('email');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!contact.trim()) return setErr(channel === 'email' ? 'Enter your email address.' : 'Enter your phone number.');
    if (channel === 'email' && !EMAIL_RE.test(contact.trim())) return setErr('Enter a valid email address.');
    setBusy(true);
    try {
      await requestRecovery({ channel, contact: contact.trim() });
      setSent(true);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <>
        <div className="callout ok" style={{ marginBottom: 16 }}>
          <Icon name="check-circle" size={20} />
          <div>
            <b>Request received</b>
            <small>If an account exists with {channel === 'email' ? 'that email' : 'that phone number'}, we've sent reset instructions.</small>
          </div>
        </div>
        <button className="btn primary block" onClick={onDone}>Back to sign in</button>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="muted">We will send a recovery link or code so you can set a new password.</p>
      <div className="seg" role="group" aria-label="Recovery channel" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={channel === 'email'} onClick={() => { setChannel('email'); setContact(''); setErr(''); }}>
          <Icon name="mail" size={14} />Email
        </button>
        <button type="button" aria-pressed={channel === 'sms'} onClick={() => { setChannel('sms'); setContact(''); setErr(''); }}>
          <Icon name="phone" size={14} />SMS
        </button>
      </div>
      <Field label={channel === 'email' ? 'Email address' : 'Phone number'} required error={err}>
        <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete={channel === 'email' ? 'email' : 'tel'} />
      </Field>
      <button className="btn primary block" type="submit" disabled={busy}>
        <Icon name={busy ? 'loader' : 'send'} size={16} className={busy ? 'spin' : ''} />Send recovery instructions
      </button>
    </form>
  );
}