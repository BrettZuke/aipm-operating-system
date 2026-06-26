/**
 * Webinar SMS reminder pipeline.
 *
 * Reminder windows (relative to webinar start):
 *   - 24h:  ~24h before  (window: 23h-25h before)  → sent_24h_at
 *   - 1h:   ~1h  before  (window: 30m-90m before)  → sent_1h_at
 *   - 15m:  ~15m before  (window: 5m-25m before)   → sent_15m_at
 *   - live: at start     (window: -2m to +5m)      → sent_live_at
 *
 * The cron at /api/cron/webinar-reminders fires every 15 min and handles
 * everything within those windows. Idempotent — won't double-send.
 *
 * Templates support {name} {title} {join_url} {minutes} placeholders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types.generated";
import { sendSms } from "@/lib/integrations/twilio";

type SB = SupabaseClient<Database>;

export type ReminderKind = "24h" | "1h" | "15m" | "live";

export type WebinarRow = {
  id: string;
  agency_id: string;
  title: string;
  starts_at: string;
  join_url: string | null;
  template_24h: string | null;
  template_1h: string | null;
  template_15m: string | null;
  template_live: string | null;
};

export type RegistrationRow = {
  id: string;
  webinar_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  sent_24h_at: string | null;
  sent_1h_at: string | null;
  sent_15m_at: string | null;
  sent_live_at: string | null;
};

const WINDOW_MS: Record<ReminderKind, { early: number; late: number }> = {
  "24h":  { early: 25 * 3600 * 1000, late: 23 * 3600 * 1000 },
  "1h":   { early: 90 * 60 * 1000,   late: 30 * 60 * 1000 },
  "15m":  { early: 25 * 60 * 1000,   late: 5  * 60 * 1000 },
  "live": { early: 2  * 60 * 1000,   late: -5 * 60 * 1000 }, // 2 min before to 5 min after
};

const SENT_COL: Record<ReminderKind, keyof RegistrationRow> = {
  "24h":  "sent_24h_at",
  "1h":   "sent_1h_at",
  "15m":  "sent_15m_at",
  "live": "sent_live_at",
};

const TEMPLATE_FIELD: Record<ReminderKind, keyof WebinarRow> = {
  "24h":  "template_24h",
  "1h":   "template_1h",
  "15m":  "template_15m",
  "live": "template_live",
};

function fillTemplate(tpl: string, vars: { name?: string | null; title: string; joinUrl?: string | null; minutes: number }) {
  return tpl
    .replaceAll("{name}", vars.name?.split(" ")[0]?.trim() || "there")
    .replaceAll("{title}", vars.title)
    .replaceAll("{join_url}", vars.joinUrl ?? "")
    .replaceAll("{minutes}", String(vars.minutes));
}

/** Determine which reminder window the webinar is currently in (if any). */
export function whichWindow(webinarStartsAt: string, now = Date.now()): ReminderKind | null {
  const start = new Date(webinarStartsAt).getTime();
  const ms = start - now; // positive when webinar is in the future
  for (const kind of ["live", "15m", "1h", "24h"] as const) {
    const w = WINDOW_MS[kind];
    if (ms <= w.early && ms >= w.late) return kind;
  }
  return null;
}

export type SendReminderResult = {
  sent: number;
  skipped_no_phone: number;
  skipped_already_sent: number;
  errors: Array<{ registration_id: string; error: string }>;
};

/**
 * Process all due reminders for a single webinar. The caller (cron) decides
 * which webinars to process; this function handles the per-webinar logic.
 */
export async function processWebinarReminders(sb: SB, webinar: WebinarRow): Promise<SendReminderResult> {
  const out: SendReminderResult = { sent: 0, skipped_no_phone: 0, skipped_already_sent: 0, errors: [] };
  const window = whichWindow(webinar.starts_at);
  if (!window) return out;

  const sentCol = SENT_COL[window];
  const tpl = webinar[TEMPLATE_FIELD[window]] as string | null;
  if (!tpl) return out; // template disabled

  const minutes = Math.max(0, Math.round((new Date(webinar.starts_at).getTime() - Date.now()) / 60000));

  // Fetch registrations that need this reminder. Select all columns since the
  // `sent_*_at` field name is dynamic — narrowing the select string at compile
  // time would require a giant union.
  const { data: regs, error } = await sb
    .from("webinar_registrations")
    .select("id,name,phone,sent_24h_at,sent_1h_at,sent_15m_at,sent_live_at")
    .eq("webinar_id", webinar.id)
    .is(sentCol, null);

  if (error) {
    out.errors.push({ registration_id: "—", error: error.message });
    return out;
  }

  for (const r of regs ?? []) {
    if (!r.phone) { out.skipped_no_phone++; continue; }

    const body = fillTemplate(tpl, { name: r.name, title: webinar.title, joinUrl: webinar.join_url, minutes });
    const sms = await sendSms({ to: r.phone, body });

    if (sms.ok) {
      // Computed-key updates need a runtime-keyed object — typed via Partial
      const patch: Partial<Record<typeof sentCol, string>> & { last_send_error: string | null } = {
        last_send_error: null,
      };
      patch[sentCol] = new Date().toISOString();
      await sb.from("webinar_registrations").update(patch).eq("id", r.id);
      out.sent++;
    } else {
      await sb.from("webinar_registrations").update({ last_send_error: sms.error }).eq("id", r.id);
      out.errors.push({ registration_id: r.id, error: sms.error });
    }
  }
  return out;
}

/**
 * Manual blast for a webinar — fires the matching reminder template to all
 * registrations regardless of window. Used when the coach wants to text everyone
 * NOW rather than wait for the scheduled cron tick.
 */
export async function blastWebinar(sb: SB, webinarId: string, kind: ReminderKind, dryRun = false): Promise<SendReminderResult> {
  const out: SendReminderResult = { sent: 0, skipped_no_phone: 0, skipped_already_sent: 0, errors: [] };
  const { data: webinar, error: wErr } = await sb.from("webinars").select("*").eq("id", webinarId).maybeSingle();
  if (wErr || !webinar) { out.errors.push({ registration_id: "—", error: wErr?.message ?? "Webinar not found" }); return out; }

  const tpl = (webinar as unknown as WebinarRow)[TEMPLATE_FIELD[kind]] as string | null;
  if (!tpl) { out.errors.push({ registration_id: "—", error: `No template configured for ${kind}` }); return out; }

  const sentCol = SENT_COL[kind];
  const minutes = Math.max(0, Math.round((new Date((webinar as unknown as WebinarRow).starts_at).getTime() - Date.now()) / 60000));

  const { data: regs } = await sb.from("webinar_registrations").select("*").eq("webinar_id", webinarId);
  for (const r of (regs ?? []) as RegistrationRow[]) {
    if (!r.phone) { out.skipped_no_phone++; continue; }
    if (r[sentCol]) { out.skipped_already_sent++; continue; }

    const body = fillTemplate(tpl, { name: r.name, title: (webinar as unknown as WebinarRow).title, joinUrl: (webinar as unknown as WebinarRow).join_url, minutes });
    if (dryRun) { out.sent++; continue; }

    const sms = await sendSms({ to: r.phone, body });
    if (sms.ok) {
      const patch: Partial<Record<typeof sentCol, string>> & { last_send_error: string | null } = {
        last_send_error: null,
      };
      patch[sentCol] = new Date().toISOString();
      await sb.from("webinar_registrations").update(patch).eq("id", r.id);
      out.sent++;
    } else {
      await sb.from("webinar_registrations").update({ last_send_error: sms.error }).eq("id", r.id);
      out.errors.push({ registration_id: r.id, error: sms.error });
    }
  }
  return out;
}
