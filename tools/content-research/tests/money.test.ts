import { describe, expect, it } from "vitest";
import { apifyTokens, creditFromLimits, errorSnippet, estimateScanUsd, eventChargeUsd, hintOrder, IG_RESULT_USD, isTerminalRunStatus, runCostUsd, scanChargeCap } from "../lib/apify";
import { freeOnly, parseModelJson, providers, isDailyWall, isPerMinuteLimit, retryDelayMs } from "../lib/llm";
import { numberedKeys, parseEnv } from "../lib/env";

describe("the spend cap on a scan", () => {
  it("covers the posts, leaves headroom, and rounds up to the cent", () => {
    // 2 creators, 5 posts each: 10 posts at 0.0027 is 0.027, plus 15 percent and a cent.
    expect(scanChargeCap(2, 5)).toBe(0.05);
    expect(scanChargeCap(10, 30)).toBe(0.95);
  });

  it("is always above what the scan is expected to cost", () => {
    for (const creators of [1, 3, 10, 25]) {
      for (const limit of [5, 15, 30, 60]) {
        expect(scanChargeCap(creators, limit)).toBeGreaterThan(estimateScanUsd(creators, limit));
      }
    }
  });

  it("never rounds a whole cent on through floating point noise", () => {
    expect(scanChargeCap(1, 1)).toBe(0.02);
    expect(Number.isFinite(scanChargeCap(0, 0))).toBe(true);
  });

  it("quotes the estimate at the real per-post price", () => {
    expect(estimateScanUsd(2, 5)).toBeCloseTo(10 * IG_RESULT_USD, 6);
  });
});

describe("what a run actually cost", () => {
  it("takes the larger of the running total and the charged events", () => {
    const data = {
      usageTotalUsd: 0,
      chargedEventCounts: { "actor-start": 1, "dataset-item": 10 },
      pricingInfo: { pricingPerEvent: { actorChargeEvents: { "actor-start": { eventPriceUsd: 0.001 }, "dataset-item": { eventPriceUsd: 0.0027 } } } },
    };
    expect(eventChargeUsd(data)).toBeCloseTo(0.028);
    expect(runCostUsd(data)).toBeCloseTo(0.028);
    expect(runCostUsd({ ...data, usageTotalUsd: 0.05 })).toBe(0.05);
  });

  it("says nothing rather than zero when the cost is not known yet", () => {
    expect(runCostUsd({})).toBeNull();
    expect(eventChargeUsd({})).toBeNull();
  });

  it("knows which statuses mean the run is over", () => {
    expect(isTerminalRunStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalRunStatus("TIMED-OUT")).toBe(true);
    expect(isTerminalRunStatus("RUNNING")).toBe(false);
    expect(isTerminalRunStatus(null)).toBe(false);
  });
});

describe("free credit left", () => {
  it("works it out from the account's own limits", () => {
    expect(creditFromLimits({ limits: { maxMonthlyUsageUsd: 5 }, monthlyUsageCycle: { usage: 1.25 } })).toBe(3.75);
    expect(creditFromLimits({ limits: { maxMonthlyUsageUsd: 5 }, current: { monthlyUsageUsd: 5 } })).toBe(0);
  });

  it("never goes below zero, and says nothing when there is no limit to read", () => {
    expect(creditFromLimits({ limits: { maxMonthlyUsageUsd: 5 }, monthlyUsageCycle: { usage: 9 } })).toBe(0);
    expect(creditFromLimits({})).toBeNull();
    expect(creditFromLimits(null)).toBeNull();
  });
});

describe("keeping tokens out of anything printed", () => {
  it("takes a token out of an error message", () => {
    expect(errorSnippet("failed for apify_api_abc123DEF")).toBe("failed for [token]");
    expect(errorSnippet("url?token=secretvalue&x=1")).toContain("token=[removed]");
  });

  it("cuts a long body down", () => {
    expect(errorSnippet("x".repeat(1_000)).length).toBe(200);
  });
});

describe("reading tokens out of the environment", () => {
  it("reads a numbered family in order and drops repeats", () => {
    const env = { APIFY_API_TOKEN: "one", APIFY_API_TOKEN_2: "two", APIFY_API_TOKEN_3: "one" } as NodeJS.ProcessEnv;
    expect(numberedKeys("APIFY_API_TOKEN", env)).toEqual(["one", "two"]);
  });

  it("also accepts the shorter name and a comma separated list", () => {
    const env = { APIFY_TOKENS: "a, b", APIFY_TOKEN: "c" } as NodeJS.ProcessEnv;
    expect(apifyTokens(env)).toEqual(["a", "b", "c"]);
  });

  it("tries the token that started a run first", () => {
    expect(hintOrder(4, 2)).toEqual([2, 0, 1, 3]);
    expect(hintOrder(3, null)).toEqual([0, 1, 2]);
    expect(hintOrder(3, 9)).toEqual([0, 1, 2]);
  });

  it("reads a .env file, quotes and comments and all", () => {
    const parsed = parseEnv(['# a comment', 'GROQ_API_KEY="gsk_abc"', "EMPTY=", "export YOUTUBE_API_KEY=xyz", "not a line"].join("\n"));
    expect(parsed.GROQ_API_KEY).toBe("gsk_abc");
    expect(parsed.YOUTUBE_API_KEY).toBe("xyz");
    expect(parsed.EMPTY).toBe("");
  });
});

describe("free providers only", () => {
  it("keeps Groq and Gemini", () => {
    const list = [
      { name: "groq", url: "", model: "m", key: "k" },
      { name: "gemini-2", url: "", model: "m", key: "k" },
    ];
    expect(freeOnly(list)).toHaveLength(2);
  });

  it("keeps OpenRouter only when the model is a free one", () => {
    expect(freeOnly([{ name: "openrouter", url: "", model: "some/model:free", key: "k" }])).toHaveLength(1);
    expect(freeOnly([{ name: "openrouter", url: "", model: "some/paid-model", key: "k" }])).toHaveLength(0);
  });

  it("drops anything that could spend money", () => {
    expect(freeOnly([{ name: "anthropic", url: "", model: "m", key: "k" }])).toHaveLength(0);
    expect(freeOnly([{ name: "openai", url: "", model: "m", key: "k" }])).toHaveLength(0);
    expect(freeOnly([{ name: "mistral", url: "", model: "m", key: "k" }])).toHaveLength(0);
  });

  it("never builds a provider from a paid key sitting in the environment", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: "sk-x", GROQ_API_KEY: "gsk_x" } as NodeJS.ProcessEnv;
    const built = providers(env);
    expect(built.map((p) => p.name)).toEqual(["groq"]);
    expect(built.some((p) => p.key.startsWith("sk-"))).toBe(false);
  });

  it("makes one provider entry per key, so a spent day moves to the next project", () => {
    const env = { GEMINI_API_KEYS: "a,b,c" } as NodeJS.ProcessEnv;
    expect(providers(env).map((p) => p.name)).toEqual(["gemini-1", "gemini-2", "gemini-3"]);
  });
});

describe("telling a spent day from a busy minute", () => {
  it("knows a daily wall does not clear by waiting", () => {
    expect(isDailyWall("quota exceeded: GenerateRequestsPerDayPerProject")).toBe(true);
    expect(isPerMinuteLimit("quota exceeded: GenerateRequestsPerDayPerProject")).toBe(false);
  });

  it("knows a per minute limit is worth one wait", () => {
    expect(isPerMinuteLimit("Rate limit reached, tokens per minute")).toBe(true);
  });

  it("honours the wait the provider asks for", () => {
    expect(retryDelayMs("7", "")).toBe(7_000);
    expect(retryDelayMs(null, "Please try again in 4.2s")).toBe(4_200);
    expect(retryDelayMs(null, "no idea")).toBeNull();
  });
});

describe("reading JSON out of a model answer", () => {
  it("survives a code fence and a sentence of preamble", () => {
    expect(parseModelJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("reads a bare list without throwing the rest away", () => {
    expect(parseModelJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("survives a real newline inside a string value", () => {
    expect(parseModelJson('{"a":"one\ntwo"}')).toEqual({ a: "one\ntwo" });
  });

  it("says nothing when there is no JSON at all", () => {
    expect(parseModelJson("sorry, I cannot help with that")).toBeNull();
    expect(parseModelJson("")).toBeNull();
  });
});
