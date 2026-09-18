// Sending the research into the student's own dashboard.
//
// What lands where, all of it in the one workspace the student names:
//   Creators, Roster          the competitors being watched
//   Creators, What it found   the standouts, their numbers, and the analysis where there is one
//   Creators, Run history     what the last scan read and found
//   Board, Ideas              one card per hook
//   Board, Scripted           the script, laid out so the Record tab can film from it
//   Knowledge                 one Brain doc per client
//
// Run it twice and nothing doubles: the roster matches on handle, the standouts on their link, the
// cards on the marker this tool puts on each one.

import { heading, say, type Args } from "../lib/cli";
import { normalizeHandle } from "../lib/sync-map";
import { rankOutliers } from "../lib/report";
import { allBreakdowns, allHooks, allScripts, readCreators, readPosts, readProfile, readRuns, writeProfile } from "../lib/store";
import {
  buildPlan,
  checkWorkspace,
  countToolRows,
  dashboardFromEnv,
  profileDocTitle,
  profileFromBrain,
  removeToolRows,
  researchDocBody,
  researchDocTitle,
  syncCards,
  syncCreators,
  syncOutlierAnalysis,
  syncOutliers,
  syncRun,
  upsertResearchDoc,
} from "../lib/sync";
import type { StoredScript } from "../lib/store";
import type { Adaptation } from "../lib/types";

export async function syncCommand(args: Args): Promise<void> {
  const slug = args.positional[0];
  const workspace = typeof args.flags.workspace === "string" ? args.flags.workspace.trim() : "";
  if (!slug || !workspace) {
    say("Give a client and the workspace to write into:");
    say("  npx tsx research.ts sync clearpath-coaching --workspace 00000000-1111-2222-3333-444444444444");
    say("");
    say("The workspace id is in your dashboard's address bar when that client's workspace is open.");
    say("One workspace per client is the usual setup, and this only ever touches the one you name.");
    return;
  }

  const local = readProfile(slug);
  const db = dashboardFromEnv(workspace);
  const workspaceName = await checkWorkspace(db);
  const creators = readCreators(slug);
  const posts = readPosts(slug);
  const handles = creators.map((c) => normalizeHandle(c.handle ?? c.name));
  const urls = rankOutliers(posts).map((p) => p.url);

  heading(`${args.flags.remove === true ? "Removing" : "Syncing"} ${local.name} in ${workspaceName}`);
  say(`  Workspace ${db.agencyId}`);

  if (args.flags.remove === true) {
    const gone = await removeToolRows(db, local, handles, urls);
    say(`  Roster: ${gone.creators} removed.`);
    say(`  Standouts: ${gone.outliers} removed.`);
    say(`  Board cards: ${gone.cards} removed.`);
    say(`  Run history: ${gone.runs} removed.`);
    say(`  Brain docs: ${gone.docs} removed.`);
    const left = await countToolRows(db, local, handles, urls);
    say("");
    say(`  Left behind: ${left.creators} roster, ${left.outliers} standouts, ${left.cards} cards, ${left.runs} runs, ${left.docs} docs.`);
    return;
  }

  // The Brain is the source of truth for who this client is.
  const fromBrain = await profileFromBrain(db, local);
  const client = fromBrain ?? local;
  if (fromBrain) {
    say(`  Read their profile from the Brain doc "${profileDocTitle(local)}". That is what hooks are written from now.`);
    if (args.flags["pull-profile"] === true) {
      writeProfile(slug, brainProfileMarkdown(fromBrain));
      say("  Copied it back to the local profile file as well, because you asked with --pull-profile.");
    }
  } else {
    say(`  No Brain doc called "${profileDocTitle(local)}" in this workspace, so the local profile file is used.`);
  }

  const breakdowns = new Map(allBreakdowns(slug).map((b) => [b.post_url, b]));
  const hooks = new Map<string, { postUrl: string; adaptation: Adaptation }>(
    allHooks(slug).map(({ postId, stored }) => [postId, { postUrl: stored.post_url, adaptation: stored.adaptation }]),
  );
  const scripts = new Map<string, StoredScript>(
    allScripts(slug)
      .filter((s): s is { postId: string; markdown: string; parts: StoredScript } => s.parts !== null)
      .map((s) => [s.postId, s.parts]),
  );

  const at = new Date();
  const plan = buildPlan({ agencyId: db.agencyId, client, creators, posts, breakdowns, hooks, scripts, at });

  const roster = await syncCreators(db, plan.creators);
  say(`  Roster: ${roster.inserted} added, ${roster.updated} updated.`);

  const found = await syncOutliers(db, plan.outliers);
  for (const { url, breakdown } of plan.analysed) await syncOutlierAnalysis(db, url, breakdown);
  say(`  What it found: ${found} standout${found === 1 ? "" : "s"}, ${plan.analysed.length} with a breakdown attached.`);

  const cards = await syncCards(db, plan.cards);
  const ideas = plan.cards.filter((c) => c.stage === "ideas").length;
  const scripted = plan.cards.filter((c) => c.stage === "scripted").length;
  say(`  Board: ${cards.inserted} added, ${cards.updated} updated (${ideas} in Ideas, ${scripted} in Scripted).`);

  const lastScan = readRuns(slug).filter((r) => r.command === "scan").at(-1);
  if (lastScan) {
    const written = await syncRun(db, client.slug, {
      scanAt: lastScan.at,
      creatorsRead: new Set(posts.map((p) => p.creator)).size,
      creatorsSkipped: Math.max(0, creators.length - new Set(posts.map((p) => p.creator)).size),
      outliersFound: plan.outliers.length,
      outliersAnalysed: plan.analysed.length,
      scriptsWritten: scripted,
      costUsd: lastScan.apify_usd,
    });
    say(written ? "  Run history: the last scan added." : "  Run history: that scan is already on record.");
  }

  const doc = await upsertResearchDoc(db, client, researchDocBody({ client, posts, breakdowns, at }));
  say(`  Knowledge: ${doc.created ? "created" : "updated"} "${researchDocTitle(client)}".`);

  say("");
  say("  In your dashboard, on the Content page:");
  say("    Creators, Roster          who is being watched");
  say("    Creators, What it found   the standouts and why they worked");
  say("    Creators, Run history     what the last scan read");
  say("    Board, Ideas              one card per hook");
  say("    Board, Scripted           the script, and Record films from it");
  say("    Knowledge                 the write up");
}

/** The Brain's version of a profile written back as the local markdown file. */
function brainProfileMarkdown(p: ReturnType<typeof readProfile>): string {
  return [
    `# ${p.name}`,
    "",
    "Pulled from the workspace Brain. Edit it there, not here.",
    "",
    "## Who they help",
    p.who_they_help || "(not filled in)",
    "",
    "## What they sell",
    p.what_they_sell || "(not filled in)",
    "",
    "## What they can show on camera",
    p.proof || "(not filled in)",
    "",
    "## How they talk",
    p.how_they_talk || "(not filled in)",
    "",
    "## Phrases to avoid",
    p.avoid.length ? p.avoid.map((a) => `- ${a}`).join("\n") : "(none)",
    "",
  ].join("\n");
}
