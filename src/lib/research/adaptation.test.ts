import { describe, expect, it } from "vitest";
import { emptyProfile } from "./brain";
import {
  adaptationProblems,
  cardFormat,
  coerceAdaptation,
  finalizeAdaptation,
  HOOK_MAX_WORDS,
  HOOKS_REQUESTED,
  MAX_SHARED_OPENING,
  MIN_HOOKS,
  repeatedOpenings,
  screenHooks,
  THIN_PROFILE_NOTE,
} from "./adaptation";

const sources = ["Homeowners in Leeds with a boiler over ten years old.", "Boiler repairs from 400 pounds."];

describe("reading hooks back from a model", () => {
  it("takes hooks written as plain strings as well as objects", () => {
    const raw = coerceAdaptation({ hooks: ["A plain string hook", { text: "An object hook", why: "because" }], pick: 1 });
    expect(raw?.hooks.map((h) => h.text)).toEqual(["A plain string hook", "An object hook"]);
    expect(raw?.pick).toBe(1);
  });

  it("is null when the answer is not an answer", () => {
    expect(coerceAdaptation(null)).toBeNull();
    expect(coerceAdaptation(["a", "list"])).toBeNull();
  });

  it("falls back to the first hook when the pick makes no sense", () => {
    expect(coerceAdaptation({ hooks: [{ text: "one" }], pick: -3 })?.pick).toBe(0);
  });
});

describe("which hooks survive the checks", () => {
  const hook = (text: string) => ({ text, why: "it borrows the payoff-first opening" });

  it("keeps a hook built on the client's own material", () => {
    const { kept } = screenHooks([hook("The boiler that cost him twice")], null, { numberSources: sources });
    expect(kept).toHaveLength(1);
  });

  it("throws away one that claims a result nobody can check", () => {
    const { kept, dropped } = screenHooks([hook("We saved our customers thousands last winter")], null, { numberSources: sources });
    expect(kept).toHaveLength(0);
    expect(dropped[0].reasons.join(" ")).toContain("claims a result");
  });

  it("throws away one carrying a figure the profile does not have", () => {
    const { dropped } = screenHooks([hook("Fixed in 47 minutes flat")], null, { numberSources: sources });
    expect(dropped[0].reasons.join(" ")).toContain('"47"');
  });

  it("keeps a figure that IS in the profile", () => {
    const { kept } = screenHooks([hook("Boiler repairs from 400 pounds")], null, { numberSources: sources });
    expect(kept).toHaveLength(1);
  });

  it("throws away one too long to say in three seconds", () => {
    const words = Array.from({ length: HOOK_MAX_WORDS + 3 }, (_, i) => `word${i}`).join(" ");
    expect(screenHooks([hook(words)], null, { numberSources: sources }).kept).toHaveLength(0);
  });

  it("throws away one using a phrase this client never says", () => {
    const { dropped } = screenHooks([hook("Our heating solutions never fail")], ["heating solutions"], { numberSources: sources });
    expect(dropped[0].reasons.join(" ")).toContain("heating solutions");
  });

  it("insists on a bracket when the profile is too thin to know anything", () => {
    expect(screenHooks([hook("The boiler that cost him twice")], null, { needBrackets: true, numberSources: [] }).kept).toHaveLength(0);
    expect(screenHooks([hook("The [job] that cost [him] twice")], null, { needBrackets: true, numberSources: [] }).kept).toHaveLength(1);
  });

  it("throws away a repeat of a hook already kept", () => {
    const { kept } = screenHooks([hook("The same line"), hook("The same line!")], null, { numberSources: sources });
    expect(kept).toHaveLength(1);
  });
});

describe("sending an answer back for another go", () => {
  it("asks again when too many hooks open the same way", () => {
    const hooks = Array.from({ length: 4 }, (_, i) => ({ text: `The one thing about job ${i}`, why: "w" }));
    expect(repeatedOpenings(hooks)[0].count).toBe(4);
    expect(repeatedOpenings(hooks)[0].count).toBeGreaterThan(MAX_SHARED_OPENING);
  });

  it("asks again when fewer than three hooks got through, quoting what was dropped", () => {
    const raw = coerceAdaptation({ hooks: [{ text: "We saved thousands" }], pick: 0 })!;
    const screened = screenHooks(raw.hooks, null, { numberSources: sources });
    const problems = adaptationProblems(raw, screened);
    expect(screened.kept.length).toBeLessThan(MIN_HOOKS);
    expect(problems.join(" ")).toContain("We saved thousands");
  });
});

describe("the set of hooks that gets saved", () => {
  it("takes the pass that got more through and tops it up from the other", () => {
    const first = { raw: coerceAdaptation({ hooks: [{ text: "one" }], pick: 0 })!, kept: [{ text: "one", why: "" }] };
    const second = {
      raw: coerceAdaptation({ hooks: [{ text: "two" }, { text: "three" }], pick: 0, how_to_shoot_it: "Open on the invoice." })!,
      kept: [
        { text: "two", why: "" },
        { text: "three", why: "" },
      ],
    };
    const out = finalizeAdaptation([first, second], false, sources);
    expect(out.hooks.map((h) => h.text)).toEqual(["two", "three", "one"]);
    expect(out.hooks.length).toBeLessThanOrEqual(HOOKS_REQUESTED);
    expect(out.how_to_shoot_it).toBe("Open on the invoice.");
  });

  it("replaces the voice note with what to ask the client for when the profile is thin", () => {
    const pass = { raw: coerceAdaptation({ hooks: [{ text: "The [job]" }], pick: 0, make_it_sound_like_you: "made up" })!, kept: [{ text: "The [job]", why: "" }] };
    expect(finalizeAdaptation([pass], true, []).make_it_sound_like_you).toBe(THIN_PROFILE_NOTE);
  });

  it("drops a caption line carrying a figure the profile does not have", () => {
    const pass = { raw: coerceAdaptation({ hooks: [{ text: "one" }], pick: 0, caption_hook: "We fixed 300 boilers" })!, kept: [{ text: "one", why: "" }] };
    expect(finalizeAdaptation([pass], false, sources).caption_hook).toBeNull();
  });
});

describe("which board format a video becomes", () => {
  it("matches the video it was copied from", () => {
    expect(cardFormat({ platform: "instagram", kind: "reel" })).toBe("reel");
    expect(cardFormat({ platform: "youtube", kind: "short" })).toBe("short");
    expect(cardFormat({ platform: "youtube", kind: "video" })).toBe("long_form");
  });
});

describe("an empty profile", () => {
  it("starts with nothing said about the client", () => {
    const p = emptyProfile("Someone");
    expect(p.avoid).toEqual([]);
    expect(p.source).toBe("empty");
  });
});
