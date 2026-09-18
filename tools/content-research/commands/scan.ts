// Reading everybody's recent posts and working out which ones beat their own normal.
//
// This is the only command that can spend money, so it says what it will cost before it spends
// anything, refuses anything over a dollar unless you say --yes, and puts a hard cap on the Apify run
// itself so even a run that goes wrong cannot go past it.

import { computeBaselines, type BaselinePost } from "../lib/baseline";
import { datasetItems, estimateScanUsd, getRun, IG_RESULT_USD, isTerminalRunStatus, scanChargeCap, startRun } from "../lib/apify";
import { confirm, heading, logRun, money, say, type Args } from "../lib/cli";
import { requireKey } from "../lib/env";
import { normalizeInstagramItems, profileUrl } from "../lib/instagram";
import { buildReport, type CreatorGroup } from "../lib/report";
import { mergePosts, readCreators, readPosts, readProfile, writeCreators, writeGroups, writePosts, writeReport, allBreakdowns, type GroupRecord } from "../lib/store";
import type { Creator, PostInput, ScoredPost } from "../lib/types";
import { listUploads, resolveChannel, videoDetails, YoutubeQuotaError } from "../lib/youtube";

/** Anything over this needs --yes. A dollar is roughly 370 Instagram posts. */
export const SPEND_GATE_USD = 1.0;
const DEFAULT_POSTS = 15;
const MAX_POSTS = 60;
const RUN_TIMEOUT_SECS = 600;
const POLL_MS = 5_000;

export async function scanCommand(args: Args): Promise<void> {
  const slug = args.positional[0];
  if (!slug) {
    say("Give a client: npx tsx research.ts scan clearpath-coaching");
    return;
  }
  const client = readProfile(slug);
  const creators = readCreators(slug);
  if (creators.length === 0) {
    say(`Nothing is being watched for ${client.name} yet.`);
    say(`  npx tsx research.ts track ${slug} <handle>`);
    say(`  npx tsx research.ts find ${slug} "what their customers search for"`);
    return;
  }

  const requested = Number(args.flags.posts ?? DEFAULT_POSTS);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_POSTS, Math.round(requested))) : DEFAULT_POSTS;
  const instagram = creators.filter((c) => c.platform === "instagram");
  const youtube = creators.filter((c) => c.platform === "youtube");

  const estimate = estimateScanUsd(instagram.length, limit);
  const cap = scanChargeCap(instagram.length, limit);

  heading(`Scanning for ${client.name}`);
  say(`  ${instagram.length} Instagram account${instagram.length === 1 ? "" : "s"}, ${youtube.length} YouTube channel${youtube.length === 1 ? "" : "s"}, up to ${limit} recent posts each.`);
  say("");
  if (instagram.length > 0) {
    say(`  Instagram will cost about ${money(estimate)} (${instagram.length} x ${limit} posts at ${IG_RESULT_USD} each).`);
    say(`  The run carries a hard cap of ${money(cap)}, which Apify enforces. It cannot spend more than that.`);
  } else {
    say("  No Instagram accounts, so this scan spends nothing.");
  }
  say("  YouTube is free.");
  say("");

  if (estimate > SPEND_GATE_USD && args.flags.yes !== true) {
    say(`That is over ${money(SPEND_GATE_USD)}, so it will not run without you saying so.`);
    say(`Run it again with --yes, or use --posts to read fewer posts each.`);
    return;
  }
  if (instagram.length > 0 && args.flags.yes !== true && process.stdin.isTTY) {
    if (!(await confirm("Go ahead?"))) {
      say("Stopped. Nothing was spent.");
      return;
    }
  }

  const collected: { creator: Creator; posts: PostInput[] }[] = [];
  let apifyUsd = 0;
  const notes: string[] = [];

  if (instagram.length > 0) {
    requireKey("APIFY_API_TOKEN");
    const result = await scanInstagram(instagram, limit, cap);
    apifyUsd = result.costUsd;
    for (const c of instagram) {
      const handle = (c.handle ?? c.name).toLowerCase();
      const theirs = result.posts.filter((p) => (p.source ?? p.owner ?? "").toLowerCase() === handle);
      if (theirs.length === 0) notes.push(`Instagram returned nothing for ${handle}. That account may be private, renamed, or have no recent posts.`);
      collected.push({ creator: c, posts: theirs });
    }
  }

  if (youtube.length > 0) {
    requireKey("YOUTUBE_API_KEY");
    for (const c of youtube) {
      try {
        let channelId = c.channel_id;
        if (!channelId) {
          const resolved = await resolveChannel({ handle: c.handle ?? c.name });
          channelId = resolved?.channelId ?? null;
          if (channelId) {
            c.channel_id = channelId;
            writeCreators(slug, creators);
          }
        }
        if (!channelId) {
          notes.push(`Could not find the YouTube channel for ${c.name}.`);
          collected.push({ creator: c, posts: [] });
          continue;
        }
        say(`  Reading ${c.name} on YouTube`);
        const ids = await listUploads(channelId, limit);
        const posts = await videoDetails(ids);
        say(`    ${posts.length} videos`);
        collected.push({ creator: c, posts });
      } catch (e) {
        if (e instanceof YoutubeQuotaError) {
          notes.push(e.message);
          collected.push({ creator: c, posts: [] });
          break;
        }
        throw e;
      }
    }
  }

  // Each creator is judged against their OWN normal, so the maths runs once per creator.
  const scored: ScoredPost[] = [];
  const groups: CreatorGroup[] = [];
  const now = new Date();
  for (const { creator, posts } of collected) {
    if (posts.length === 0) continue;
    const basis: BaselinePost[] = posts.map((p) => ({
      id: p.external_id,
      platform: p.platform,
      kind: p.kind,
      posted_at: p.posted_at,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
    }));
    const result = computeBaselines(basis, { minScore: null, now });
    const byId = new Map(result.metrics.map((m) => [m.id, m]));
    for (const p of posts) {
      const m = byId.get(p.external_id);
      scored.push({
        ...p,
        creator: creator.name,
        metric: m?.metric ?? null,
        score: m?.score ?? null,
        baseline: m?.baseline ?? null,
        multiple: m?.multiple ?? null,
        strength: m?.strength ?? null,
        is_outlier: m?.is_outlier ?? false,
      });
    }
    groups.push(...result.groups.map((g) => ({ ...g, creator: creator.name })));
  }

  const merged = mergePosts(readPosts(slug), scored);
  writePosts(slug, merged);
  writeGroups(slug, groups as unknown as GroupRecord[]);
  logRun(slug, "scan", apifyUsd, [], notes.length ? notes.join(" ") : null);

  const outliers = scored.filter((p) => p.is_outlier);
  heading("What came back");
  say(`  ${scored.length} posts read, ${outliers.length} of them beat their own creator's normal by 2x or more.`);
  if (apifyUsd > 0) say(`  Apify charged ${money(apifyUsd)} for this run.`);
  for (const g of groups) {
    const who = g.group === "short" ? "Shorts" : g.group === "video" ? "long videos" : g.group === "youtube" ? "YouTube" : "Instagram";
    say(g.skipped ? `  ${g.creator}, ${who}: no normal yet. ${g.skipped}.` : `  ${g.creator}, ${who}: normal is ${Math.round(g.baseline ?? 0).toLocaleString("en-US")} ${g.metric}, from ${g.basis} settled posts.`);
  }
  if (notes.length) {
    say("");
    say("Worth knowing:");
    for (const nt of notes) say(`  ${nt}`);
  }

  const breakdowns = new Map(allBreakdowns(slug).map((b) => [b.post_url, b]));
  const file = writeReport(slug, buildReport({ client, posts: merged, groups, breakdowns, scannedAt: now, apifyUsd }));
  say("");
  say(`Report written to ${file}`);
  {
    say("");
    say("Next:");
    say(`  npx tsx research.ts report ${slug}              read it`);
    say(`  npx tsx research.ts breakdown ${slug} 1         find out why the top one worked`);
  }
}

interface InstagramScan {
  posts: PostInput[];
  costUsd: number;
}

async function scanInstagram(creators: Creator[], limit: number, cap: number): Promise<InstagramScan> {
  const directUrls = creators.map((c) => profileUrl(c.handle ?? c.name));
  say(`  Asking Apify for the last ${limit} posts from ${directUrls.length} Instagram account${directUrls.length === 1 ? "" : "s"}`);
  const { runId, tokenIndex } = await startRun(
    "apify~instagram-scraper",
    { directUrls, resultsType: "posts", resultsLimit: limit },
    { maxTotalChargeUsd: cap, timeoutSecs: RUN_TIMEOUT_SECS },
  );
  say(`  Run ${runId} started. This usually takes a minute or two.`);

  const deadline = Date.now() + RUN_TIMEOUT_SECS * 1000;
  let run = (await getRun(runId, tokenIndex)).run;
  let lastStatus = "";
  while (!isTerminalRunStatus(run.status)) {
    if (Date.now() > deadline) throw new Error(`The Apify run has been going for ${RUN_TIMEOUT_SECS / 60} minutes. Check it at https://console.apify.com/actors/runs/${runId}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    run = (await getRun(runId, tokenIndex)).run;
    if (run.status !== lastStatus) {
      say(`    ${run.status.toLowerCase()}`);
      lastStatus = run.status;
    }
  }
  const costUsd = run.costUsd ?? run.usageTotalUsd ?? 0;
  if (run.status !== "SUCCEEDED") {
    const why = run.statusMessage ? `: ${run.statusMessage}` : "";
    if (!run.defaultDatasetId) throw new Error(`The Instagram scrape ended as ${run.status}${why}. Nothing was collected. Charged ${money(costUsd)}.`);
    say(`  The run ended as ${run.status}${why}. Reading whatever it did collect.`);
  }
  if (!run.defaultDatasetId) return { posts: [], costUsd };
  const items = await datasetItems(run.defaultDatasetId, tokenIndex);
  const posts = normalizeInstagramItems(items);
  say(`  ${posts.length} Instagram posts read from ${items.length} rows.`);
  return { posts, costUsd };
}
