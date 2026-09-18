// What the Research screens are allowed to show from data they did not write themselves: scraped
// addresses, saved AI answers and remembered search results.
//
// A picture or a link only renders when it is https, on a host it is supposed to be on, with no
// username, password or odd port. Every saved answer is rebuilt field by field, so a row that has
// been mangled shows less rather than crashing the page or pointing somewhere it should not.
// Pure and free of server imports, so the screens and the server loaders both use the same rules.

import type { SimilarAccount, YoutubeCreatorResult } from "./search";
import type { Adaptation, Breakdown, DraftPartKey, DraftReport } from "./types";

function httpsUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw.startsWith("https://")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not a url at all: there is nothing to render.
    return null;
  }
  return url.protocol === "https:" && !url.username && !url.password && url.port === "" ? url : null;
}

const POST_HOSTS = new Set(["instagram.com", "www.instagram.com", "youtube.com", "www.youtube.com"]);
const AVATAR_HOSTS = new Set(["yt3.ggpht.com"]);
const AVATAR_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];
const STORAGE_PUBLIC_PATH = "/storage/v1/object/public/";

/** A post, profile or video link: https on instagram.com or youtube.com only. */
export function safePostUrl(raw: unknown): string | null {
  const url = httpsUrl(raw);
  return url && POST_HOSTS.has(url.hostname) ? url.href : null;
}

/** A thumbnail: this project's public Supabase storage, or i.ytimg.com. */
export function safeThumbUrl(raw: unknown, supabaseUrl: string | null | undefined): string | null {
  const url = httpsUrl(raw);
  if (!url) return null;
  if (url.hostname === "i.ytimg.com") return url.href;
  const storage = httpsUrl(supabaseUrl);
  return storage && url.hostname === storage.hostname && url.pathname.startsWith(STORAGE_PUBLIC_PATH) ? url.href : null;
}

/** A profile picture: YouTube's avatar host, or Instagram's own CDNs. */
export function safeAvatarUrl(raw: unknown): string | null {
  const url = httpsUrl(raw);
  if (!url) return null;
  return AVATAR_HOSTS.has(url.hostname) || AVATAR_SUFFIXES.some((s) => url.hostname.endsWith(s)) ? url.href : null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const texts = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, max) : []);
const numberOr = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const clamp = (v: unknown, min: number, max: number): number | null => {
  const n = numberOr(v);
  return n === null ? null : Math.min(max, Math.max(min, n));
};

export function viewBreakdown(raw: unknown): Breakdown | null {
  if (!isObj(raw)) return null;
  const hook = isObj(raw.hook) ? raw.hook : {};
  // An unknown source is shown as read from the caption: never claim a video was watched without proof.
  const source = raw.source === "watched" || raw.source === "transcript" || raw.source === "caption" ? raw.source : "caption";
  return {
    title: text(raw.title),
    hook: { spoken: text(hook.spoken), on_screen: text(hook.on_screen), caption: text(hook.caption) },
    hook_type: text(raw.hook_type),
    hook_template: text(raw.hook_template),
    angle: text(raw.angle),
    format: text(raw.format),
    beats: texts(raw.beats, 30),
    creative_choices: texts(raw.creative_choices, 20),
    why_it_holds_attention: text(raw.why_it_holds_attention),
    pattern_you_can_use: text(raw.pattern_you_can_use),
    ask: text(raw.ask),
    source,
  };
}

/** Null when there is no usable hook. Hooks are deduplicated, and pick still points at the same hook. */
export function viewAdaptation(raw: unknown): Adaptation | null {
  if (!isObj(raw) || !Array.isArray(raw.hooks)) return null;
  const hooks: { text: string; why: string }[] = [];
  for (const h of raw.hooks) {
    const t = isObj(h) ? text(h.text) : null;
    if (t && !hooks.some((k) => k.text === t)) hooks.push({ text: t, why: isObj(h) ? (text(h.why) ?? "") : "" });
    if (hooks.length === 12) break;
  }
  if (hooks.length === 0) return null;
  const rawPick = numberOr(raw.pick);
  const picked = rawPick !== null && Number.isInteger(rawPick) && isObj(raw.hooks[rawPick]) ? text((raw.hooks[rawPick] as Obj).text) : null;
  return {
    hooks,
    pick: Math.max(0, hooks.findIndex((h) => h.text === picked)),
    pick_reason: text(raw.pick_reason),
    on_screen_text: text(raw.on_screen_text),
    how_to_shoot_it: text(raw.how_to_shoot_it),
    shot_list: texts(raw.shot_list, 12),
    make_it_sound_like_you: text(raw.make_it_sound_like_you),
    caption_hook: text(raw.caption_hook),
  };
}

/** Null when there is neither a score nor a scored part to show. */
export function viewReport(raw: unknown): DraftReport | null {
  if (!isObj(raw)) return null;
  const parts = (Array.isArray(raw.parts) ? raw.parts : [])
    .filter(isObj)
    .map((p) => ({ key: (text(p.key) ?? "part") as DraftPartKey, label: text(p.label) ?? text(p.key) ?? "Part", score: clamp(p.score, 0, 10) ?? 0, note: text(p.note) ?? "", fix: text(p.fix) ?? "" }))
    .slice(0, 8);
  const score = clamp(raw.score, 0, 100);
  if (score === null && parts.length === 0) return null;
  const lineFixes = (Array.isArray(raw.line_fixes) ? raw.line_fixes : [])
    .filter(isObj)
    .map((f) => ({ line: text(f.line) ?? "", problem: text(f.problem) ?? "", rewrite: text(f.rewrite) ?? "" }))
    .filter((f) => f.line || f.rewrite)
    .slice(0, 10);
  return { score: Math.round(score ?? 0), verdict: text(raw.verdict) ?? "", parts, line_fixes: lineFixes, hook_rewrites: [...new Set(texts(raw.hook_rewrites, 5))] };
}

export function viewYoutubeResults(raw: unknown): YoutubeCreatorResult[] {
  const out: YoutubeCreatorResult[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!isObj(r)) continue;
    const channelId = text(r.channelId);
    if (!channelId || !/^UC[A-Za-z0-9_-]{22}$/.test(channelId) || out.some((o) => o.channelId === channelId)) continue;
    const best = isObj(r.bestVideo) ? r.bestVideo : {};
    out.push({
      channelId,
      title: text(r.title) ?? channelId,
      handle: text(r.handle),
      avatar: text(r.avatar),
      subscribers: numberOr(r.subscribers),
      videoCount: numberOr(r.videoCount),
      matchedVideos: numberOr(r.matchedVideos) ?? 0,
      matchedViews: numberOr(r.matchedViews) ?? 0,
      bestVideo: { title: text(best.title), views: numberOr(best.views), url: text(best.url) ?? "", thumb: text(best.thumb) },
      instagramGuess: text(r.instagramGuess),
      tracked: r.tracked === true,
    });
  }
  return out;
}

export function viewSimilarAccounts(raw: unknown): SimilarAccount[] {
  const out: SimilarAccount[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!isObj(r)) continue;
    const username = text(r.username)?.trim().toLowerCase() ?? null;
    if (!username || !/^[a-z0-9._]{1,30}$/.test(username) || out.some((o) => o.username === username)) continue;
    out.push({ username, fullName: text(r.fullName), verified: r.verified === true, avatar: text(r.avatar), tracked: r.tracked === true });
  }
  return out;
}
