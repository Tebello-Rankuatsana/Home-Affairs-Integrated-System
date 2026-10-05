// Message templates for notifications and SMS, in each citizen's preferred language.
// To add a language: add a dictionary below. Any key it does not define falls back to English.
// `st` (Sesotho) is registered but intentionally empty: have a native speaker fill it in rather than guessing.
const en = {
  'otp.sms': 'Your one-time code is {code}. It expires in {minutes} minutes.',
  'application.submitted': 'Your {service} application {reference} was received.',
  'application.status': 'Your application {reference} is now: {status}.{note}',
  'application.withdrawn': 'Your application {reference} was withdrawn.',
  'application.paid': 'Payment of {amount} {currency} received for application {reference}. Receipt: {receipt}.',
  'document.verified': 'A document on application {reference} was verified.',
  'document.rejected': 'A document on application {reference} was rejected.{note}',
  'appointment.booked': 'Appointment {reference} confirmed: {department}, {when}.',
  'appointment.cancelled': 'Appointment {reference} was cancelled.',
  'appointment.reminder': 'Reminder: appointment {reference} at {department}, {when}.',
  'appointment.noShow': 'Appointment {reference} was marked as missed. You can book a new one.',
  'queue.checkedIn': 'You are checked in at {department}. Your queue number is {queueNumber}.',
  'queue.called': 'Queue number {queueNumber}: please go to the counter at {department} now.',
  'queue.next': 'You are next in line at {department}. Please be ready.',
};

const dictionaries = { en, st: {} };

export const SUPPORTED_LANGUAGES = Object.keys(dictionaries);

export function t(lang, key, vars = {}) {
  const template = dictionaries[lang]?.[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}