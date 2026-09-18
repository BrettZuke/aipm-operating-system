import { describe, expect, it } from "vitest";
import { breakdownProblems, coerceBreakdown, finalizeBreakdown, HOOK_TYPES, mergeRepair, normalizeHookType, performanceLine, unseenFormat } from "./breakdown";
import type { Breakdown } from "./types";

const answer = {
  title: "Two vans, one price list",
  hook: { spoken: "Your boiler is not broken.", on_screen: "NOT BROKEN", caption: "The dial nobody checks" },
  hook_type: "Proof/Result",
  hook_template: "Your [thing] is not [problem]",
  angle: "Most callouts are a pressure drop, not a fault.",
  format: "Talking head with a close up of the gauge",
  beats: ["0:00 he points at the gauge", "0:04 he opens the filling loop", "0:09 the needle moves", "0:14 he says what it cost"],
  creative_choices: ["Hard cut to the gauge at 0:04", "Captions two words at a time"],
  why_it_holds_attention: 'The first frame is the answer. He says "that is forty quid saved" at 0:14 and people stay for it.',
  pattern_you_can_use: "Lead with the answer. Then show the two minutes that get you there.",
  ask: "Comment BOILER",
};

describe("making a model's breakdown safe to save", () => {
  it("keeps a clean answer", () => {
    const b = coerceBreakdown(answer, "watched")!;
    expect(b.title).toBe("Two vans, one price list");
    expect(b.hook.on_screen).toBe("NOT BROKEN");
    expect(b.hook_type).toBe("Proof or result");
    expect(b.beats).toHaveLength(4);
    expect(breakdownProblems(b, "video")).toEqual([]);
  });

  it("blanks what a route cannot honestly know", () => {
    const fromTranscript = coerceBreakdown(answer, "transcript")!;
    expect(fromTranscript.hook.on_screen).toBeNull();
    // "Talking head" describes what you see, which a transcript cannot.
    expect(fromTranscript.format).toBeNull();
    const fromCaption = coerceBreakdown(answer, "caption")!;
    expect(fromCaption.hook.spoken).toBeNull();
    expect(fromCaption.beats).toEqual([]);
  });

  it("keeps a format a transcript really could tell you", () => {
    expect(unseenFormat("Spoken tool announcement")).toBe("Spoken tool announcement");
    expect(unseenFormat("Talking head with b-roll")).toBeNull();
  });

  it("cuts a title back to eight words", () => {
    const b = coerceBreakdown({ ...answer, title: "one two three four five six seven eight nine ten" }, "watched")!;
    expect(b.title!.split(" ")).toHaveLength(8);
  });

  it("takes the dashes and emoji out of every string", () => {
    const b = coerceBreakdown({ ...answer, angle: "A thing \u2014 and another \u{1F600}" }, "watched")!;
    expect(b.angle).toBe("A thing, and another");
  });

  it("refuses an answer that is not an object", () => {
    expect(coerceBreakdown("nope", "watched")).toBeNull();
    expect(coerceBreakdown(null, "watched")).toBeNull();
    expect(coerceBreakdown([answer], "watched")).toBeNull();
  });

  it("fills missing fields with null and empty lists rather than failing", () => {
    const b = coerceBreakdown({}, "watched")!;
    expect(b.title).toBeNull();
    expect(b.beats).toEqual([]);
    expect(b.hook).toEqual({ spoken: null, on_screen: null, caption: null });
  });
});

describe("hook types", () => {
  it("maps the spellings a model uses onto the list", () => {
    expect(normalizeHookType("Proof/Result")).toBe("Proof or result");
    expect(normalizeHookType("behind-the-scenes")).toBe("Behind the scenes");
    expect(normalizeHookType("story")).toBe("Story");
  });

  it("falls back to Other rather than inventing a type", () => {
    expect(normalizeHookType("Wildly Unusual Thing")).toBe("Other");
    expect(normalizeHookType("")).toBeNull();
    expect(normalizeHookType(42)).toBeNull();
    expect(HOOK_TYPES).toContain("Other");
  });
});

describe("what gets sent back for a second pass", () => {
  it("sends back an answer that points at nothing", () => {
    const b = coerceBreakdown({ ...answer, why_it_holds_attention: "It is very engaging throughout." }, "watched")!;
    const problems = breakdownProblems(b, "video");
    expect(problems.map((p) => p.field)).toContain("filler");
  });

  it("sends back a why with no quote and no timestamp", () => {
    const b = coerceBreakdown({ ...answer, why_it_holds_attention: "People stay because the point arrives fast." }, "watched")!;
    expect(breakdownProblems(b, "video").map((p) => p.field)).toContain("why_it_holds_attention");
  });

  it("sends back a template with no brackets in it", () => {
    const b = coerceBreakdown({ ...answer, hook_template: "Your boiler is not broken" }, "watched")!;
    expect(breakdownProblems(b, "video").map((p) => p.field)).toContain("hook_template");
  });

  it("sends back beats with no timestamps, and says watching again is the only fix", () => {
    const b = coerceBreakdown({ ...answer, beats: ["he points", "he opens it"] }, "watched")!;
    const beats = breakdownProblems(b, "video").find((p) => p.field === "beats")!;
    expect(beats.fixableInText).toBe(false);
  });

  it("does not ask a caption-only breakdown for timestamps it cannot have", () => {
    const b = coerceBreakdown({ ...answer, beats: [] }, "caption")!;
    expect(breakdownProblems(b, "caption").map((p) => p.field)).not.toContain("beats");
  });
});

describe("the last pass before saving", () => {
  it("removes any sentence still using filler", () => {
    const b = coerceBreakdown({ ...answer, angle: "It is engaging. The pressure is the real fault." }, "watched")!;
    expect(finalizeBreakdown(b).angle).toBe("The pressure is the real fault.");
  });

  it("drops a beat written in filler and keeps the rest", () => {
    const b = coerceBreakdown({ ...answer, beats: [...answer.beats, "0:20 a powerful moment"] }, "watched")!;
    expect(finalizeBreakdown(b).beats).toHaveLength(4);
  });
});

describe("applying a text-only repair", () => {
  const base = coerceBreakdown(answer, "watched")! as Breakdown;

  it("takes only the fields a text pass is allowed to change", () => {
    const merged = mergeRepair(base, { angle: "A better angle", beats: ["should be ignored"], hook: { spoken: "changed" } });
    expect(merged.angle).toBe("A better angle");
    expect(merged.beats).toEqual(base.beats);
    expect(merged.hook.spoken).toBe(base.hook.spoken);
  });

  it("ignores an empty or unusable repair", () => {
    expect(mergeRepair(base, null)).toEqual(base);
    expect(mergeRepair(base, { angle: "" }).angle).toBe(base.angle);
  });
});

describe("the performance sentence", () => {
  it("says the multiple when there is one", () => {
    expect(performanceLine({ metric: "views", score: 50_000, baseline: 10_000, multiple: 5, views: 50_000 })).toBe(
      "Views: 50,000, which is 5x this creator's normal of 10,000.",
    );
  });

  it("names engagement when that is what was measured", () => {
    expect(performanceLine({ metric: "engagement", score: 900, baseline: 300, multiple: 3, views: null })).toContain("Engagement (likes plus comments): 900");
  });

  it("says plainly when there is no normal yet", () => {
    expect(performanceLine({ metric: null, score: null, baseline: null, multiple: null, views: 1_200 })).toContain("no normal worked out yet");
  });

  it("says plainly when there is no number at all", () => {
    expect(performanceLine({ metric: null, score: null, baseline: null, multiple: null, views: null })).toBe("No view count is available.");
  });
});

describe("never describing what a route could not see", () => {
  const withVisuals = {
    ...answer,
    creative_choices: ["Close-up of the hose swap at 0:10", "Text overlay of the cost at 0:30", "The caption opens with the price", "Links listed in the description"],
  };

  it("keeps every choice when the video was actually watched", () => {
    expect(coerceBreakdown(withVisuals, "watched")!.creative_choices).toHaveLength(4);
  });

  it("drops the ones a caption could not possibly know", () => {
    const b = coerceBreakdown(withVisuals, "caption")!;
    expect(b.creative_choices).toEqual(["The caption opens with the price", "Links listed in the description"]);
  });

  it("drops visual claims from a transcript, but keeps a timestamp it really has", () => {
    const b = coerceBreakdown({ ...withVisuals, creative_choices: ["A close-up at 0:10", "He names the price at 0:04"] }, "transcript")!;
    expect(b.creative_choices).toEqual(["He names the price at 0:04"]);
  });

  it("does not let a repair pass put the invented visuals back", () => {
    const b = coerceBreakdown(answer, "caption")!;
    const merged = mergeRepair(b, { creative_choices: ["A hard cut to the gauge at 0:04"] });
    expect(merged.creative_choices).toEqual(b.creative_choices);
  });
});
