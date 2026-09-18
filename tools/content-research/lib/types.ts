// The shapes every other module passes around. No logic here on purpose: this file is the contract.

export type Platform = "instagram" | "youtube";
export type PostKind = "reel" | "carousel" | "image" | "short" | "video";
export type Metric = "views" | "engagement";
export type BreakdownSource = "watched" | "transcript" | "caption";

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
  thumb_url: string | null;
  display_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  image_urls: string[] | null;
  media_expires_at: string | null;
  /** The account that posted it. */
  owner: string | null;
  /** The handle we asked for, so a post can be matched back to the creator we tracked. */
  source: string | null;
}

/** A post with its creator-relative numbers worked out. This is what a report ranks. */
export interface ScoredPost extends PostInput {
  creator: string;
  metric: Metric | null;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  strength: number | null;
  is_outlier: boolean;
}

export interface Creator {
  /** How the student refers to them: an Instagram handle or a YouTube @handle. */
  name: string;
  platform: Platform;
  /** Instagram username, lowercased. */
  handle: string | null;
  /** YouTube channel id (UC...), filled in the first time we resolve it. */
  channel_id: string | null;
  added_at: string;
}

export interface ClientProfile {
  slug: string;
  name: string;
  who_they_help: string;
  what_they_sell: string;
  proof: string;
  how_they_talk: string;
  avoid: string[];
  /** Where the text came from: the local file, or the workspace Brain. */
  source: "local" | "brain";
}

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

export interface DraftReport {
  score: number;
  verdict: string;
  parts: { key: DraftPartKey; label: string; score: number; note: string; fix: string }[];
  line_fixes: { line: string; problem: string; rewrite: string }[];
  hook_rewrites: string[];
}

/** One line in the client's run log: what was spent and which model answered. */
export interface RunRecord {
  at: string;
  command: string;
  apify_usd: number;
  ai_calls: { label: string; provider: string; model: string; ms: number }[];
  note: string | null;
}
