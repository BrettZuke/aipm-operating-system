import { describe, expect, it } from "vitest";
import { scanChargeCap } from "./apify";
import { creatorsWithinBudget, DAILY_APIFY_CEILING_USD, MAX_SCAN_CREATORS, orderForScan } from "./scan-plan";

describe("which creators a scan reads first", () => {
  it("reads the never-read first, then the longest ago, then by name", () => {
    const creators = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
      { id: "c", name: "Cara" },
      { id: "d", name: "Dan" },
    ];
    const lastRead = new Map([
      ["a", "2026-09-16T00:00:00Z"],
      ["b", "2026-09-10T00:00:00Z"],
    ]);
    expect(orderForScan(creators, lastRead).map((c) => c.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("never changes the list it was given", () => {
    const creators = [{ id: "b", name: "Bob" }, { id: "a", name: "Alice" }];
    orderForScan(creators, new Map());
    expect(creators.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("how many creators fit in what is left of the day", () => {
  it("never plans a read whose cap goes past the money left", () => {
    for (const budget of [0, 0.05, 0.2, 1, DAILY_APIFY_CEILING_USD]) {
      const n = creatorsWithinBudget(MAX_SCAN_CREATORS, 15, budget);
      if (n > 0) expect(scanChargeCap(n, 15)).toBeLessThanOrEqual(budget + 1e-9);
      if (n < MAX_SCAN_CREATORS) expect(scanChargeCap(n + 1, 15)).toBeGreaterThan(budget);
    }
  });

  it("reads nobody when there is nothing left", () => {
    expect(creatorsWithinBudget(10, 15, 0)).toBe(0);
    expect(creatorsWithinBudget(10, 15, -1)).toBe(0);
  });
});
