import { describe, expect, it } from "vitest";
import { bannedPhrasesUsed, hookWords, HOOK_MAX_WORDS, missingCta, overpromises, sanitize, spokenWords, tooLong, unsupportedNumbers, unverifiableClaims } from "./guards";
import { MAX_SHARED_OPENING, repeatedOpenings, screenHooks } from "./adaptation";

describe("cleaning what a model wrote", () => {
  it("takes out dashes, emoji and curly quotes", () => {
    expect(sanitize("one \u2014 two")).toBe("one, two");
    expect(sanitize("one \u2013 two")).toBe("one, two");
    expect(sanitize("nice \u{1F600} work")).toBe("nice work");
    expect(sanitize("“quoted” and ‘single’")).toBe('"quoted" and \'single\'');
    expect(sanitize("cold‑call")).toBe("cold-call");
  });

  it("takes out a stage direction the model added unasked", () => {
    expect(sanitize("Say this [on screen: BIG TEXT] then stop")).toBe("Say this then stop");
  });

  it("collapses a doubled word and doubled spaces", () => {
    expect(sanitize("the the boiler")).toBe("the boiler");
    expect(sanitize("two  spaces")).toBe("two spaces");
  });
});

describe("claims nobody can check", () => {
  it("catches a first-person result with a number in it", () => {
    expect(unverifiableClaims("I got 80 million views last month.")).toHaveLength(1);
    expect(unverifiableClaims("We booked 400 clients this year.")).toHaveLength(1);
    expect(unverifiableClaims("My revenue hit $40,000.")).toHaveLength(1);
  });

  it("catches a quantity written as a word", () => {
    expect(unverifiableClaims("We have helped hundreds of customers.")).toHaveLength(1);
    expect(unverifiableClaims("I have done thousands of these.")).toHaveLength(1);
  });

  it("allows a number that is being reported inside quotes", () => {
    expect(unverifiableClaims('The advert said "I got 80 million views" and it was nonsense.')).toHaveLength(0);
  });

  it("allows a number that is not a claim about the speaker", () => {
    expect(unverifiableClaims("A boiler service takes 45 minutes.")).toHaveLength(0);
    expect(unverifiableClaims("The van holds 200 parts.")).toHaveLength(0);
  });

  it("says nothing about clean text", () => {
    expect(unverifiableClaims("")).toHaveLength(0);
    expect(unverifiableClaims("Here is how we fix a cold radiator.")).toHaveLength(0);
  });
});

describe("promises nobody can keep", () => {
  it("catches a promise of a personal reply", () => {
    expect(overpromises("Comment below and I will reply personally.")).not.toHaveLength(0);
    expect(overpromises("I'll reply to every single comment.")).not.toHaveLength(0);
  });

  it("leaves a normal ask alone", () => {
    expect(overpromises("Comment BOILER and we will send the checklist.")).toHaveLength(0);
  });
});

describe("the ask", () => {
  it("counts a missing or throwaway ask as missing", () => {
    expect(missingCta(null)).toBe(true);
    expect(missingCta("")).toBe(true);
    expect(missingCta("Follow")).toBe(true);
    expect(missingCta("Comment BOILER and we will send it over")).toBe(false);
  });
});

describe("counting what is actually said", () => {
  it("ignores the labelled scaffolding around the script", () => {
    const script = "HOOK: not counted\nThis is the line that is said.\nON SCREEN: not counted\nSo is this one.";
    expect(spokenWords(script)).toBe(11);
  });

  it("stops counting at the shot list", () => {
    expect(spokenWords("Two words here.\nSHOT LIST\none two three four five")).toBe(3);
  });

  it("flags a reel that is really an email read aloud", () => {
    const long = Array.from({ length: 160 }, () => "word").join(" ");
    expect(tooLong(long, 150)).toBe(160);
    expect(tooLong("short one", 150)).toBeNull();
  });
});

describe("the fifteen word hook rule", () => {
  it("counts the words in a hook, brackets included", () => {
    expect(hookWords("Bought my [person] a [big purchase] at [age]")).toBe(8);
    expect(hookWords("one two three")).toBe(3);
    expect(hookWords("   ")).toBe(0);
  });

  it("keeps a hook of exactly fifteen words and throws away sixteen", () => {
    const fifteen = Array.from({ length: HOOK_MAX_WORDS }, () => "word").join(" ");
    const sixteen = `${fifteen} extra`;
    const screened = screenHooks([
      { text: fifteen, why: "" },
      { text: sixteen, why: "" },
    ]);
    expect(screened.kept.map((h) => h.text)).toEqual([fifteen]);
    expect(screened.dropped[0].reasons[0]).toContain("16 words");
  });

  it("throws away a hook that claims a result, and says why", () => {
    const screened = screenHooks([{ text: "I got 400 leads in a week", why: "" }]);
    expect(screened.kept).toHaveLength(0);
    expect(screened.dropped[0].reasons.join(" ")).toContain("claims a result nobody can check");
  });

  it("throws away a hook that promises a personal reply", () => {
    const screened = screenHooks([{ text: "Comment and I will reply personally", why: "" }]);
    expect(screened.kept).toHaveLength(0);
    expect(screened.dropped[0].reasons.join(" ")).toContain("promises a personal reply");
  });

  it("throws away a hook using a phrase the client bans", () => {
    const screened = screenHooks([{ text: "Here is the thing about boilers", why: "" }], ["here is the thing"]);
    expect(screened.kept).toHaveLength(0);
    expect(screened.dropped[0].reasons.join(" ")).toContain("never says");
  });

  it("throws away a hook carrying a number the client profile does not have", () => {
    const screened = screenHooks([{ text: "The 7 point check most miss", why: "" }], null, { numberSources: ["a 12 point check"] });
    expect(screened.kept).toHaveLength(0);
    expect(screened.dropped[0].reasons.join(" ")).toContain('"7"');
  });

  it("allows a number that IS in the client profile", () => {
    const screened = screenHooks([{ text: "The 12 point check most miss", why: "" }], null, { numberSources: ["a 12 point check"] });
    expect(screened.kept).toHaveLength(1);
  });

  it("insists on a bracket when the client profile is thin", () => {
    const filled = screenHooks([{ text: "The first van I bought was not new", why: "" }], null, { needBrackets: true });
    expect(filled.kept).toHaveLength(0);
    const bracketed = screenHooks([{ text: "The first [thing] I bought was not new", why: "" }], null, { needBrackets: true });
    expect(bracketed.kept).toHaveLength(1);
  });

  it("throws away a repeat of a hook it already kept", () => {
    const screened = screenHooks([
      { text: "Your boiler is not broken", why: "" },
      { text: "your boiler is not broken.", why: "" },
    ]);
    expect(screened.kept).toHaveLength(1);
    expect(screened.dropped[0].reasons).toContain("it repeats another hook");
  });

  it("flags when too many hooks open the same way", () => {
    const hooks = Array.from({ length: MAX_SHARED_OPENING + 1 }, (_, i) => ({ text: `You can now do ${"thing ".repeat(i + 1)}` }));
    expect(repeatedOpenings(hooks)).toEqual([{ opening: "you can now", count: MAX_SHARED_OPENING + 1 }]);
    expect(repeatedOpenings(hooks.slice(0, MAX_SHARED_OPENING))).toEqual([]);
  });
});

describe("numbers that are not in the sources", () => {
  it("finds a figure that was invented", () => {
    expect(unsupportedNumbers("quiet hours from 10pm to 6am", ["there is a quiet hours rule"])).toEqual(["10", "6"]);
  });

  it("allows a figure that is in the sources, commas ignored", () => {
    expect(unsupportedNumbers("we fitted 1,200 of them", ["1200 fitted so far"])).toEqual([]);
  });

  it("ignores a number inside brackets, because that is a blank to fill in", () => {
    expect(unsupportedNumbers("[12] years doing this", [])).toEqual([]);
  });
});

describe("phrases a client never says", () => {
  it("matches whatever shape the apostrophe is", () => {
    expect(bannedPhrasesUsed("here’s the thing about it", ["here's the thing"])).toEqual(["here's the thing"]);
  });

  it("says nothing when there is no list", () => {
    expect(bannedPhrasesUsed("anything at all", null)).toEqual([]);
    expect(bannedPhrasesUsed("anything at all", [])).toEqual([]);
  });
});

describe("quantities written as words", () => {
  it("catches a big figure borrowed from the video being copied", () => {
    // Every hook in a real run said "thirty thousand pounds", a figure no client profile had.
    expect(unsupportedNumbers("can cost you thirty thousand pounds", ["a service is 90 pounds"])).toContain("thirty thousand");
  });

  it("catches a bare scale word used as a claim", () => {
    expect(unsupportedNumbers("we have saved people thousands", ["boiler servicing"])).toContain("thousand");
    expect(unsupportedNumbers("tens of thousands of pounds of damage", [])).not.toHaveLength(0);
  });

  it("allows the same figure when the client profile really says it", () => {
    expect(unsupportedNumbers("can cost thirty thousand pounds", ["a burst pipe cost one customer thirty thousand pounds"])).toEqual([]);
  });

  it("leaves ordinary words that are not quantities alone", () => {
    expect(unsupportedNumbers("one thing nobody checks", [])).toEqual([]);
    expect(unsupportedNumbers("the first callout of the day", [])).toEqual([]);
  });

  it("still leaves a bracketed slot alone", () => {
    expect(unsupportedNumbers("it can cost [amount] thousand", [])).toEqual([]);
  });

  it("catches both the digits and the words in the same line", () => {
    const found = unsupportedNumbers("a 3 pound hose, thirty thousand pounds of damage", []);
    expect(found).toContain("3");
    expect(found).toContain("thirty thousand");
  });
});
