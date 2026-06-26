"use server";

import { slackPost } from "@/lib/integrations/slack";
import { sendSms } from "@/lib/integrations/twilio";
import { listLeads, primaryContact } from "@/lib/integrations/close";
import {
  checkAnthropic, checkSlack, checkTwilio, checkClose, checkKit,
  checkBoosend, checkRetell, checkMake, checkN8N, checkTypeform, checkICLOSED, checkFanbasis,
  type IntegrationStatus,
} from "@/lib/integrations";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

type TestResult = { ok: true; message: string } | { ok: false; error: string };

export type AllStatusResult = {
  ok: true;
  results: Array<{ name: string; status: IntegrationStatus }>;
} | { ok: false; error: string };

/**
 * Re-runs every integration's connectivity check and returns a single
 * structured snapshot. Free — every check uses read-only endpoints (or
 * just env-var presence in Boosend's case).
 */
export async function verifyAllIntegrations(): Promise<AllStatusResult> {
  try {
    const checks: Array<[string, () => Promise<IntegrationStatus>]> = [
      ["Anthropic",  checkAnthropic],
      ["Slack",      checkSlack],
      ["Twilio",     checkTwilio],
      ["Close CRM",  checkClose],
      ["Kit",        checkKit],
      ["Boosend",    checkBoosend],
      ["Retell",     checkRetell],
      ["Make.com",   checkMake],
      ["N8N",        checkN8N],
      ["Typeform",   checkTypeform],
      ["iClosed",    checkICLOSED],
      ["FanBasis",   checkFanbasis],
    ];
    const results = await Promise.all(checks.map(async ([name, fn]) => ({ name, status: await fn() })));
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function testSlackMessage(channel: string): Promise<TestResult> {
  if (!channel.trim()) return { ok: false, error: "Channel required (e.g. #general or a channel ID)" };
  const result = await slackPost(channel.trim(), "Test message from Settoku OS — wired up correctly. ✅");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Posted to ${result.channel}` };
}

export async function testSms(to: string): Promise<TestResult> {
  if (!to.trim()) return { ok: false, error: "Phone required (E.164 format: +15551234567)" };
  const result = await sendSms({
    to: to.trim(),
    body: "Test message from Settoku OS — your Twilio integration is wired up. ✅",
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `SMS queued · sid=${result.sid} · status=${result.status}` };
}

export async function importCloseLeads(): Promise<TestResult> {
  const { agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace." };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let cursor: string | undefined = undefined;
  let imported = 0, updated = 0, skipped = 0;
  const seen = new Set<string>();

  for (let page = 0; page < 50; page++) { // safety cap
    const result = await listLeads({ limit: 100, cursor });
    if (!result.ok) return { ok: false, error: result.error };

    for (const lead of result.leads) {
      const { name, email, phone } = primaryContact(lead);
      if (!email) { skipped++; continue; }
      if (seen.has(email)) { skipped++; continue; }
      seen.add(email);

      const { data: existing } = await supabase
        .from("clients").select("id,data").eq("agency_id", agencyId).eq("email", email).maybeSingle();

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (existing.data as any) ?? {};
        await supabase.from("clients").update({
          name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { ...data, close_id: lead.id, close_status: lead.status_label, phone: phone ?? data.phone } as any,
        }).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("clients").insert({
          agency_id: agencyId,
          name,
          email,
          status: "lead",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { close_id: lead.id, close_status: lead.status_label, phone, source: "close_crm" } as any,
        });
        imported++;
      }
    }

    if (!result.cursor) break;
    cursor = result.cursor;
  }

  revalidatePath("/clients");
  return { ok: true, message: `Imported ${imported} new · updated ${updated} existing · ${skipped} skipped` };
}

export async function sendPaymentReminder(opts: { clientId: string; phone: string; clientName: string; amount: number; daysOverdue: number; productName?: string }): Promise<TestResult> {
  const { sendSms: send } = await import("@/lib/integrations/twilio");
  const { formatOverdueReminder } = await import("@/lib/integrations/twilio");
  const result = await send({
    to: opts.phone,
    body: formatOverdueReminder({
      clientName: opts.clientName,
      amount: opts.amount,
      daysOverdue: opts.daysOverdue,
      productName: opts.productName,
    }),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Reminder sent · sid=${result.sid}` };
}
