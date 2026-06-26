import { describe, it, expect, beforeEach } from "vitest";
import { checkEnv } from "./env-check";

const ALL = [
  "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CRON_SECRET", "SECRETS_ENCRYPTION_KEY", "ANTHROPIC_API_KEY", "FANBASIS_TARGET_AGENCY_ID", "SLACK_BOT_TOKEN",
];

describe("checkEnv (M7)", () => {
  beforeEach(() => { for (const k of ALL) delete process.env[k]; });

  it("ok=true when all required are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "x";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x";
    process.env.CRON_SECRET = "x";
    const r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.missing_required).toEqual([]);
    expect(r.missing_recommended).toContain("SECRETS_ENCRYPTION_KEY");
  });

  it("ok=false and lists the missing required var", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "x";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x";
    // CRON_SECRET intentionally unset
    const r = checkEnv();
    expect(r.ok).toBe(false);
    expect(r.missing_required).toContain("CRON_SECRET");
  });

  it("never leaks values — entries expose only key/present/note", () => {
    const r = checkEnv();
    for (const e of [...r.required, ...r.recommended]) {
      expect(Object.keys(e).every((k) => ["key", "present", "note"].includes(k))).toBe(true);
    }
  });

  it("treats whitespace-only as absent", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "x";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x";
    process.env.CRON_SECRET = "   ";
    expect(checkEnv().missing_required).toContain("CRON_SECRET");
  });
});
