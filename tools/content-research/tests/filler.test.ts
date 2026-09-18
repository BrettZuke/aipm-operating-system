import { describe, expect, it } from "vitest";
import { BANNED_FILLER, fillerHits, fillerProblem, stripFiller } from "../lib/filler";

describe("catching words that point at nothing", () => {
  it("catches a banned word used on its own", () => {
    const hits = fillerHits("The hook is really engaging.");
    expect(hits).toHaveLength(1);
    expect(hits[0].phrase).toBe("engaging");
  });

  it("lets it through when the same sentence shows the concrete thing", () => {
    expect(fillerHits('It is relatable because he says "I lost my first customer" at 0:03')).toHaveLength(0);
    expect(fillerHits('A strong hook: "Your boiler is not broken"')).toHaveLength(0);
    expect(fillerHits("High energy from 0:00 to 0:04")).toHaveLength(0);
  });

  it("does not count a banned word inside a quote, because that is the creator talking", () => {
    expect(fillerHits('He opens with "this is so relatable" and cuts away.')).toHaveLength(0);
  });

  it("catches hyphen and space spellings alike", () => {
    expect(fillerHits("It is attention grabbing.")).toHaveLength(1);
    expect(fillerHits("It is attention-grabbing.")).toHaveLength(1);
    expect(fillerHits("Scroll stopping stuff.")).toHaveLength(1);
  });

  it("catches the phrase spread over a few words", () => {
    expect(fillerHits("The opening really grabs the viewer's attention.")).toHaveLength(1);
  });

  it("finds every banned phrase when each is used plainly", () => {
    for (const phrase of BANNED_FILLER) {
      expect(fillerHits(`This one is ${phrase}.`).length, phrase).toBeGreaterThan(0);
    }
  });

  it("counts one hit per phrase per sentence, not one per word", () => {
    expect(fillerHits("Engaging and engaging again.")).toHaveLength(1);
    expect(fillerHits("It is engaging. It is compelling.")).toHaveLength(2);
  });

  it("says nothing about clean writing", () => {
    expect(fillerHits('He holds up the invoice at 0:05 and says "this is the bit nobody shows you".')).toHaveLength(0);
    expect(fillerHits(null)).toHaveLength(0);
    expect(fillerHits("")).toHaveLength(0);
  });
});

describe("taking filler out", () => {
  it("removes the offending sentence and keeps the rest", () => {
    const text = 'The hook is engaging. He says "I lost a customer" at 0:03.';
    expect(stripFiller(text)).toBe('He says "I lost a customer" at 0:03.');
  });

  it("keeps the line breaks between the lines that survive", () => {
    expect(stripFiller("It is relatable.\nHe holds up the bill.")).toBe("He holds up the bill.");
  });

  it("can end up with nothing, and says so plainly", () => {
    expect(stripFiller("It is engaging and powerful.")).toBe("");
  });
});

describe("telling the model what to fix", () => {
  it("quotes the sentences back", () => {
    const problem = fillerProblem(fillerHits("The hook is engaging."));
    expect(problem).toContain('"The hook is engaging."');
    expect(problem).toContain('uses "engaging"');
  });

  it("says nothing when the writing is clean", () => {
    expect(fillerProblem([])).toBeNull();
  });
});
