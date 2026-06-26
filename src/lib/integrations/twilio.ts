/**
 * Twilio SMS helpers.
 *
 * Used for:
 *   - Payment overdue reminders to clients
 *   - Custom messages from "Send reminder" button
 *   - Future: AI-drafted follow-ups
 */

export type SmsResult = { ok: true; sid: string; status: string } | { ok: false; error: string };

export async function sendSms(opts: {
  to: string;       // E.164 format (+15551234567)
  body: string;
  from?: string;    // defaults to TWILIO_FROM_NUMBER (falls back to RETELL_FROM_NUMBER)
}): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  // Prefer TWILIO_FROM_NUMBER so Twilio + Retell numbers can diverge later.
  // Falls back to RETELL_FROM_NUMBER for current setup where they're identical.
  const from = opts.from ?? process.env.TWILIO_FROM_NUMBER ?? process.env.RETELL_FROM_NUMBER;

  if (!sid || !auth) return { ok: false, error: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set" };
  if (!from) return { ok: false, error: "No from-number set (TWILIO_FROM_NUMBER or RETELL_FROM_NUMBER)" };

  // Normalize phone — strip everything except digits and leading +
  const normalizedTo = opts.to.replace(/[^\d+]/g, "");
  if (!normalizedTo.startsWith("+")) {
    return { ok: false, error: `Phone must be E.164 format (+1...). Got: ${opts.to}` };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: normalizedTo, From: from, Body: opts.body }).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    // Surface Twilio error code for actionable feedback. Common: 21408 (no SMS perm),
    // 21606 (number not SMS-capable), 21610 (recipient unsubscribed STOP), 30007 (carrier filter).
    const code = data.code ? ` (Twilio code ${data.code})` : "";
    return { ok: false, error: `${data.message ?? data.detail ?? `HTTP ${res.status}`}${code}` };
  }
  return { ok: true, sid: data.sid, status: data.status };
}

export function formatOverdueReminder(opts: {
  clientName: string;
  amount: number;
  daysOverdue: number;
  productName?: string;
}): string {
  const first = opts.clientName.split(" ")[0];
  const amt = `$${opts.amount.toFixed(2)}`;
  const product = opts.productName ?? "your your agency payment";
  return `Hey ${first}, quick heads up: ${amt} for ${product} is ${opts.daysOverdue} day${opts.daysOverdue === 1 ? "" : "s"} overdue. Just want to make sure nothing's stuck. Let me know if you need anything.`;
}
