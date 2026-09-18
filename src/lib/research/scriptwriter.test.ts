import { describe, expect, it } from "vitest";
import { emptyProfile } from "./brain";
import { coerceScript, scriptProblems, SCRIPT_WORD_LIMIT } from "./scriptwriter";
import type { ClientProfile } from "./types";

const client: ClientProfile = {
  ...emptyProfile("Northgate Plumbing"),
  who_they_help: "Homeowners in Leeds with a boiler over ten years old.",
  what_they_sell: "Boiler repairs and replacements, same day callouts.",
  proof: "The van, the bench, a corroded heat exchanger.",
  how_they_talk: "Short sentences. Never says heating solutions.",
  avoid: ["heating solutions"],
  source: "brain",
};

const draft = (over: Record<string, unknown> = {}) =>
  coerceScript(
    {
      hook: "This job cost him twice what it should have.",
      script: "This job cost him twice what it should have.\nThe first company used the wrong pipe.\nWe took it out in an hour.",
      cta: "Message the word BOILER and we will take a look.",
      on_screen: "Twice the price",
      caption: "Cheap work is not cheap.",
      shot_list: ["The invoice in his hand"],
      ...over,
    },
    "This job cost him twice what it should have.",
  )!;

describe("reading a written script back", () => {
  it("cleans every part and keeps the chosen hook when the model drops it", () => {
    const d = coerceScript({ script: "Some words that get said." }, "The chosen hook");
    expect(d?.hook).toBe("The chosen hook");
    expect(d?.cta).toBe("");
  });

  it("is null when there is no script at all", () => {
    expect(coerceScript({ hook: "h" }, "h")).toBeNull();
    expect(coerceScript(null, "h")).toBeNull();
    expect(coerceScript("a string", "h")).toBeNull();
  });

  it("takes dashes and stage directions out of what gets saved", () => {
    const dash = "\u2014";
    const d = coerceScript({ script: `He said it ${dash} then showed the invoice. [ON SCREEN: twice the price]` }, "h");
    expect(d?.script).not.toContain(dash);
    expect(d?.script).not.toContain("ON SCREEN:");
  });
});

describe("the checks a script has to pass before it is filed", () => {
  it("passes a script built only from the client's own profile", () => {
    expect(scriptProblems(draft(), client, false)).toEqual([]);
  });

  it("catches a result nobody can check", () => {
    const problems = scriptProblems(draft({ script: "We have saved our customers thousands of pounds this year." }), client, false);
    expect(problems.join(" ")).toContain("claims a result nobody can check");
  });

  it("catches a promise of a personal reply", () => {
    const problems = scriptProblems(draft({ cta: "Comment below and I will personally reply to every single comment." }), client, false);
    expect(problems.join(" ")).toContain("personal reply");
  });

  it("catches a phrase this client never says", () => {
    const problems = scriptProblems(draft({ script: "We do heating solutions for homes in Leeds." }), client, false);
    expect(problems.join(" ")).toContain("heating solutions");
  });

  it("catches a figure that is not in their profile", () => {
    const problems = scriptProblems(draft({ script: "The job took 47 minutes and cost 812 pounds." }), client, false);
    expect(problems.join(" ")).toContain("not in the client profile");
  });

  it("catches a missing ask", () => {
    expect(scriptProblems(draft({ cta: "" }), client, false).join(" ")).toContain("no real call to action");
  });

  it("catches a reel that has quietly become an essay, but leaves a long video alone", () => {
    const long = { script: "A sentence that is said out loud. ".repeat(60) };
    expect(scriptProblems(draft(long), client, false).join(" ")).toContain(String(SCRIPT_WORD_LIMIT));
    expect(scriptProblems(draft(long), client, true).join(" ")).not.toContain(String(SCRIPT_WORD_LIMIT));
  });
});
