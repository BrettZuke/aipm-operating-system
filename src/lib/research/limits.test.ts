import { describe, expect, it } from "vitest";
import { DAILY_LIMITS, limitDecision, limitMessage, USAGE_KIND, utcDayStart, type LimitKey } from "./limits";
import { DAILY_APIFY_CEILING_USD } from "./scan-plan";

describe("the daily caps", () => {
  it("is set for one student, not an agency", () => {
    expect(DAILY_LIMITS.manualScans).toBe(6);
    expect(DAILY_LIMITS.breakdowns).toBe(30);
    expect(DAILY_LIMITS.adaptations).toBe(30);
    expect(DAILY_LIMITS.scripts).toBe(15);
    expect(DAILY_LIMITS.draftScores).toBe(25);
    expect(DAILY_LIMITS.searches).toBe(20);
  });

  it("caps what one workspace can spend on Instagram in a day at two dollars", () => {
    expect(DAILY_APIFY_CEILING_USD).toBe(2);
  });

  it("has a kind in the ledger for every cap", () => {
    for (const key of Object.keys(DAILY_LIMITS) as LimitKey[]) {
      expect(USAGE_KIND[key]).toMatch(/^[a-z_]+$/);
    }
    expect(new Set(Object.values(USAGE_KIND)).size).toBe(Object.keys(DAILY_LIMITS).length);
  });

  it("lets work through until the cap is used, then refuses with a sentence naming it", () => {
    expect(limitDecision("scripts", 14)).toEqual({ ok: true });
    const refused = limitDecision("scripts", 15);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error).toContain("15 scripts");
    expect(refused.ok === false && refused.error).toContain("midnight UTC");
  });

  it("names the cap and the reset in every message", () => {
    for (const key of Object.keys(DAILY_LIMITS) as LimitKey[]) {
      expect(limitMessage(key)).toContain(String(DAILY_LIMITS[key]));
      expect(limitMessage(key)).toContain("midnight UTC");
    }
  });
});

describe("when a day starts", () => {
  it("counts from midnight UTC, whatever time of day it is", () => {
    expect(utcDayStart(new Date("2026-09-17T23:59:59Z"))).toBe("2026-09-17T00:00:00.000Z");
    expect(utcDayStart(new Date("2026-09-17T00:00:00Z"))).toBe("2026-09-17T00:00:00.000Z");
  });
});
