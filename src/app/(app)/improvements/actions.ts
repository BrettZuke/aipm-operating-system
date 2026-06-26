"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import type { Json } from "@/lib/supabase/types.generated";

type Result = { ok: true } | { ok: false; error: string };

const KINDS = ["bug", "tech_debt", "feature", "audit", "security", "perf", "data_quality"] as const;
const STATUSES = ["open", "in_progress", "done", "blocked", "cancelled"] as const;
type Kind = typeof KINDS[number];
type Status = typeof STATUSES[number];

export async function createImprovement(_prev: unknown, formData: FormData): Promise<Result & { id?: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "bug") as Kind;
  const priority = Math.max(1, Math.min(5, Number(formData.get("priority") ?? 3)));
  const proposedFix = String(formData.get("proposed_fix") ?? "").trim() || null;

  if (!title) return { ok: false, error: "Title required" };
  if (!KINDS.includes(kind)) return { ok: false, error: "Invalid kind" };

  const { supabase, agencyId, user } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const { data, error } = await supabase
    .from("improvements")
    .insert({
      agency_id: agencyId,
      title, description, kind, priority,
      proposed_fix: proposedFix,
      source: "manual",
      created_by: user.id,
    })
    .select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/improvements");
  return { ok: true, id: data.id };
}

export async function updateImprovementStatus(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as Status;
  const log = String(formData.get("log") ?? "").trim() || null;

  if (!id || !STATUSES.includes(status)) return { ok: false, error: "Invalid status" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const now = new Date().toISOString();
  const update: {
    status: Status;
    updated_at: string;
    attempted_at?: string;
    resolved_at?: string;
    last_attempt_log?: string;
  } = { status, updated_at: now };
  if (status === "in_progress") update.attempted_at = now;
  if (status === "done" || status === "cancelled") update.resolved_at = now;
  if (log) update.last_attempt_log = log;

  const { error } = await supabase
    .from("improvements")
    .update(update)
    .eq("agency_id", agencyId)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/improvements");
  return { ok: true };
}

export async function updateImprovementPriority(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const priority = Math.max(1, Math.min(5, Number(formData.get("priority") ?? 3)));
  if (!id) return { ok: false, error: "Missing id" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const { error } = await supabase
    .from("improvements")
    .update({ priority, updated_at: new Date().toISOString() })
    .eq("agency_id", agencyId)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/improvements");
  return { ok: true };
}

export async function deleteImprovement(id: string): Promise<Result> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("improvements").delete().eq("agency_id", agencyId).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/improvements");
  return { ok: true };
}

/**
 * Internal use by self-discovery cron — same as createImprovement but stamps
 * source="self_discover" and is idempotent on (agency, source, title) per the
 * partial unique index in the migration.
 */
export async function upsertDiscoveredImprovement(opts: {
  agencyId: string;
  title: string;
  description?: string;
  kind: Kind;
  priority?: number;
  evidence?: string;
  filesTouched?: string[];
  data?: Json;
  source?: string;
}): Promise<Result> {
  const { supabase } = await getAuthContext();
  // Use insert with ignore-on-conflict (the unique index handles dedupe)
  const { error } = await supabase.from("improvements").insert({
    agency_id: opts.agencyId,
    title: opts.title,
    description: opts.description ?? null,
    kind: opts.kind,
    priority: opts.priority ?? 3,
    evidence: opts.evidence ?? null,
    files_touched: opts.filesTouched ?? [],
    source: opts.source ?? "self_discover",
    data: opts.data ?? {},
  });
  // 23505 = unique violation = already exists, fine
  if (error && error.code !== "23505") return { ok: false, error: error.message };
  return { ok: true };
}
