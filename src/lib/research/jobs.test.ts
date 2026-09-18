import { describe, expect, it } from "vitest";
import {
  hashWebhookToken,
  IN_FLIGHT_MS,
  MAX_ONBOARDS_IN_FLIGHT,
  newWebhookToken,
  parseJobStart,
  REFUSAL_MESSAGE,
  scanRefusal,
  scanResultsLimit,
  SCAN_SETTINGS,
  webhookBase,
  webhookTokenMatches,
  webhookUrl,
  type UnfinishedJob,
} from "./jobs";

const job = (over: Partial<UnfinishedJob> = {}): UnfinishedJob => ({
  id: "j1",
  purpose: "scan",
  creator_ids: ["c1"],
  created_at: new Date().toISOString(),
  ...over,
});

describe("the one-time token in the callback address", () => {
  it("stores only a fingerprint, never the token", () => {
    const { token, hash } = newWebhookToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashWebhookToken(token)).toBe(hash);
  });

  it("matches only the token it was made for", () => {
    const { token, hash } = newWebhookToken();
    expect(webhookTokenMatches(token, hash)).toBe(true);
    expect(webhookTokenMatches(`${token}x`, hash)).toBe(false);
    expect(webhookTokenMatches("", hash)).toBe(false);
    expect(webhookTokenMatches(token, null)).toBe(false);
  });

  it("gives no address at all unless there is a public https one to call", () => {
    expect(webhookBase({ RESEARCH_PUBLIC_URL: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(webhookBase({ RESEARCH_PUBLIC_URL: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(webhookBase({ RESEARCH_PUBLIC_URL: "https://127.0.0.1" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(webhookBase({ RESEARCH_PUBLIC_URL: "not a url" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(webhookBase({ RESEARCH_PUBLIC_URL: "https://my-dashboard.example.com/" } as unknown as NodeJS.ProcessEnv)).toBe("https://my-dashboard.example.com");
  });

  it("builds the callback address with the job and its token", () => {
    const env = { RESEARCH_PUBLIC_URL: "https://my-dashboard.example.com" } as unknown as NodeJS.ProcessEnv;
    expect(webhookUrl("j1", "tok en", env)).toBe("https://my-dashboard.example.com/api/research/apify?job=j1&token=tok%20en");
    expect(webhookUrl("j1", "t", {} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("when a new read may not start", () => {
  it("lets only one whole-roster scan run at a time", () => {
    expect(scanRefusal("scan", ["c1"], [job()], Date.now())).toBe("scan_running");
    expect(scanRefusal("scan", ["c1"], [], Date.now())).toBeNull();
    expect(scanRefusal("scan", ["c1"], [job({ purpose: "onboard" })], Date.now())).toBeNull();
  });

  it("does not read one creator twice at once", () => {
    expect(scanRefusal("onboard", ["c1"], [job({ purpose: "onboard", creator_ids: ["c1"] })], Date.now())).toBe("creator_in_flight");
    expect(scanRefusal("onboard", ["c2"], [job({ purpose: "onboard", creator_ids: ["c1"] })], Date.now())).toBeNull();
  });

  it("holds new creators back once the slots are full", () => {
    const live = Array.from({ length: MAX_ONBOARDS_IN_FLIGHT }, (_, i) => job({ id: `o${i}`, purpose: "onboard", creator_ids: [`x${i}`] }));
    expect(scanRefusal("onboard", ["new"], live, Date.now())).toBe("onboards_full");
  });

  it("treats a read older than the stale window as stuck, so it blocks nothing", () => {
    const old = job({ created_at: new Date(Date.now() - IN_FLIGHT_MS - 1_000).toISOString() });
    expect(scanRefusal("scan", ["c1"], [old], Date.now())).toBeNull();
  });

  it("has a plain sentence for every refusal", () => {
    for (const message of Object.values(REFUSAL_MESSAGE)) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/undefined|null|error/i);
    }
  });
});

describe("the database's answer to a start", () => {
  it("reads back a job id or a refusal, and nothing else", () => {
    expect(parseJobStart({ job_id: "abc" })).toEqual({ jobId: "abc" });
    expect(parseJobStart({ refusal: "daily_ceiling", spent_usd: 2 })).toEqual({ refusal: "daily_ceiling" });
    expect(() => parseJobStart({ refusal: "something else" })).toThrow();
    expect(() => parseJobStart(null)).toThrow();
    expect(() => parseJobStart({ job_id: "" })).toThrow();
  });
});

describe("how many posts a scan asks for", () => {
  it("uses the mode's own depth and never goes outside sensible bounds", () => {
    expect(scanResultsLimit({ mode: "recent" })).toBe(SCAN_SETTINGS.recent.resultsLimit);
    expect(scanResultsLimit({ mode: "full" })).toBe(SCAN_SETTINGS.full.resultsLimit);
    expect(scanResultsLimit({ mode: "recent", resultsLimit: 0 })).toBe(1);
    expect(scanResultsLimit({ mode: "recent", resultsLimit: 5_000 })).toBe(200);
  });
});
