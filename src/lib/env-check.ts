/**
 * Non-throwing config check (M7).
 *
 * Reports which critical env vars are present so a misconfiguration — e.g. a wiped
 * SECRETS_ENCRYPTION_KEY (silent revenue blackout) or a missing CRON_SECRET (crons
 * fail closed) — is VISIBLE via the gated health endpoint instead of surfacing only
 * as broken behaviour. Deliberately does NOT throw at boot: an over-eager validator
 * can take the whole app down, so this surfaces status for monitoring rather than
 * crashing. Returns presence booleans only — never the values.
 */
export type EnvStatus = { key: string; present: boolean; note?: string };

// Core — the app can't function correctly without these.
const REQUIRED: { key: string; note?: string }[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL" },
  { key: "SUPABASE_SERVICE_ROLE_KEY" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY" },
  { key: "CRON_SECRET", note: "crons + health auth fail closed without it" },
];

// Feature-scoped — app runs, but a capability degrades if absent.
const RECOMMENDED: { key: string; note?: string }[] = [
  { key: "SECRETS_ENCRYPTION_KEY", note: "LOAD-BEARING once Stripe keys are encrypted (H4) — wiping it blanks revenue" },
  { key: "GROQ_API_KEY", note: "Settoku Chat (free AI provider)" },
  { key: "FANBASIS_TARGET_AGENCY_ID", note: "webhook/cron tenant scoping" },
  { key: "SLACK_BOT_TOKEN", note: "ops alerts + digests" },
];

const present = (k: string) => typeof process.env[k] === "string" && process.env[k]!.trim().length > 0;
const map = (list: { key: string; note?: string }[]): EnvStatus[] =>
  list.map(({ key, note }) => ({ key, present: present(key), ...(note ? { note } : {}) }));

export function checkEnv(): {
  ok: boolean;
  missing_required: string[];
  missing_recommended: string[];
  required: EnvStatus[];
  recommended: EnvStatus[];
} {
  const required = map(REQUIRED);
  const recommended = map(RECOMMENDED);
  return {
    ok: required.every((r) => r.present),
    missing_required: required.filter((r) => !r.present).map((r) => r.key),
    missing_recommended: recommended.filter((r) => !r.present).map((r) => r.key),
    required,
    recommended,
  };
}
