// What the Research screens show, as pure functions: which sub-tab a link means, the filters in the
// address, the numbers and ages on a card, the line beside Scan now, and when to stop checking on a
// running scan. No server imports, so the screens use these directly and every rule is unit tested.

import { DEFAULT_FEED_FILTERS, FEED_SORTS, FEED_WINDOWS, type FeedFilters, type FeedSort } from "./feed";
import type { JobView } from "./jobs";
import type { Breakdown, BreakdownSource, Platform, PostKind } from "./types";

export const RESEARCH_SUBS = ["feed", "creators", "drafts", "runs"] as const;
export type ResearchSub = (typeof RESEARCH_SUBS)[number];

// The Creators tab used to have Roster, What it found and Run history. Those links still work.
const SUB_ALIASES: Record<string, ResearchSub> = { signal: "feed", roster: "creators" };

export function researchSub(raw: string | null | undefined): ResearchSub {
  if (!raw) return "feed";
  if ((RESEARCH_SUBS as readonly string[]).includes(raw)) return raw as ResearchSub;
  return SUB_ALIASES[raw] ?? "feed";
}

export const PLATFORMS: Platform[] = ["instagram", "youtube"];
export const POST_KINDS: PostKind[] = ["reel", "short", "video", "carousel", "image"];
const KINDS_BY_PLATFORM: Record<Platform, PostKind[]> = { instagram: ["reel", "carousel", "image"], youtube: ["short", "video"] };

export const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", youtube: "YouTube" };
export const KIND_LABEL: Record<PostKind, string> = { reel: "Reel", carousel: "Carousel", image: "Image", short: "Short", video: "Video" };
export const SORT_LABEL: Record<FeedSort, string> = { standout: "Most standout", multiple: "Biggest multiple", views: "Most views", newest: "Newest" };
export const SHOW_LABEL: Record<FeedFilters["show"], string> = { standouts: "Standouts", all: "All videos" };

export function formatsFor(platform: Platform | null): PostKind[] {
  return platform ? KINDS_BY_PLATFORM[platform] : POST_KINDS;
}

/** The filters with a new platform, keeping the format only when that platform has it. */
export function withFormatFor(filters: FeedFilters, platform: Platform | null): FeedFilters {
  const keep = filters.format !== null && formatsFor(platform).includes(filters.format);
  return { ...filters, platform, format: keep ? filters.format : null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Short names in the address, so a copied link stays readable.
const PARAM = { window: "days", platform: "platform", format: "format", creatorId: "creator", sort: "sort", show: "show" } as const;

/** The filters an address asks for. Anything not allowed falls back to its default. */
export function filtersFromParams(get: (key: string) => string | null | undefined): FeedFilters {
  const days = Number(get(PARAM.window));
  const window = (FEED_WINDOWS as readonly number[]).includes(days) ? (days as FeedFilters["window"]) : DEFAULT_FEED_FILTERS.window;
  const rawPlatform = get(PARAM.platform);
  const platform = (PLATFORMS as string[]).includes(rawPlatform ?? "") ? (rawPlatform as Platform) : null;
  const rawFormat = get(PARAM.format);
  const format = formatsFor(platform).includes(rawFormat as PostKind) ? (rawFormat as PostKind) : null;
  const creator = get(PARAM.creatorId);
  const rawSort = get(PARAM.sort);
  const sort = (FEED_SORTS as readonly string[]).includes(rawSort ?? "") ? (rawSort as FeedSort) : DEFAULT_FEED_FILTERS.sort;
  const rawShow = get(PARAM.show);
  const show = rawShow === "all" || rawShow === "standouts" ? rawShow : DEFAULT_FEED_FILTERS.show;
  return { window, platform, format, creatorId: isUuid(creator) ? creator : null, sort, show };
}

/** A copy of the address with the filters written in. Defaults are left out. */
export function filtersToParams(base: URLSearchParams, filters: FeedFilters): URLSearchParams {
  const out = new URLSearchParams(base);
  const put = (key: string, value: string | number | null, fallback: string | number | null) => {
    if (value === null || value === fallback) out.delete(key);
    else out.set(key, String(value));
  };
  put(PARAM.window, filters.window, DEFAULT_FEED_FILTERS.window);
  put(PARAM.platform, filters.platform, null);
  put(PARAM.format, filters.format, null);
  put(PARAM.creatorId, filters.creatorId, null);
  put(PARAM.sort, filters.sort, DEFAULT_FEED_FILTERS.sort);
  put(PARAM.show, filters.show, DEFAULT_FEED_FILTERS.show);
  return out;
}

/** "12.4" for 12.4x: one decimal below a hundred, whole numbers above. */
export function multipleText(multiple: number | null): string | null {
  if (multiple === null || !Number.isFinite(multiple)) return null;
  return multiple >= 100 ? String(Math.round(multiple)) : multiple.toFixed(1);
}

/** "2.1M", "184K", "920". The number on a card, short enough to read at a glance. */
export function compactNumber(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

const DAY_MS = 86_400_000;

/** A post's age in the shortest unit that still reads: today, 3d, 2w, 4mo, 1y. */
export function ageText(iso: string | null, nowMs: number): string | null {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const days = Math.floor(Math.max(0, nowMs - at) / DAY_MS);
  if (days < 1) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** How long ago something happened, in words: just now, 5 min ago, 3 hr ago, yesterday. */
export function sinceText(iso: string | null, nowMs: number): string | null {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const mins = Math.floor(Math.max(0, nowMs - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "16 Sep 2026", in UTC, so the server and the browser write the same words. */
export function dateText(iso: string | null): string | null {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

export function durationText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The line to quote as the hook: what was said, else what was on screen, else the caption. */
export function hookQuote(b: Pick<Breakdown, "title" | "hook">): string | null {
  for (const text of [b.hook.spoken, b.hook.on_screen, b.hook.caption, b.title]) {
    if (text && text.trim()) return text.trim();
  }
  return null;
}

export function sourceNote(source: BreakdownSource | null): string | null {
  if (source === "transcript") return "Read from the words spoken, the video itself was not watched.";
  if (source === "caption") return "Read from the caption only, the video itself was not watched.";
  return null;
}

// Copies of backend rules the screens need without importing a server module. The tests fail if
// either side changes on its own.
export const SCAN_STALE_MS = 45 * 60_000;
/** How far back each scan reads, in the words the button uses. Mirrors SCAN_SETTINGS in jobs.ts,
    which the screens cannot import because it is a server module; a test keeps the two in step. */
export const SCAN_MODE_LABEL: Record<"recent" | "full", string> = {
  recent: "Last 30 days",
  full: "Last 120 days",
};
export const SCANNED_ROLES = ["emulate", "watch", "strategist"] as const;
export const DRAFT_UPLOAD_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as const;
export type DraftUploadType = keyof typeof DRAFT_UPLOAD_TYPES;
export const DRAFT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const UNFINISHED = ["starting", "running", "ingesting"];

/** An unfinished scan young enough to still be working. Older ones are treated as stuck. */
export function jobIsRunning(job: Pick<JobView, "status" | "created_at"> | null, nowMs: number): boolean {
  return !!job && UNFINISHED.includes(job.status) && nowMs - Date.parse(job.created_at) < SCAN_STALE_MS;
}

export type ScanTone = "live" | "bad" | "idle";

/** The line beside Scan now. lastReadAt is when any creator's posts were last read. */
export function scanStatus(job: JobView | null, lastReadAt: string | null, nowMs: number): { tone: ScanTone; text: string } {
  if (job && jobIsRunning(job, nowMs)) {
    const what = job.purpose === "onboard" ? "Reading a new creator" : "Scanning";
    return { tone: "live", text: `${what}, started ${sinceText(job.created_at, nowMs)}` };
  }
  const failedAt = job?.status === "failed" ? (job.finished_at ?? job.created_at) : null;
  if (failedAt && (!lastReadAt || Date.parse(failedAt) > Date.parse(lastReadAt))) {
    return { tone: "bad", text: `Last scan failed ${sinceText(failedAt, nowMs)}` };
  }
  const last = lastReadAt ?? (job?.status === "done" ? (job.finished_at ?? job.created_at) : null);
  return last ? { tone: "idle", text: `Last read ${sinceText(last, nowMs)}` } : { tone: "idle", text: "Not scanned yet" };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function scanStartedText(started: { instagramCreators: number; instagramLeft?: number; youtubeCreators: number; pollOnly?: boolean }): string {
  const parts = [
    started.instagramCreators > 0 ? plural(started.instagramCreators, "Instagram account", "Instagram accounts") : null,
    started.youtubeCreators > 0 ? plural(started.youtubeCreators, "YouTube channel", "YouTube channels") : null,
  ].filter(Boolean);
  if (parts.length === 0) return "Scan started.";
  const youtubeOnly = started.instagramCreators === 0;
  // A scan reads at most sixty accounts and stops at the day's ceiling, longest unread first.
  // Saying nothing about the rest would read as "everyone was scanned".
  const leftOver =
    started.instagramLeft && started.instagramLeft > 0 ? ` ${plural(started.instagramLeft, "account is", "accounts are")} left for the next scan.` : "";
  const polling = started.pollOnly && started.instagramCreators > 0 ? " Keep this tab open while it runs so the results come in." : "";
  return `Reading ${parts.join(" and ")}.${youtubeOnly ? " New videos show up in about a minute." : ""}${leftOver}${polling}`;
}

export const POLL_EVERY_MS = 8_000;
export const POLL_FOR_MS = 15 * 60_000;

/** Check on a running scan only while the page is on screen, and give up after fifteen minutes. */
export function pollDecision(s: { running: boolean; visible: boolean; startedMs: number; nowMs: number }): "poll" | "wait" | "stop" {
  if (!s.running || s.nowMs - s.startedMs > POLL_FOR_MS) return "stop";
  return s.visible ? "poll" : "wait";
}

export const FEED_FIRST_VISIBLE = 24;
export const FEED_STEP = 24;

/** Show more: reveal what is already loaded first, and only ask for another page when it runs out. */
export function revealPlan(s: { visible: number; loaded: number; hasMore: boolean; step: number }): { nextVisible: number; fetch: boolean } {
  const target = s.visible + s.step;
  if (s.loaded >= target) return { nextVisible: target, fetch: false };
  if (s.hasMore) return { nextVisible: target, fetch: true };
  return { nextVisible: s.loaded, fetch: false };
}

export type DraftFormat = "reel" | "short" | "long";
export const DRAFT_FORMAT_LABEL: Record<DraftFormat, string> = { reel: "Reel", short: "Short", long: "Long video" };

export function draftCardFormat(format: DraftFormat): "reel" | "short" | "long_form" {
  return format === "long" ? "long_form" : format;
}

/** The upload type for a chosen file: what the browser says it is when that is allowed, else read
    from the file name. */
export function draftContentType(name: string, type: string): DraftUploadType | null {
  if (type in DRAFT_UPLOAD_TYPES) return type as DraftUploadType;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const byExt = Object.entries(DRAFT_UPLOAD_TYPES).find(([, e]) => e === ext);
  return byExt ? (byExt[0] as DraftUploadType) : null;
}

/** A short stable key for a set of ids, so a list starts again when the server sends a different
    set rather than showing one list's state over another's rows. */
export function listKey(ids: string[]): string {
  let hash = 0;
  for (const ch of [...ids].sort().join(",")) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `${ids.length}:${(hash >>> 0).toString(36)}`;
}
