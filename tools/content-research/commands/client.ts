// Adding a client, and showing what the tool knows about them.
//
// The profile is where every fact in every hook comes from. It is a plain markdown file you can open
// and edit at any time, and the more of it the client fills in, the less the tool has to leave blank.

import { existsSync } from "node:fs";
import { ask, heading, say, type Args } from "../lib/cli";
import { profileIsThin } from "../lib/adaptation";
import { blankProfile, clientExists, listClients, profilePath, readProfile, toSlug, writeProfile, readCreators, readPosts, totalApifyUsd } from "../lib/store";

const QUESTIONS: { heading: string; prompt: string }[] = [
  { heading: "Who they help", prompt: "Who exactly is their customer? (the more specific the better)\n> " },
  { heading: "What they sell", prompt: "What do they actually sell, and what makes them the obvious choice?\n> " },
  { heading: "What they can show on camera", prompt: "What can they point a phone at? Jobs, van, workshop, before and after, the thing that goes wrong.\n> " },
  { heading: "How they talk", prompt: "How does the owner actually speak? Paste a real sentence or two if you have one.\n> " },
  { heading: "Phrases to avoid", prompt: "Anything they hate hearing, or cannot back up? (one per line is fine, or leave blank)\n> " },
];

export async function clientCommand(args: Args): Promise<void> {
  const action = args.positional[0];
  if (action === "add") return addClient(args);
  if (action === "show") return showClient(args);
  say("Use one of these:");
  say('  npx tsx research.ts client add "Their Business Name"');
  say("  npx tsx research.ts client show [name]");
}

async function addClient(args: Args): Promise<void> {
  const name = args.positional.slice(1).join(" ").trim();
  if (!name) {
    say('Give the business name, in quotes: npx tsx research.ts client add "Burnley Boiler Care"');
    return;
  }
  const slug = toSlug(name);
  if (clientExists(slug)) {
    say(`"${name}" already exists. Open ${profilePath(slug)} to edit it.`);
    return;
  }

  let markdown = blankProfile(name);
  if (process.stdin.isTTY) {
    say(`Setting up ${name}. Five questions. Press enter to skip any of them and fill it in later.`);
    say("");
    const answers: Record<string, string> = {};
    for (const q of QUESTIONS) {
      answers[q.heading] = await ask(q.prompt);
      say("");
    }
    const filled = QUESTIONS.filter((q) => answers[q.heading]);
    if (filled.length > 0) {
      markdown = [`# ${name}`, "", ...QUESTIONS.flatMap((q) => [`## ${q.heading}`, answers[q.heading] || "(not filled in yet)", ""])].join("\n");
    }
  }

  const file = writeProfile(slug, markdown);
  say(`Made ${name}.`);
  say(`Their profile is at ${file}`);
  say("");
  const profile = readProfile(slug);
  if (profileIsThin(profile)) {
    say("That profile is still thin, which means hooks will come back with [brackets] where their");
    say("real details go. Open the file and fill in what you know, especially what they can show on");
    say("camera. That section is where every good hook comes from.");
    say("");
  }
  say("Next:");
  say(`  npx tsx research.ts track ${slug} <an instagram handle or a youtube @handle>`);
  say(`  npx tsx research.ts find ${slug} "what their customers search for"`);
}

async function showClient(args: Args): Promise<void> {
  const slug = args.positional[1];
  if (!slug) {
    const all = listClients();
    if (all.length === 0) {
      say('No clients yet. Make one: npx tsx research.ts client add "Their Business Name"');
      return;
    }
    heading("Your clients");
    for (const s of all) {
      const posts = readPosts(s);
      const creators = readCreators(s);
      say(`  ${s}: ${creators.length} creator${creators.length === 1 ? "" : "s"} tracked, ${posts.length} posts read, ${posts.filter((p) => p.is_outlier).length} standouts`);
    }
    return;
  }
  const profile = readProfile(slug);
  const file = profilePath(slug);
  heading(profile.name);
  say(`Profile file: ${file}`);
  say("");
  say(`Who they help: ${profile.who_they_help || "(not filled in)"}`);
  say(`What they sell: ${profile.what_they_sell || "(not filled in)"}`);
  say(`Can show on camera: ${profile.proof || "(not filled in)"}`);
  say(`How they talk: ${profile.how_they_talk || "(not filled in)"}`);
  say(`Phrases to avoid: ${profile.avoid.length ? profile.avoid.join(", ") : "(none)"}`);
  if (profileIsThin(profile)) {
    say("");
    say("This profile is thin. Hooks written from it will keep [brackets] where the client's own");
    say("details belong, because guessing them would put a claim in their name that is not true.");
  }
  const creators = readCreators(slug);
  const posts = readPosts(slug);
  heading("Research so far");
  say(`  Creators tracked: ${creators.length}`);
  for (const c of creators) say(`    ${c.platform === "youtube" ? "YouTube" : "Instagram"}: ${c.name}`);
  say(`  Posts read: ${posts.length}`);
  say(`  Standouts found: ${posts.filter((p) => p.is_outlier).length}`);
  say(`  Spent on Apify for this client, ever: ${totalApifyUsd(slug).toFixed(4)} US dollars`);
  if (!existsSync(file)) say("  (profile file missing)");
}
