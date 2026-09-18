import { describe, expect, it } from "vitest";
import {
  instagramGuess,
  isFresh,
  markTrackedInstagram,
  markTrackedYoutube,
  normaliseQuery,
  pacificDayStart,
  parseRelatedProfiles,
  rankYoutubeCreators,
  SEARCH_FRESH_MS,
  YOUTUBE_RESULTS,
  YOUTUBE_SEARCHES_PER_DAY,
} from "./search";
import type { PostInput } from "./types";
import type { SearchChannel } from "./youtube";

describe("remembering a search", () => {
  it("keys on the words, however they were typed", () => {
    expect(normaliseQuery("  Boiler   REPAIR  ")).toBe("boiler repair");
    expect(normaliseQuery("x".repeat(200)).length).toBe(100);
  });

  it("reuses an answer for a day, and never one dated in the future", () => {
    const now = Date.now();
    expect(isFresh(new Date(now - 1_000).toISOString(), now)).toBe(true);
    expect(isFresh(new Date(now - SEARCH_FRESH_MS - 1_000).toISOString(), now)).toBe(false);
    expect(isFresh(new Date(now + 10 * 60_000).toISOString(), now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });

  it("stops short of the allowance the key actually has", () => {
    expect(YOUTUBE_SEARCHES_PER_DAY).toBeLessThan(100);
  });
});

describe("when YouTube's own allowance resets", () => {
  it("counts from midnight Pacific, in summer and in winter", () => {
    expect(pacificDayStart(new Date("2026-09-17T12:00:00Z"))).toBe("2026-09-17T07:00:00.000Z");
    expect(pacificDayStart(new Date("2026-01-17T12:00:00Z"))).toBe("2026-01-17T08:00:00.000Z");
  });
});

describe("an Instagram handle named in a channel description", () => {
  it("finds one and ignores Instagram's own paths", () => {
    expect(instagramGuess("Follow at https://instagram.com/Some.Creator for more")).toBe("some.creator");
    expect(instagramGuess("IG: @thehandle")).toBe("thehandle");
    expect(instagramGuess("See https://instagram.com/p/ABC123/")).toBeNull();
    expect(instagramGuess("No socials here")).toBeNull();
    expect(instagramGuess(null)).toBeNull();
  });
});

const video = (channelId: string, views: number, id: string): PostInput => ({
  platform: "youtube",
  external_id: id,
  url: `https://www.youtube.com/watch?v=${id}`,
  kind: "short",
  posted_at: "2026-09-01T00:00:00Z",
  caption: `Video ${id}`,
  description: null,
  duration_s: 40,
  views,
  likes: null,
  comments: null,
  thumb_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  display_url: null,
  media_url: null,
  audio_url: null,
  image_urls: null,
  media_expires_at: null,
  owner: channelId,
  source: null,
});

const channel = (channelId: string, over: Partial<SearchChannel> = {}): SearchChannel => ({
  channelId,
  title: `Channel ${channelId}`,
  handle: `@${channelId.toLowerCase()}`,
  avatar: null,
  subscribers: 1_000,
  videoCount: 50,
  description: null,
  ...over,
});

describe("ranking the channels behind a search", () => {
  it("puts the channel whose matching videos got the most views first", () => {
    const videos = [video("UCa", 100, "v1"), video("UCa", 900, "v2"), video("UCb", 500, "v3")];
    const ranked = rankYoutubeCreators(videos, [channel("UCa"), channel("UCb")]);
    expect(ranked.map((r) => r.channelId)).toEqual(["UCa", "UCb"]);
    expect(ranked[0].matchedVideos).toBe(2);
    expect(ranked[0].matchedViews).toBe(1_000);
    expect(ranked[0].bestVideo.views).toBe(900);
  });

  it("leaves out a channel none of whose videos matched", () => {
    expect(rankYoutubeCreators([video("UCa", 10, "v1")], [channel("UCa"), channel("UCz")])).toHaveLength(1);
  });

  it("returns at most a screenful", () => {
    const videos = Array.from({ length: 40 }, (_, i) => video(`UC${i}`, i, `v${i}`));
    const channels = Array.from({ length: 40 }, (_, i) => channel(`UC${i}`));
    expect(rankYoutubeCreators(videos, channels)).toHaveLength(YOUTUBE_RESULTS);
  });

  it("marks the ones already on the roster, by channel id or by handle", () => {
    const ranked = rankYoutubeCreators([video("UCa", 10, "v1")], [channel("UCa")]);
    expect(markTrackedYoutube(ranked, [{ youtube: null, youtube_channel_id: "UCa" }])[0].tracked).toBe(true);
    expect(markTrackedYoutube(ranked, [{ youtube: "@UCa", youtube_channel_id: null }])[0].tracked).toBe(true);
    expect(markTrackedYoutube(ranked, [{ youtube: "@somebodyelse", youtube_channel_id: null }])[0].tracked).toBe(false);
    expect(markTrackedYoutube(ranked, [{ youtube: null, youtube_channel_id: "UCb" }])[0].tracked).toBe(false);
    expect(markTrackedYoutube(ranked, [])[0].tracked).toBe(false);
  });
});

describe("Instagram's own similar accounts", () => {
  it("reads both spellings of the fields, and drops the account you asked about", () => {
    const items = [
      {
        relatedProfiles: [
          { username: "OtherOne", full_name: "Other One", is_verified: true, profile_pic_url: "https://scontent.cdninstagram.com/a.jpg" },
          { username: "secondone", fullName: "Second One", verified: false, profilePicUrl: "http://insecure.example.com/b.jpg" },
          { username: "someplumber" },
          { username: "otherone" },
        ],
      },
    ];
    const related = parseRelatedProfiles(items, "someplumber");
    expect(related.map((r) => r.username)).toEqual(["otherone", "secondone"]);
    expect(related[0].verified).toBe(true);
    expect(related[1].avatar).toBeNull();
  });

  it("gives nothing back when the profile could not be read", () => {
    expect(parseRelatedProfiles([{ error: "not found" }], "x")).toEqual([]);
    expect(parseRelatedProfiles([], "x")).toEqual([]);
  });

  it("marks the ones already on the roster", () => {
    const related = parseRelatedProfiles([{ relatedProfiles: [{ username: "otherone" }] }], "x");
    expect(markTrackedInstagram(related, [{ instagram: "OtherOne", handle: "otherone" }])[0].tracked).toBe(true);
    expect(markTrackedInstagram(related, [{ instagram: null, handle: "someoneelse" }])[0].tracked).toBe(false);
  });
});
