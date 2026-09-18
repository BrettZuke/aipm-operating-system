// The shapes every Research module passes around. No logic here on purpose: this file is the
// contract the server modules, the screens and the tests all read.

export type Platform = "instagram" | "youtube";
export type PostKind = "reel" | "carousel" | "image" | "short" | "video";
export type Metric = "views" | "engagement";
export type BreakdownSource = "watched" | "transcript" | "caption";
export type ScanMode = "full" | "recent";
export type JobStatus = "starting" | "running" | "ingesting" | "done" | "failed";
/** A whole-roster scan, or one newly tracked creator's first read. */
export type JobPurpose = "scan" | "onboard";

/** A post as it comes off a scraper or an API, before any maths is done to it. */
export interface PostInput {
  platform: Platform;
  external_id: string;
  url: string;
  kind: PostKind;
  posted_at: string | null;
  caption: string | null;
  description: string | null;
  duration_s: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** A picture that does not expire: i.ytimg.com for YouTube, null for Instagram until we copy one. */
  thumb_url: string | null;
  display_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  image_urls: string[] | null;
  media_expires_at: string | null;
  /** Who posted it, lowercased. Matches a post back to the creator being tracked. */
  owner: string | null;
  /** The profile a scan read it from, for posts made with somebody else. */
  source: string | null;
}

/** One content_posts row as stored. */
export interface PostRow {
  id: string;
  agency_id: string;
  creator_id: string;
  platform: Platform;
  external_id: string;
  url: string;
  kind: PostKind;
  posted_at: string | null;
  caption: string | null;
  description: string | null;
  duration_s: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  metric: Metric | null;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  strength: number | null;
  is_outlier: boolean;
  thumb_url: string | null;
  display_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  image_urls: string[] | null;
  media_expires_at: string | null;
  transcript: string | null;
  breakdown: Breakdown | null;
  breakdown_model: string | null;
  analysed_at: string | null;
  adaptation: Adaptation | null;
  adapted_at: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

/** Why a video worked, saved on content_posts.breakdown. */
export interface Breakdown {
  title: string | null;
  hook: { spoken: string | null; on_screen: string | null; caption: string | null };
  hook_type: string | null;
  hook_template: string | null;
  angle: string | null;
  format: string | null;
  beats: string[];
  creative_choices: string[];
  why_it_holds_attention: string | null;
  pattern_you_can_use: string | null;
  ask: string | null;
  source: BreakdownSource;
}

/** "Make it yours", saved on content_posts.adaptation. */
export interface Adaptation {
  hooks: { text: string; why: string }[];
  pick: number;
  pick_reason: string | null;
  on_screen_text: string | null;
  how_to_shoot_it: string | null;
  shot_list: string[];
  make_it_sound_like_you: string | null;
  caption_hook: string | null;
}

export type DraftPartKey = "hook" | "clarity" | "value" | "pacing" | "ask" | "fit";

/** A scored draft, saved on research_drafts.report. Part scores are 0 to 10, the total 0 to 100. */
export interface DraftReport {
  score: number;
  verdict: string;
  parts: { key: DraftPartKey; label: string; score: number; note: string; fix: string }[];
  line_fixes: { line: string; problem: string; rewrite: string }[];
  hook_rewrites: string[];
}

/** Everything the client is described by. Read from their Brain, never invented. */
export interface ClientProfile {
  name: string;
  who_they_help: string;
  what_they_sell: string;
  proof: string;
  how_they_talk: string;
  avoid: string[];
  /** Where the description came from: their Client profile doc, or nothing but the workspace name. */
  source: "brain" | "empty";
}

export interface JobResult {
  posts: number;
  outliers: number;
  creators_read: number;
  creators_skipped: string[];
}

/** One research_jobs row. */
export interface ResearchJob {
  id: string;
  agency_id: string;
  kind: "instagram_scan";
  purpose: JobPurpose;
  mode: ScanMode;
  status: JobStatus;
  apify_run_id: string | null;
  token_hint: number | null;
  webhook_token_hash: string;
  creator_ids: string[];
  max_charge_usd: number;
  cost_usd: number | null;
  result: JobResult | null;
  error: string | null;
  started_by: string | null;
  last_checked_at: string | null;
  claimed_at: string | null;
  created_at: string;
  finished_at: string | null;
}

/** The roster fields the scan and ingest paths need. */
export interface CreatorLite {
  id: string;
  name: string;
  handle: string;
  instagram: string | null;
  youtube: string | null;
  youtube_channel_id: string | null;
  role: string;
  status: string;
  min_score: number | null;
}

export const CREATOR_LITE_COLUMNS = "id,name,handle,instagram,youtube,youtube_channel_id,role,status,min_score";
