// Finding creators and putting one on the roster.
//
// Two finders: the channels making the most watched videos of the last year for a niche on YouTube,
// and the accounts Instagram itself says are similar to one you already know. Both remember their
// answer for a day, per workspace, so asking the same thing again costs nothing. YouTube's search
// allowance belongs to one key that every workspace on this dashboard shares, so a second guard
// counts across all of them. An Instagram lookup is one profile read, capped at a cent.
//
// Tracking a creator puts them on the roster and starts reading their posts straight away, so the
// answer can say whether that read started or whether the next scan will pick them up.

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatorRole } from "@/lib/content/creators";
import { IG_PROFILE_SCRAPER, runSyncItems } from "./apify";
import { ResearchUserError } from "./errors";
import { refreshYoutube, SCAN_ROLES } from "./ingest";
import { REFUSAL_MESSAGE, scanCreators, YOUTUBE_BUDGET_MS, type ScanOptions } from "./jobs";
import { reserveSharedYoutubeSearch } from "./limits";
import { normalizeIgHandle } from "./normalize-instagram";
import {
  isFresh,
  markTrackedInstagram,
  markTrackedYoutube,
  normaliseQuery,
  parseRelatedProfiles,
  rankYoutubeCreators,
  type SimilarAccount,
  type YoutubeCreatorResult,
} from "./search";
import { parseChannelRef, searchVideos, YoutubeQuotaError } from "./youtube";

const PROFILE_CHARGE_USD = 0.01;
const PROFILE_TIMEOUT_MS = 90_000;

export interface TrackCreatorInput {
  name?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  youtubeChannelId?: string | null;
  role?: CreatorRole;
}

export interface TrackOptions {
  startedBy: string | null;
  /** False when no new creator read may start now. They are still tracked, and the next scan reads
      them. */
  scanInstagram: boolean;
  /** Called right before the Instagram read starts, once every free check has passed, to reserve
      the day's allowance. A message means it cannot run today. */
  beforeOnboard?: (creatorId: string) => Promise<string | null>;
  /** The same, right before a due YouTube read is scheduled. */
  beforeYoutubeRefresh?: (creatorId: string) => Promise<string | null>;
  /** How the YouTube read runs. By default after the answer goes back; a script passes a runner
      that waits. */
  runLater?: (task: () => Promise<void>) => void | Promise<void>;
  /** Overrides for a deliberately tiny read, used by tests and scripts. */
  scan?: Pick<ScanOptions, "mode" | "resultsLimit" | "maxChargeUsd">;
}

/** What happened to a tracked creator's Instagram. */
export type InstagramRead =
  | { state: "started"; jobId: string }
  /** A read already running includes this creator. */
  | { state: "already"; note: string }
  /** Not read now (the allowance is used, the slots are full, or the read would not start). */
  | { state: "later"; note: string }
  /** No Instagram account, or a role that is never read. */
  | { state: "none" };

/** What happened to a tracked creator's YouTube uploads. */
export type YoutubeRead = { state: "started" } | { state: "recent" } | { state: "later"; note: string } | { state: "none" };

export interface TrackResult {
  creatorId: string;
  created: boolean;
  role: string;
  instagram: string | null;
  youtube: string | null;
  instagramRead: InstagramRead;
  youtubeRead: YoutubeRead;
}

export const NEXT_SCAN_NOTE = "Their Instagram posts will be read on the next scan.";
export const NEXT_SCAN_YOUTUBE_NOTE = "Their YouTube videos will be read on the next scan.";
/** Tracking a creator again only reads their YouTube uploads this long after the last read, unless
    they are new or their channel changed. */
export const YOUTUBE_REFRESH_AFTER_MS = 6 * 3_600_000;

const bareHandle = (v: string | null | undefined) => (v ?? "").trim().replace(/^@+/, "").toLowerCase();

export interface RosterRow {
  id: string;
  handle: string;
  instagram: string | null;
  youtube: string | null;
  youtube_channel_id: string | null;
  role: string;
  last_scraped_at: string | null;
}

/** The roster row this creator already is, if any. The roster's unique key ignores the case of the
    handle, which a bulk write cannot aim at, so the match is made here instead. */
export function matchRosterRow(rows: RosterRow[], id: { handle: string; instagram: string | null; channelId: string | null }): RosterRow | null {
  const byChannel = id.channelId ? rows.find((r) => r.youtube_channel_id === id.channelId) : undefined;
  if (byChannel) return byChannel;
  const byInstagram = id.instagram ? rows.find((r) => normalizeIgHandle(r.instagram ?? "") === id.instagram) : undefined;
  if (byInstagram) return byInstagram;
  return rows.find((r) => bareHandle(r.handle) === bareHandle(id.handle)) ?? null;
}

/** Pure: whether tracking points this creator at a different YouTube channel than their row has. */
export function youtubeChannelChanged(
  existing: { youtube: string | null; youtube_channel_id: string | null },
  next: { youtube: string | null; channelId: string | null },
): boolean {
  if (next.channelId) return next.channelId !== existing.youtube_channel_id;
  if (next.youtube) return bareHandle(next.youtube) !== bareHandle(existing.youtube);
  return false;
}

/** Pure: whether tracking should read their YouTube uploads now. A new creator, a changed channel,
    or nothing read in the last six hours. */
export function youtubeRefreshDue(existing: { last_scraped_at: string | null } | null, channelChanged: boolean, nowMs: number): boolean {
  if (!existing || channelChanged) return true;
  const last = existing.last_scraped_at ? Date.parse(existing.last_scraped_at) : Number.NaN;
  return !Number.isFinite(last) || nowMs - last > YOUTUBE_REFRESH_AFTER_MS;
}

/** The roster values for a tracked creator: a bare lowercase Instagram handle, YouTube in the
    "@Handle" form the roster already uses, and the handle the roster is keyed on. */
export function trackIdentity(input: TrackCreatorInput): { handle: string; instagram: string | null; youtube: string | null; channelId: string | null } {
  const instagram = input.instagram ? normalizeIgHandle(input.instagram) : null;
  if (input.instagram && !instagram) throw new ResearchUserError("That Instagram handle does not look right.");
  const ref = input.youtube ? parseChannelRef({ handle: input.youtube }) : null;
  if (input.youtube && !ref) throw new ResearchUserError("That YouTube handle does not look right.");
  const idRef = input.youtubeChannelId ? parseChannelRef({ channelId: input.youtubeChannelId }) : null;
  if (input.youtubeChannelId && !(idRef && "channelId" in idRef)) throw new ResearchUserError("That YouTube channel id does not look right.");
  const channelId = idRef && "channelId" in idRef ? idRef.channelId : ref && "channelId" in ref ? ref.channelId : null;
  const ytHandle = ref && "handle" in ref ? ref.handle : null;
  const youtube = ytHandle ? `@${ytHandle}` : channelId;
  const handle = instagram ?? (ytHandle ? ytHandle.toLowerCase() : channelId);
  if (!handle) throw new ResearchUserError("Add an Instagram or a YouTube account to track.");
  return { handle, instagram, youtube, channelId };
}

/** Put a creator on the roster (or bring back the row that is already theirs), start their first
    Instagram read right away so the answer can say whether it started, and read their YouTube
    uploads after the answer goes back when a read is due. */
export async function trackCreator(sb: SupabaseClient, agencyId: string, input: TrackCreatorInput, opts: TrackOptions): Promise<TrackResult> {
  const id = trackIdentity(input);
  const { data, error } = await sb
    .from("content_creators")
    .select("id,handle,instagram,youtube,youtube_channel_id,role,last_scraped_at")
    .eq("agency_id", agencyId);
  if (error) throw new Error(`Reading your roster failed: ${error.message}`);
  const existing = matchRosterRow((data ?? []) as RosterRow[], id);
  const channelChanged = existing ? youtubeChannelChanged(existing, { youtube: id.youtube, channelId: id.channelId }) : false;

  const nowIso = new Date().toISOString();
  let creatorId: string;
  let role: string;
  if (existing) {
    role = input.role ?? existing.role;
    const patch = {
      status: "active",
      role,
      updated_at: nowIso,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(id.instagram ? { instagram: id.instagram } : {}),
      ...(id.youtube ? { youtube: id.youtube } : {}),
      // A new handle given without its channel id would leave the old channel's saved id behind and
      // the read would go to the old channel; clearing it makes the read resolve the new handle.
      ...(id.channelId ? { youtube_channel_id: id.channelId } : channelChanged ? { youtube_channel_id: null } : {}),
    };
    const { error: updateError } = await sb.from("content_creators").update(patch).eq("id", existing.id).eq("agency_id", agencyId);
    if (updateError) throw new Error(`Updating the creator failed: ${updateError.message}`);
    creatorId = existing.id;
  } else {
    role = input.role ?? "emulate";
    const { data: inserted, error: insertError } = await sb
      .from("content_creators")
      .insert({
        agency_id: agencyId,
        handle: id.handle,
        name: input.name?.trim() || id.handle,
        instagram: id.instagram,
        youtube: id.youtube,
        youtube_channel_id: id.channelId,
        role,
        status: "active",
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error(`Adding the creator failed: ${insertError?.message ?? "no row came back"}`);
    creatorId = (inserted as { id: string }).id;
  }

  const final = { instagram: id.instagram ?? existing?.instagram ?? null, youtube: id.youtube ?? existing?.youtube ?? null };
  const scanned = SCAN_ROLES.includes(role);
  const instagramRead = scanned && final.instagram ? await startOnboard(sb, agencyId, creatorId, opts) : ({ state: "none" } as const);
  const youtubeRead: YoutubeRead =
    scanned && final.youtube ? await startYoutubeRefresh(sb, agencyId, creatorId, youtubeRefreshDue(existing, channelChanged, Date.now()), opts) : { state: "none" };

  return { creatorId, created: !existing, role, ...final, instagramRead, youtubeRead };
}

async function startYoutubeRefresh(sb: SupabaseClient, agencyId: string, creatorId: string, due: boolean, opts: TrackOptions): Promise<YoutubeRead> {
  if (!due) return { state: "recent" };
  try {
    const refusal = await opts.beforeYoutubeRefresh?.(creatorId);
    if (refusal) return { state: "later", note: NEXT_SCAN_YOUTUBE_NOTE };
  } catch (e) {
    // The creator is already saved; a read that could not be reserved is left to the next scan.
    console.error(`[research] reserving the YouTube read for ${creatorId} failed:`, e instanceof Error ? e.message : e);
    return { state: "later", note: NEXT_SCAN_YOUTUBE_NOTE };
  }
  const run = opts.runLater ?? after;
  await run(async () => {
    try {
      await refreshYoutube(sb, agencyId, [creatorId], Date.now() + YOUTUBE_BUDGET_MS);
    } catch (e) {
      console.error(`[research] the YouTube read for tracked creator ${creatorId} failed:`, e instanceof Error ? e.message : e);
    }
  });
  return { state: "started" };
}

async function startOnboard(sb: SupabaseClient, agencyId: string, creatorId: string, opts: TrackOptions): Promise<InstagramRead> {
  if (!opts.scanInstagram) return { state: "later", note: NEXT_SCAN_NOTE };
  const beforeOnboard = opts.beforeOnboard;
  try {
    const scan = await scanCreators(sb, agencyId, {
      creatorIds: [creatorId],
      mode: opts.scan?.mode ?? "full",
      startedBy: opts.startedBy,
      platforms: ["instagram"],
      purpose: "onboard",
      resultsLimit: opts.scan?.resultsLimit,
      maxChargeUsd: opts.scan?.maxChargeUsd,
      beforeStart: beforeOnboard ? () => beforeOnboard(creatorId) : undefined,
    });
    if (scan.ok && scan.jobId) return { state: "started", jobId: scan.jobId };
    if (!scan.ok && scan.refusal === "creator_in_flight") return { state: "already", note: REFUSAL_MESSAGE.creator_in_flight };
    if (!scan.ok && scan.refusal === "onboards_full") return { state: "later", note: REFUSAL_MESSAGE.onboards_full };
    if (!scan.ok && (scan.refusal === "cap_used" || scan.refusal === "daily_ceiling")) return { state: "later", note: NEXT_SCAN_NOTE };
    console.warn(`[research] the Instagram read for tracked creator ${creatorId} did not start: ${scan.ok ? "no job" : scan.error}`);
    return { state: "later", note: NEXT_SCAN_NOTE };
  } catch (e) {
    // The creator is already saved; a read that cannot start is picked up by the next scan.
    console.error(`[research] starting the Instagram read for tracked creator ${creatorId} failed:`, e instanceof Error ? e.message : e);
    return { state: "later", note: NEXT_SCAN_NOTE };
  }
}

// ------------------------------------------------------------------ the finders

export interface FinderOptions {
  /** Runs only before a real search, never for one answered from the cache. A message refuses it. */
  beforeSearch?: () => Promise<string | null>;
}

type SearchPlatform = "youtube" | "instagram";

async function cachedResults<T>(sb: SupabaseClient, agencyId: string, platform: SearchPlatform, query: string): Promise<T[] | null> {
  const { data, error } = await sb
    .from("research_searches")
    .select("results,created_at")
    .eq("agency_id", agencyId)
    .eq("platform", platform)
    .eq("query", query)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading your earlier searches failed: ${error.message}`);
  const row = data as { results: unknown; created_at: string } | null;
  return row && isFresh(row.created_at) && Array.isArray(row.results) ? (row.results as T[]) : null;
}

async function saveResults(sb: SupabaseClient, agencyId: string, platform: SearchPlatform, query: string, results: unknown[]): Promise<void> {
  const { error } = await sb.from("research_searches").insert({ agency_id: agencyId, platform, query, results });
  if (error) throw new Error(`Saving the search failed: ${error.message}`);
}

async function rosterRows(sb: SupabaseClient, agencyId: string): Promise<{ handle: string; instagram: string | null; youtube: string | null; youtube_channel_id: string | null }[]> {
  const { data, error } = await sb.from("content_creators").select("handle,instagram,youtube,youtube_channel_id").eq("agency_id", agencyId);
  if (error) throw new Error(`Reading your roster failed: ${error.message}`);
  return (data ?? []) as { handle: string; instagram: string | null; youtube: string | null; youtube_channel_id: string | null }[];
}

/** The channels making the most watched videos of the last year for a niche, best first, each
    marked when they are already on your roster. */
export async function findYoutubeCreators(
  sb: SupabaseClient,
  agencyId: string,
  query: string,
  opts: FinderOptions = {},
): Promise<{ query: string; results: YoutubeCreatorResult[]; cached: boolean }> {
  const q = normaliseQuery(query);
  if (q.length < 2) throw new ResearchUserError("Type a niche to search, such as online coaching.");
  const cached = await cachedResults<Omit<YoutubeCreatorResult, "tracked">>(sb, agencyId, "youtube", q);
  if (cached) return { query: q, results: markTrackedYoutube(cached, await rosterRows(sb, agencyId)), cached: true };

  const refusal = await opts.beforeSearch?.();
  if (refusal) throw new ResearchUserError(refusal);
  // The key's searches are shared by every workspace on this dashboard. Reserved after this
  // workspace's own allowance, so a workspace that has used its own can never take the shared ones.
  const shared = await reserveSharedYoutubeSearch(sb, agencyId, q);
  if (!shared.ok) throw new ResearchUserError(shared.error);
  let found;
  try {
    found = await searchVideos(q);
  } catch (e) {
    if (e instanceof YoutubeQuotaError) throw new ResearchUserError(e.message);
    throw e;
  }
  const ranked = rankYoutubeCreators(found.videos, found.channels);
  await saveResults(sb, agencyId, "youtube", q, ranked);
  return { query: q, results: markTrackedYoutube(ranked, await rosterRows(sb, agencyId)), cached: false };
}

/** The accounts Instagram itself relates to one profile: its own similar accounts. */
export async function findSimilarInstagram(
  sb: SupabaseClient,
  agencyId: string,
  handle: string,
  opts: FinderOptions = {},
): Promise<{ query: string; results: SimilarAccount[]; cached: boolean }> {
  const username = normalizeIgHandle(handle);
  if (!username) throw new ResearchUserError("That Instagram handle does not look right.");
  const cached = await cachedResults<Omit<SimilarAccount, "tracked">>(sb, agencyId, "instagram", username);
  if (cached) return { query: username, results: markTrackedInstagram(cached, await rosterRows(sb, agencyId)), cached: true };

  const refusal = await opts.beforeSearch?.();
  if (refusal) throw new ResearchUserError(refusal);
  const items = await runSyncItems(IG_PROFILE_SCRAPER, { usernames: [username] }, { maxTotalChargeUsd: PROFILE_CHARGE_USD, timeoutMs: PROFILE_TIMEOUT_MS });
  if (!items.some((i) => i && typeof i === "object" && !("error" in (i as object)))) {
    throw new ResearchUserError("Instagram did not return that account. Check the handle, and note that private accounts cannot be read.");
  }
  const related = parseRelatedProfiles(items, username);
  await saveResults(sb, agencyId, "instagram", username, related);
  return { query: username, results: markTrackedInstagram(related, await rosterRows(sb, agencyId)), cached: false };
}
