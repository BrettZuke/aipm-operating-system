// Reading the student's own API keys out of the environment, and saying in plain English which one
// is missing when something cannot run.
//
// Every key here belongs to the student and sits in their own .env.local (locally) or their Vercel
// project settings (once deployed). Nothing here ever prints a key, and nothing here ever reads a
// paid key: the only providers Research can call are free ones.

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
  /** What it does, in one sentence a non-developer understands. */
  what: string;
  /** Where to get one, free. */
  where: string;
}

export function apifyKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([...numberedKeys("APIFY_API_TOKEN", env), ...keyList(env.APIFY_TOKENS), ...keyList(env.APIFY_TOKEN)])];
}

export function groqKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([...keyList(env.GROQ_API_KEYS), ...keyList(env.GROQ_API_KEY)])];
}

export function geminiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([...keyList(env.GEMINI_API_KEYS), ...keyList(env.GEMINI_API_KEY)])];
}

export function youtubeKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return keyList(env.YOUTUBE_API_KEY)[0] ?? null;
}

/** Which keys are set and what each one is for. The Research screens show this when a key is missing. */
export function keyChecks(env: NodeJS.ProcessEnv = process.env): KeyCheck[] {
  return [
    {
      name: "APIFY_API_TOKEN",
      present: apifyKeys(env).length > 0,
      what: "Reads the recent posts of the Instagram accounts you track. The only thing in Research that can cost money, and every read carries a hard spend cap.",
      where: "console.apify.com, sign up free, then Settings and Integrations",
    },
    {
      name: "GROQ_API_KEY",
      present: groqKeys(env).length > 0,
      what: "Writes the hooks and the scripts, scores your drafts, and turns a reel's audio into words when the video cannot be watched. Free.",
      where: "console.groq.com/keys",
    },
    {
      name: "GEMINI_API_KEY",
      present: geminiKeys(env).length > 0,
      what: "Watches the video itself, so a breakdown is about what is on screen and not a guess from the caption. Free.",
      where: "aistudio.google.com/apikey",
    },
    {
      name: "YOUTUBE_API_KEY",
      present: !!youtubeKey(env),
      what: "Reads YouTube channels and their uploads, and finds creators by niche. Free.",
      where: "console.cloud.google.com, enable the YouTube Data API v3, then Credentials and Create API key",
    },
  ];
}

export function keyCheck(name: string, env: NodeJS.ProcessEnv = process.env): KeyCheck | null {
  return keyChecks(env).find((c) => c.name === name) ?? null;
}

/** The message shown when a key this action needs is not set. Names the key and where to get one. */
export function missingKeyMessage(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const check = keyCheck(name, env);
  const what = check ? ` ${check.what}` : "";
  const where = check ? ` Get a free one at ${check.where}.` : "";
  return `${name} is not set on this dashboard, so this cannot run.${what} Add it to your .env.local when running locally, or to your project's environment variables on Vercel, then try again.${where}`;
}
