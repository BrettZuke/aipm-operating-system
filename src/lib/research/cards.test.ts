import { describe, expect, it } from "vitest";
import { parseFilmScript, toLines } from "@/lib/content/film";
import { cardFormat, filmScriptBody, platformCode, researchCardNotes } from "./cards";
import type { Breakdown } from "./types";

const breakdown: Breakdown = {
  title: "Two vans, one price list",
  hook: { spoken: "This job cost him twice what it should have.", on_screen: null, caption: null },
  hook_type: "Proof or result",
  hook_template: "This [job] cost [person] twice what it should have",
  angle: "Cheap work costs more in the end",
  format: "Talking head with the van behind him",
  beats: ["0:00 he holds up the invoice", "0:06 cut to the corroded pipe"],
  creative_choices: ["Hard cut to the invoice at 0:05"],
  why_it_holds_attention: 'He opens with "twice what it should have" and shows the invoice at 0:05.',
  pattern_you_can_use: "Lead with the price. Then show what caused it.",
  ask: "Message the word BOILER",
  source: "watched",
};

describe("the shape a script is filed in", () => {
  it("is parsed back apart by the Record tab exactly as it was written", () => {
    const body = filmScriptBody({
      hook: "This job cost him twice what it should have.",
      onScreen: "Twice the price",
      spoken: "This job cost him twice what it should have.\n\nThe first company used the wrong pipe.\n\nWe took it out in an hour.",
      cta: "Message the word BOILER and we will take a look.",
      shots: ["The invoice in his hand", "The corroded pipe on the bench"],
    });
    const parsed = parseFilmScript({ id: "1", title: "t", platform: "ig", format: "reel", script: body, notes: null, source: null });
    expect(parsed.hook).toBe("This job cost him twice what it should have.");
    expect(parsed.onScreen).toBe("Twice the price");
    expect(parsed.cta).toBe("Message the word BOILER and we will take a look.");
    expect(parsed.shots).toEqual(["The invoice in his hand", "The corroded pipe on the bench"]);
    // The hook and the ask are shown in their own blocks, so the spoken body must not repeat them.
    expect(parsed.beats).toEqual(["The first company used the wrong pipe.", "We took it out in an hour."]);
    expect(toLines(parsed.beats[0])).toEqual(["The first company used the wrong pipe."]);
  });

  it("keeps a YouTube title where Record looks for it", () => {
    const body = filmScriptBody({ hook: "h", onScreen: null, spoken: "words", cta: "subscribe now please", shots: [], videoTitle: "The real cost of a cheap boiler job" });
    const parsed = parseFilmScript({ id: "1", title: "t", platform: "yt", format: "long_form", script: body, notes: null, source: null });
    expect(parsed.videoTitle).toBe("The real cost of a cheap boiler job");
  });
});

describe("what a card says about where it came from", () => {
  it("puts the borrowed pattern where Record reads the subject from", () => {
    const notes = researchCardNotes({
      creator: "Some Plumber",
      postUrl: "https://www.instagram.com/p/ABC123/",
      multiple: 12.4,
      metric: "views",
      breakdown,
      adaptation: null,
    });
    const parsed = parseFilmScript({ id: "1", title: "t", platform: "ig", format: "reel", script: "HOOK: h", notes, source: null });
    expect(parsed.subject).toBe("Lead with the price. Then show what caused it.");
    expect(notes).toContain("12.4x their normal views");
    expect(notes).toContain("https://www.instagram.com/p/ABC123/");
  });

  it("says engagement when that is what was measured", () => {
    const notes = researchCardNotes({ creator: "A", postUrl: "u", multiple: 3, metric: "engagement", breakdown: null, adaptation: null });
    expect(notes).toContain("3x their normal engagement");
  });
});

describe("the board's own codes", () => {
  it("maps each kind of post to a format the board accepts", () => {
    expect(cardFormat({ platform: "instagram", kind: "reel" })).toBe("reel");
    expect(cardFormat({ platform: "instagram", kind: "carousel" })).toBe("carousel");
    expect(cardFormat({ platform: "youtube", kind: "short" })).toBe("short");
    expect(cardFormat({ platform: "youtube", kind: "video" })).toBe("long_form");
    expect(platformCode("instagram")).toBe("ig");
    expect(platformCode("youtube")).toBe("yt");
  });
});
