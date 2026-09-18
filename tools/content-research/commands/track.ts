// Adding the accounts you want to watch for a client.
//
// An Instagram handle is taken as written. A YouTube handle or channel link is checked against
// YouTube straight away, so a typo is caught here instead of half way through a scan.

import { heading, say, type Args } from "../lib/cli";
import { requireKey } from "../lib/env";
import { readCreators, readProfile, writeCreators } from "../lib/store";
import { parseChannelRef, resolveChannel } from "../lib/youtube";
import type { Creator } from "../lib/types";

/** Work out from what the student typed whether this is Instagram or YouTube. */
export function classifyHandle(raw: string): { platform: "instagram" | "youtube"; value: string } | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  if (/youtube\.com|youtu\.be/i.test(input)) return { platform: "youtube", value: input };
  if (/instagram\.com/i.test(input)) {
    const m = input.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
    return m ? { platform: "instagram", value: m[1].toLowerCase() } : null;
  }
  if (input.startsWith("@")) return { platform: "youtube", value: input };
  if (/^UC[A-Za-z0-9_-]{22}$/.test(input)) return { platform: "youtube", value: input };
  if (/^[A-Za-z0-9._]{1,30}$/.test(input)) return { platform: "instagram", value: input.toLowerCase() };
  return null;
}

export async function trackCommand(args: Args): Promise<void> {
  const [slug, ...handles] = args.positional;
  if (!slug || handles.length === 0) {
    say("Give a client and at least one account to watch:");
    say("  npx tsx research.ts track clearpath-coaching somecoachhandle");
    say("  npx tsx research.ts track clearpath-coaching @SomeChannel https://www.youtube.com/@Another");
    return;
  }
  const client = readProfile(slug);
  const creators = readCreators(slug);
  const added: Creator[] = [];
  const skipped: string[] = [];

  for (const raw of handles) {
    const parsed = classifyHandle(raw);
    if (!parsed) {
      skipped.push(`${raw}: that is not an Instagram handle, a YouTube @handle or a channel link`);
      continue;
    }
    if (parsed.platform === "instagram") {
      const handle = parsed.value;
      if (creators.some((c) => c.platform === "instagram" && c.handle === handle)) {
        skipped.push(`${handle}: already being watched`);
        continue;
      }
      const creator: Creator = { name: handle, platform: "instagram", handle, channel_id: null, added_at: new Date().toISOString() };
      creators.push(creator);
      added.push(creator);
      continue;
    }

    requireKey("YOUTUBE_API_KEY");
    if (!parseChannelRef({ handle: parsed.value })) {
      skipped.push(`${raw}: that does not look like a YouTube channel`);
      continue;
    }
    const channel = await resolveChannel({ handle: parsed.value });
    if (!channel) {
      skipped.push(`${raw}: YouTube has no channel with that handle. Open the channel page and copy the @handle from the address bar.`);
      continue;
    }
    if (creators.some((c) => c.platform === "youtube" && c.channel_id === channel.channelId)) {
      skipped.push(`${channel.title}: already being watched`);
      continue;
    }
    const creator: Creator = {
      name: channel.title,
      platform: "youtube",
      handle: channel.handle,
      channel_id: channel.channelId,
      added_at: new Date().toISOString(),
    };
    creators.push(creator);
    added.push(creator);
  }

  writeCreators(slug, creators);

  heading(`${client.name} is now watching ${creators.length} account${creators.length === 1 ? "" : "s"}`);
  for (const c of creators) say(`  ${c.platform === "youtube" ? "YouTube " : "Instagram"}  ${c.name}${c.handle && c.name !== c.handle ? ` (${c.handle})` : ""}`);
  if (skipped.length) {
    say("");
    say("Not added:");
    for (const s of skipped) say(`  ${s}`);
  }
  if (added.length) {
    say("");
    say(`Next: npx tsx research.ts scan ${slug}`);
  }
}
