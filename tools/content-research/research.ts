#!/usr/bin/env -S npx tsx
// Content research: find the posts that beat their own creator's normal, work out why, and turn the
// pattern into hooks and scripts in your client's voice.
//
// Everything runs from here: npx tsx research.ts <command>
// Nothing here spends money except "scan", and that one says what it will cost before it does.

import { parseArgs, say } from "./lib/cli";
import { loadEnv, MissingKey } from "./lib/env";
import { DailyQuotaSpent } from "./lib/llm";
import { ApifyError } from "./lib/apify";
import { DashboardError, DashboardNotConfigured } from "./lib/sync";
import { YoutubeQuotaError } from "./lib/youtube";
import { setupCommand } from "./commands/setup";
import { clientCommand } from "./commands/client";
import { trackCommand } from "./commands/track";
import { findCommand } from "./commands/find";
import { scanCommand } from "./commands/scan";
import { reportCommand } from "./commands/report";
import { breakdownCommand } from "./commands/breakdown";
import { hooksCommand } from "./commands/hooks";
import { scriptCommand } from "./commands/script";
import { scoreCommand } from "./commands/score";
import { syncCommand } from "./commands/sync";

const HELP = `Content research, for one client at a time.

  npx tsx research.ts setup
      Which keys you have, which you are missing, and where to get each one.

  npx tsx research.ts client add "Their Business Name"
  npx tsx research.ts client show [name]
      Make a client, or see what the tool knows about one. The profile is where every fact in
      every hook comes from, so fill it in properly.

  npx tsx research.ts track <client> <handle...>
      Watch an Instagram handle, a YouTube @handle, or a channel link.

  npx tsx research.ts find <client> "what their customers search for"
      Find creators in that niche through YouTube, and offer to track them.

  npx tsx research.ts scan <client> [--posts 15] [--yes]
      Read everybody's recent posts and work out which ones beat their own normal.
      Says what it will cost first. This is the only command that spends anything.

  npx tsx research.ts report <client> [--print]
      The standouts, ranked, with the numbers and anything broken down so far.

  npx tsx research.ts breakdown <client> <number|link> [--again]
      Watch that one and say exactly why it worked.

  npx tsx research.ts hooks <client> <number|link> [--again]
      Six hooks in your client's voice, built on that video's mechanism.

  npx tsx research.ts script <client> <number|link> [--hook "..."]
      The full script from the chosen hook, with the invention guards on.

  npx tsx research.ts score <client> <file.md>
  npx tsx research.ts score <client> --text "the whole script"
      Score a draft out of 100, part by part, with the exact lines to fix.

  npx tsx research.ts sync <client> --workspace <workspace id>
      Send it all into your own dashboard: the competitors onto the Roster, the standouts onto
      What it found, the last scan onto Run history, each hook onto the Board as an idea, and the
      script onto the Board ready for the Record tab to film from. Plus one Brain doc.
      Add --remove to take it all back out.

Read START-HERE.md if this is your first time.`;

type Command = (args: ReturnType<typeof parseArgs>) => Promise<void>;

const COMMANDS: Record<string, Command> = {
  setup: setupCommand,
  client: clientCommand,
  track: trackCommand,
  find: findCommand,
  scan: scanCommand,
  report: reportCommand,
  breakdown: breakdownCommand,
  hooks: hooksCommand,
  script: scriptCommand,
  score: scoreCommand,
  sync: syncCommand,
};

async function main(): Promise<void> {
  loadEnv();
  const [name, ...rest] = process.argv.slice(2);
  if (!name || name === "help" || name === "--help" || name === "-h") {
    say(HELP);
    return;
  }
  const command = COMMANDS[name];
  if (!command) {
    say(`There is no command called "${name}".`);
    say("");
    say(HELP);
    process.exitCode = 1;
    return;
  }
  await command(parseArgs(rest));
}

main().catch((e: unknown) => {
  process.exitCode = 1;
  say("");
  if (e instanceof MissingKey || e instanceof DashboardNotConfigured) {
    say(e.message);
    return;
  }
  if (e instanceof DailyQuotaSpent) {
    say("Today's free AI allowance is spent, so this cannot finish right now.");
    say("It resets in a day. Add a second free key to keep going sooner: see README.md.");
    return;
  }
  if (e instanceof YoutubeQuotaError || e instanceof ApifyError || e instanceof DashboardError) {
    say(e.message);
    return;
  }
  say(`It stopped: ${e instanceof Error ? e.message : String(e)}`);
  if (process.env.RESEARCH_DEBUG && e instanceof Error && e.stack) say(e.stack);
  say("");
  say("If that is not clear, run the same command again with RESEARCH_DEBUG=1 in front of it and send the output.");
});
