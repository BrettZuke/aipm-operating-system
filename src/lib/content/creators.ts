// Content Machine roster: the shared vocabulary for who a workspace scrapes and what for.
// Pure functions and constants only, so both the server actions and the client panel can import
// them, and so the labels stay identical wherever a role is shown.

export const CREATOR_ROLES = ["strategist", "emulate", "watch", "ideas"] as const;
export type CreatorRole = (typeof CREATOR_ROLES)[number];

export const CREATOR_STATUSES = ["active", "paused"] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];

export type Creator = {
  id: string;
  handle: string;
  name: string;
  instagram: string | null;
  youtube: string | null;
  role: CreatorRole;
  status: CreatorStatus;
  note: string | null;
  last_scraped_at: string | null;
  posts_count: number;
  videos_count: number;
  followers: number | null;
  /** How many posts to pull per run. The operator's control over depth. */
  scrape_limit: number;
  /** Free text: why this person is on the roster, in the operator's own words. */
  why: string | null;
  /** Which lanes this creator is a copy model FOR. Null means all of them. Distinct from role:
      role is how much weight they carry, lanes is what they are worth copying into. */
  lanes: string[] | null;
};

/** Depth options, in the operator's language rather than a number box. */
export const SCRAPE_DEPTHS = [
  { value: 25, label: "Light", hint: "25 recent posts" },
  { value: 50, label: "Normal", hint: "50 recent posts" },
  { value: 100, label: "Deep", hint: "100 recent posts" },
  { value: 200, label: "Everything", hint: "200 recent posts" },
] as const;

export function depthLabel(limit: number): string {
  const exact = SCRAPE_DEPTHS.find((d) => d.value === limit);
  if (exact) return exact.label;
  const nearest = SCRAPE_DEPTHS.reduce((a, b) =>
    Math.abs(b.value - limit) < Math.abs(a.value - limit) ? b : a,
  );
  return nearest.label;
}

/** Where a creator's data actually comes from, named rather than implied. */
export function sourcesOf(c: Pick<Creator, "instagram" | "youtube" | "posts_count" | "videos_count">) {
  const out: { platform: string; handle: string; collected: string; url: string }[] = [];
  if (c.instagram) {
    out.push({
      platform: "Instagram",
      handle: `@${c.instagram}`,
      collected: c.posts_count > 0 ? `${c.posts_count} posts` : "nothing yet",
      url: `https://instagram.com/${c.instagram}`,
    });
  }
  if (c.youtube) {
    const h = c.youtube.replace(/^@/, "");
    out.push({
      platform: "YouTube",
      handle: `@${h}`,
      collected: c.videos_count > 0 ? `${c.videos_count} videos` : "nothing yet",
      url: `https://youtube.com/@${h}`,
    });
  }
  return out;
}

// The dropdown answers one question in the operator's own words: what do I use this person for?
// Verb-first, because every option is an instruction to the machine, not a description of them.
export const ROLE_LABEL: Record<CreatorRole, string> = {
  strategist: "Learn from",
  emulate: "Copy",
  watch: "Track only",
  ideas: "Ideas only",
};

export const ROLE_HELP: Record<CreatorRole, string> = {
  strategist:
    "Learn from them. Settoku studies how they build content, their structure, hooks, and pacing, and adds it to your brain. It never copies what they talk about.",
  emulate:
    "Copy them. Their best performing posts drive your scripts, and every script you get is built to compete with something of theirs that worked.",
  watch:
    "Track them only. You can see what they are posting, but nothing they do reaches your scripts.",
  ideas:
    "Ideas only. Useful for what to talk about, never for how to make it. Their format is deliberately never copied.",
};

export const ROLE_ACCENT: Record<CreatorRole, string> = {
  strategist: "#B57EFF",
  emulate: "#00D393",
  watch: "#0083FF",
  ideas: "#F8AF00",
};

// Roster order puts the copy targets first because that is what the operator manages most.
export const ROLE_ORDER: CreatorRole[] = ["emulate", "strategist", "watch", "ideas"];

/**
 * Reduce anything an operator might paste to a bare handle: "@name", "name",
 * "instagram.com/name/", or a full profile URL with query string.
 */
export function normaliseHandle(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  s = s.split(/[?#]/)[0];
  if (/^https?:\/\//i.test(s) || /\.(com|tv|be)\//i.test(s)) {
    const parts = s.replace(/\/+$/, "").split("/");
    // A YouTube channel URL ends /@handle or /channel/UC...; a profile URL ends /handle.
    const last = parts[parts.length - 1] ?? "";
    const prev = parts[parts.length - 2] ?? "";
    s = /^(reels?|videos|shorts|featured|about|posts)$/i.test(last) ? prev : last;
  }
  return s.replace(/^@+/, "").trim();
}

export function platformsOf(c: Pick<Creator, "instagram" | "youtube">): string[] {
  const out: string[] = [];
  if (c.instagram) out.push("Instagram");
  if (c.youtube) out.push("YouTube");
  return out;
}

/** "2.4k" / "189k" / "1.2M" for follower counts, which are always approximate anyway. */
export function compactCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * How long ago the scrape ran, in the coarsest useful unit. Returns "Never scraped" when the
 * creator is on the roster but nothing has been collected yet, which is a real state worth showing.
 */
export function lastScrapedLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Never scraped";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Never scraped";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Scraped today";
  if (days === 1) return "Scraped yesterday";
  if (days < 30) return `Scraped ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "Scraped last month" : `Scraped ${months} months ago`;
}
