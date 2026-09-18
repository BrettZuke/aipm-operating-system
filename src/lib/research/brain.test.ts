import { describe, expect, it } from "vitest";
import { blankProfileDoc, cutAt, emptyProfile, parseClientProfile, profileIsThin, profileSources, trimProfile } from "./brain";

const FILLED = `# Client profile: Northgate Plumbing

## Who they help
Homeowners in Leeds with a boiler over ten years old who have already had one breakdown.

## What they sell
Boiler repairs and replacements, 400 to 3,200 pounds, same day callouts.

## What they can show on camera
The van, the workshop bench, a corroded heat exchanger, the before and after of a rusted pipe.

## How they talk
"Right, let's have a look." Short sentences. Never says heating solutions.

## Phrases to avoid
- heating solutions
- market leading
`;

describe("reading the Client profile out of the Brain", () => {
  it("pulls every section out and names the client from the heading", () => {
    const p = parseClientProfile(FILLED, "the workspace");
    expect(p.name).toBe("Northgate Plumbing");
    expect(p.who_they_help).toContain("Leeds");
    expect(p.what_they_sell).toContain("same day callouts");
    expect(p.proof).toContain("corroded heat exchanger");
    expect(p.how_they_talk).toContain("Right, let's have a look.");
    expect(p.avoid).toEqual(["heating solutions", "market leading"]);
    expect(p.source).toBe("brain");
  });

  it("never reads the guidance comments as the client's own answers", () => {
    const p = parseClientProfile(blankProfileDoc("Anyone"), "Anyone");
    expect(p.source).toBe("empty");
    expect(profileIsThin(p)).toBe(true);
  });

  it("falls back to the workspace name when the document has no heading", () => {
    const p = parseClientProfile("## Who they help\nSmall gyms in Manchester with fewer than 200 members.\n", "Bright Gyms");
    expect(p.name).toBe("Bright Gyms");
  });

  it("treats a document with nothing filled in as empty", () => {
    const p = parseClientProfile("# Someone\n\n## Who they help\n\n## What they sell\n", "Someone");
    expect(p.source).toBe("empty");
  });
});

describe("whether there is enough to write from", () => {
  it("is thin until at least two sections say something real", () => {
    const p = emptyProfile("Someone");
    expect(profileIsThin(p)).toBe(true);
    expect(profileIsThin({ ...p, who_they_help: "Homeowners in Leeds with old boilers" })).toBe(true);
    expect(profileIsThin({ ...p, who_they_help: "Homeowners in Leeds with old boilers", what_they_sell: "Boiler repairs and replacements" })).toBe(false);
  });

  it("only offers the sections that say something as facts", () => {
    const p = { ...emptyProfile("Someone"), who_they_help: "Homeowners", proof: "The van" };
    expect(profileSources(p)).toEqual(["Homeowners", "The van"]);
  });
});

describe("keeping a profile inside a prompt's budget", () => {
  it("never cuts a word in half", () => {
    expect(cutAt("one two three four", 9)).toBe("one two");
    expect(cutAt("short", 50)).toBe("short");
  });

  it("stays inside the budget and keeps every section", () => {
    const long = (n: number) => "word ".repeat(n).trim();
    const p = { ...emptyProfile("Someone"), who_they_help: long(500), what_they_sell: long(500), proof: long(500), how_they_talk: long(500) };
    const trimmed = trimProfile(p, 600);
    const total = trimmed.who_they_help.length + trimmed.what_they_sell.length + trimmed.proof.length + trimmed.how_they_talk.length;
    expect(total).toBeLessThanOrEqual(600);
    expect(trimmed.proof.length).toBeGreaterThan(0);
    expect(trimmed.how_they_talk.length).toBeGreaterThan(0);
  });

  it("gives a short section's unused room to the others", () => {
    const p = { ...emptyProfile("Someone"), who_they_help: "short", what_they_sell: "x".repeat(4_000), proof: "x".repeat(4_000), how_they_talk: "short" };
    const trimmed = trimProfile(p, 1_000);
    expect(trimmed.who_they_help).toBe("short");
    expect(trimmed.proof.length + trimmed.what_they_sell.length).toBeGreaterThan(900);
  });
});
