// Reading keys out of a .env file, and saying in plain English which ones are missing.
//
// Order: whatever is already in the environment wins, then a .env in this folder, then a .env at the
// top of the repo. RESEARCH_ENV_FILE points at one specific file instead, for anyone keeping all
// their keys in one place. Nothing here ever prints a key.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** A .env file's contents as key and value pairs. Quotes are stripped, comment lines ignored. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** The files searched for keys, in order. */
export function envFiles(): string[] {
  const named = (process.env.RESEARCH_ENV_FILE ?? "").trim();
  if (named) return [named];
  return [path.join(TOOL_DIR, ".env"), path.join(TOOL_DIR, "..", "..", ".env")];
}

let loaded = false;

/** Fill process.env from the .env files, without overwriting anything already set. Safe to call
    more than once. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  for (const file of envFiles()) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

/** Split a comma or newline separated list of keys, ignoring blanks and stray quotes. */
export function keyList(raw?: string | null): string[] {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((k) => k.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Every value of a numbered family such as APIFY_API_TOKEN, APIFY_API_TOKEN_2, APIFY_API_TOKEN_3. */
export function numberedKeys(base: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const out = keyList(env[base]);
  for (let i = 2; i <= 20; i++) out.push(...keyList(env[`${base}_${i}`]));
  return [...new Set(out)];
}

export interface KeyCheck {
  name: string;
  present: boolean;
  what: string;
  where: string;
  needed: "always" | "for video" | "for youtube" | "for the dashboard";
}

/** Which keys are set and what each one is for. Used by the setup command and by every command
    that is about to spend one. */
export function keyChecks(env: NodeJS.ProcessEnv = process.env): KeyCheck[] {
  return [
    {
      name: "APIFY_API_TOKEN",
      present: numberedKeys("APIFY_API_TOKEN", env).length > 0 || keyList(env.APIFY_TOKEN).length > 0,
      what: "Reads the recent posts of the Instagram accounts you track. The only thing here that can cost money.",
      where: "https://console.apify.com/sign-up then https://console.apify.com/settings/integrations",
      needed: "always",
    },
    {
      name: "GROQ_API_KEY",
      present: keyList(env.GROQ_API_KEY).length > 0 || keyList(env.GROQ_API_KEYS).length > 0,
      what: "Writes the hooks and scripts, and turns a reel's audio into text when the video cannot be watched. Free.",
      where: "https://console.groq.com/keys",
      needed: "always",
    },
    {
      name: "GEMINI_API_KEY",
      present: keyList(env.GEMINI_API_KEY).length > 0 || keyList(env.GEMINI_API_KEYS).length > 0,
      what: "Watches the video itself, so the breakdown is about what is on screen and not just the words. Free.",
      where: "https://aistudio.google.com/apikey",
      needed: "for video",
    },
    {
      name: "YOUTUBE_API_KEY",
      present: keyList(env.YOUTUBE_API_KEY).length > 0,
      what: "Reads YouTube channels and their uploads, and finds creators by niche. Free.",
      where: "https://console.cloud.google.com/apis/library/youtube.googleapis.com then Credentials, Create API key",
      needed: "for youtube",
    },
    {
      name: "DASHBOARD_SUPABASE_URL",
      present: !!(env.DASHBOARD_SUPABASE_URL ?? "").trim(),
      what: "Your own dashboard's database address, so sync can write to your Brain and your Content page.",
      where: "Supabase, your project, Settings, Data API, Project URL",
      needed: "for the dashboard",
    },
    {
      name: "DASHBOARD_SUPABASE_SERVICE_KEY",
      present: !!(env.DASHBOARD_SUPABASE_SERVICE_KEY ?? "").trim(),
      what: "The key that lets sync write into your own dashboard. Keep it out of any public place.",
      where: "Supabase, your project, Settings, API keys, service_role",
      needed: "for the dashboard",
    },
  ];
}

export class MissingKey extends Error {
  constructor(readonly key: string, message: string) {
    super(message);
    this.name = "MissingKey";
  }
}

/** Throw a plain-English error when a key this command needs is not set. */
export function requireKey(name: string, env: NodeJS.ProcessEnv = process.env): void {
  const check = keyChecks(env).find((c) => c.name === name);
  if (check && check.present) return;
  const what = check ? ` ${check.what}` : "";
  const where = check ? `\nGet one here: ${check.where}` : "";
  throw new MissingKey(name, `${name} is not set, so this command cannot run.${what}\nPut it in a file called .env next to research.ts (copy .env.example to start).${where}`);
}
