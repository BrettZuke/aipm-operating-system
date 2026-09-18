// Pure, dependency-free logic for the content kanban board (content_cards table).
// Extracted here so the position math, stage-history append, and enum/field validation the
// server actions rely on are unit-tested without a DB or a session (vitest coverage counts
// src/lib/**). The board client and the server actions both import from this module, so the
// column set, the chip labels, and the drop math can never drift between the two surfaces.
//
// Mirrors the DB check constraints in supabase/migrations/20260723233000_content_cards.sql:
// stage, format, platform, and plan_month are all validated against the same allowed values.

// 'to_record' is where a script lands when the owner approves it from the daily email. It is
// deliberately separate from 'filming': one means "I said yes to this", the other means "I am
// making it right now", and collapsing them loses the queue tomorrow's shoot is picked from.
export const STAGES = [
  { key: "ideas", label: "Ideas" },
  { key: "unscripted", label: "Unscripted" },
  { key: "scripted", label: "Scripted" },
  { key: "to_record", label: "To record" },
  { key: "filming", label: "Filming" },
  { key: "editing", label: "Editing" },
  { key: "posted", label: "Posted" },
] as const;

export type Stage = (typeof STAGES)[number]["key"];
export const STAGE_KEYS: Stage[] = STAGES.map((s) => s.key);

export const FORMATS = [
  { key: "reel", label: "Reel" },
  { key: "short", label: "Short" },
  { key: "story", label: "Story" },
  { key: "carousel", label: "Carousel" },
  { key: "long_form", label: "Long-form" },
  { key: "other", label: "Other" },
] as const;

export type Format = (typeof FORMATS)[number]["key"];
export const FORMAT_KEYS: Format[] = FORMATS.map((f) => f.key);

export const PLATFORMS = [
  { key: "yt", label: "YouTube" },
  { key: "ig", label: "Instagram" },
  { key: "tt", label: "TikTok" },
  { key: "em", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "dm", label: "DM" },
  { key: "bio", label: "Bio link" },
  { key: "other", label: "Other" },
] as const;

export type Platform = (typeof PLATFORMS)[number]["key"];
export const PLATFORM_KEYS: Platform[] = PLATFORMS.map((p) => p.key);

export function stageLabel(key: string): string {
  return STAGES.find((s) => s.key === key)?.label ?? key;
}
export function formatLabel(key: string | null): string | null {
  return key ? (FORMATS.find((f) => f.key === key)?.label ?? key) : null;
}
export function platformLabel(key: string | null): string | null {
  return key ? (PLATFORMS.find((p) => p.key === key)?.label ?? key) : null;
}

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGE_KEYS as string[]).includes(v);
}
export function isFormat(v: unknown): v is Format {
  return typeof v === "string" && (FORMAT_KEYS as string[]).includes(v);
}
export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORM_KEYS as string[]).includes(v);
}

// plan_month is 'YYYY-MM' with a real month 01-12 (matches the DB check constraint).
const PLAN_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function isPlanMonth(v: unknown): v is string {
  return typeof v === "string" && PLAN_MONTH_RE.test(v);
}

export interface StageEvent {
  stage: Stage;
  at: string; // ISO timestamp
}

// Append a stage transition, immutably (never mutate the caller's array).
export function appendStageEvent(history: StageEvent[], stage: Stage, at: string): StageEvent[] {
  return [...history, { stage, at }];
}

// A freshly created card seeds its history with a first stamp for the stage it was created in.
// Defaults to Ideas (the global "New card" entry point); the per-column add passes the column's
// own stage so a card filed straight into, say, Scripted starts its timeline there.
export function newCardHistory(at: string, stage: Stage = "ideas"): StageEvent[] {
  return [{ stage, at }];
}

// Fractional indexing on a double-precision column: a card dropped between two neighbours takes
// the midpoint of their positions, so a drop rewrites only the moved row (no full-column
// renumber). `before`/`after` are the positions of the cards that will sit directly ABOVE and
// BELOW the drop (columns render position-ascending, so smaller = higher). null means the drop
// is at the very top, the very bottom, or into an empty column.
export const DEFAULT_POSITION = 1;
const POSITION_STEP = 1;

export function computeDropPosition(before: number | null, after: number | null): number {
  if (before === null && after === null) return DEFAULT_POSITION; // empty column
  if (before === null) return (after as number) - POSITION_STEP; // dropped at the top
  if (after === null) return before + POSITION_STEP; // dropped at the bottom
  return (before + after) / 2; // midpoint between two existing cards
}

// A new card lands at the top of Ideas: above the current first card, or at the default when
// the column is empty.
export function computeCreatePosition(topPosition: number | null): number {
  return computeDropPosition(null, topPosition);
}

export interface MovePatch {
  stage: Stage;
  position: number;
  stage_history: StageEvent[];
  posted_at: string | null;
  changedStage: boolean;
}

// The single source of truth for what a drop writes. A cross-column move appends to
// stage_history and stamps (or clears) posted_at; a same-column reorder only moves the card, so
// history stays clean instead of collecting an identical stage on every nudge. Position is
// always recomputed from the neighbours the drop landed between.
export function planCardMove(args: {
  fromStage: Stage;
  toStage: Stage;
  history: StageEvent[];
  before: number | null;
  after: number | null;
  at: string;
  currentPostedAt: string | null;
}): MovePatch {
  const position = computeDropPosition(args.before, args.after);
  const changedStage = args.fromStage !== args.toStage;
  const stage_history = changedStage
    ? appendStageEvent(args.history, args.toStage, args.at)
    : args.history;
  const posted_at = changedStage
    ? args.toStage === "posted"
      ? args.at
      : null
    : args.currentPostedAt;
  return { stage: args.toStage, position, stage_history, posted_at, changedStage };
}
