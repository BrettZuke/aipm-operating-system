import { describe, expect, it } from "vitest";
import {
  coerceReport,
  draftChecks,
  finalizeReport,
  finalScore,
  findAsk,
  HARD_FAIL_CAP,
  lineInDraft,
  PART_ORDER,
  PART_WEIGHTS,
  reportProblems,
  SHORT_FORM_WORD_LIMIT,
} from "../lib/draft-rules";
import type { DraftPartKey } from "../lib/types";

const CLEAN = [
  "Your boiler is not broken.",
  "Nine times out of ten it is the pressure, and you can fix that yourself in a minute.",
  "Find the filling loop under the boiler and open both taps until the needle sits in the green.",
  "If it drops again by the weekend, comment BOILER and we will send the checklist.",
].join("\n");

describe("finding the ask", () => {
  it("finds it in the last lines", () => {
    expect(findAsk(CLEAN)).toContain("comment BOILER");
  });

  it("finds it in the last sentences of a single paragraph", () => {
    expect(findAsk("One thing. Another thing. Send me a message and we will sort it.")).toContain("Send me");
  });

  it("finds one that is only on screen", () => {
    expect(findAsk("No ask at all here.", ["Tap the link in bio"])).toBe("Tap the link in bio");
  });

  it("finds nothing when there is nothing", () => {
    expect(findAsk("Just three sentences. With no ask. At all.")).toBeNull();
  });

  it("ignores an ask buried in the middle, because the end is what people hear", () => {
    expect(findAsk("Follow me first.\nThen this.\nThen that.\nAnd that is it.")).toBeNull();
  });
});

describe("what code can say about a draft on its own", () => {
  it("counts the words and works out the length", () => {
    const c = draftChecks({ spoken: CLEAN, format: "reel" });
    expect(c.spokenWords).toBe(56);
    expect(c.firstSentence).toBe("Your boiler is not broken.");
    expect(c.firstSentenceWords).toBe(5);
    expect(c.cta).toContain("comment BOILER");
    expect(c.hardFails).toHaveLength(0);
  });

  it("works out words a second when the length is known", () => {
    const c = draftChecks({ spoken: CLEAN, format: "reel", durationS: 30 });
    expect(c.wordsPerSecond).toBe(1.9);
  });

  it("hard fails a draft with no ask", () => {
    const c = draftChecks({ spoken: "One line. Two lines. Three lines.", format: "reel" });
    expect(c.hardFails.join(" ")).toContain("no call to action");
  });

  it("hard fails a draft claiming a result nobody can check", () => {
    const c = draftChecks({ spoken: `We booked 400 jobs last month.\n${CLEAN}`, format: "reel" });
    expect(c.hardFails.join(" ")).toContain("claims a result");
  });

  it("flags a reel that is far too long, but not a long video", () => {
    const long = `${Array.from({ length: SHORT_FORM_WORD_LIMIT + 10 }, () => "word").join(" ")}. Comment BOILER and we will send it.`;
    expect(draftChecks({ spoken: long, format: "reel" }).overLength).toBeGreaterThan(SHORT_FORM_WORD_LIMIT);
    expect(draftChecks({ spoken: long, format: "long" }).overLength).toBeNull();
  });

  it("uses the hook it was given rather than the first line", () => {
    const c = draftChecks({ spoken: CLEAN, hook: "A different opener entirely", format: "reel" });
    expect(c.firstSentence).toBe("A different opener entirely");
  });
});

describe("turning six part scores into one number", () => {
  const parts = (score: number) => PART_ORDER.map((key) => ({ key, score }));

  it("weights the hook most heavily", () => {
    expect(PART_WEIGHTS.hook).toBe(0.3);
    expect(Object.values(PART_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("turns a straight ten into a hundred and a straight five into fifty", () => {
    expect(finalScore(parts(10), false)).toBe(100);
    expect(finalScore(parts(5), false)).toBe(50);
    expect(finalScore(parts(0), false)).toBe(0);
  });

  it("caps at sixty when a hard check failed, however good the rest is", () => {
    expect(finalScore(parts(10), true)).toBe(HARD_FAIL_CAP);
    expect(finalScore(parts(4), true)).toBe(40);
  });

  it("reweights over the parts that are actually there", () => {
    expect(finalScore([{ key: "hook" as DraftPartKey, score: 8 }], false)).toBe(80);
  });

  it("clamps a score the model pushed out of range", () => {
    expect(finalScore(parts(99), false)).toBe(100);
    expect(finalScore([{ key: "hook" as DraftPartKey, score: -4 }], false)).toBe(0);
  });

  it("scores zero rather than throwing when there are no parts", () => {
    expect(finalScore([], false)).toBe(0);
  });
});

describe("making a model's report safe", () => {
  const good = {
    verdict: "Open on the pressure gauge.",
    parts: PART_ORDER.map((key) => ({ key, score: 7, note: 'Line 1 "Your boiler is not broken." lands fast.', fix: "Cut the second clause." })),
    line_fixes: [{ line: "Your boiler is not broken.", problem: "Fine as it is.", rewrite: "Your boiler is probably fine." }],
    hook_rewrites: ["Your boiler is probably fine", "The needle is the whole problem", "Nobody checks this one dial"],
  };

  it("keeps a clean report as it is", () => {
    const r = coerceReport(good, CLEAN)!;
    expect(r.parts).toHaveLength(6);
    expect(r.line_fixes).toHaveLength(1);
    expect(r.hook_rewrites).toHaveLength(3);
    expect(reportProblems(r, "script", CLEAN)).toEqual([]);
  });

  it("throws away a fix quoting a line that is not in the draft", () => {
    const r = coerceReport({ ...good, line_fixes: [{ line: "A line nobody wrote anywhere", problem: "x", rewrite: "y" }] }, CLEAN)!;
    expect(r.line_fixes).toHaveLength(0);
  });

  it("throws away a hook rewrite that invents a number", () => {
    const r = coerceReport({ ...good, hook_rewrites: ["Nine out of ten boilers are fine", "The 97 percent nobody mentions", "The needle is the problem"] }, CLEAN)!;
    expect(r.hook_rewrites.join(" ")).not.toContain("97");
  });

  it("throws away a hook rewrite that is too long or claims a result", () => {
    const r = coerceReport(
      { ...good, hook_rewrites: [Array.from({ length: 20 }, (_, i) => `alpha bravo charlie delta`).join(" "), "I booked 40 jobs from this", "The needle is the problem"] },
      CLEAN,
    )!;
    expect(r.hook_rewrites).toEqual(["The needle is the problem"]);
  });

  it("clamps and orders the part scores whatever order they arrive in", () => {
    const shuffled = { ...good, parts: [...good.parts].reverse().map((p) => ({ ...p, score: 42 })) };
    const r = coerceReport(shuffled, CLEAN)!;
    expect(r.parts.map((p) => p.key)).toEqual(PART_ORDER);
    expect(r.parts.every((p) => p.score === 10)).toBe(true);
  });

  it("refuses an answer that is not an object at all", () => {
    expect(coerceReport("nope", CLEAN)).toBeNull();
    expect(coerceReport([1, 2], CLEAN)).toBeNull();
  });

  it("asks for another pass when the notes point at nothing", () => {
    const vague = { ...good, parts: good.parts.map((p) => ({ ...p, note: "It works well." })) };
    const r = coerceReport(vague, CLEAN)!;
    expect(reportProblems(r, "script", CLEAN).join(" ")).toContain("do not quote the draft");
  });

  it("asks for another pass when a part is missing", () => {
    const r = coerceReport({ ...good, parts: good.parts.slice(0, 4) }, CLEAN)!;
    expect(reportProblems(r, "script", CLEAN).join(" ")).toContain("missing: ask, fit");
  });

  it("asks for another pass when a fix invents a number", () => {
    const withNumber = { ...good, parts: good.parts.map((p) => (p.key === "hook" ? { ...p, fix: "Say 87 percent instead." } : p)) };
    const r = coerceReport(withNumber, CLEAN)!;
    expect(reportProblems(r, "script", CLEAN).join(" ")).toContain("add a number the draft never said");
  });
});

describe("settling on a final report", () => {
  const report = (score: number) => ({
    verdict: "Open on the gauge.",
    parts: PART_ORDER.map((key) => ({ key, label: key, score, note: 'Line 1 "x" lands.', fix: "Cut it." })),
    line_fixes: [],
    hook_rewrites: [],
    spoken: null,
    onScreen: [],
  });

  it("keeps the pass with fewer problems", () => {
    const checks = draftChecks({ spoken: CLEAN, format: "reel" });
    const final = finalizeReport(
      [
        { report: report(4), problems: ["one", "two"] },
        { report: report(8), problems: [] },
      ],
      checks,
    );
    expect(final.score).toBe(80);
  });

  it("applies the hard fail cap even when the model loved it", () => {
    const checks = draftChecks({ spoken: "No ask here at all. Just two lines.", format: "reel" });
    const final = finalizeReport([{ report: report(10), problems: [] }], checks);
    expect(final.score).toBe(HARD_FAIL_CAP);
    expect(final.verdict).toBe("Open on the gauge.");
  });

  it("falls back to the hard failure as the verdict when there is none", () => {
    const checks = draftChecks({ spoken: "No ask here at all. Just two lines.", format: "reel" });
    const final = finalizeReport([{ report: { ...report(6), verdict: null }, problems: [] }], checks);
    expect(final.verdict).toContain("no call to action");
  });
});

describe("checking a quoted line really is in the draft", () => {
  it("ignores punctuation and case", () => {
    expect(lineInDraft("your BOILER is not broken", CLEAN)).toBe(true);
  });

  it("refuses a line that is not there", () => {
    expect(lineInDraft("something else entirely", CLEAN)).toBe(false);
  });

  it("refuses a fragment too short to mean anything", () => {
    expect(lineInDraft("your", CLEAN)).toBe(false);
  });
});

describe("the way a trade actually asks", () => {
  it("recognises a British callout as an ask", () => {
    expect(findAsk("One line.\nAnother line.\nGive us a callout if you spot the rust.")).toContain("callout");
    expect(findAsk("One line.\nAnother line.\nGive us a ring and we will sort it.")).toContain("ring");
    expect(findAsk("One line.\nAnother line.\nGet in touch before the winter.")).toContain("Get in touch");
  });

  it("does not hard fail a script that ends on a callout", () => {
    const c = draftChecks({ spoken: "One line.\nAnother line.\nGive us a callout if you spot the rust.", format: "reel" });
    expect(c.hardFails).toEqual([]);
  });

  it("still finds nothing when the last lines really ask for nothing", () => {
    expect(findAsk("One line.\nAnother line.\nThat is all there is to it.")).toBeNull();
  });
});

describe("never printing a fix that invents a figure", () => {
  const draft = "A rusted exchanger can fail.\nA service can spot it.\nGive us a callout.";
  const base = {
    verdict: "Open on the rust.",
    parts: PART_ORDER.map((key) => ({ key, label: key, score: 7, note: 'Line 1 "A rusted exchanger can fail." lands.', fix: "Cut the second clause." })),
    line_fixes: [],
    hook_rewrites: [],
    spoken: null,
    onScreen: [],
  };

  it("blanks a fix carrying a number the draft never said", () => {
    const withInvention = { ...base, parts: base.parts.map((p) => (p.key === "value" ? { ...p, fix: "Add: saving you thousands versus a new boiler." } : p)) };
    const final = finalizeReport([{ report: withInvention, problems: [] }], draftChecks({ spoken: draft, format: "reel" }), draft);
    expect(final.parts.find((p) => p.key === "value")?.fix).toBe("");
    expect(final.parts.find((p) => p.key === "hook")?.fix).toBe("Cut the second clause.");
  });

  it("drops a line fix whose rewrite invents a figure", () => {
    const withInvention = { ...base, line_fixes: [{ line: "A service can spot it.", problem: "Vague.", rewrite: "A service saves you thousands." }] };
    const final = finalizeReport([{ report: withInvention, problems: [] }], draftChecks({ spoken: draft, format: "reel" }), draft);
    expect(final.line_fixes).toHaveLength(0);
  });
});

describe("telling a reference from a claim", () => {
  it("does not treat a line number or a timestamp as an invented figure", () => {
    const draft = "A rusted exchanger can fail.\nA service can spot it.\nGive us a callout.";
    const report = {
      verdict: "Open on the rust.",
      parts: PART_ORDER.map((key) => ({ key, label: key, score: 7, note: 'Line 1 "A rusted exchanger can fail." lands.', fix: "Rewrite line 1 and cut lines 2 and 3." })),
      line_fixes: [],
      hook_rewrites: [],
      spoken: null,
      onScreen: [],
    };
    const final = finalizeReport([{ report, problems: [] }], draftChecks({ spoken: draft, format: "reel" }), draft);
    expect(final.parts.every((p) => p.fix.startsWith("Rewrite line"))).toBe(true);
    expect(reportProblems(report, "script", draft).join(" ")).not.toContain("add a number");
  });

  it("still catches a real invented figure in the same sentence", () => {
    const draft = "A rusted exchanger can fail.\nGive us a callout.";
    const report = {
      verdict: "v",
      parts: PART_ORDER.map((key) => ({ key, label: key, score: 7, note: 'Line 1 "A rusted exchanger can fail." lands.', fix: "Rewrite line 1 to say it saves you thousands." })),
      line_fixes: [],
      hook_rewrites: [],
      spoken: null,
      onScreen: [],
    };
    const final = finalizeReport([{ report, problems: [] }], draftChecks({ spoken: draft, format: "reel" }), draft);
    expect(final.parts[0].fix).toBe("");
  });
});

describe("choosing between two passes", () => {
  const draft = "A rusted exchanger can fail.\nA service can spot it.\nGive us a callout.";
  const make = (quoted: boolean, rewrites: string[]) => ({
    verdict: "Open on the rust.",
    parts: PART_ORDER.map((key) => ({
      key,
      label: key,
      score: 7,
      note: quoted ? 'Line 1 "A rusted exchanger can fail." lands.' : "It works well enough.",
      fix: "Cut a line.",
    })),
    line_fixes: [],
    hook_rewrites: rewrites,
    spoken: null,
    onScreen: [],
  });

  it("prefers the pass that actually quotes the draft when both have the same problem count", () => {
    const thin = { report: make(false, []), problems: ["one problem"] };
    const solid = { report: make(true, ["A rusted exchanger can fail"]), problems: ["one problem"] };
    const final = finalizeReport([solid, thin], draftChecks({ spoken: draft, format: "reel" }), draft);
    expect(final.parts[0].note).toContain('"A rusted exchanger can fail."');
  });

  it("still prefers fewer problems over more evidence", () => {
    const fewer = { report: make(false, []), problems: [] };
    const richer = { report: make(true, ["one", "two", "three"]), problems: ["a", "b"] };
    const final = finalizeReport([fewer, richer], draftChecks({ spoken: draft, format: "reel" }), draft);
    expect(final.parts[0].note).toBe("It works well enough.");
  });
});
