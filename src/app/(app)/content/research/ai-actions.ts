"use server";

// Everything on the Research screens that calls a model, plus the two writes that put a result on
// the Content board.
//
// Each of these reserves one of the day's allowance before it spends anything, checks that the
// video or the upload really belongs to this workspace, and answers with either the result or one
// sentence saying what went wrong. A failure is never dressed up as a success: the screens show the
// sentence, not a spinner that quietly stops.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adaptPost, saveHookCard, writeScriptCard } from "@/lib/research/adapt";
import { analyzePost } from "@/lib/research/analyze";
import { findSimilarInstagram, findYoutubeCreators } from "@/lib/research/discover";
import { loadFeedPosts, type FeedPost } from "@/lib/research/feed";
import { loadDraft, loadDrafts, type DraftDetail, type DraftSummary } from "@/lib/research/detail";
import { reserveOrRefuse } from "@/lib/research/limits";
import { createDraftUpload, DRAFT_TYPES, scoreDraft } from "@/lib/research/score";
import type { SimilarAccount, YoutubeCreatorResult } from "@/lib/research/search";
import type { Adaptation, Breakdown, DraftReport } from "@/lib/research/types";
import { FEED_SORTS, FEED_WINDOWS } from "@/lib/research/feed";
import { POST_KINDS, PLATFORMS } from "@/lib/research/view";
import { actionFailure, isFail, researchContext, type Fail } from "./action-context";

const PostSchema = z.object({ postId: z.string().uuid() });

/** Break one video down: the model watches it when it can, reads the words when it cannot. */
export async function analyzePostAction(input: { postId: string }): Promise<{ ok: true; breakdown: Breakdown; model: string } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = PostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That video could not be found." };
  try {
    const refusal = await reserveOrRefuse(ctx.sb, ctx.agencyId, ["breakdowns"], parsed.data.postId);
    if (refusal) return { ok: false, error: refusal };
    const result = await analyzePost(ctx.sb, ctx.agencyId, parsed.data.postId);
    revalidatePath("/content");
    return { ok: true, breakdown: result.breakdown, model: result.model };
  } catch (e) {
    return actionFailure(e, "break down", ctx.agencyId);
  }
}

/** Hooks in the client's own voice, built on this video's mechanism. */
export async function adaptPostAction(
  input: { postId: string },
): Promise<{ ok: true; adaptation: Adaptation; breakdown: Breakdown; profileThin: boolean } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = PostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That video could not be found." };
  try {
    // A video that has not been broken down has to be first, so both allowances are checked before
    // either is taken.
    const { data } = await ctx.sb.from("content_posts").select("breakdown").eq("id", parsed.data.postId).eq("agency_id", ctx.agencyId).maybeSingle();
    const needsBreakdown = !(data as { breakdown: unknown } | null)?.breakdown;
    const refusal = await reserveOrRefuse(ctx.sb, ctx.agencyId, needsBreakdown ? ["breakdowns", "adaptations"] : ["adaptations"], parsed.data.postId);
    if (refusal) return { ok: false, error: refusal };
    const result = await adaptPost(ctx.sb, ctx.agencyId, parsed.data.postId);
    revalidatePath("/content");
    return { ok: true, adaptation: result.adaptation, breakdown: result.breakdown, profileThin: result.profileThin };
  } catch (e) {
    return actionFailure(e, "make it yours", ctx.agencyId);
  }
}

const HookSchema = z.object({ postId: z.string().uuid(), hook: z.string().trim().min(3).max(300) });

/** Save one hook as a card in Ideas on the Content board. */
export async function saveHookAction(input: { postId: string; hook: string }): Promise<{ ok: true; cardId: string; created: boolean } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = HookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a hook to save." };
  try {
    const saved = await saveHookCard(ctx.sb, ctx.agencyId, parsed.data.postId, parsed.data.hook);
    revalidatePath("/content");
    return { ok: true, ...saved };
  } catch (e) {
    return actionFailure(e, "save hook", ctx.agencyId);
  }
}

/** Write the full script on a chosen hook and file it in Scripted, ready to film in Record. */
export async function writeScriptAction(
  input: { postId: string; hook: string },
): Promise<{ ok: true; cardId: string; title: string; problems: string[] } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = HookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a hook to write the script on." };
  try {
    const written = await writeScriptCard(ctx.sb, ctx.agencyId, parsed.data.postId, parsed.data.hook, {
      beforeWrite: (needsBreakdown) =>
        reserveOrRefuse(ctx.sb, ctx.agencyId, needsBreakdown ? ["breakdowns", "scripts"] : ["scripts"], parsed.data.postId),
    });
    revalidatePath("/content");
    return { ok: true, cardId: written.cardId, title: written.title, problems: written.problems };
  } catch (e) {
    return actionFailure(e, "write script", ctx.agencyId);
  }
}

const SearchSchema = z.object({ platform: z.enum(["youtube", "instagram"]), query: z.string().trim().min(2).max(100) });

export type CreatorSearchResults =
  | { ok: true; platform: "youtube"; query: string; cached: boolean; results: YoutubeCreatorResult[] }
  | { ok: true; platform: "instagram"; query: string; cached: boolean; results: SimilarAccount[] };

/** Find creators: a niche on YouTube, or the accounts Instagram says are like one you know. */
export async function searchCreatorsAction(input: { platform: "youtube" | "instagram"; query: string }): Promise<CreatorSearchResults | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = SearchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Type at least two characters to search for." };
  try {
    const beforeSearch = () => reserveOrRefuse(ctx.sb, ctx.agencyId, ["searches"], parsed.data.query);
    if (parsed.data.platform === "youtube") {
      const found = await findYoutubeCreators(ctx.sb, ctx.agencyId, parsed.data.query, { beforeSearch });
      return { ok: true, platform: "youtube", query: found.query, cached: found.cached, results: found.results };
    }
    const found = await findSimilarInstagram(ctx.sb, ctx.agencyId, parsed.data.query, { beforeSearch });
    return { ok: true, platform: "instagram", query: found.query, cached: found.cached, results: found.results };
  } catch (e) {
    return actionFailure(e, "find creators", ctx.agencyId);
  }
}

const UploadSchema = z.object({
  contentType: z.enum(Object.keys(DRAFT_TYPES) as ["video/mp4", "video/quicktime", "video/webm"]),
  size: z.number().int().positive(),
});

/** A one-off address the browser uploads one draft video to. The video never passes through this
    app, because a server action's body is capped at a megabyte. */
export async function draftUploadUrlAction(
  input: { contentType: string; size: number },
): Promise<{ ok: true; path: string; token: string; signedUrl: string; bucket: string } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = UploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Upload an mp4, mov or webm video of up to 25MB." };
  try {
    const refusal = await reserveOrRefuse(ctx.sb, ctx.agencyId, ["draftUploads"], null);
    if (refusal) return { ok: false, error: refusal };
    const upload = await createDraftUpload(ctx.sb, ctx.agencyId, parsed.data.contentType, parsed.data.size);
    return { ok: true, path: upload.path, token: upload.token, signedUrl: upload.signedUrl, bucket: upload.bucket };
  } catch (e) {
    return actionFailure(e, "draft upload", ctx.agencyId);
  }
}

const ScoreSchema = z.discriminatedUnion("inputKind", [
  z.object({
    inputKind: z.literal("script"),
    format: z.enum(["reel", "short", "long"]),
    title: z.string().trim().max(200).nullish(),
    hook: z.string().trim().max(300).nullish(),
    script: z.string().trim().min(20, "Paste the script you want scored.").max(20_000),
  }),
  z.object({
    inputKind: z.literal("video"),
    format: z.enum(["reel", "short", "long"]),
    title: z.string().trim().max(200).nullish(),
    hook: z.string().trim().max(300).nullish(),
    videoPath: z.string().trim().min(1).max(200),
    durationS: z.number().positive().max(7_200).nullish(),
  }),
]);

/** Score one draft and save it, so the history keeps every score with the words it judged. */
export async function scoreDraftAction(
  input: z.input<typeof ScoreSchema>,
): Promise<{ ok: true; draftId: string; score: number; report: DraftReport; model: string } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = ScoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Paste a script, or upload a video, and pick a format." };
  }
  try {
    const refusal = await reserveOrRefuse(ctx.sb, ctx.agencyId, ["draftScores"], parsed.data.inputKind);
    if (refusal) return { ok: false, error: refusal };
    const scored = await scoreDraft(ctx.sb, ctx.agencyId, ctx.userId, parsed.data);
    return { ok: true, draftId: scored.draftId, score: scored.score, report: scored.report, model: scored.model };
  } catch (e) {
    return actionFailure(e, "score draft", ctx.agencyId);
  }
}

const FiltersSchema = z.object({
  window: z.union([z.literal(FEED_WINDOWS[0]), z.literal(FEED_WINDOWS[1]), z.literal(FEED_WINDOWS[2])]),
  platform: z.enum(PLATFORMS as [string, ...string[]]).nullable(),
  format: z.enum(POST_KINDS as [string, ...string[]]).nullable(),
  creatorId: z.string().uuid().nullable(),
  sort: z.enum(FEED_SORTS),
  show: z.enum(["standouts", "all"]),
});

const MoreSchema = z.object({ filters: FiltersSchema, cursor: z.number().int().min(0).max(10_000) });

/** One page of the feed for a set of filters. Called from the page itself, so changing a filter
    never reloads the whole Content page. */
export async function loadMorePostsAction(
  input: z.input<typeof MoreSchema>,
): Promise<{ ok: true; posts: FeedPost[]; nextCursor: number | null } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = MoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those filters are not ones this page has." };
  try {
    const page = await loadFeedPosts(ctx.member, ctx.agencyId, parsed.data.filters as Parameters<typeof loadFeedPosts>[2], parsed.data.cursor);
    return { ok: true, ...page };
  } catch (e) {
    return actionFailure(e, "load more", ctx.agencyId);
  }
}

/** The workspace's scored drafts, newest first. */
export async function draftHistoryAction(): Promise<{ ok: true; drafts: DraftSummary[] } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  try {
    return { ok: true, drafts: await loadDrafts(ctx.member, ctx.agencyId) };
  } catch (e) {
    return actionFailure(e, "draft history", ctx.agencyId);
  }
}

/** One saved score, opened from the history. */
export async function draftDetailAction(input: { draftId: string }): Promise<{ ok: true; draft: DraftDetail } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = z.object({ draftId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That score could not be found." };
  try {
    const draft = await loadDraft(ctx.member, ctx.agencyId, parsed.data.draftId);
    if (!draft) return { ok: false, error: "That score is not in this workspace." };
    return { ok: true, draft };
  } catch (e) {
    return actionFailure(e, "draft detail", ctx.agencyId);
  }
}
