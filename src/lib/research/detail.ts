// The reads the Research screens need beyond one page of the feed: one video with the heavy fields
// its detail view shows, and this workspace's scored drafts. Every query spells out the workspace
// id, because these run with the service-role key where the database's own rules do not apply.

import type { SupabaseClient } from "@supabase/supabase-js";
import { THIN_PROFILE_NOTE } from "./adaptation";
import { FEED_COLUMNS, toFeedPost, type FeedPost } from "./feed";
import { viewAdaptation, viewBreakdown, viewReport } from "./safe-view";
import type { Adaptation, Breakdown, DraftReport } from "./types";
import type { DraftFormat } from "./view";

/** The fields a card does not carry, loaded when one video is opened. */
export interface PostDetail {
  caption: string | null;
  description: string | null;
  durationS: number | null;
  likes: number | null;
  comments: number | null;
  transcript: string | null;
  breakdown: Breakdown | null;
  analysedAt: string | null;
  adaptation: Adaptation | null;
  adaptedAt: string | null;
  /** Made while the Client profile was still thin: the hooks keep [brackets] and the note says what
      to ask the client for. */
  adaptedWithThinProfile: boolean;
}

type FeedRow = Parameters<typeof toFeedPost>[0];

export interface DetailRow extends FeedRow {
  description: string | null;
  duration_s: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  transcript: string | null;
  breakdown: unknown;
  analysed_at: string | null;
  adaptation: unknown;
}

const DETAIL_COLUMNS = `${FEED_COLUMNS},description,duration_s,likes,comments,transcript,breakdown,analysed_at,adaptation`;

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

/** A saved AI answer is rebuilt field by field, so a mangled row shows less rather than crashing. */
export function toPostDetail(row: DetailRow): PostDetail {
  const adaptation = viewAdaptation(row.adaptation);
  return {
    caption: row.caption,
    description: row.description ?? null,
    durationS: num(row.duration_s),
    likes: num(row.likes),
    comments: num(row.comments),
    transcript: row.transcript ?? null,
    breakdown: viewBreakdown(row.breakdown),
    analysedAt: row.analysed_at ?? null,
    adaptation,
    adaptedAt: adaptation ? (row.adapted_at ?? null) : null,
    adaptedWithThinProfile: adaptation?.make_it_sound_like_you === THIN_PROFILE_NOTE,
  };
}

/** One of this workspace's videos as its card and its detail, or null when it is not theirs. */
export async function loadPostDetail(sb: SupabaseClient, agencyId: string, postId: string): Promise<{ post: FeedPost; detail: PostDetail } | null> {
  const { data, error } = await sb.from("content_posts").select(DETAIL_COLUMNS).eq("id", postId).eq("agency_id", agencyId).maybeSingle();
  if (error) throw new Error(`Loading that video failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as DetailRow;
  return { post: toFeedPost(row), detail: toPostDetail(row) };
}

export const DRAFT_HISTORY = 25;

export interface DraftSummary {
  id: string;
  created_at: string;
  input_kind: "script" | "video";
  format: DraftFormat;
  title: string | null;
  hook: string | null;
  score: number | null;
}

export interface DraftDetail extends DraftSummary {
  duration_s: number | null;
  report: DraftReport | null;
}

const DRAFT_SUMMARY_COLUMNS = "id,created_at,input_kind,format,title,hook,score";

export async function loadDrafts(sb: SupabaseClient, agencyId: string, limit = DRAFT_HISTORY): Promise<DraftSummary[]> {
  const { data, error } = await sb.from("research_drafts").select(DRAFT_SUMMARY_COLUMNS).eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Loading your scored drafts failed: ${error.message}`);
  return (data ?? []) as DraftSummary[];
}

export async function loadDraft(sb: SupabaseClient, agencyId: string, draftId: string): Promise<DraftDetail | null> {
  const { data, error } = await sb.from("research_drafts").select(`${DRAFT_SUMMARY_COLUMNS},duration_s,report`).eq("id", draftId).eq("agency_id", agencyId).maybeSingle();
  if (error) throw new Error(`Loading that draft failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Omit<DraftDetail, "duration_s" | "report"> & { duration_s: number | string | null; report: unknown };
  return { ...row, duration_s: num(row.duration_s), report: viewReport(row.report) };
}

/** When any creator's posts were last read, for the line beside Scan now. */
export async function lastReadAt(sb: SupabaseClient, agencyId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("content_creators")
    .select("last_scraped_at")
    .eq("agency_id", agencyId)
    .not("last_scraped_at", "is", null)
    .order("last_scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading when your creators were last read failed: ${error.message}`);
  return (data as { last_scraped_at: string } | null)?.last_scraped_at ?? null;
}
