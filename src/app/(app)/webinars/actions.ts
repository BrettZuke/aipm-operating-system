"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { blastWebinar, type ReminderKind } from "@/lib/webinar/reminders";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export async function createWebinar(_prev: unknown, formData: FormData): Promise<Result<{ webinarId: string }>> {
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const joinUrl = String(formData.get("join_url") ?? "").trim() || null;

  if (!title) return { ok: false, error: "Title required" };
  if (!startsAt) return { ok: false, error: "Start date/time required" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const { data, error } = await supabase
    .from("webinars")
    .insert({
      agency_id: agencyId,
      title,
      starts_at: new Date(startsAt).toISOString(),
      join_url: joinUrl,
    })
    .select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/webinars");
  return { ok: true, webinarId: data.id };
}

export async function updateWebinar(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const joinUrl = String(formData.get("join_url") ?? "").trim() || null;
  const tpl24h = String(formData.get("template_24h") ?? "").trim() || null;
  const tpl1h  = String(formData.get("template_1h") ?? "").trim() || null;
  const tpl15m = String(formData.get("template_15m") ?? "").trim() || null;
  const tplLive= String(formData.get("template_live") ?? "").trim() || null;

  if (!id || !title || !startsAt) return { ok: false, error: "Missing required fields" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const { error } = await supabase
    .from("webinars")
    .update({
      title,
      starts_at: new Date(startsAt).toISOString(),
      join_url: joinUrl,
      template_24h: tpl24h,
      template_1h:  tpl1h,
      template_15m: tpl15m,
      template_live: tplLive,
      updated_at: new Date().toISOString(),
    })
    .eq("agency_id", agencyId)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/webinars/${id}`);
  revalidatePath("/webinars");
  return { ok: true };
}

export async function deleteWebinar(id: string): Promise<Result> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("webinars").delete().eq("agency_id", agencyId).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/webinars");
  return { ok: true };
}

/**
 * Add registrations from a CSV-pasted blob. Accepts comma OR tab separated.
 * Header row optional — auto-detects "name", "email", "phone" columns
 * (case-insensitive). If no header, assumes order: name, email, phone.
 *
 * Phone normalization: strips everything except digits and leading +.
 * E.164 format expected (+15551234567). Rows without phone
 * are still inserted but won't receive SMS.
 */
export async function addRegistrationsFromCsv(_prev: unknown, formData: FormData): Promise<Result<{ inserted: number; skipped: number; errors: string[] }>> {
  const webinarId = String(formData.get("webinar_id") ?? "");
  const csvText = String(formData.get("csv") ?? "").trim();
  if (!webinarId || !csvText) return { ok: false, error: "Missing webinar or CSV" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  // Verify webinar belongs to workspace
  const { data: webinar } = await supabase.from("webinars").select("id").eq("agency_id", agencyId).eq("id", webinarId).maybeSingle();
  if (!webinar) return { ok: false, error: "Webinar not found" };

  const rows = csvText.split("\n").map(r => r.trim()).filter(Boolean);
  if (rows.length === 0) return { ok: false, error: "Empty CSV" };

  // Detect delimiter
  const delim = rows[0].includes("\t") ? "\t" : ",";
  const split = (line: string) => line.split(delim).map(c => c.trim().replace(/^["']|["']$/g, ""));

  // Header detection
  const first = split(rows[0]).map(c => c.toLowerCase());
  let nameIdx = 0, emailIdx = 1, phoneIdx = 2;
  let dataStart = 0;
  if (first.some(c => ["name", "email", "phone", "first_name", "first name"].includes(c))) {
    nameIdx = first.findIndex(c => c === "name" || c === "first_name" || c === "first name");
    emailIdx = first.findIndex(c => c === "email");
    phoneIdx = first.findIndex(c => c === "phone" || c === "phone_number" || c === "mobile");
    if (nameIdx < 0)  nameIdx  = 0;
    if (emailIdx < 0) emailIdx = 1;
    if (phoneIdx < 0) phoneIdx = 2;
    dataStart = 1;
  }

  const inserts: Array<{ webinar_id: string; name: string | null; email: string | null; phone: string | null; source: string }> = [];
  const errors: string[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const cells = split(rows[i]);
    const name = cells[nameIdx]?.trim() || null;
    const email = cells[emailIdx]?.trim().toLowerCase() || null;
    const rawPhone = cells[phoneIdx]?.trim() || null;
    const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, "") : null;
    if (phone && !phone.startsWith("+")) {
      errors.push(`Row ${i + 1}: phone "${rawPhone}" not in E.164 format (+1...)`);
      continue;
    }
    if (!name && !email && !phone) continue; // skip blanks
    inserts.push({ webinar_id: webinarId, name, email, phone, source: "csv" });
  }

  if (inserts.length === 0) return { ok: true, inserted: 0, skipped: rows.length - dataStart, errors };

  // Use upsert on (webinar_id, phone) to dedupe — the unique index in the
  // migration enforces no duplicate phone per webinar.
  const { error, count } = await supabase
    .from("webinar_registrations")
    .upsert(inserts, { onConflict: "webinar_id,phone", ignoreDuplicates: true, count: "exact" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/webinars/${webinarId}`);
  return { ok: true, inserted: count ?? inserts.length, skipped: rows.length - dataStart - inserts.length, errors };
}

/** Server-action wrapper around blastWebinar — auth-gated by workspace membership. */
export async function fireWebinarBlast(_prev: unknown, formData: FormData): Promise<Result<{ sent: number; skipped: number; errored: number }>> {
  const webinarId = String(formData.get("webinar_id") ?? "");
  const kind = String(formData.get("kind") ?? "live") as ReminderKind;
  const dryRun = String(formData.get("dry_run") ?? "") === "true";

  if (!webinarId) return { ok: false, error: "webinar_id required" };
  if (!["24h", "1h", "15m", "live"].includes(kind)) return { ok: false, error: "Invalid kind" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  // Verify ownership
  const { data: webinar } = await supabase.from("webinars").select("id").eq("agency_id", agencyId).eq("id", webinarId).maybeSingle();
  if (!webinar) return { ok: false, error: "Webinar not found" };

  const result = await blastWebinar(supabase, webinarId, kind, dryRun);
  revalidatePath(`/webinars/${webinarId}`);
  return {
    ok: true,
    sent: result.sent,
    skipped: result.skipped_no_phone + result.skipped_already_sent,
    errored: result.errors.length,
  };
}
