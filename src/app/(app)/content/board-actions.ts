"use server";

// Content board server actions. Server actions are their own entry points (they do NOT pass
// through the (app) layout paywall), so each re-proves entitlement. agency_id is always taken
// from the server session, never the client, and every write goes through the caller's own
// RLS client (content_cards has member policies via is_agency_member), so a member can only ever
// touch their own workspace's cards. content_cards is not in the generated Supabase types yet, so
// we use the repo's untyped-cast idiom (`as unknown as SupabaseClient`, see src/lib/agents/run.ts).
//
// All position / stage-history / stage-transition logic lives in and is unit-tested from
// src/lib/content/board.ts; these actions are the thin DB boundary around it.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import {
  FORMAT_KEYS,
  PLATFORM_KEYS,
  isPlanMonth,
  isStage,
  computeCreatePosition,
  planCardMove,
  newCardHistory,
  type Stage,
  type StageEvent,
} from "@/lib/content/board";
import { loadCreatorSettings } from "@/lib/creator/settings";
import { appendScriptToDoc } from "@/lib/content/google-doc-append";
import { FEEDBACK_DOC, feedbackEntry } from "@/lib/content/house-style";
import type { CardInput } from "./board-types";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };
// `docNotice` rides along on a successful move: the move itself saved, but delivering the script to
// the connected Google Doc failed. It is a soft, non-blocking notice, never an error.
export type MoveResult = { ok: true; docNotice?: string } | { ok: false; error: string };
export type SendResult = { ok: true } | { ok: false; error: string; code?: "NO_DOC" };

// A select that was cleared arrives as "" from the client; treat that (and null) as "unset".
const nullableEnum = <T extends string>(keys: readonly T[]) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.union([z.null(), z.enum(keys as unknown as [T, ...T[]])]),
  );

const CardSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  topic: z.string().max(500).optional(),
  format: nullableEnum(FORMAT_KEYS),
  platform: nullableEnum(PLATFORM_KEYS),
  hook: z.string().max(1000).optional(),
  script: z.string().max(20000).optional(),
  source: z.string().max(500).optional(),
  plan_month: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.union([z.null(), z.string().refine(isPlanMonth, "Plan month must be YYYY-MM")]),
  ),
  notes: z.string().max(5000).optional(),
});

// Trim optional free text, collapsing empty strings to null so we never store "".
function nn(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// `stage` lets the per-column "add" file a card straight into a chosen column; the global
// "New card" button omits it and lands in Ideas. It is validated against the six-stage whitelist
// server-side (never trust the client) and mirrors the DB stage check constraint.
export async function createCard(input: CardInput, stage: string = "ideas"): Promise<ActionResult> {
  if (!isStage(stage)) return { ok: false, error: "Invalid stage" };
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const sbu = supabase as unknown as SupabaseClient;

  // New cards land at the top of their column: read the current top card's position for the midpoint.
  const { data: top } = await sbu
    .from("content_cards")
    .select("position")
    .eq("agency_id", agencyId)
    .eq("stage", stage)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const topPosition = (top as { position: number } | null)?.position ?? null;
  const now = new Date().toISOString();

  const { data, error } = await sbu
    .from("content_cards")
    .insert({
      agency_id: agencyId,
      stage,
      position: computeCreatePosition(topPosition),
      title: parsed.data.title,
      topic: nn(parsed.data.topic),
      format: parsed.data.format ?? null,
      platform: parsed.data.platform ?? null,
      hook: nn(parsed.data.hook),
      script: nn(parsed.data.script),
      source: nn(parsed.data.source),
      plan_month: parsed.data.plan_month ?? null,
      notes: nn(parsed.data.notes),
      stage_history: newCardHistory(now, stage),
      created_by: "human",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateCard(id: string, input: CardInput): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  if (!id) return { ok: false, error: "Missing card id" };

  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const sbu = supabase as unknown as SupabaseClient;

  const { error } = await sbu
    .from("content_cards")
    .update({
      title: parsed.data.title,
      topic: nn(parsed.data.topic),
      format: parsed.data.format ?? null,
      platform: parsed.data.platform ?? null,
      hook: nn(parsed.data.hook),
      script: nn(parsed.data.script),
      source: nn(parsed.data.source),
      plan_month: parsed.data.plan_month ?? null,
      notes: nn(parsed.data.notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("agency_id", agencyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");
  return { ok: true, id };
}

// A drop: change stage and/or position. before/after are the positions of the cards that will
// sit directly above and below the drop in the target column (null at the top/bottom/empty).
export async function moveCard(
  id: string,
  toStage: string,
  before: number | null,
  after: number | null,
): Promise<MoveResult> {
  if (!isStage(toStage)) return { ok: false, error: "Invalid stage" };
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const sbu = supabase as unknown as SupabaseClient;

  const { data: card, error: readErr } = await sbu
    .from("content_cards")
    .select("stage, stage_history, posted_at, title, hook, script")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!card) return { ok: false, error: "Card not found" };
  const c = card as {
    stage: Stage;
    stage_history: StageEvent[] | null;
    posted_at: string | null;
    title: string;
    hook: string | null;
    script: string | null;
  };

  const patch = planCardMove({
    fromStage: c.stage,
    toStage,
    history: Array.isArray(c.stage_history) ? c.stage_history : [],
    before: finiteOrNull(before),
    after: finiteOrNull(after),
    at: new Date().toISOString(),
    currentPostedAt: c.posted_at,
  });

  const { error } = await sbu
    .from("content_cards")
    .update({
      stage: patch.stage,
      position: patch.position,
      stage_history: patch.stage_history,
      posted_at: patch.posted_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("agency_id", agencyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");

  // Approval = moving INTO Filming: deliver the script to the connected Google Doc. This runs only
  // after the move has already committed, and is wrapped so any Doc failure yields a soft notice the
  // drawer can retry. It must NEVER turn a saved move into a failure: nothing blocks the board.
  let docNotice: string | undefined;
  if (patch.changedStage && patch.stage === "filming") {
    try {
      const settings = await loadCreatorSettings(agencyId);
      if (settings.googleDocId) {
        const r = await appendScriptToDoc({
          docId: settings.googleDocId,
          card: { title: c.title, hook: c.hook, script: c.script },
          at: new Date().toISOString(),
        });
        if (!r.ok) {
          console.error("[moveCard] approved-script Doc append failed:", r.error);
          docNotice = r.error;
        }
      }
    } catch (e) {
      console.error("[moveCard] Doc delivery threw (ignored, the move is already saved):", e);
      docNotice = "Couldn't send the script to the Doc. Open the card and use Send to Doc to retry.";
    }
  }
  return { ok: true, docNotice };
}

// Hard delete of a single card. Member-scoped by the same content_cards RLS as every other write
// (the .eq("agency_id") is defense in depth on top of the policy), so a member can only ever
// delete a card in their own workspace. No soft-delete column exists; this is a real row removal.
export async function deleteCard(id: string): Promise<MoveResult> {
  if (!id) return { ok: false, error: "Missing card id" };
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const sbu = supabase as unknown as SupabaseClient;

  const { error } = await sbu
    .from("content_cards")
    .delete()
    .eq("id", id)
    .eq("agency_id", agencyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/content");
  return { ok: true };
}

/**
 * Bin a script and say why, from the Record tab.
 *
 * A delete on its own throws away the most valuable thing in the exchange: the reason. The reason
 * goes into a knowledge doc the writer reads on every future run, so rejecting a script is how the
 * machine is taught rather than just tidied. The doc is a normal Brain document, visible and
 * editable at /knowledge, because the operator should be able to see exactly what it learned from
 * him and correct it.
 *
 * The reason is required. A rejection with no reason teaches nothing and would quietly train the
 * writer on an empty string.
 */
export async function rejectScript(id: string, reason: string): Promise<MoveResult> {
  if (!id) return { ok: false, error: "Missing card id" };
  const why = (reason ?? "").trim();
  if (why.length < 4) return { ok: false, error: "Say what was wrong with it, even briefly." };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const sbu = supabase as unknown as SupabaseClient;

  const { data: card, error: readErr } = await sbu
    .from("content_cards")
    .select("title, hook, platform, notes")
    .eq("id", id).eq("agency_id", agencyId).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!card) return { ok: false, error: "Card not found" };

  const entry = feedbackEntry(
    card as { title: string; hook: string | null; platform: string | null; notes: string | null },
    why,
    new Date(),
  );

  const { data: doc } = await sbu
    .from("knowledge_docs").select("id, content_text")
    .eq("agency_id", agencyId).eq("title", FEEDBACK_DOC).maybeSingle();

  // The lesson is written BEFORE the card goes, so a failure here cannot lose both the script and
  // the reason it was rejected.
  const existing = (doc as { id: string; content_text: string | null } | null)?.content_text ?? "";
  const header = existing
    ? existing
    : [
        `# ${FEEDBACK_DOC}`,
        "",
        "Every script you binned, and the reason in your own words. The writer reads the newest of",
        "these before choosing an angle and again before writing, so this file is how your taste",
        "reaches the machine. Edit or delete anything here that no longer reflects what you want.",
        "",
      ].join("\n");
  const content = `${header.replace(/\s+$/, "")}\n\n${entry}\n`;

  const saved = doc
    ? await sbu.from("knowledge_docs").update({ content_text: content })
        .eq("id", (doc as { id: string }).id).eq("agency_id", agencyId)
    : await sbu.from("knowledge_docs").insert({
        agency_id: agencyId,
        title: FEEDBACK_DOC,
        source_type: "content_strategy",
        content_text: content,
        metadata: { written_by: "record-tab-rejection" },
      });
  if (saved.error) return { ok: false, error: `Could not save the feedback: ${saved.error.message}` };

  const { error: delErr } = await sbu
    .from("content_cards").delete().eq("id", id).eq("agency_id", agencyId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/content");
  revalidatePath("/knowledge");
  return { ok: true };
}

// Manual "Send to Doc" from the card drawer: appends this card's script to the connected Google Doc
// from ANY stage (useful for resends, or when the filming auto-send failed). Returns a NO_DOC code
// when nothing is connected so the drawer can show the connect explainer instead of a raw error.
export async function sendCardToDoc(cardId: string): Promise<SendResult> {
  if (!cardId) return { ok: false, error: "Missing card id" };
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const sbu = supabase as unknown as SupabaseClient;

  const { data: card, error: readErr } = await sbu
    .from("content_cards")
    .select("title, hook, script")
    .eq("id", cardId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!card) return { ok: false, error: "Card not found" };

  const settings = await loadCreatorSettings(agencyId);
  if (!settings.googleDocId) {
    return { ok: false, code: "NO_DOC", error: "No Google Doc is connected for this workspace yet." };
  }
  const c = card as { title: string; hook: string | null; script: string | null };
  const r = await appendScriptToDoc({
    docId: settings.googleDocId,
    card: { title: c.title, hook: c.hook, script: c.script },
    at: new Date().toISOString(),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
