import { describe, expect, it } from "vitest";
import { blankProfile, mergePosts, parseProfile, postId, toSlug } from "../lib/store";
import { profileIsThin, profileSources } from "../lib/adaptation";
import type { ScoredPost } from "../lib/types";

const FILLED = `# Burnley Boiler Care

## Who they help
Homeowners in Burnley with a boiler over ten years old.

## What they sell
Servicing and repairs, 90 pounds for a service.

## What they can show on camera
The van, the pressure gauge, a rusted heat exchanger they keep on the bench.

## How they talk
Short. Blunt. "Nine times out of ten it is the pressure."

## Phrases to avoid
- premium
- here's the thing
`;

describe("the client profile file", () => {
  it("reads every section out of it", () => {
    const p = parseProfile("burnley-boiler-care", FILLED);
    expect(p.name).toBe("Burnley Boiler Care");
    expect(p.who_they_help).toContain("Homeowners in Burnley");
    expect(p.what_they_sell).toContain("90 pounds");
    expect(p.proof).toContain("rusted heat exchanger");
    expect(p.how_they_talk).toContain("Nine times out of ten");
    expect(p.avoid).toEqual(["premium", "here's the thing"]);
  });

  it("comes back empty rather than broken when a section is missing", () => {
    const p = parseProfile("x", "# Just A Name\n\n## Who they help\nSomebody.\n");
    expect(p.what_they_sell).toBe("");
    expect(p.avoid).toEqual([]);
  });

  it("knows when a profile is too thin to write real hooks from", () => {
    expect(profileIsThin(parseProfile("burnley-boiler-care", FILLED))).toBe(false);
    expect(profileIsThin(parseProfile("x", blankProfile("New Client")))).toBe(true);
    expect(profileIsThin(parseProfile("x", "# X\n\n## Who they help\nSomebody in town.\n"))).toBe(true);
  });

  it("offers only the filled-in sections as facts", () => {
    const sources = profileSources(parseProfile("x", "# X\n\n## Who they help\nSomebody.\n"));
    expect(sources).toEqual(["Somebody."]);
  });

  it("turns a business name into a folder name", () => {
    expect(toSlug("Burnley Boiler Care")).toBe("burnley-boiler-care");
    expect(toSlug("  O'Brien & Sons, Ltd. ")).toBe("o-brien-sons-ltd");
    expect(toSlug("!!!")).toBe("client");
  });

  it("gives a post a filename that is stable and safe", () => {
    expect(postId({ platform: "instagram", external_id: "C9abcDEF12" })).toBe("ig-C9abcDEF12");
    expect(postId({ platform: "youtube", external_id: "dQw4w9WgXcQ" })).toBe("yt-dQw4w9WgXcQ");
  });
});

describe("keeping one row per post across scans", () => {
  const post = (id: string, views: number): ScoredPost =>
    ({ platform: "instagram", external_id: id, url: `https://x/${id}`, views } as unknown as ScoredPost);

  it("lets the newer numbers win", () => {
    const merged = mergePosts([post("a", 100), post("b", 200)], [post("a", 500)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((p) => p.external_id === "a")?.views).toBe(500);
  });

  it("adds posts that are new", () => {
    expect(mergePosts([post("a", 1)], [post("b", 2)])).toHaveLength(2);
  });
});

describe("keeping the record of how each creator was measured", () => {
  const row = (creator: string, group: string, baseline: number) => ({ creator, group, baseline });

  it("keeps creators a later scan did not cover", async () => {
    const { mergeGroups } = await import("../lib/store");
    const merged = mergeGroups([row("a", "instagram", 100), row("b", "youtube", 200)], [row("b", "youtube", 500)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((g) => g.creator === "a")?.baseline).toBe(100);
    expect(merged.find((g) => g.creator === "b")?.baseline).toBe(500);
  });

  it("replaces every row for a creator whose groups changed shape", async () => {
    const { mergeGroups } = await import("../lib/store");
    const merged = mergeGroups([row("a", "youtube", 100)], [row("a", "short", 50), row("a", "video", 900)]);
    expect(merged.map((g) => g.group).sort()).toEqual(["short", "video"]);
  });
});
