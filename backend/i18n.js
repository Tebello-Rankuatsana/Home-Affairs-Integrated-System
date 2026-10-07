const en = {
  // ── Auth & OTP ─────────────────────────────────────────────────────────
  'otp.sms':            'Your one-time code is {code}. It expires in {minutes} minutes.',
  'otp.email.subject':  'Your one-time code',
  'otp.email.body':     'Your one-time code is {code}. It expires in {minutes} minutes. If you did not request this, ignore this message.',
  'auth.login.success': 'You signed in successfully.',
  'auth.account.created': 'Welcome, {name}. Your citizen account is ready.',

  // ── Applications ───────────────────────────────────────────────────────
  'application.submitted':  'Your {service} application {reference} was received.',
  'application.status':     'Your application {reference} is now: {status}.{note}',
  'application.approved':   'Your application {reference} was approved.',
  'application.rejected':   'Your application {reference} was rejected.{note}',
  'application.moreInfo':   'We need more information on application {reference}.{note}',
  'application.withdrawn':  'Your application {reference} was withdrawn.',
  'application.assigned':   'Your application {reference} is now being handled by {officer}.',
  'application.paid':       'Payment of {amount} {currency} received for application {reference}. Receipt: {receipt}.',

  // ── Documents ──────────────────────────────────────────────────────────
  'document.received':          'We received your document "{name}" ({type}).',
  'document.attached':          'Document "{name}" was attached to application {reference}.',
  'document.verified':          'A document on application {reference} was verified.',
  'document.rejected':          'A document on application {reference} was rejected.{note}',
  'document.needsResubmission': 'Please re-upload a document on application {reference}.{note}',

  // ── Appointments ───────────────────────────────────────────────────────
  'appointment.booked':    'Appointment {reference} confirmed: {department}, {when}.',
  'appointment.cancelled': 'Appointment {reference} was cancelled.',
  'appointment.reminder':  'Reminder: appointment {reference} at {department}, {when}.',
  'appointment.noShow':    'Appointment {reference} was marked as missed. You can book a new one.',
  'appointment.checkedIn': 'You are checked in at {department}. Your queue number is {queueNumber}.',

  // ── Queue ──────────────────────────────────────────────────────────────
  'queue.checkedIn': 'You are checked in at {department}. Your queue number is {queueNumber}.',
  'queue.called':    'Queue number {queueNumber}: please go to the counter at {department} now.',
  'queue.next':      'You are next in line at {department}. Please be ready.',
  'queue.completed': 'Thanks for visiting {department}. We hope your query was resolved.',

  // ── Receipts ───────────────────────────────────────────────────────────
  'receipt.issued': 'Receipt {receiptNumber} issued for {service}.',
  'receipt.verified': 'This receipt is valid: {service}, issued {date}.',

  // ── Identity ───────────────────────────────────────────────────────────
  'identity.released': 'Identity fields {fields} were released to {department} for application {reference}.',

  // ── Admin / system ─────────────────────────────────────────────────────
  'admin.user.created': 'A new {role} account was created for {email}.',
  'admin.user.updated': 'The account {email} was updated: {fields}.',
  'admin.scope.changed': 'Department {department} identity scopes changed: {fields}.',
};

// Sesotho (st) — placeholders only; The Matladian will have to bless us with the correct translations before this is used in production.
const st = {
  'otp.sms':            'Khoutu ea hau ea nako e le \'ngoe ke {code}. E fela kamora metsotso e {minutes}.',
  'application.submitted': 'Kopo ea hau ea {service} ({reference}) e amohetsoe.',
  'application.status':    'Kopo ea hau {reference} e se e le: {status}.{note}',
  'appointment.booked':    'Kopano {reference} e tiisitsoe: {department}, {when}.',
  'queue.checkedIn':       'O kene moleng ho {department}. Nomoro ea hau ke {queueNumber}.',
  'queue.called':          'Nomoro ea {queueNumber}: ka kopo ea fihla khaontareng ea {department} hona joale.',
};

const dictionaries = { en, st };

export const SUPPORTED_LANGUAGES = Object.keys(dictionaries);
export const DEFAULT_LANGUAGE = 'en';

/**
 * Translate `key` into `lang`, substituting {name} placeholders with `vars`.
 * Unknown keys return the key itself (so missing strings are visible in logs),
 * and unknown languages fall back to English.
 */
export function t(lang, key, vars = {}) {
  const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LANGUAGE];
  const template = dict[key] ?? dictionaries[DEFAULT_LANGUAGE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] === undefined || vars[name] === null ? '' : String(vars[name])
  );
}

/**
 * Normalise an incoming locale tag ("st-ZA", "EN", "pt-BR") to a supported code.
 * Falls back to `DEFAULT_LANGUAGE`.
 */
export function normaliseLanguage(tag) {
  if (!tag) return DEFAULT_LANGUAGE;
  const short = String(tag).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(short) ? short : DEFAULT_LANGUAGE;
}

/**
 * Pick the best language for a request: explicit profile setting beats Accept-Language,
 * which beats the default.
 */
export function languageFor(profile, req) {
  if (profile?.preferredLanguage) return normaliseLanguage(profile.preferredLanguage);
  const header = req?.headers?.['accept-language'];
  if (header) return normaliseLanguage(header.split(',')[0]);
  return DEFAULT_LANGUAGE;
}

/** Convenience: interpolate a template string using English as the source. */
export function tf(lang, template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] === undefined || vars[name] === null ? '' : String(vars[name])
  );
}

/**
 * Runtime check for translators / CI: which keys are defined in `en` but
 * missing from another language. Handy for reporting on partial translations.
 */
export function missingKeys(lang) {
  const dict = dictionaries[lang] ?? {};
  return Object.keys(en).filter((k) => !(k in dict));
}