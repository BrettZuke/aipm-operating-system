// The part that actually WATCHES the video.
//
// Gemini is the one free model that can take a YouTube address and watch the video behind it, or take
// the bytes of an Instagram reel and watch those, or look at the slides of a carousel. That is the
// difference between a breakdown that says what is on screen and one that guesses from the caption.
//
// Free keys only, and the key travels in a header so it never lands in an address or a printed line.
// When every key's day is spent it throws DailyQuotaSpent, and the caller falls back to a transcript.

import { recordAiCall } from "./call-log";
import { MissingKeyError } from "./errors";
import { geminiKeys as readGeminiKeys, keyList, missingKeyMessage } from "./keys";
import { DailyQuotaSpent, isDailyWall, isPerMinuteLimit, parseModelJson, retryDelayMs } from "./llm";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_VIDEO_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"] as const;
export const DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODELS[0];
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_WAIT_MS = 20_000;
const SERVER_RETRY_WAIT_MS = 2_500;

export type GeminiPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType?: string }; videoMetadata?: { startOffset?: string; endOffset?: string } }
  | { inlineData: { mimeType: string; data: string } };

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/** The models to try, in order. Both are free. The second one exists because the first came back
    503 "currently experiencing high demand" on a real run and the whole breakdown fell back to
    reading the caption, which is a much worse answer than watching on a slightly older model. */
export function geminiVideoModels(): string[] {
  const named = keyList(process.env.GEMINI_VIDEO_MODEL);
  return named.length ? named : [...DEFAULT_VIDEO_MODELS];
}

export function geminiVideoModel(): string {
  return geminiVideoModels()[0];
}

/** Every Gemini key the student has set, in order, duplicates removed. */
export function geminiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return readGeminiKeys(env);
}

/** True when a video can be watched right now. */
export function geminiAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return geminiKeys(env).length > 0;
}

export function textPart(text: string): GeminiPart {
  return { text };
}

/** A YouTube video Gemini fetches and watches itself, optionally only up to endS seconds. */
export function youtubePart(url: string, clip?: { endS?: number | null }): GeminiPart {
  const part: GeminiPart = { fileData: { fileUri: url } };
  return clip?.endS ? { ...part, videoMetadata: { startOffset: "0s", endOffset: `${Math.round(clip.endS)}s` } } : part;
}

export function inlinePart(bytes: Uint8Array, mimeType: string): GeminiPart {
  return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
}

/** How to treat a Gemini refusal. Gemini's own messages name the window ("PerDay", "PerMinute"),
    which is more precise than guessing: every Gemini 429 says RESOURCE_EXHAUSTED, so reading those
    alone would take a one minute wait for a spent day. */
export function geminiRefusal(status: number, body: string): "daily" | "minute" | "key" | "retry_other_key" | "fatal" {
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(body)) {
    if (/PerDay/i.test(body)) return "daily";
    if (/PerMinute/i.test(body)) return "minute";
    if (isPerMinuteLimit(body)) return "minute";
    return isDailyWall(body) ? "daily" : "minute";
  }
  if (/API_KEY_INVALID|API key not valid|API key expired|API_KEY_SERVICE_BLOCKED/i.test(body)) return "key";
  if (status >= 500) return "retry_other_key";
  return "fatal";
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export interface GeminiAnswer {
  json: unknown;
  provider: string;
  model: string;
  ms: number;
}

/** The answer text of a response, with any thinking left out. */
export function answerText(body: GenerateResponse): string {
  return (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
}

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, 240);
}

/** One JSON answer from Gemini, with the video or the pictures attached. The media goes first and
    the instructions last. Throws DailyQuotaSpent when every key is spent for the day. */
export async function geminiJson(
  parts: GeminiPart[],
  opts: { label: string; timeoutMs?: number; temperature?: number; quiet?: boolean },
): Promise<GeminiAnswer> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new MissingKeyError("GEMINI_API_KEY", missingKeyMessage("GEMINI_API_KEY"));
  const models = geminiVideoModels();
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", temperature: opts.temperature ?? 0.4 },
  });
  let last = "no Gemini key answered";
  let spent = 0;

  for (const model of models) {
    for (let i = 0; i < keys.length; i++) {
      const slot = keys.length > 1 ? `gemini-${i + 1}` : "gemini";
      for (let attempt = 1; attempt <= 2; attempt++) {
        const started = Date.now();
        let res: Response;
        try {
          res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
            body,
            signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
            cache: "no-store",
          });
        } catch (e) {
          // A video this slow will be just as slow on the next key, so let the caller fall back.
          const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
          throw new GeminiError(timedOut ? `${slot} did not finish watching in time` : `${slot} request failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        const took = Date.now() - started;
        if (!res.ok) {
          const text = await res.text();
          const kind = geminiRefusal(res.status, text);
          last = `${slot} ${model} ${res.status}: ${snippet(text)}`;
          if (!opts.quiet) console.warn(`  [${opts.label}] ${last} (${kind})`);
          if (kind === "retry_other_key" && attempt === 1) {
            await new Promise((r) => setTimeout(r, SERVER_RETRY_WAIT_MS));
            continue;
          }
          if (kind === "minute" && attempt === 1) {
            const wait = Math.min(retryDelayMs(res.headers.get("retry-after"), text) ?? 5_000, MAX_WAIT_MS) + 500;
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          if (kind === "daily" || kind === "minute") spent++;
          if (kind === "fatal") throw new GeminiError(`Gemini refused the request: ${last}`, res.status);
          break;
        }
        const parsedBody = (await res.json()) as GenerateResponse;
        if (parsedBody.promptFeedback?.blockReason) throw new GeminiError(`Gemini would not look at this one (${parsedBody.promptFeedback.blockReason})`);
        const text = answerText(parsedBody);
        const finish = parsedBody.candidates?.[0]?.finishReason ?? null;
        if (!text) throw new GeminiError(`Gemini watched it but wrote nothing back (reason ${finish ?? "none"})`);
        const json = parseModelJson(text);
        if (json === null) throw new GeminiError(`Gemini answered with something that is not JSON (${text.length} characters, reason ${finish ?? "none"})`);
        recordAiCall({ kind: "gemini", label: opts.label, provider: slot, model, ms: took });
        return { json, provider: slot, model, ms: took };
      }
    }
  }
  // Only a spent day on every key of every model means "come back tomorrow".
  if (spent >= keys.length * models.length) throw new DailyQuotaSpent("gemini", last);
  throw new GeminiError(last);
}
