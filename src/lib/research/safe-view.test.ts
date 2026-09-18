import { describe, expect, it } from "vitest";
import { safeAvatarUrl, safePostUrl, safeThumbUrl, viewAdaptation, viewBreakdown, viewReport, viewSimilarAccounts, viewYoutubeResults } from "./safe-view";

const STORAGE = "https://abcdefgh.supabase.co";

describe("only showing pictures and links from where they belong", () => {
  it("allows a post link only on Instagram or YouTube", () => {
    expect(safePostUrl("https://www.instagram.com/p/ABC/")).toBe("https://www.instagram.com/p/ABC/");
    expect(safePostUrl("https://www.youtube.com/watch?v=abc")).toBe("https://www.youtube.com/watch?v=abc");
    expect(safePostUrl("https://evil.example.com/p/ABC/")).toBeNull();
    expect(safePostUrl("http://www.instagram.com/p/ABC/")).toBeNull();
    expect(safePostUrl("https://user:pass@www.instagram.com/p/ABC/")).toBeNull();
    expect(safePostUrl("not a url")).toBeNull();
  });

  it("allows a cover image only from this dashboard's own storage or YouTube", () => {
    expect(safeThumbUrl(`${STORAGE}/storage/v1/object/public/research-thumbs/abc.jpg`, STORAGE)).toContain("research-thumbs");
    expect(safeThumbUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg", STORAGE)).toContain("i.ytimg.com");
    expect(safeThumbUrl("https://evil.example.com/abc.jpg", STORAGE)).toBeNull();
    expect(safeThumbUrl(`${STORAGE}/rest/v1/agencies`, STORAGE)).toBeNull();
  });

  it("allows a profile picture only from YouTube's or Instagram's own hosts", () => {
    expect(safeAvatarUrl("https://yt3.ggpht.com/abc")).toContain("yt3.ggpht.com");
    expect(safeAvatarUrl("https://scontent-lhr8-1.cdninstagram.com/v/abc.jpg")).toContain("cdninstagram.com");
    expect(safeAvatarUrl("https://evil.example.com/abc.jpg")).toBeNull();
  });
});

describe("rebuilding a saved answer field by field", () => {
  it("never claims a video was watched without proof", () => {
    const b = viewBreakdown({ hook: {}, source: "made up" });
    expect(b?.source).toBe("caption");
  });

  it("shows less rather than crashing on a mangled row", () => {
    expect(viewBreakdown(null)).toBeNull();
    expect(viewBreakdown("a string")).toBeNull();
    const b = viewBreakdown({ hook: "not an object", beats: "not a list", creative_choices: [1, 2, "real one"] });
    expect(b?.hook.spoken).toBeNull();
    expect(b?.beats).toEqual([]);
    expect(b?.creative_choices).toEqual(["real one"]);
  });

  it("keeps the picked hook pointing at the same hook after duplicates go", () => {
    const a = viewAdaptation({ hooks: [{ text: "one" }, { text: "one" }, { text: "two" }], pick: 2 });
    expect(a?.hooks.map((h) => h.text)).toEqual(["one", "two"]);
    expect(a?.hooks[a.pick].text).toBe("two");
  });

  it("is null when there is no usable hook at all", () => {
    expect(viewAdaptation({ hooks: [] })).toBeNull();
    expect(viewAdaptation({})).toBeNull();
  });

  it("clamps part scores and the total into range", () => {
    const r = viewReport({ score: 999, parts: [{ key: "hook", label: "Hook", score: 44, note: "n", fix: "f" }], hook_rewrites: ["a", "a", "b"] });
    expect(r?.score).toBe(100);
    expect(r?.parts[0].score).toBe(10);
    expect(r?.hook_rewrites).toEqual(["a", "b"]);
  });

  it("drops a search result that is not a real channel or handle", () => {
    expect(viewYoutubeResults([{ channelId: "not-a-channel" }, { channelId: "UC" + "x".repeat(22), title: "Real" }])).toHaveLength(1);
    expect(viewSimilarAccounts([{ username: "Bad Handle!" }, { username: "goodhandle" }])).toHaveLength(1);
  });
});
