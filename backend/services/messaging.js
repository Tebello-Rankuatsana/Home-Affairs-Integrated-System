// Delivery providers. These are stand-ins that log to the console.
// To go live, replace the bodies with a real SMS gateway and an email service (SMTP, SES, etc.).
export async function sendSms(to, text) {
  console.log(`[sms] to=${to} text="${text}"`);
}

export async function sendEmail(to, subject, text) {
  console.log(`[email] to=${to} subject="${subject}" text="${text}"`);
}
