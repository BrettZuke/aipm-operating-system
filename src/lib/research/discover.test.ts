import { describe, expect, it } from "vitest";
import { matchRosterRow, trackIdentity, YOUTUBE_REFRESH_AFTER_MS, youtubeChannelChanged, youtubeRefreshDue, type RosterRow } from "./discover";
import { ResearchUserError } from "./errors";

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  id: "r1",
  handle: "someplumber",
  instagram: "someplumber",
  youtube: null,
  youtube_channel_id: null,
  role: "emulate",
  last_scraped_at: null,
  ...over,
});

describe("turning what was typed into roster values", () => {
  it("reduces an Instagram handle however it was pasted", () => {
    expect(trackIdentity({ instagram: "@SomePlumber" })).toMatchObject({ handle: "someplumber", instagram: "someplumber" });
    expect(trackIdentity({ instagram: "https://www.instagram.com/SomePlumber/" }).instagram).toBe("someplumber");
  });

  it("keeps YouTube in the at-handle form the roster already uses", () => {
    expect(trackIdentity({ youtube: "@SomeChannel" })).toMatchObject({ handle: "somechannel", youtube: "@SomeChannel" });
    const byId = trackIdentity({ youtubeChannelId: `UC${"a".repeat(22)}` });
    expect(byId.channelId).toBe(`UC${"a".repeat(22)}`);
  });

  it("refuses in plain words rather than saving something wrong", () => {
    expect(() => trackIdentity({})).toThrow(ResearchUserError);
    expect(() => trackIdentity({ instagram: "not a handle!" })).toThrow(ResearchUserError);
    expect(() => trackIdentity({ youtubeChannelId: "nonsense" })).toThrow(ResearchUserError);
  });
});

describe("finding the row a creator already has", () => {
  it("matches on the channel id first, then Instagram, then the handle ignoring case", () => {
    const rows = [row({ id: "byChannel", handle: "other", instagram: null, youtube_channel_id: "UCabc" }), row({ id: "byInstagram" }), row({ id: "byHandle", handle: "SomeOne", instagram: null })];
    expect(matchRosterRow(rows, { handle: "x", instagram: null, channelId: "UCabc" })?.id).toBe("byChannel");
    expect(matchRosterRow(rows, { handle: "x", instagram: "someplumber", channelId: null })?.id).toBe("byInstagram");
    expect(matchRosterRow(rows, { handle: "someone", instagram: null, channelId: null })?.id).toBe("byHandle");
    expect(matchRosterRow(rows, { handle: "nobody", instagram: null, channelId: null })).toBeNull();
  });
});

describe("when a YouTube channel has really changed", () => {
  it("trusts a channel id over a handle", () => {
    expect(youtubeChannelChanged({ youtube: "@old", youtube_channel_id: "UCa" }, { youtube: "@old", channelId: "UCb" })).toBe(true);
    expect(youtubeChannelChanged({ youtube: "@old", youtube_channel_id: "UCa" }, { youtube: "@new", channelId: "UCa" })).toBe(false);
    expect(youtubeChannelChanged({ youtube: "@old", youtube_channel_id: null }, { youtube: "@OLD", channelId: null })).toBe(false);
    expect(youtubeChannelChanged({ youtube: "@old", youtube_channel_id: null }, { youtube: "@new", channelId: null })).toBe(true);
    expect(youtubeChannelChanged({ youtube: "@old", youtube_channel_id: null }, { youtube: null, channelId: null })).toBe(false);
  });
});

describe("whether to read their YouTube again", () => {
  it("always reads a new creator or a changed channel", () => {
    expect(youtubeRefreshDue(null, false, Date.now())).toBe(true);
    expect(youtubeRefreshDue({ last_scraped_at: new Date().toISOString() }, true, Date.now())).toBe(true);
  });

  it("leaves a channel alone that was read a moment ago", () => {
    const now = Date.now();
    expect(youtubeRefreshDue({ last_scraped_at: new Date(now - 60_000).toISOString() }, false, now)).toBe(false);
    expect(youtubeRefreshDue({ last_scraped_at: new Date(now - YOUTUBE_REFRESH_AFTER_MS - 1_000).toISOString() }, false, now)).toBe(true);
    expect(youtubeRefreshDue({ last_scraped_at: "not a date" }, false, now)).toBe(true);
  });
});
