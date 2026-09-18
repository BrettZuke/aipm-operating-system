import { describe, expect, it } from "vitest";
import { parseFilmScript, readingLength, speakingSeconds, toLines } from "./film";

const card = (script: string, extra: Partial<Parameters<typeof parseFilmScript>[0]> = {}) =>
  parseFilmScript({
    id: "1", title: "Board title", platform: "ig", format: "reel",
    script, notes: null, source: null, ...extra,
  });

// Both writers produce these shapes: the cloud agent and the older command-line scripter. The
// YouTube sample below is a real card body, labels and blank lines exactly as filed.
const REEL = `HOOK: I watched a scraper die at 3am.

ON SCREEN: 60 rows of errors

It returned 60 rows of errors.
And it called that success.

That silence is the dangerous part.

CTA: Comment MACHINE and the breakdown gets sent to you.

SHOT LIST:
- Presenter to camera: the hook
- The terminal with the error rows`;

const YOUTUBE = `TITLE: Content to Cash: Live Attribution System Demo

THUMBNAIL: Stop Guessing

THUMBNAIL PROPS: a dashboard on the left, a board of cards on the right

HOOK: Watch me track content to cash, live.

ON SCREEN: POST TO PAYMENT. LIVE.

You post content. You get views.

CTA: Comment ATTRIBUTION for the demo.

SHOT LIST:
- Presenter to camera
- The attribution tab`;

describe("parseFilmScript", () => {
  it("pulls a reel apart into the parts you film from", () => {
    const f = card(REEL);
    expect(f.hook).toBe("I watched a scraper die at 3am.");
    expect(f.onScreen).toBe("60 rows of errors");
    expect(f.cta).toBe("Comment MACHINE and the breakdown gets sent to you.");
    expect(f.shots).toEqual(["Presenter to camera: the hook", "The terminal with the error rows"]);
  });

  it("keeps the spoken words as the beats they were written in", () => {
    const f = card(REEL);
    expect(f.beats).toEqual([
      "It returned 60 rows of errors.\nAnd it called that success.",
      "That silence is the dangerous part.",
    ]);
  });

  it("drops the hook from the words when the script opens with it", () => {
    // Scripts are written with the hook as their first spoken line, and the hook is already the
    // largest thing on the page. Left in, the first thing read while recording is a stutter.
    const f = card("HOOK: I track three clicks.\n\nI track three clicks.\nThen the payment lands.");
    expect(f.beats[0]).toBe("Then the payment lands.");
    expect(f.beats.join(" ")).not.toContain("I track three clicks.");
  });

  it("ignores punctuation and casing when spotting that duplicate", () => {
    const f = card('HOOK: "I track three clicks"\n\nI track three clicks.\nThen it lands.');
    expect(f.beats[0]).toBe("Then it lands.");
  });

  it("drops the whole beat when the hook was the only line in it", () => {
    const f = card("HOOK: One line.\n\nOne line.\n\nA second beat.");
    expect(f.beats).toEqual(["A second beat."]);
  });

  it("leaves the words alone when they do not open with the hook", () => {
    const f = card("HOOK: A hook.\n\nSomething else entirely.");
    expect(f.beats).toEqual(["Something else entirely."]);
    const g = card("HOOK: A hook.\n\nDifferent opening.\nA hook.");
    expect(g.beats).toEqual(["Different opening.\nA hook."]);
  });

  it("drops the ask from the words when the script closes with it", () => {
    const f = card("HOOK: A hook.\n\nA middle line.\nComment WORD for the breakdown.\n\nCTA: Comment WORD for the breakdown.");
    expect(f.beats).toEqual(["A middle line."]);
    expect(f.cta).toBe("Comment WORD for the breakdown.");
  });

  it("keeps a closing line that merely resembles the ask", () => {
    const f = card("HOOK: A hook.\n\nSomething else.\n\nCTA: Comment WORD for the breakdown.");
    expect(f.beats).toEqual(["Something else."]);
  });

  it("never lets a label leak into the spoken words", () => {
    const f = card(REEL);
    const words = f.beats.join(" ");
    for (const label of ["HOOK:", "ON SCREEN:", "CTA:", "SHOT LIST:"]) {
      expect(words).not.toContain(label);
    }
  });

  it("reads the YouTube-only parts, and does not confuse the two thumbnail labels", () => {
    const f = card(YOUTUBE, { platform: "yt", format: "long_form" });
    expect(f.videoTitle).toBe("Content to Cash: Live Attribution System Demo");
    expect(f.thumbnail).toBe("Stop Guessing");
    expect(f.thumbnailProps).toBe("a dashboard on the left, a board of cards on the right");
    // THUMBNAIL PROPS is the longer label and must not be swallowed by THUMBNAIL.
    expect(f.thumbnail).not.toContain("dashboard");
  });

  it("leaves the YouTube fields null on a reel", () => {
    const f = card(REEL);
    expect(f.videoTitle).toBeNull();
    expect(f.thumbnail).toBeNull();
    expect(f.thumbnailProps).toBeNull();
  });

  it("reads the subject the agent recorded on the card", () => {
    const f = card(REEL, { notes: "Subject: Attribution, post to payment\nPattern: something" });
    expect(f.subject).toBe("Attribution, post to payment");
    expect(card(REEL).subject).toBeNull();
  });

  it("survives a card with no shot list, which is what the old ones looked like", () => {
    const f = card("HOOK: A hook.\n\nSome words.\n\nCTA: Comment WORD.");
    expect(f.shots).toEqual([]);
    expect(f.beats).toEqual(["Some words."]);
  });

  it("treats an unlabelled body as spoken words rather than losing it", () => {
    const f = card("Just some words with no labels at all.");
    expect(f.hook).toBe("");
    expect(f.beats).toEqual(["Just some words with no labels at all."]);
  });

  it("does not fall over on an empty script", () => {
    const f = card("");
    expect(f.hook).toBe("");
    expect(f.beats).toEqual([]);
    expect(f.shots).toEqual([]);
  });

  it("accepts the bullet characters a model reaches for", () => {
    const f = card("SHOT LIST:\n- one\n* two\n• three");
    expect(f.shots).toEqual(["one", "two", "three"]);
  });
});

describe("toLines", () => {
  it("gives each sentence its own line, because a wall of text is unreadable while talking", () => {
    // Nine of the first nineteen cards arrived as a single paragraph from the fallback model.
    expect(toLines("I built a scraper. It reads 36 accounts. It broke at 3am."))
      .toEqual(["I built a scraper.", "It reads 36 accounts.", "It broke at 3am."]);
  });

  it("keeps line breaks the writer put in", () => {
    expect(toLines("First beat.\nSecond beat.")).toEqual(["First beat.", "Second beat."]);
  });

  it("does not split a decimal, an abbreviation mid-sentence, or a url", () => {
    expect(toLines("It costs $0.40 a run.")).toEqual(["It costs $0.40 a run."]);
    expect(toLines("Go to example.com now.")).toEqual(["Go to example.com now."]);
  });

  it("splits when a quote opens the next sentence", () => {
    expect(toLines('It lied. "I got 80 million views," it wrote.'))
      .toEqual(["It lied.", '"I got 80 million views," it wrote.']);
  });
});

describe("speakingSeconds", () => {
  it("estimates out-loud length, so an overlong reel is obvious before it is filmed", () => {
    expect(speakingSeconds([Array(150).fill("word").join(" ")])).toBe(60);
    expect(speakingSeconds([])).toBe(0);
  });

  it("reads back as something a person would say", () => {
    expect(readingLength(45)).toBe("45s");
    expect(readingLength(60)).toBe("1m");
    expect(readingLength(95)).toBe("1m 35s");
  });
});
