// Asking a model for JSON, on free keys only.
//
// This tool never touches a paid key. Groq and Gemini both have free tiers that cover normal use,
// and OpenRouter is allowed only while the model name ends in ":free". Anything else is dropped
// before a request can go out, so a paid key sitting in your .env cannot be spent by accident.
//
// Groq goes first on purpose: it answers in about two seconds where Gemini often takes twenty, and
// a slow first call can eat the whole time budget and leave you with nothing.

import { keyList } from "./env";

export interface Provider {
  name: string;
  url: string;
  model: string;
  key: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-3.6-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const FREE_SLOT = /^(groq|gemini)(-\d+)?$/;

/** Every free provider, in the order they are tried. One entry per key, because a free allowance is
    per project: when one project's day is spent the next one carries on. */
export function providers(env: NodeJS.ProcessEnv = process.env): Provider[] {
  const out: Provider[] = [];
  const groq = [...new Set([...keyList(env.GROQ_API_KEYS), ...keyList(env.GROQ_API_KEY)])];
  groq.forEach((key, i) => out.push({ name: groq.length > 1 ? `groq-${i + 1}` : "groq", url: GROQ_URL, model: GROQ_MODEL, key }));
  const gem = [...new Set([...keyList(env.GEMINI_API_KEYS), ...keyList(env.GEMINI_API_KEY)])];
  gem.forEach((key, i) => out.push({ name: gem.length > 1 ? `gemini-${i + 1}` : "gemini", url: GEMINI_URL, model: GEMINI_MODEL, key }));
  const openrouter = keyList(env.OPENROUTER_API_KEY)[0] ?? null;
  const openrouterModel = (env.OPENROUTER_CHAT_MODEL ?? "").trim();
  if (openrouter && openrouterModel) out.push({ name: "openrouter", url: OPENROUTER_URL, model: openrouterModel, key: openrouter });
  return freeOnly(out);
}

/** Only the providers that cannot spend money. An OpenRouter account can hold real credit, so its
    model has to be one of the ":free" ones or it is dropped. */
export function freeOnly(list: Provider[]): Provider[] {
  return list.filter((p) => FREE_SLOT.test(p.name) || (p.name === "openrouter" && p.model.endsWith(":free")));
}

/** A daily allowance does not clear by waiting, so the run moves to the next free key at once. */
export function isDailyWall(body: string): boolean {
  return /PerDay|per day|daily|exceeded your current quota|free_tier_requests|RESOURCE_EXHAUSTED/i.test(body);
}

/** A per-minute limit does clear, so it is worth one short wait. */
export function isPerMinuteLimit(body: string): boolean {
  return /rate limit|tokens per minute|TPM|per minute/i.test(body) && !isDailyWall(body);
}

/** How long the provider says to wait, in milliseconds, or null when it did not say. */
export function retryDelayMs(header: string | null, body: string): number | null {
  const fromHeader = header ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return Math.round(fromHeader * 1_000);
  const m = body.match(/(?:try again|retry) in ([\d.]+)\s*s/i);
  if (m) {
    const seconds = Number(m[1]);
    if (Number.isFinite(seconds)) return Math.round(seconds * 1_000);
  }
  return null;
}

export class DailyQuotaSpent extends Error {
  constructor(readonly providerName: string, message: string) {
    super(message);
    this.name = "DailyQuotaSpent";
  }
}

/** Models put real newlines and tabs inside JSON string values, which is not legal JSON. This
    escapes any raw control character so the answer can still be read. */
export function repairControlChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 && ch !== "\n" && ch !== "\r") out += " ";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "";
    else out += ch;
  }
  return out;
}

/** Pull the JSON object or list out of a model's answer, surviving a code fence, a sentence of
    preamble, and the real newlines a model puts inside string values. */
export function parseModelJson(raw: string): unknown | null {
  const text = (raw ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const openArray = text.indexOf("[");
  const openObject = text.indexOf("{");
  const arrayFirst = openArray !== -1 && (openObject === -1 || openArray < openObject);
  const tryParse = (slice: string): unknown | null => {
    for (const variant of [slice, repairControlChars(slice)]) {
      try {
        return JSON.parse(variant);
      } catch {
        continue;
      }
    }
    return null;
  };
  if (arrayFirst) {
    const end = text.lastIndexOf("]");
    if (end > openArray) {
      const parsed = tryParse(text.slice(openArray, end + 1));
      if (Array.isArray(parsed)) return parsed;
    }
  }
  if (openObject !== -1) {
    const end = text.lastIndexOf("}");
    if (end > openObject) {
      const parsed = tryParse(text.slice(openObject, end + 1));
      if (parsed && typeof parsed === "object") return parsed;
    }
  }
  return null;
}

export interface LlmAnswer {
  json: unknown;
  /** Which provider answered and with what, so every run can say where its words came from. */
  provider: string;
  model: string;
  ms: number;
}

const TIMEOUT_MS = 60_000;
const MAX_WAIT_MS = 20_000;

/** One JSON answer, tried across the free providers in order. Throws DailyQuotaSpent when every free
    key is spent for the day, which is not a fault: it means come back tomorrow. */
export async function askJson(
  prompt: string,
  opts: { label: string; temperature?: number; providers?: Provider[]; timeoutMs?: number; quiet?: boolean },
): Promise<LlmAnswer> {
  const pool = opts.providers ?? providers();
  if (pool.length === 0) {
    throw new Error("No free AI key is set. Add GROQ_API_KEY or GEMINI_API_KEY to your .env. Both are free.");
  }
  let last = "no provider answered";
  let spent = 0;
  for (const p of pool) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(p.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${p.key}`,
            "Content-Type": "application/json",
            // Cloudflare in front of Groq refuses a request with no browser User-Agent (error 1010).
            "User-Agent": BROWSER_UA,
          },
          body: JSON.stringify({
            model: p.model,
            temperature: opts.temperature ?? 0.5,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (e) {
        last = `${p.name} did not answer: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
      if (res.ok) {
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = body.choices?.[0]?.message?.content ?? "";
        const json = parseModelJson(text);
        if (json === null) {
          last = `${p.name} answered with something that is not JSON (${text.length} characters)`;
          break;
        }
        return { json, provider: p.name, model: p.model, ms: Date.now() - started };
      }
      const text = await res.text();
      last = `${p.name} answered ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 200)}`;
      if (!opts.quiet) console.warn(`  [${opts.label}] ${last}`);
      if (res.status === 429 && isPerMinuteLimit(text) && attempt === 1) {
        const wait = Math.min(retryDelayMs(res.headers.get("retry-after"), text) ?? 5_000, MAX_WAIT_MS) + 500;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (res.status === 429 || isDailyWall(text)) spent++;
      break;
    }
  }
  if (spent >= pool.length) throw new DailyQuotaSpent("every free key", last);
  throw new Error(`No free AI provider could answer. Last try: ${last}`);
}
