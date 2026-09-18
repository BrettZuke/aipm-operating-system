import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  captionHook,
  cardNotes,
  cardSource,
  cardsFor,
  creatorRow,
  filmScriptBody,
  formatCode,
  normalizeHandle,
  outlierAnalysis,
  outlierRow,
  platformCode,
  postTypeOf,
  TOOL,
} from "../lib/sync-map";
import { buildPlan, profileDocTitle, researchDocBody, researchDocTitle } from "../lib/sync";
import { parseProfile } from "../lib/store";
import type { Adaptation, Breakdown, Creator, ScoredPost } from "../lib/types";
import type { StoredBreakdown, StoredScript } from "../lib/store";

const AGENCY = "00000000-1111-2222-3333-444444444444";
const AT = new Date("2026-09-17T12:00:00.000Z");

const CLIENT = parseProfile(
  "burnley-boiler-care",
  `# Burnley Boiler Care

## Who they help
Homeowners with an old combi.

## What they sell
Servicing and repairs.

## What they can show on camera
The van, the gauge, a rusted heat exchanger on the bench.
`,
);

function post(over: Partial<ScoredPost> = {}): ScoredPost {
  return {
    platform: "youtube",
    external_id: "KeRV45ZKiRg",
    url: "https://www.youtube.com/watch?v=KeRV45ZKiRg",
    kind: "short",
    posted_at: "2026-08-14T09:30:00.000Z",
    caption: "The 5 Dollar fix\nsecond line of the caption",
    description: null,
    duration_s: 70,
    views: 12867,
    likes: 535,
    comments: 33,
    thumb_url: null,
    display_url: null,
    media_url: null,
    audio_url: null,
    image_urls: null,
    media_expires_at: null,
    owner: "UCxxxx",
    source: null,
    creator: "The Trade Explainer",
    metric: "views",
    score: 12867,
    baseline: 2874,
    multiple: 4.5,
    strength: 18.4,
    is_outlier: true,
    ...over,
  };
}

const BREAKDOWN: Breakdown = {
  title: "Plumber warns about cheap hoses",
  hook: { spoken: "A three dollar hose can cost you thirty thousand.", on_screen: "NOT BROKEN", caption: "The 5 Dollar fix" },
  hook_type: "Warning",
  hook_template: "A [low cost item] can be the reason somebody loses [large sum]",
  angle: "A cheap hose bursts and insurance denies the claim.",
  format: "Talking head with multiple angles",
  beats: ["0:00 he holds the hose", "0:08 he explains the pressure"],
  creative_choices: ["Hard cut at 0:03"],
  why_it_holds_attention: 'The opening gives the penalty. He says "they will deny it" at 0:39.',
  pattern_you_can_use: "State a big risk from a cheap part, then offer the cheap fix.",
  ask: "Send this to somebody still using the old ones.",
  source: "watched",
};

const ADAPTATION: Adaptation = {
  hooks: [
    { text: "A cheap pressure gauge can leave you with a repair bill", why: "Uses the gauge from the profile." },
    { text: "That rusted heat exchanger could force a whole new boiler", why: "Uses the bench part." },
    { text: "A cracked filling loop can flood your flat", why: "Uses the filling loop." },
  ],
  pick: 1,
  pick_reason: "It names the part they can hold up.",
  on_screen_text: "Cheap parts, big bills",
  how_to_shoot_it: "Open on the bench. Cut to the gauge. End on the certificate.",
  shot_list: ["rusted heat exchanger on bench", "pressure gauge on combi"],
  make_it_sound_like_you: "Use the exchanger they keep on the bench.",
  caption_hook: "Cheap parts can cost you thousands",
};

describe("the shapes the dashboard already knows how to draw", () => {
  it("uses the post types the dashboard's own signal panel displays", () => {
    expect(postTypeOf({ platform: "youtube", kind: "short" })).toBe("Video");
    expect(postTypeOf({ platform: "youtube", kind: "video" })).toBe("Video");
    expect(postTypeOf({ platform: "instagram", kind: "reel" })).toBe("Video");
    expect(postTypeOf({ platform: "instagram", kind: "carousel" })).toBe("Sidecar");
    expect(postTypeOf({ platform: "instagram", kind: "image" })).toBe("Image");
  });

  it("uses only platform and format codes the board's check constraints allow", () => {
    const platforms = ["yt", "ig", "tt", "em", "sms", "dm", "bio", "other"];
    const formats = ["reel", "short", "story", "carousel", "long_form", "other"];
    expect(platforms).toContain(platformCode("youtube"));
    expect(platforms).toContain(platformCode("instagram"));
    for (const p of [
      { platform: "youtube", kind: "short" },
      { platform: "youtube", kind: "video" },
      { platform: "instagram", kind: "reel" },
      { platform: "instagram", kind: "carousel" },
    ] as const) {
      expect(formats).toContain(formatCode(p));
    }
  });

  it("stores a handle in one shape, because the roster's key ignores case", () => {
    expect(normalizeHandle("@SomeOne")).toBe("someone");
    expect(normalizeHandle(" Someone ")).toBe("someone");
    expect(normalizeHandle(null)).toBe("");
  });

  it("takes the caption hook from the first line only", () => {
    expect(captionHook("The 5 Dollar fix\nsecond line")).toBe("The 5 Dollar fix");
    expect(captionHook("\n\n  after blanks  ")).toBe("after blanks");
    expect(captionHook(null)).toBeNull();
  });
});

describe("the roster row", () => {
  const creator: Creator = { name: "The Trade Explainer", platform: "youtube", handle: "@TradeExplainer", channel_id: "UCxxxx", added_at: AT.toISOString() };

  it("files a tracked competitor as a copy target the roster understands", () => {
    const row = creatorRow({ agencyId: AGENCY, creator, clientName: CLIENT.name, posts: [post()], at: AT });
    expect(row.agency_id).toBe(AGENCY);
    expect(row.handle).toBe("tradeexplainer");
    expect(row.name).toBe("The Trade Explainer");
    expect(row.role).toBe("emulate");
    expect(row.status).toBe("active");
    expect(row.youtube).toBe("@TradeExplainer");
    expect(row.instagram).toBeNull();
  });

  it("counts their posts by platform, the way the roster shows them", () => {
    const posts = [post(), post({ external_id: "b", url: "u2" }), post({ platform: "instagram", kind: "reel", external_id: "c", url: "u3" })];
    const row = creatorRow({ agencyId: AGENCY, creator, clientName: CLIENT.name, posts, at: AT });
    expect(row.videos_count).toBe(2);
    expect(row.posts_count).toBe(1);
    expect(row.last_scraped_at).toBe(AT.toISOString());
  });

  it("leaves the last scan time empty when nothing has been read for them", () => {
    const row = creatorRow({ agencyId: AGENCY, creator, clientName: CLIENT.name, posts: [], at: AT });
    expect(row.last_scraped_at).toBeNull();
  });

  it("puts an Instagram creator's handle in the instagram column", () => {
    const ig: Creator = { name: "a_plumbing_account", platform: "instagram", handle: "a_plumbing_account", channel_id: null, added_at: AT.toISOString() };
    const row = creatorRow({ agencyId: AGENCY, creator: ig, clientName: CLIENT.name, posts: [], at: AT });
    expect(row.instagram).toBe("a_plumbing_account");
    expect(row.youtube).toBeNull();
  });
});

describe("the standout row", () => {
  it("carries every number the signal panel reads", () => {
    const row = outlierRow(AGENCY, post(), "tradeexplainer");
    expect(row).toMatchObject({
      agency_id: AGENCY,
      url: "https://www.youtube.com/watch?v=KeRV45ZKiRg",
      platform: "youtube",
      creator: "The Trade Explainer",
      handle: "tradeexplainer",
      post_type: "Video",
      metric: "views",
      score: 12867,
      creator_median: 2874,
      multiple: 4.5,
      views: 12867,
      likes: 535,
      comments: 33,
      caption_hook: "The 5 Dollar fix",
    });
  });

  it("writes the posted date as a date, because that column is one", () => {
    expect(outlierRow(AGENCY, post(), null).posted).toBe("2026-08-14");
    expect(outlierRow(AGENCY, post({ posted_at: null }), null).posted).toBeNull();
  });

  it("never sends an analysis column with the numbers, so a re-sync cannot blank a breakdown", () => {
    const row = outlierRow(AGENCY, post(), null) as unknown as Record<string, unknown>;
    for (const field of ["hook_type", "hook_template", "format", "ask", "why_it_worked", "analysed"]) {
      expect(Object.keys(row)).not.toContain(field);
    }
  });

  it("sends the analysis as its own set of fields, all populated", () => {
    expect(outlierAnalysis(BREAKDOWN)).toEqual({
      hook_type: "Warning",
      hook_template: "A [low cost item] can be the reason somebody loses [large sum]",
      format: "Talking head with multiple angles",
      ask: "Send this to somebody still using the old ones.",
      why_it_worked: 'The opening gives the penalty. He says "they will deny it" at 0:39.',
      analysed: true,
    });
  });

  it("never sends a null metric, because that column cannot be null", () => {
    expect(outlierRow(AGENCY, post({ metric: null }), null).metric).toBe("views");
  });
});

describe("the board cards", () => {
  const script = {
    hook: "That rusted heat exchanger could force a whole new boiler",
    onScreen: "Cheap parts, big bills",
    spoken: "That rusted heat exchanger could force a whole new boiler.\nA corroded part can let the system fail.\nGive us a callout if you spot the rust.",
    cta: "Give us a callout if you spot the rust.",
    shots: ["rusted heat exchanger on bench", "pressure gauge on combi"],
  };

  const built = () =>
    cardsFor({ agencyId: AGENCY, slug: CLIENT.slug, postId: "yt-KeRV45ZKiRg", post: post(), breakdown: BREAKDOWN, adaptation: ADAPTATION, script, at: AT });

  it("files each hook in Ideas and the script in Scripted", () => {
    const cards = built();
    expect(cards.filter((c) => c.stage === "ideas")).toHaveLength(3);
    expect(cards.filter((c) => c.stage === "scripted")).toHaveLength(1);
  });

  it("puts the chosen hook first", () => {
    expect(built()[0].title).toBe("That rusted heat exchanger could force a whole new boiler");
  });

  it("uses a created_by the board's check constraint accepts", () => {
    for (const card of built()) {
      expect(card.created_by === "human" || card.created_by.startsWith("agent:")).toBe(true);
      expect(card.created_by).toBe(`agent:${TOOL}`);
    }
  });

  it("marks every card so it can be found and taken back out", () => {
    const sources = built().map((c) => c.source);
    expect(new Set(sources).size).toBe(sources.length);
    for (const s of sources) expect(s.startsWith(`${TOOL}:burnley-boiler-care:yt-KeRV45ZKiRg:`)).toBe(true);
    expect(cardSource("a", "b", "hook", 2)).toBe(`${TOOL}:a:b:hook:2`);
  });

  it("gives the same card the same marker every run, so a second sync updates", () => {
    expect(built().map((c) => c.source)).toEqual(built().map((c) => c.source));
  });

  it("writes where it came from into the notes, with a Subject line the Record tab reads", () => {
    const notes = cardNotes({ creator: "The Trade Explainer", postUrl: "https://x/1", multiple: 4.5, metric: "views", breakdown: BREAKDOWN, adaptation: ADAPTATION });
    expect(notes.split("\n")[0]).toBe("Subject: State a big risk from a cheap part, then offer the cheap fix.");
    expect(notes).toContain("4.5x their normal views");
    expect(notes).toContain("https://x/1");
  });

  it("files hooks even when no script has been written yet", () => {
    const cards = cardsFor({ agencyId: AGENCY, slug: "s", postId: "p", post: post(), breakdown: null, adaptation: ADAPTATION, script: null, at: AT });
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.stage === "ideas")).toBe(true);
  });

  it("writes nothing when there are no hooks and no script", () => {
    expect(cardsFor({ agencyId: AGENCY, slug: "s", postId: "p", post: post(), breakdown: null, adaptation: null, script: null, at: AT })).toEqual([]);
  });
});

// The layout has to be readable by the dashboard's OWN parser, not by one we wrote to match it.
// This tool lives inside the dashboard repo, so the parser is at src/lib/content/film.ts from the
// repo root. If it is not there, the test says so rather than passing quietly.
const FILM = path.join(__dirname, "..", "..", "..", "src", "lib", "content", "film.ts");
const haveDashboard = existsSync(FILM);

describe("the script card, read back by the dashboard's own Record parser", () => {
  it.skipIf(!haveDashboard)("is parsed into its hook, its words and its ask", async () => {
    const { parseFilmScript, speakingSeconds } = await import(FILM);
    const body = filmScriptBody({
      hook: "That rusted heat exchanger could force a whole new boiler",
      onScreen: "Cheap parts, big bills",
      spoken:
        "That rusted heat exchanger could force a whole new boiler.\nA corroded part can let the whole system fail.\nInsurance calls it wear and tear.\nGive us a callout if you spot the rust.",
      cta: "Give us a callout if you spot the rust.",
      shots: ["rusted heat exchanger on bench", "pressure gauge on combi"],
    });
    const parsed = parseFilmScript({ id: "card-1", title: "A card", platform: "ig", format: "reel", script: body, notes: "Subject: the pattern", source: `${TOOL}:x` });

    expect(parsed.hook).toBe("That rusted heat exchanger could force a whole new boiler");
    expect(parsed.onScreen).toBe("Cheap parts, big bills");
    expect(parsed.cta).toBe("Give us a callout if you spot the rust.");
    expect(parsed.shots).toEqual(["rusted heat exchanger on bench", "pressure gauge on combi"]);
    expect(parsed.subject).toBe("the pattern");
    // The hook opens the spoken script too, and their parser drops that duplicate.
    expect(parsed.beats.join("\n")).not.toContain("That rusted heat exchanger could force");
    expect(parsed.beats.join("\n")).toContain("A corroded part can let the whole system fail.");
    expect(speakingSeconds(parsed.beats)).toBeGreaterThan(0);
  });

  it.skipIf(!haveDashboard)("survives a script written as one paragraph with no line breaks", async () => {
    const { parseFilmScript, toLines } = await import(FILM);
    const body = filmScriptBody({
      hook: "One cheap part can cost you a boiler",
      onScreen: null,
      spoken: "One cheap part can cost you a boiler. A corroded exchanger fails quietly. Give us a callout.",
      cta: "Give us a callout.",
      shots: [],
    });
    const parsed = parseFilmScript({ id: "c", title: "t", platform: "ig", format: "reel", script: body, notes: null, source: null });
    expect(parsed.hook).toBe("One cheap part can cost you a boiler");
    expect(toLines(parsed.beats.join("\n")).length).toBeGreaterThan(1);
  });

  it("says plainly when the dashboard is not next door to check against", () => {
    expect(haveDashboard || "src/lib/content/film.ts is not in this checkout, so the Record parser check was skipped").toBeTruthy();
  });
});

describe("the whole plan for one client", () => {
  const creators: Creator[] = [
    { name: "The Trade Explainer", platform: "youtube", handle: "@TradeExplainer", channel_id: "UCxxxx", added_at: AT.toISOString() },
  ];
  const stored: StoredBreakdown = { post_url: post().url, creator: post().creator, breakdown: BREAKDOWN, model: "groq:x", at: AT.toISOString(), transcript: null };
  const storedScript: StoredScript = {
    post_url: post().url,
    creator: post().creator,
    hook: ADAPTATION.hooks[1].text,
    on_screen: ADAPTATION.on_screen_text,
    script: "line one.\nline two.",
    cta: "Give us a callout.",
    caption: null,
    shot_list: ["a shot"],
    problems: [],
    model: "groq:x",
    at: AT.toISOString(),
  };

  const plan = () =>
    buildPlan({
      agencyId: AGENCY,
      client: CLIENT,
      creators,
      posts: [post(), post({ external_id: "dull", url: "https://x/dull", is_outlier: false, multiple: 1.1 })],
      breakdowns: new Map([[post().url, stored]]),
      hooks: new Map([["yt-KeRV45ZKiRg", { postUrl: post().url, adaptation: ADAPTATION }]]),
      scripts: new Map([["yt-KeRV45ZKiRg", storedScript]]),
      at: AT,
    });

  it("only sends the standouts, not every post read", () => {
    expect(plan().outliers).toHaveLength(1);
    expect(plan().outliers[0].url).toBe(post().url);
  });

  it("sends one roster row per tracked creator", () => {
    expect(plan().creators).toHaveLength(1);
  });

  it("sends the analysis only for standouts that have a breakdown", () => {
    expect(plan().analysed).toHaveLength(1);
    expect(plan().analysed[0].url).toBe(post().url);
  });

  it("sends the hooks and the script as cards", () => {
    const cards = plan().cards;
    expect(cards.filter((c) => c.stage === "ideas")).toHaveLength(3);
    expect(cards.filter((c) => c.stage === "scripted")).toHaveLength(1);
  });

  it("stamps every row with the workspace it is going to", () => {
    const p = plan();
    for (const row of [...p.creators, ...p.outliers, ...p.cards]) expect(row.agency_id).toBe(AGENCY);
  });

  it("is the same plan every time, so a second sync has nothing new to add", () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(plan()));
  });
});

describe("the Brain doc", () => {
  it("names the two docs the same way every time", () => {
    expect(profileDocTitle(CLIENT)).toBe("Client profile: Burnley Boiler Care");
    expect(researchDocTitle(CLIENT)).toBe("Competitor research: Burnley Boiler Care");
  });

  it("writes what was found and what to copy", () => {
    const body = researchDocBody({
      client: CLIENT,
      posts: [post()],
      breakdowns: new Map([[post().url, { post_url: post().url, creator: post().creator, breakdown: BREAKDOWN, model: "x", at: AT.toISOString(), transcript: null }]]),
      at: AT,
    });
    expect(body).toContain("Competitor research for Burnley Boiler Care");
    expect(body).toContain("4.5x their normal");
    expect(body).toContain("What to copy: State a big risk from a cheap part");
  });

  it("says plainly when there were no standouts", () => {
    expect(researchDocBody({ client: CLIENT, posts: [], breakdowns: new Map(), at: AT })).toContain("No standouts in the last scan");
  });
});
