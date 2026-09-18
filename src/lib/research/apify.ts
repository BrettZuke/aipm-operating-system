// Apify, the service that reads Instagram for you. This is the only part of Research that can cost
// money, so the money rules live here where no caller can forget them.
//
// Every run carries a hard spend cap that Apify itself enforces, so even a run that goes wrong
// cannot cost more than the cap. Tokens travel in a header, never in an address and never in
// anything logged. A free account that has spent its monthly credit answers 402 or 403, and the
// next token the student has set is tried automatically.

import { makeTtlCache } from "@/lib/creator/snapshot-cache";
import { MissingKeyError } from "./errors";
import { apifyKeys, missingKeyMessage } from "./keys";

const API = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 30_000;
const DATASET_PAGE = 1_000;
const DATASET_MAX_ITEMS = 20_000;

export const IG_SCRAPER = "apify~instagram-scraper";
export const IG_PROFILE_SCRAPER = "apify~instagram-profile-scraper";
/** What one Instagram post costs on the free tier, checked 2026-09-16. */
export const IG_RESULT_USD = 0.0027;

export const TERMINAL_RUN_STATUSES = ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"];
export const RUN_WEBHOOK_EVENTS = ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"];

// A spent free account answers 402 or 403 ("Monthly usage hard limit exceeded"); a dead token
// answers 401. All three mean "try the next token", never "the request itself is wrong".
const REFUSED = new Set([401, 402, 403]);

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string | null;
  usageTotalUsd: number | null;
  /** What the run cost, which is known the moment it ends. */
  costUsd: number | null;
  statusMessage: string | null;
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

/** Every Apify token the student has set, in order, duplicates removed. */
export function apifyTokens(env: NodeJS.ProcessEnv = process.env): string[] {
  return apifyKeys(env);
}

/** The hard spend cap for one scan: every post at the free-tier price, 15 percent headroom in case
    the price moves, plus a cent, rounded up to the next cent. */
export function scanChargeCap(creators: number, limit: number): number {
  const cents = (creators * limit * IG_RESULT_USD * 1.15 + 0.01) * 100;
  // Rounded before the ceiling, so floating point noise cannot push a whole extra cent onto the cap.
  return Math.ceil(Number(cents.toFixed(6))) / 100;
}

/** What a scan is expected to cost before any headroom. This is the number the student is shown
    before they press the button. */
export function estimateScanUsd(creators: number, limit: number): number {
  return Math.round(creators * limit * IG_RESULT_USD * 10_000) / 10_000;
}

/** A dollar amount written the way money is read: "less than a cent", "$0.04", "$1.20". */
export function usdText(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "not known";
  if (amount <= 0) return "nothing";
  if (amount < 0.01) return "less than a cent";
  return `$${amount.toFixed(2)}`;
}

export function isTerminalRunStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_RUN_STATUSES.includes(status);
}

/** Which tokens to try for a run lookup: the one that started it first, then the rest. A run is
    only visible to the account that started it. */
export function hintOrder(poolSize: number, hint: number | null | undefined): number[] {
  const all = Array.from({ length: poolSize }, (_, i) => i);
  if (hint == null || !Number.isInteger(hint) || hint < 0 || hint >= poolSize) return all;
  return [hint, ...all.filter((i) => i !== hint)];
}

/** How much free monthly credit one account has left, from its limits answer. */
export function creditFromLimits(data: unknown): number | null {
  const d = (data ?? {}) as {
    monthlyUsageCycle?: { usage?: unknown };
    current?: { monthlyUsageUsd?: unknown };
    limits?: { maxMonthlyUsageUsd?: unknown };
  };
  const limit = Number(d.limits?.maxMonthlyUsageUsd);
  if (!Number.isFinite(limit)) return null;
  const used = Number(d.monthlyUsageCycle?.usage ?? d.current?.monthlyUsageUsd ?? 0);
  return Math.max(0, limit - (Number.isFinite(used) ? used : 0));
}

async function call(token: string, path: string, init: { method?: string; body?: string; timeoutMs?: number } = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
}

/** A short, safe piece of an error message. Apify echoes a rejected webhook address back, and that
    address carries the job's one-time token, so anything that looks like a token is removed. */
export function errorSnippet(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/token=[^&"'\\\s]*/g, "token=[removed]")
    .replace(/apify_api_[A-Za-z0-9]+/g, "[token]")
    .slice(0, 200);
}

async function snippet(res: Response): Promise<string> {
  return errorSnippet(await res.text());
}

/** What the run was charged for, priced at the account's own event prices. */
export function eventChargeUsd(data: Record<string, unknown>): number | null {
  const counts = data.chargedEventCounts;
  const events = (data.pricingInfo as { pricingPerEvent?: { actorChargeEvents?: Record<string, { eventPriceUsd?: unknown } | undefined> } } | undefined)
    ?.pricingPerEvent?.actorChargeEvents;
  if (!counts || typeof counts !== "object" || !events) return null;
  let total = 0;
  for (const [name, n] of Object.entries(counts as Record<string, unknown>)) {
    const price = Number(events[name]?.eventPriceUsd);
    const times = Number(n);
    if (Number.isFinite(price) && price > 0 && Number.isFinite(times) && times > 0) total += price * times;
  }
  return total;
}

/** What a run cost, in dollars. Apify books the charge a few seconds after a run ends, so right at
    the end the running total can still read zero while the charged events already show the posts.
    The larger of the two is the real cost at any moment. */
export function runCostUsd(data: Record<string, unknown>): number | null {
  const usage = typeof data.usageTotalUsd === "number" && Number.isFinite(data.usageTotalUsd) ? data.usageTotalUsd : null;
  const events = eventChargeUsd(data);
  if (usage === null && events === null) return null;
  return Math.round(Math.max(usage ?? 0, events ?? 0) * 1e6) / 1e6;
}

function toRun(data: Record<string, unknown> | undefined): ApifyRun {
  if (!data || typeof data.id !== "string" || typeof data.status !== "string") {
    throw new ApifyError("Apify answered without a run in it");
  }
  const usage = Number(data.usageTotalUsd);
  return {
    id: data.id,
    status: data.status,
    defaultDatasetId: typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : null,
    usageTotalUsd: Number.isFinite(usage) ? usage : null,
    costUsd: runCostUsd(data),
    statusMessage: typeof data.statusMessage === "string" ? data.statusMessage : null,
  };
}

function requireTokens(): string[] {
  const tokens = apifyTokens();
  if (tokens.length === 0) throw new MissingKeyError("APIFY_API_TOKEN", missingKeyMessage("APIFY_API_TOKEN"));
  return tokens;
}

export const EVERY_TOKEN_REFUSED =
  "Every Apify account you have set refused the read. Either this month's free credit is spent or the token is wrong. " +
  "Add another free token as APIFY_API_TOKEN_2, or wait for the monthly reset.";

/** Start a read on the first token that accepts it. The webhook fires on every ending status.
    Returns the run id and which token started it. */
export async function startRun(
  actor: string,
  input: unknown,
  opts: { maxTotalChargeUsd: number; timeoutSecs: number; webhook?: { url: string; eventTypes: string[] } },
): Promise<{ runId: string; tokenIndex: number }> {
  if (!(opts.maxTotalChargeUsd > 0)) throw new ApifyError("Refusing to start a read without a spend cap");
  const tokens = requireTokens();
  const qs = new URLSearchParams({
    timeout: String(opts.timeoutSecs),
    maxTotalChargeUsd: String(opts.maxTotalChargeUsd),
  });
  if (opts.webhook) {
    const hooks = [{ eventTypes: opts.webhook.eventTypes, requestUrl: opts.webhook.url }];
    qs.set("webhooks", Buffer.from(JSON.stringify(hooks)).toString("base64"));
  }
  for (let i = 0; i < tokens.length; i++) {
    const res = await call(tokens[i], `/acts/${actor}/runs?${qs.toString()}`, { method: "POST", body: JSON.stringify(input) });
    if (REFUSED.has(res.status)) {
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) throw new ApifyError(`Apify refused to start the read: ${res.status} ${await snippet(res)}`, res.status);
    const body = (await res.json()) as { data?: { id?: unknown } };
    if (typeof body.data?.id !== "string") throw new ApifyError("Apify started the read but sent no run id back");
    return { runId: body.data.id, tokenIndex: i };
  }
  throw new ApifyError(EVERY_TOKEN_REFUSED, 402);
}

/** Look a run up, trying the token that started it first. */
export async function getRun(runId: string, hint: number | null): Promise<{ run: ApifyRun; tokenIndex: number }> {
  const tokens = requireTokens();
  for (const i of hintOrder(tokens.length, hint)) {
    const res = await call(tokens[i], `/actor-runs/${encodeURIComponent(runId)}`);
    if (res.status === 404 || REFUSED.has(res.status)) {
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) throw new ApifyError(`Looking the Apify run up failed: ${res.status} ${await snippet(res)}`, res.status);
    const body = (await res.json()) as { data?: Record<string, unknown> };
    return { run: toRun(body.data), tokenIndex: i };
  }
  throw new ApifyError("That Apify run is not visible to any token you have set", 404);
}

/** Everything the run collected, read with the token of the account that owns it. */
export async function datasetItems(datasetId: string, tokenIndex: number): Promise<unknown[]> {
  const token = apifyTokens()[tokenIndex];
  if (!token) throw new ApifyError("The Apify token that owns this read is no longer set on this dashboard");
  const out: unknown[] = [];
  for (let offset = 0; offset < DATASET_MAX_ITEMS; offset += DATASET_PAGE) {
    const qs = new URLSearchParams({ clean: "true", format: "json", offset: String(offset), limit: String(DATASET_PAGE) });
    const res = await call(token, `/datasets/${encodeURIComponent(datasetId)}/items?${qs.toString()}`);
    if (!res.ok) throw new ApifyError(`Reading the results failed: ${res.status} ${await snippet(res)}`, res.status);
    const page: unknown = await res.json();
    if (!Array.isArray(page)) throw new ApifyError("Apify answered the results read with something other than a list");
    out.push(...page);
    if (page.length < DATASET_PAGE) break;
  }
  return out;
}

/** Run something small and wait for it: one post, one profile. The request itself waits for the
    whole run, so this is never used for a scan. */
export async function runSyncItems(actor: string, input: unknown, opts: { maxTotalChargeUsd: number; timeoutMs: number }): Promise<unknown[]> {
  if (!(opts.maxTotalChargeUsd > 0)) throw new ApifyError("Refusing to start a read without a spend cap");
  const tokens = requireTokens();
  // The actor gets a few seconds less than the wait, so a slow run ends on Apify's side with a clear
  // answer instead of an aborted request.
  const actorTimeoutSecs = Math.max(10, Math.floor(opts.timeoutMs / 1000) - 5);
  const qs = new URLSearchParams({
    timeout: String(actorTimeoutSecs),
    maxTotalChargeUsd: String(opts.maxTotalChargeUsd),
    clean: "true",
    format: "json",
  });
  for (const token of tokens) {
    const res = await call(token, `/acts/${actor}/run-sync-get-dataset-items?${qs.toString()}`, {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: opts.timeoutMs,
    });
    if (REFUSED.has(res.status)) {
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) throw new ApifyError(`That Apify read failed: ${res.status} ${await snippet(res)}`, res.status);
    const items: unknown = await res.json();
    if (!Array.isArray(items)) throw new ApifyError("Apify answered with something other than a list");
    return items;
  }
  throw new ApifyError(EVERY_TOKEN_REFUSED, 402);
}

const creditCache = makeTtlCache<number | null>(10 * 60_000, 2);

/** Dollars of free monthly credit left across every token the student has set, cached ten minutes.
    Null means no account answered, which is not the same as no credit. */
export async function apifyCreditLeft(): Promise<number | null> {
  return creditCache.get("pool", async () => {
    const tokens = apifyTokens();
    const known: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      try {
        const res = await call(tokens[i], "/users/me/limits", { timeoutMs: 15_000 });
        if (!res.ok) {
          console.error(`[research] Apify credit read failed for token ${i + 1}: ${res.status}`);
          await res.body?.cancel();
          continue;
        }
        const body = (await res.json()) as { data?: unknown };
        const left = creditFromLimits(body.data);
        if (left !== null) known.push(left);
      } catch (e) {
        // One account being unreachable must not blank the whole number, so it is left out and the
        // rest still count.
        console.error(`[research] Apify credit read failed for token ${i + 1}:`, e instanceof Error ? e.message : e);
      }
    }
    return known.length === 0 ? null : Math.round(known.reduce((sum, a) => sum + a, 0) * 100) / 100;
  });
}
