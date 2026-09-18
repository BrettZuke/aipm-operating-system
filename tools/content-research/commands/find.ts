// Finding creators in a niche, through YouTube search.
//
// This is the one command with a tight daily allowance: YouTube gives about 100 searches a day for
// the whole key, so it is worth thinking about the search before running it. Instagram has no free
// search at all, which is why this is YouTube only. Most creators worth copying are on both, and the
// channel description often says where.

import { ask, heading, say, type Args } from "../lib/cli";
import { requireKey } from "../lib/env";
import { readCreators, readProfile, writeCreators } from "../lib/store";
import { instagramGuess, searchVideos, type SearchChannel } from "../lib/youtube";
import type { Creator, PostInput } from "../lib/types";

export interface Found {
  channel: SearchChannel;
  matchedVideos: number;
  matchedViews: number;
  best: { title: string; views: number | null; url: string } | null;
  instagram: string | null;
  tracked: boolean;
}

/** Group the search results by channel and rank them by the views they got for this search. */
export function rankChannels(videos: PostInput[], channels: SearchChannel[], tracked: Set<string>): Found[] {
  const byChannel = new Map<string, PostInput[]>();
  for (const v of videos) {
    if (!v.owner) continue;
    const list = byChannel.get(v.owner) ?? [];
    list.push(v);
    byChannel.set(v.owner, list);
  }
  const out: Found[] = [];
  for (const channel of channels) {
    const theirs = byChannel.get(channel.channelId) ?? [];
    if (theirs.length === 0) continue;
    const best = [...theirs].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
    out.push({
      channel,
      matchedVideos: theirs.length,
      matchedViews: theirs.reduce((sum, v) => sum + (v.views ?? 0), 0),
      best: best ? { title: best.caption ?? "Untitled", views: best.views, url: best.url } : null,
      instagram: instagramGuess(channel.description),
      tracked: tracked.has(channel.channelId),
    });
  }
  return out.sort((a, b) => b.matchedViews - a.matchedViews).slice(0, 20);
}

export async function findCommand(args: Args): Promise<void> {
  const [slug, ...rest] = args.positional;
  const niche = rest.join(" ").trim();
  if (!slug || !niche) {
    say("Give a client and what their customers would search for:");
    say('  npx tsx research.ts find clearpath-coaching "how to get coaching clients"');
    return;
  }
  requireKey("YOUTUBE_API_KEY");
  const client = readProfile(slug);
  const creators = readCreators(slug);
  const tracked = new Set(creators.map((c) => c.channel_id).filter((id): id is string => !!id));

  say(`Searching YouTube for "${niche}". This uses one of about 100 free searches you get a day.`);
  const { videos, channels } = await searchVideos(niche);
  if (videos.length === 0) {
    say("");
    say("Nothing came back. Try plainer words, the ones a customer would actually type.");
    return;
  }
  const found = rankChannels(videos, channels, tracked);

  heading(`${found.length} creators making the most watched "${niche}" videos of the last year`);
  found.forEach((f, i) => {
    const subs = f.channel.subscribers === null ? "subscribers hidden" : `${f.channel.subscribers.toLocaleString("en-US")} subscribers`;
    say("");
    say(`${String(i + 1).padStart(2)}. ${f.channel.title}${f.tracked ? "  (already tracked)" : ""}`);
    say(`    ${subs}, ${f.matchedVideos} video${f.matchedVideos === 1 ? "" : "s"} in this search with ${f.matchedViews.toLocaleString("en-US")} views between them`);
    if (f.best) say(`    Best: "${f.best.title.slice(0, 70)}" (${(f.best.views ?? 0).toLocaleString("en-US")} views)`);
    if (f.channel.handle) say(`    ${f.channel.handle}`);
    if (f.instagram) say(`    Their description mentions instagram.com/${f.instagram} (their words, worth checking)`);
  });

  const picks = typeof args.flags.add === "string" ? args.flags.add : await ask("\nTrack which ones? Numbers separated by commas, or enter to skip: ");
  if (!picks) {
    say("");
    say(`Nothing tracked. When you decide: npx tsx research.ts track ${slug} @TheirHandle`);
    return;
  }
  const chosen = picks
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= found.length)
    .map((n) => found[n - 1]);

  const added: string[] = [];
  for (const f of chosen) {
    if (f.tracked) continue;
    const creator: Creator = {
      name: f.channel.title,
      platform: "youtube",
      handle: f.channel.handle,
      channel_id: f.channel.channelId,
      added_at: new Date().toISOString(),
    };
    creators.push(creator);
    added.push(f.channel.title);
  }
  writeCreators(slug, creators);
  say("");
  if (added.length === 0) {
    say("Nothing new to track.");
  } else {
    say(`Now watching ${added.join(", ")} for ${client.name}.`);
    say(`Next: npx tsx research.ts scan ${slug}`);
  }
}
