// Everything the Research tab needs on first render, read on the server in one go.
//
// The Content page renders every tab's data with the page, so a sub-tab, a filter or opening a
// video is all client state: none of them reloads the page. This module is the one server read that
// makes that possible.

import type { SupabaseClient } from "@supabase/supabase-js";
import { lastReadAt, loadDraft, loadDrafts, loadPostDetail, type DraftDetail, type DraftSummary, type PostDetail } from "@/lib/research/detail";
import { loadFeedPosts, type FeedFilters, type FeedPost } from "@/lib/research/feed";
import { latestJob, type JobView } from "@/lib/research/jobs";
import { keyChecks, type KeyCheck } from "@/lib/research/keys";
import { filtersFromParams, isUuid, researchSub, type ResearchSub } from "@/lib/research/view";
import type { FeedPost as Card } from "@/lib/research/feed";

export interface ResearchTabData {
  ok: true;
  sub: ResearchSub;
  filters: FeedFilters;
  feed: { posts: FeedPost[]; nextCursor: number | null };
  totalPosts: number;
  job: JobView | null;
  lastReadAt: string | null;
  drafts: DraftSummary[];
  firstDraft: DraftDetail | null;
  /** A deep link with a video id opens that video straight away. */
  open: { post: Card; detail: PostDetail } | null;
  /** Keys the student has not set yet, so a screen can say which one and where to get it. */
  missingKeys: KeyCheck[];
  renderedAt: number;
}

export type ResearchData = ResearchTabData | { ok: false; error: string };

export async function loadResearchTab(
  sb: SupabaseClient,
  agencyId: string,
  params: { sub?: string; post?: string; [key: string]: string | undefined },
): Promise<ResearchData> {
  try {
    const sub = researchSub(params.sub);
    const filters = filtersFromParams((key) => params[key] ?? null);
    const postId = isUuid(params.post) ? params.post : null;

    const [feed, total, job, readAt, drafts, open] = await Promise.all([
      loadFeedPosts(sb, agencyId, filters, 0),
      sb.from("content_posts").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      latestJob(sb, agencyId),
      lastReadAt(sb, agencyId),
      loadDrafts(sb, agencyId),
      postId ? loadPostDetail(sb, agencyId, postId) : Promise.resolve(null),
    ]);
    if (total.error) throw new Error(`Counting your videos failed: ${total.error.message}`);

    return {
      ok: true,
      sub,
      filters,
      feed,
      totalPosts: total.count ?? 0,
      job,
      lastReadAt: readAt,
      drafts,
      firstDraft: drafts[0] ? await loadDraft(sb, agencyId, drafts[0].id) : null,
      open,
      missingKeys: keyChecks().filter((k) => !k.present),
      renderedAt: Date.now(),
    };
  } catch (e) {
    console.error(`[research] loading the Research tab for ${agencyId} failed:`, e);
    return { ok: false, error: "Research could not be loaded. Reload the page, and check your dashboard's database settings if it keeps happening." };
  }
}
