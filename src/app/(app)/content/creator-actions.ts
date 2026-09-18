"use server";

// Content Machine roster actions. Server actions are their own entry points (they do NOT pass
// through the (app) layout paywall), so each re-proves entitlement. agency_id is always taken from
// the server session, never the client, and every write goes through the caller's own RLS client
// (content_creators has member policies via is_agency_member), so a member can only ever touch
// their own workspace's roster. content_creators is not in the generated Supabase types yet, so we
// use the repo's untyped-cast idiom (`as unknown as SupabaseClient`, see src/lib/agents/run.ts).

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { CREATOR_ROLES, CREATOR_STATUSES, normaliseHandle } from "@/lib/content/creators";

export type CreatorResult = { ok: true } | { ok: false; error: string };

// A handle can arrive as "@name", a bare slug, or a pasted profile URL; store the bare handle so
// the roster never holds two rows for the same person.
const HandleSchema = z.string().trim().min(1, "Handle is required").max(120).transform(normaliseHandle);

const AddSchema = z.object({
  handle: HandleSchema,
  name: z.string().trim().max(120).optional(),
  instagram: z.string().trim().max(200).optional(),
  youtube: z.string().trim().max(200).optional(),
  role: z.enum(CREATOR_ROLES),
  note: z.string().trim().max(500).optional(),
});

export type AddCreatorInput = z.input<typeof AddSchema>;

function nn(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

export async function addCreator(input: AddCreatorInput): Promise<CreatorResult> {
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid creator" };
  }
  const { handle, name, instagram, youtube, role, note } = parsed.data;
  const { supabase, agencyId } = await getAuthContext();
  const sbu = supabase as unknown as SupabaseClient;
  const yt = nn(youtube);

  // Adding a handle already on the roster re-activates and re-roles it rather than erroring or
  // duplicating: "add this person" and "I want them back" are the same intent to the operator.
  //
  // The match is made here rather than with an upsert. The roster's unique key is
  // (agency_id, lower(handle)), an expression index, and Postgres rejects an ON CONFLICT that names
  // plain columns instead (42P10), which made this button fail on every click.
  const { data: rows, error: readError } = await sbu
    .from("content_creators")
    .select("id,handle")
    .eq("agency_id", agencyId);
  if (readError) return { ok: false, error: readError.message };
  const existing = ((rows ?? []) as { id: string; handle: string }[]).find(
    (r) => (r.handle ?? "").trim().toLowerCase() === handle.trim().toLowerCase(),
  );
  const row = {
    agency_id: agencyId,
    handle,
    name: nn(name) ?? handle,
    instagram: nn(instagram) ?? handle,
    youtube: yt ? normaliseHandle(yt) : null,
    role,
    status: "active",
    note: nn(note),
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await sbu.from("content_creators").update(row).eq("id", existing.id).eq("agency_id", agencyId)
    : await sbu.from("content_creators").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");
  return { ok: true };
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(CREATOR_ROLES).optional(),
  status: z.enum(CREATOR_STATUSES).optional(),
  scrape_limit: z.number().int().min(10).max(200).optional(),
  why: z.string().trim().max(500).nullable().optional(),
  // An empty array would mean "a model for nothing" and drop them from every run, so the
  // cleared state is null, meaning every lane.
  lanes: z.array(z.string().trim().min(1).max(40)).max(8).nullable().optional(),
});

export async function updateCreator(input: z.input<typeof UpdateSchema>): Promise<CreatorResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change" };
  }
  const { id, role, status, scrape_limit, why, lanes } = parsed.data;
  if (!role && !status && scrape_limit === undefined && why === undefined && lanes === undefined) {
    return { ok: false, error: "Nothing to change" };
  }

  const { supabase, agencyId } = await getAuthContext();
  const sbu = supabase as unknown as SupabaseClient;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (role) patch.role = role;
  if (status) patch.status = status;
  if (scrape_limit !== undefined) patch.scrape_limit = scrape_limit;
  if (why !== undefined) patch.why = nn(why);
  if (lanes !== undefined) patch.lanes = lanes?.length ? lanes : null;

  const { error } = await sbu
    .from("content_creators")
    .update(patch)
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");
  return { ok: true };
}

export async function deleteCreator(id: string): Promise<CreatorResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid creator" };
  const { supabase, agencyId } = await getAuthContext();
  const sbu = supabase as unknown as SupabaseClient;
  const { error } = await sbu
    .from("content_creators")
    .delete()
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");
  return { ok: true };
}
