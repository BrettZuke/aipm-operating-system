// "Make it yours", and the two ways a result reaches the Content board: a saved hook (a card in
// Ideas) and a full script (a card in Scripted, which the Record tab films from).
//
// Every fact in a hook or a script comes from the client's own profile in the Brain. The checks in
// guards.ts run after the model answers, and a hook that claims a result nobody can check, promises
// a personal reply, uses a phrase the client never says or carries a figure the profile does not
// have is thrown away with the reason written down. If too few survive, the model is asked again,
// once, with the offending lines quoted back at it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDropPosition, newCardHistory, type Stage } from "@/lib/content/board";
import {
  adaptationProblems,
  adaptPrompt,
  coerceAdaptation,
  finalizeAdaptation,
  screenHooks,
  type RawAdaptation,
  type SourceVideo,
} from "./adaptation";
import { analyzePost, loadPost, type AnalysedPost } from "./analyze";
import { loadClientProfile, profileIsThin, profileSources } from "./brain";
import { performanceLine } from "./breakdown";
import { cardFormat, filmScriptBody, platformCode, researchCardNotes } from "./cards";
import { ResearchUserError } from "./errors";
import { sanitize } from "./guards";
import { askJson } from "./llm";
import { coerceScript, scriptPrompt, scriptProblems } from "./scriptwriter";
import type { Adaptation, Breakdown } from "./types";

export const ADAPT_BUDGET_MS = 100_000;
export const SCRIPT_BUDGET_MS = 90_000;
const HOOK_MAX_CHARS = 300;

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));
const left = (deadline: number, most: number) => Math.max(5_000, Math.min(most, deadline - Date.now()));

export function sourceVideo(post: AnalysedPost): SourceVideo {
  return {
    creatorName: post.creator_name,
    platform: post.platform,
    kind: post.kind,
    url: post.url,
    metric: post.metric,
    multiple: num(post.multiple),
    performance: performanceLine({
      metric: post.metric,
      score: num(post.score),
      baseline: num(post.baseline),
      multiple: num(post.multiple),
      views: num(post.views),
    }),
  };
}

async function breakdownFor(sb: SupabaseClient, agencyId: string, post: AnalysedPost, deadline: number): Promise<Breakdown> {
  if (post.breakdown) return post.breakdown;
  return (await analyzePost(sb, agencyId, post.id, { deadline })).breakdown;
}

export interface AdaptResult {
  adaptation: Adaptation;
  breakdown: Breakdown;
  model: string;
  /** True when the Client profile is too thin to write real detail from, so the hooks keep
      [brackets] and the note says exactly what to ask the client for. */
  profileThin: boolean;
}

/** Hooks and a shooting plan for the client's own version of one video, built from their profile.
    Breaks the video down first when it has not been. Saves the result on the post. */
export async function adaptPost(sb: SupabaseClient, agencyId: string, postId: string, opts: { deadline?: number } = {}): Promise<AdaptResult> {
  const deadline = opts.deadline ?? Date.now() + ADAPT_BUDGET_MS;
  const post = await loadPost(sb, agencyId, postId);
  const breakdown = await breakdownFor(sb, agencyId, post, deadline);
  const client = await loadClientProfile(sb, agencyId);
  const thin = profileIsThin(client);
  const video = sourceVideo(post);
  // A figure may appear in a hook only when the client's own profile contains it.
  const numberSources = profileSources(client);

  const passes: { raw: RawAdaptation; kept: { text: string; why: string }[] }[] = [];
  const models: string[] = [];
  let retry: string[] | null = null;
  for (let pass = 1; pass <= 2; pass++) {
    if (pass === 2 && deadline - Date.now() < 25_000) break;
    let answer: { json: unknown; model: string };
    try {
      answer = await askJson(adaptPrompt({ breakdown, video, client, thin, retry }), {
        label: pass === 1 ? "adapt" : "adapt-retry",
        timeoutMs: left(deadline, 45_000),
        temperature: 0.8,
        deadline,
        quiet: true,
      });
    } catch (e) {
      // A second pass that fails must not throw away hooks the first pass already got right.
      if (pass === 1 || passes.every((p) => p.kept.length === 0)) throw e;
      console.warn(`[research] the second Make it yours pass for post ${post.id} failed, keeping the first:`, e instanceof Error ? e.message : e);
      break;
    }
    models.push(answer.model);
    const raw = coerceAdaptation(answer.json);
    if (!raw) {
      console.warn(`[research] Make it yours pass ${pass} for post ${post.id} was not an answer we can read`);
      retry = ["Your answer was not the JSON object asked for. Return exactly the keys listed."];
      continue;
    }
    const screened = screenHooks(raw.hooks, client.avoid, { needBrackets: thin, numberSources });
    passes.push({ raw, kept: screened.kept });
    const problems = adaptationProblems(raw, screened);
    if (screened.dropped.length) {
      console.log(
        `[research] Make it yours pass ${pass}: kept ${screened.kept.length}, dropped ${screened.dropped.map((d) => `"${d.text}" (${d.reasons.join("; ")})`).join(", ")}`,
      );
    }
    if (problems.length === 0) break;
    retry = problems;
  }

  if (passes.length === 0 || passes.every((p) => p.kept.length === 0)) {
    throw new ResearchUserError("No hook for this video passed the checks. Try Make it yours again in a minute.");
  }
  const adaptation = finalizeAdaptation(passes, thin, numberSources);
  const nowIso = new Date().toISOString();
  const { error } = await sb.from("content_posts").update({ adaptation, adapted_at: nowIso, updated_at: nowIso }).eq("id", post.id).eq("agency_id", agencyId);
  if (error) throw new Error(`Saving Make it yours failed: ${error.message}`);
  return { adaptation, breakdown, model: [...new Set(models)].join(" + "), profileThin: thin };
}

/** The position after the last card in a board column: the board's own way of saying "at the end". */
async function endOfColumn(sb: SupabaseClient, agencyId: string, stage: Stage): Promise<number> {
  const { data, error } = await sb
    .from("content_cards")
    .select("position")
    .eq("agency_id", agencyId)
    .eq("stage", stage)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the ${stage} column failed: ${error.message}`);
  return computeDropPosition((data as { position: number } | null)?.position ?? null, null);
}

function cleanHook(hookText: string): string {
  const hook = sanitize(hookText ?? "").replace(/\s*\n\s*/g, " ").trim();
  if (!hook) throw new ResearchUserError("Write a hook first.");
  if (hook.length > HOOK_MAX_CHARS) throw new ResearchUserError(`A hook is said in a few seconds. Keep it under ${HOOK_MAX_CHARS} characters.`);
  return hook;
}

/** File a hook as a card in Ideas, at the end of the column. Saving the same hook from the same
    video again gives back the card it already made instead of filing a second one. */
export async function saveHookCard(sb: SupabaseClient, agencyId: string, postId: string, hookText: string): Promise<{ cardId: string; created: boolean }> {
  const hook = cleanHook(hookText);
  const post = await loadPost(sb, agencyId, postId);
  const source = `research:${post.id}`;
  const { data: existing, error: existingError } = await sb
    .from("content_cards")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("source", source)
    .eq("stage", "ideas")
    .eq("hook", hook)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Checking for a saved hook failed: ${existingError.message}`);
  if (existing) return { cardId: (existing as { id: string }).id, created: false };

  const video = sourceVideo(post);
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("content_cards")
    .insert({
      agency_id: agencyId,
      stage: "ideas",
      position: await endOfColumn(sb, agencyId, "ideas"),
      title: hook.slice(0, 200),
      hook,
      format: cardFormat(video),
      platform: platformCode(video.platform),
      source,
      notes: researchCardNotes({
        creator: video.creatorName,
        postUrl: video.url,
        multiple: video.multiple,
        metric: video.metric,
        breakdown: post.breakdown,
        adaptation: post.adaptation,
      }),
      stage_history: newCardHistory(now, "ideas"),
      created_by: "human",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Saving the hook failed: ${error?.message ?? "no card came back"}`);
  return { cardId: (data as { id: string }).id, created: true };
}

export interface ScriptResult {
  cardId: string;
  title: string;
  model: string;
  /** Checks the script still fails, written on the card so nobody films a problem by accident. */
  problems: string[];
}

/** Write a full script on a chosen hook and file it in Scripted, so it turns up in Record.
    beforeWrite runs after the free checks and right before any model is called, told whether the
    video has to be broken down first, so the day's allowance is reserved before anything spends. */
export async function writeScriptCard(
  sb: SupabaseClient,
  agencyId: string,
  postId: string,
  hookText: string,
  opts: { deadline?: number; beforeWrite?: (needsBreakdown: boolean) => Promise<string | null> } = {},
): Promise<ScriptResult> {
  const deadline = opts.deadline ?? Date.now() + SCRIPT_BUDGET_MS;
  const hook = cleanHook(hookText);
  const post = await loadPost(sb, agencyId, postId);
  const client = await loadClientProfile(sb, agencyId);
  const refusal = await opts.beforeWrite?.(!post.breakdown);
  if (refusal) throw new ResearchUserError(refusal);
  const breakdown = await breakdownFor(sb, agencyId, post, deadline);
  const video = sourceVideo(post);
  const thin = profileIsThin(client);
  const longForm = cardFormat(video) === "long_form";

  let draft: ReturnType<typeof coerceScript> = null;
  let model = "unknown";
  let problems: string[] = [];
  let retry: string[] | null = null;
  for (let pass = 1; pass <= 2; pass++) {
    if (pass === 2 && deadline - Date.now() < 25_000) break;
    const answer = await askJson(
      scriptPrompt({
        hook,
        breakdown,
        video,
        client,
        thin,
        onScreen: post.adaptation?.on_screen_text ?? null,
        shotList: post.adaptation?.shot_list ?? [],
        retry,
      }),
      { label: pass === 1 ? "script" : "script-retry", timeoutMs: left(deadline, 45_000), temperature: 0.6, deadline, quiet: true },
    );
    model = answer.model;
    const written = coerceScript(answer.json, hook);
    if (!written) {
      retry = ["Your answer was not the JSON object asked for. Return exactly the keys listed."];
      continue;
    }
    problems = scriptProblems(written, client, longForm);
    draft = written;
    if (problems.length === 0) break;
    console.log(`[research] script pass ${pass} for post ${post.id} failed its checks: ${problems.join(" | ")}`);
    retry = problems;
  }
  if (!draft) throw new ResearchUserError("The script did not come back in a shape we can use. Try again in a minute.");

  const title = sanitize(draft.hook || hook).slice(0, 200);
  const body = filmScriptBody({
    hook: draft.hook,
    onScreen: draft.on_screen,
    spoken: draft.script,
    cta: draft.cta,
    shots: draft.shot_list,
    videoTitle: null,
  });
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("content_cards")
    .insert({
      agency_id: agencyId,
      stage: "scripted",
      position: await endOfColumn(sb, agencyId, "scripted"),
      title,
      hook: draft.hook,
      format: cardFormat(video),
      platform: platformCode(video.platform),
      script: body.slice(0, 20_000),
      source: `research:${post.id}`,
      notes: researchCardNotes({
        creator: video.creatorName,
        postUrl: video.url,
        multiple: video.multiple,
        metric: video.metric,
        breakdown,
        adaptation: post.adaptation,
        extra: [
          draft.caption ? `Caption:\n${draft.caption}` : "",
          problems.length ? `Checks this script still fails, fix these before filming:\n${problems.map((p) => `- ${p}`).join("\n")}` : "",
        ].filter(Boolean),
      }),
      stage_history: newCardHistory(now, "scripted"),
      created_by: "agent:research",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Saving the script failed: ${error?.message ?? "no card came back"}`);
  return { cardId: (data as { id: string }).id, title, model, problems };
}
