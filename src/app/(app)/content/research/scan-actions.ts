"use server";

// Scanning, and putting a creator on the roster.
//
// A scan is on demand: the student presses Scan now. Nothing here runs on a timer, because this
// dashboard's free hosting allows two scheduled jobs and both are already used. The README says how
// to schedule one from Supabase later if you want to.
//
// Every scan reserves one of the day's allowance before it spends anything, and every read carries
// a hard cost cap. The scan itself runs in the background at Apify, so this action answers at once
// and the page checks for the result.

import { after } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { CREATOR_ROLES } from "@/lib/content/creators";
import { apifyCreditLeft, estimateScanUsd, scanChargeCap } from "@/lib/research/apify";
import { trackCreator } from "@/lib/research/discover";
import { reserveOrRefuse } from "@/lib/research/limits";
import { checkJobs, scanCreators, scanResultsLimit, type JobView } from "@/lib/research/jobs";
import { normalizeIgHandle } from "@/lib/research/normalize-instagram";
import { CREATOR_LITE_COLUMNS, type CreatorLite, type ScanMode } from "@/lib/research/types";
import { actionFailure, isFail, researchContext, type Fail } from "./action-context";

const ModeSchema = z.object({ mode: z.enum(["full", "recent"]).default("recent") });

export interface ScanEstimate {
  /** Accounts a scan would read now. */
  instagramCreators: number;
  youtubeCreators: number;
  /** What those Instagram reads are expected to cost, before the cap's headroom. */
  estimateUsd: number;
  /** The hard cap the read would carry. Apify itself refuses to spend past it. */
  capUsd: number;
}

/** What a scan would cost before anything is spent, so the button can say so. */
export async function scanEstimateAction(input: { mode?: ScanMode } = {}): Promise<({ ok: true } & ScanEstimate) | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = ModeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick how far back to read." };
  try {
    const { data, error } = await ctx.sb
      .from("content_creators")
      .select(CREATOR_LITE_COLUMNS)
      .eq("agency_id", ctx.agencyId)
      .eq("status", "active")
      .in("role", ["emulate", "watch", "strategist"]);
    if (error) throw new Error(`Reading your creators failed: ${error.message}`);
    const creators = (data ?? []) as CreatorLite[];
    const instagram = creators.filter((c) => normalizeIgHandle(c.instagram ?? "") !== null).length;
    const youtube = creators.filter((c) => (c.youtube ?? "").trim() !== "").length;
    const limit = scanResultsLimit({ mode: parsed.data.mode });
    return {
      ok: true,
      instagramCreators: instagram,
      youtubeCreators: youtube,
      estimateUsd: estimateScanUsd(instagram, limit),
      capUsd: instagram > 0 ? scanChargeCap(instagram, limit) : 0,
    };
  } catch (e) {
    return actionFailure(e, "scan estimate", ctx.agencyId);
  }
}

export interface ScanStarted {
  jobId: string | null;
  instagramCreators: number;
  instagramLeft: number;
  youtubeCreators: number;
  capUsd: number | null;
  /** True when Apify has nowhere public to call back to, so the page checks for itself. */
  pollOnly: boolean;
}

/** Start a scan of every creator this workspace tracks. */
export async function scanNowAction(input: { mode?: ScanMode } = {}): Promise<({ ok: true } & ScanStarted) | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = ModeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick how far back to read." };
  try {
    const started = await scanCreators(ctx.sb, ctx.agencyId, {
      mode: parsed.data.mode,
      startedBy: ctx.userId,
      beforeStart: () => reserveOrRefuse(ctx.sb, ctx.agencyId, ["manualScans"], parsed.data.mode),
    });
    if (!started.ok) return { ok: false, error: started.error };
    revalidatePath("/content");
    return {
      ok: true,
      jobId: started.jobId,
      instagramCreators: started.instagramCreators,
      instagramLeft: started.instagramLeft,
      youtubeCreators: started.youtubeCreators,
      capUsd: started.maxChargeUsd,
      pollOnly: started.pollOnly,
    };
  } catch (e) {
    return actionFailure(e, "scan now", ctx.agencyId);
  }
}

export interface JobStatus {
  running: boolean;
  /** True when this call actually finished a scan off, so the page knows to reload. */
  finished: boolean;
  job: JobView | null;
}

/** Where the running scan has got to. Called by the page every few seconds while one is running,
    and the only way a result arrives when there is no public address for Apify to call back to. */
export async function jobStatusAction(): Promise<({ ok: true } & JobStatus) | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  try {
    // Checking can take a while when a scan has just finished, so the answer goes back first and the
    // heavy part (saving the posts, copying the cover images) runs after it.
    const summary = await checkJobs(ctx.sb, ctx.agencyId, { thumbnailBudgetMs: 20_000 });
    if (summary.ingested > 0) revalidatePath("/content");
    return { ok: true, running: summary.running, finished: summary.ingested > 0, job: summary.job };
  } catch (e) {
    return actionFailure(e, "scan status", ctx.agencyId);
  }
}

/** How much free Apify credit is left across the tokens this dashboard has. Null when no account
    answered, which is not the same as none left. */
export async function creditLeftAction(): Promise<{ ok: true; usd: number | null } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  try {
    return { ok: true, usd: await apifyCreditLeft() };
  } catch (e) {
    return actionFailure(e, "credit left", ctx.agencyId);
  }
}

const TrackSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  instagram: z.string().trim().max(200).optional().nullable(),
  youtube: z.string().trim().max(200).optional().nullable(),
  youtubeChannelId: z.string().trim().max(60).optional().nullable(),
  role: z.enum(CREATOR_ROLES).optional(),
});

export interface Tracked {
  creatorId: string;
  created: boolean;
  /** One sentence saying what is happening to them now. */
  note: string;
}

/** Put a creator on the roster and start reading their posts. */
export async function trackCreatorAction(input: z.input<typeof TrackSchema>): Promise<({ ok: true } & Tracked) | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = TrackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Add an Instagram or a YouTube account to track." };
  try {
    const result = await trackCreator(ctx.sb, ctx.agencyId, parsed.data, {
      startedBy: ctx.userId,
      scanInstagram: true,
      beforeOnboard: (creatorId) => reserveOrRefuse(ctx.sb, ctx.agencyId, ["onboards"], creatorId),
      beforeYoutubeRefresh: (creatorId) => reserveOrRefuse(ctx.sb, ctx.agencyId, ["youtubeRefreshes"], creatorId),
      runLater: after,
    });
    revalidatePath("/content");
    const notes: string[] = [];
    if (result.instagramRead.state === "started") notes.push("Reading their Instagram posts now.");
    else if (result.instagramRead.state !== "none") notes.push(result.instagramRead.note);
    if (result.youtubeRead.state === "started") notes.push("Reading their YouTube videos now.");
    else if (result.youtubeRead.state === "later") notes.push(result.youtubeRead.note);
    return {
      ok: true,
      creatorId: result.creatorId,
      created: result.created,
      note: notes.join(" ") || "They are on your roster. The next scan reads their posts.",
    };
  } catch (e) {
    return actionFailure(e, "track creator", ctx.agencyId);
  }
}
