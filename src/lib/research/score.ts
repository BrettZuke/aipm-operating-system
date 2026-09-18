// Scoring a draft before it goes out: a pasted script, or a video uploaded straight into private
// storage through a one-off address (a server action's body is capped at a megabyte, so the video
// itself never passes through the app).
//
// The checks in code run first (spoken words, pace, the first sentence, the ask, invented claims),
// then a model scores six parts out of ten. The total is worked out in code and capped at 60 when a
// check failed hard, whatever the model thought of it. An uploaded video is deleted the moment
// scoring finishes, whether it worked or not.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coerceReport,
  draftChecks,
  draftPrompt,
  finalizeReport,
  reportProblems,
  type DraftChecks,
  type DraftFormat,
  type DraftPromptArgs,
  type NichePattern,
  type RawReport,
} from "./draft-rules";
import { ResearchUserError } from "./errors";
import { geminiAvailable, GeminiError, geminiJson, inlinePart, textPart } from "./gemini";
import { askJson, DailyQuotaSpent } from "./llm";
import { formatTranscript, transcribeUrl, type Transcript } from "./transcribe";
import type { DraftReport } from "./types";

export const DRAFT_BUCKET = "research-drafts";
/** What the app accepts. The bucket itself allows a little more, so the app's limit is the one that
    decides. */
export const DRAFT_MAX_BYTES = 25 * 1024 * 1024;
export const DRAFT_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as const;
export type DraftContentType = keyof typeof DRAFT_TYPES;
export const SCORE_BUDGET_MS = 110_000;
const GEMINI_INLINE_MAX_BYTES = 15 * 1024 * 1024;
/** An upload address lives two hours; anything never scored after that is cleared away. */
const STALE_UPLOAD_MS = 3 * 3_600_000;
const NICHE_SIZE = 5;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const FOREIGN_UPLOAD_MESSAGE = "That upload does not belong to this workspace. Upload the video again.";

const left = (deadline: number, most: number) => Math.max(5_000, Math.min(most, deadline - Date.now()));

/** True only for an upload this dashboard minted for this workspace. */
export function isDraftPathFor(agencyId: string, path: string | null | undefined): boolean {
  if (!path || !new RegExp(`^${UUID}$`).test(agencyId)) return false;
  return new RegExp(`^${agencyId}/${UUID}\\.(mp4|mov|webm)$`).test(path);
}

/** Delete this workspace's uploads that were never scored. Returns how many went. */
export async function sweepStaleDrafts(sb: SupabaseClient, agencyId: string, nowMs = Date.now()): Promise<number> {
  const { data, error } = await sb.storage.from(DRAFT_BUCKET).list(agencyId, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw new Error(`Listing draft uploads failed: ${error.message}`);
  const stale = (data ?? [])
    .filter((o) => o.created_at && nowMs - Date.parse(o.created_at) > STALE_UPLOAD_MS)
    .map((o) => `${agencyId}/${o.name}`)
    .filter((p) => isDraftPathFor(agencyId, p));
  if (stale.length === 0) return 0;
  const removed = await sb.storage.from(DRAFT_BUCKET).remove(stale);
  if (removed.error) throw new Error(`Removing old draft uploads failed: ${removed.error.message}`);
  return stale.length;
}

/** A one-off address the browser uploads one draft video to, good for two hours, at a place only
    this workspace's scoring can read. Clears away anything abandoned first. */
export async function createDraftUpload(
  sb: SupabaseClient,
  agencyId: string,
  contentType: DraftContentType,
  size: number,
): Promise<{ bucket: string; path: string; token: string; signedUrl: string; maxBytes: number }> {
  if (!(contentType in DRAFT_TYPES)) throw new ResearchUserError("Upload an mp4, mov or webm video.");
  if (!(size > 0) || size > DRAFT_MAX_BYTES) throw new ResearchUserError("Videos can be up to 25MB.");
  const swept = await sweepStaleDrafts(sb, agencyId);
  if (swept) console.log(`[research] cleared away ${swept} abandoned draft uploads for ${agencyId}`);
  const path = `${agencyId}/${randomUUID()}.${DRAFT_TYPES[contentType]}`;
  const { data, error } = await sb.storage.from(DRAFT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Creating the upload address failed: ${error?.message ?? "no address came back"}`);
  return { bucket: DRAFT_BUCKET, path: data.path, token: data.token, signedUrl: data.signedUrl, maxBytes: DRAFT_MAX_BYTES };
}

/** The workspace's strongest broken-down standouts, so "does this fit the niche" is judged against
    what is actually working for these creators rather than against short-form in general. */
export async function nichePatterns(sb: SupabaseClient, agencyId: string): Promise<NichePattern[]> {
  const { data, error } = await sb
    .from("content_posts")
    .select("multiple,breakdown,content_creators(name)")
    .eq("agency_id", agencyId)
    .eq("is_outlier", true)
    .not("breakdown", "is", null)
    .order("strength", { ascending: false, nullsFirst: false })
    .limit(NICHE_SIZE);
  if (error) throw new Error(`Reading the broken-down standouts failed: ${error.message}`);
  return (
    (data ?? []) as unknown as {
      multiple: number | null;
      breakdown: { hook_type?: string | null; hook_template?: string | null; pattern_you_can_use?: string | null } | null;
      content_creators: { name: string } | { name: string }[] | null;
    }[]
  ).map((r) => {
    const creator = Array.isArray(r.content_creators) ? r.content_creators[0] : r.content_creators;
    return {
      creator: creator?.name ?? "A creator",
      multiple: r.multiple === null ? null : Number(r.multiple),
      hookType: r.breakdown?.hook_type ?? null,
      hookTemplate: r.breakdown?.hook_template ?? null,
      pattern: r.breakdown?.pattern_you_can_use ?? null,
    };
  });
}

export type ScoreDraftInput =
  | { inputKind: "script"; format: DraftFormat; title?: string | null; hook?: string | null; script: string }
  | { inputKind: "video"; format: DraftFormat; title?: string | null; hook?: string | null; videoPath: string; durationS?: number | null };

export interface ScoreResult {
  draftId: string;
  score: number;
  report: DraftReport;
  model: string;
}

interface Scoring {
  report: DraftReport;
  model: string;
}

/** Score with one model call, ask again once when the report fails its own checks, keep the better
    of the two. */
async function scoreWith(
  call: (retry: string[] | null) => Promise<{ json: unknown; model: string }>,
  base: Omit<DraftPromptArgs, "retry">,
  draftText: string | null,
  deadline: number,
  onFirst?: (r: RawReport) => DraftChecks,
): Promise<Scoring & { first: RawReport }> {
  const passes: { report: RawReport; problems: string[] }[] = [];
  const models: string[] = [];
  let checks = base.checks;
  let retry: string[] | null = null;
  let first: RawReport | null = null;
  for (let pass = 1; pass <= 2; pass++) {
    if (pass === 2 && deadline - Date.now() < 25_000) break;
    let answer: { json: unknown; model: string };
    try {
      answer = await call(retry);
    } catch (e) {
      // A second pass that fails must not throw away a first pass that worked.
      if (pass === 1 || passes.length === 0) throw e;
      console.warn("[research] the second draft score pass failed, keeping the first:", e instanceof Error ? e.message : e);
      break;
    }
    models.push(answer.model);
    const report = coerceReport(answer.json, draftText);
    if (!report) {
      retry = ["Your answer was not the JSON object asked for. Return exactly the keys listed."];
      continue;
    }
    if (!first) {
      first = report;
      if (onFirst) checks = onFirst(report);
    }
    const problems = reportProblems(report, base.mode, draftText);
    passes.push({ report, problems });
    if (problems.length === 0) break;
    retry = problems;
  }
  if (!first || passes.length === 0) throw new ResearchUserError("The draft could not be scored right now. Try again in a minute.");
  return { report: finalizeReport(passes, checks, draftText), model: [...new Set(models)].join(" + "), first };
}

async function saveDraft(sb: SupabaseClient, agencyId: string, userId: string | null, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await sb.from("research_drafts").insert({ agency_id: agencyId, created_by: userId, ...row }).select("id").single();
  if (error || !data) throw new Error(`Saving the score failed: ${error?.message ?? "no row came back"}`);
  return (data as { id: string }).id;
}

async function scoreScript(
  sb: SupabaseClient,
  agencyId: string,
  userId: string | null,
  input: Extract<ScoreDraftInput, { inputKind: "script" }>,
  deadline: number,
): Promise<ScoreResult> {
  const script = input.script.trim();
  const checks = draftChecks({ spoken: script, hook: input.hook, title: input.title, format: input.format });
  const niche = await nichePatterns(sb, agencyId);
  const base = { format: input.format, title: input.title ?? null, hook: input.hook ?? null, words: script, checks, niche, mode: "script" as const };
  const scored = await scoreWith(
    (retry) =>
      askJson(draftPrompt({ ...base, retry }), {
        label: retry ? "draft-score-retry" : "draft-score",
        timeoutMs: left(deadline, 40_000),
        temperature: 0.3,
        deadline,
        quiet: true,
      }),
    base,
    [input.title, input.hook, script].filter(Boolean).join("\n"),
    deadline,
  );
  const draftId = await saveDraft(sb, agencyId, userId, {
    input_kind: "script",
    format: input.format,
    title: input.title ?? null,
    hook: input.hook ?? null,
    script,
    score: scored.report.score,
    report: scored.report,
    model: scored.model.slice(0, 200),
  });
  return { draftId, score: scored.report.score, report: scored.report, model: scored.model };
}

async function scoreVideo(
  sb: SupabaseClient,
  agencyId: string,
  userId: string | null,
  input: Extract<ScoreDraftInput, { inputKind: "video" }>,
  deadline: number,
): Promise<ScoreResult> {
  const { data: blob, error } = await sb.storage.from(DRAFT_BUCKET).download(input.videoPath);
  if (error || !blob) throw new ResearchUserError("That upload is not there any more. Upload the video again.");
  const bytes = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type?.startsWith("video/")
    ? blob.type
    : input.videoPath.endsWith(".webm")
      ? "video/webm"
      : input.videoPath.endsWith(".mov")
        ? "video/quicktime"
        : "video/mp4";

  // The words first, from a short-lived address, so the checks in code run on what was actually
  // said before any model judges it. A video with no speech still gets watched.
  let transcript: Transcript | null = null;
  const signed = await sb.storage.from(DRAFT_BUCKET).createSignedUrl(input.videoPath, 600);
  if (signed.error || !signed.data) throw new Error(`Preparing the draft to be read failed: ${signed.error?.message ?? "no address"}`);
  try {
    transcript = await transcribeUrl(signed.data.signedUrl, { label: "draft-transcript", quiet: true });
  } catch (e) {
    console.warn("[research] the draft's words could not be pulled out, scoring from the video alone:", e instanceof Error ? e.message : e);
  }
  const durationS = input.durationS ?? transcript?.durationS ?? null;
  const words = transcript && transcript.text ? formatTranscript(transcript) : null;
  const spoken = transcript?.text ?? "";
  let checks = draftChecks({ spoken, hook: input.hook, title: input.title, format: input.format, durationS });
  const niche = await nichePatterns(sb, agencyId);

  let scored: (Scoring & { first: RawReport }) | null = null;
  if (geminiAvailable() && bytes.length <= GEMINI_INLINE_MAX_BYTES) {
    const base = { format: input.format, title: input.title ?? null, hook: input.hook ?? null, words, checks, niche, mode: "watched" as const };
    try {
      scored = await scoreWith(
        (retry) =>
          geminiJson([inlinePart(bytes, mime), textPart(draftPrompt({ ...base, retry }))], {
            label: retry ? "draft-score-retry" : "draft-score",
            timeoutMs: left(deadline, 60_000),
            quiet: true,
          }),
        base,
        spoken ? [input.title, input.hook, spoken].filter(Boolean).join("\n") : null,
        deadline,
        // What the model heard and saw completes the checks: the words when nothing could be
        // transcribed, and an ask that is shown on screen rather than said.
        (firstPass) => {
          checks = draftChecks({
            spoken: spoken || firstPass.spoken || "",
            hook: input.hook,
            title: input.title,
            format: input.format,
            durationS,
            onScreen: firstPass.onScreen,
          });
          return checks;
        },
      );
    } catch (e) {
      if (!(e instanceof GeminiError || e instanceof DailyQuotaSpent)) throw e;
      console.warn("[research] watching the draft did not work, falling back to its words:", e.message);
    }
  }
  if (!scored) {
    if (!words) throw new ResearchUserError("This video could not be watched right now and nobody speaks in it. Try again later.");
    const base = { format: input.format, title: input.title ?? null, hook: input.hook ?? null, words, checks, niche, mode: "transcript" as const };
    scored = await scoreWith(
      (retry) =>
        askJson(draftPrompt({ ...base, retry }), {
          label: retry ? "draft-score-retry" : "draft-score",
          timeoutMs: left(deadline, 40_000),
          temperature: 0.3,
          deadline,
          quiet: true,
        }),
      base,
      [input.title, input.hook, spoken].filter(Boolean).join("\n"),
      deadline,
    );
  }
  const model = [transcript?.model, scored.model].filter(Boolean).join(" + ");
  const draftId = await saveDraft(sb, agencyId, userId, {
    input_kind: "video",
    format: input.format,
    title: input.title ?? null,
    hook: input.hook ?? null,
    transcript: (spoken || scored.first.spoken || null)?.slice(0, 20_000) ?? null,
    duration_s: durationS,
    score: scored.report.score,
    report: scored.report,
    model: model.slice(0, 200),
  });
  return { draftId, score: scored.report.score, report: scored.report, model };
}

/** Score one draft and save it. An uploaded video is deleted afterwards, whatever happened. */
export async function scoreDraft(
  sb: SupabaseClient,
  agencyId: string,
  userId: string | null,
  input: ScoreDraftInput,
  opts: { deadline?: number } = {},
): Promise<ScoreResult> {
  const deadline = opts.deadline ?? Date.now() + SCORE_BUDGET_MS;
  if (input.inputKind === "video" && !isDraftPathFor(agencyId, input.videoPath)) {
    throw new ResearchUserError(FOREIGN_UPLOAD_MESSAGE);
  }
  try {
    return input.inputKind === "script"
      ? await scoreScript(sb, agencyId, userId, input, deadline)
      : await scoreVideo(sb, agencyId, userId, input, deadline);
  } finally {
    if (input.inputKind === "video") {
      const removed = await sb.storage.from(DRAFT_BUCKET).remove([input.videoPath]);
      if (removed.error) console.error(`[research] could not delete the draft upload ${input.videoPath}:`, removed.error.message);
    }
  }
}
