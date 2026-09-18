// Turning a video's audio into text, free, on Groq's Whisper.
//
// Groq downloads the video from its address itself, so nothing is uploaded from your machine. This is
// the fallback for when the video cannot be watched: the words without the pictures. A breakdown made
// this way is marked as such, and it is never allowed to describe anything visual.

import { recordAiCall } from "./call-log";
import { MissingKeyError } from "./errors";
import { groqKeys as readGroqKeys, missingKeyMessage } from "./keys";
import { DailyQuotaSpent, isDailyWall, isPerMinuteLimit, retryDelayMs } from "./llm";

const URL_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
export const WHISPER_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;
const TIMEOUT_MS = 90_000;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class TranscribeError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  durationS: number | null;
  provider: string;
  model: string;
  ms: number;
}

/** Text from Groq made safe to print. Groq echoes the address it was given, and a media address can
    carry a token that grants a download, so every address is taken out first. */
export function redactForLog(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, "[address]").replace(/token=[^&\s"'<>\\]*/gi, "token=[removed]");
}

export function groqKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return readGroqKeys(env);
}

/** "0:07" for 7.4 seconds, "1:02" for 62. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The transcript as timestamped lines ("[0:03] what was said"), cut at a whole line under maxChars. */
export function formatTranscript(t: Pick<Transcript, "text" | "segments">, maxChars = 5_000): string {
  const lines = t.segments.length
    ? t.segments.map((s) => `[${clock(s.start)}] ${s.text.trim()}`).filter((l) => !/^\[\d+:\d{2}\]\s*$/.test(l))
    : [t.text.trim()];
  const out: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > maxChars) break;
    out.push(line);
    size += line.length + 1;
  }
  return out.length ? out.join("\n") : t.text.slice(0, maxChars);
}

/** Groq's answer turned into a transcript. */
export function parseTranscription(body: unknown, provider: string, model: string, ms: number): Transcript {
  const b = (body ?? {}) as { text?: unknown; duration?: unknown; segments?: unknown };
  const segments = Array.isArray(b.segments)
    ? b.segments
        .map((s) => s as { start?: unknown; end?: unknown; text?: unknown })
        .filter((s) => typeof s.text === "string" && Number.isFinite(Number(s.start)))
        .map((s) => ({ start: Number(s.start), end: Number(s.end ?? s.start), text: String(s.text).trim() }))
    : [];
  const duration = Number(b.duration);
  return {
    text: typeof b.text === "string" ? b.text.trim() : segments.map((s) => s.text).join(" "),
    segments,
    durationS: Number.isFinite(duration) && duration > 0 ? duration : null,
    provider,
    model,
    ms,
  };
}

/** Transcribe the video at an address Groq can download. Throws DailyQuotaSpent when every key and
    model is spent for the day. An expired Instagram address answers 400. */
export async function transcribeUrl(mediaUrl: string, opts: { label: string; quiet?: boolean }): Promise<Transcript> {
  const keys = groqKeys();
  if (keys.length === 0) throw new MissingKeyError("GROQ_API_KEY", missingKeyMessage("GROQ_API_KEY"));
  let last = "no Groq key answered";
  let pairs = 0;
  let spent = 0;
  for (const model of WHISPER_MODELS) {
    for (let i = 0; i < keys.length; i++) {
      const slot = keys.length > 1 ? `groq-${i + 1}` : "groq";
      pairs++;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const form = new FormData();
        form.set("model", model);
        form.set("url", mediaUrl);
        form.set("response_format", "verbose_json");
        form.set("temperature", "0");
        const started = Date.now();
        let res: Response;
        try {
          res = await fetch(URL_ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${keys[i]}`, "User-Agent": BROWSER_UA },
            body: form,
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store",
          });
        } catch (e) {
          throw new TranscribeError(`${slot} could not do it: ${redactForLog(e instanceof Error ? e.message : String(e))}`);
        }
        if (res.ok) {
          const transcript = parseTranscription(await res.json(), slot, model, Date.now() - started);
          recordAiCall({ kind: "whisper", label: opts.label, provider: slot, model, ms: transcript.ms });
          return transcript;
        }
        const text = await res.text();
        // Made safe before it is cut, so an address split at the cut cannot leave its token behind.
        last = `${slot} ${model} ${res.status}: ${redactForLog(text.replace(/\s+/g, " ")).slice(0, 200)}`;
        if (!opts.quiet) console.warn(`  [${opts.label}] ${last}`);
        if (res.status === 429 && isPerMinuteLimit(text) && attempt === 1) {
          const wait = Math.min(retryDelayMs(res.headers.get("retry-after"), text) ?? 5_000, 20_000) + 500;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (res.status === 429 || isDailyWall(text)) {
          spent++;
          break;
        }
        // The model is not offered on this key: try the next model rather than the next key.
        if (res.status === 404 || /model_not_found|does not exist/i.test(text)) break;
        if (res.status === 401 || res.status === 403) break;
        throw new TranscribeError(`Groq refused it: ${last}`, res.status);
      }
    }
  }
  if (pairs > 0 && spent === pairs) throw new DailyQuotaSpent("groq whisper", last);
  throw new TranscribeError(last);
}
