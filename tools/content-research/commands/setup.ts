// "Which keys do I have, and how do I get the ones I am missing."

import { apifyCreditLeft, apifyTokens } from "../lib/apify";
import { heading, say, type Args } from "../lib/cli";
import { keyChecks } from "../lib/env";

export async function setupCommand(_args: Args): Promise<void> {
  heading("What is connected");
  const checks = keyChecks();
  for (const c of checks) {
    say(`${c.present ? "  yes" : "  NO "}  ${c.name}`);
  }

  const missing = checks.filter((c) => !c.present);
  if (missing.length === 0) {
    say("");
    say("Everything is connected.");
  } else {
    heading("What to get next");
    for (const c of missing) {
      say("");
      say(`${c.name} (${c.needed === "always" ? "needed for everything" : `needed ${c.needed}`})`);
      say(`  What it does: ${c.what}`);
      say(`  Get it here:  ${c.where}`);
    }
    say("");
    say("Then put each one in a file called .env next to research.ts, one per line, like this:");
    say("  GROQ_API_KEY=gsk_your_real_key");
    say("");
    say("Copy .env.example to .env to start. Your .env is never committed.");
  }

  const tokens = apifyTokens();
  if (tokens.length > 0) {
    heading("Apify credit");
    const left = await apifyCreditLeft();
    if (left === null) {
      say("  None of your Apify accounts answered. Check the token is right, or try again in a minute.");
    } else {
      say(`  ${left.toFixed(2)} US dollars of free credit left across ${tokens.length} account${tokens.length === 1 ? "" : "s"}.`);
      say(`  At 0.0027 a post that is about ${Math.floor(left / 0.0027).toLocaleString("en-US")} more Instagram posts.`);
      if (left < 0.5) say("  Running low. Make another free Apify account and add it as APIFY_API_TOKEN_2.");
    }
  }

  heading("What each thing costs you");
  say("  Instagram scanning   about 0.003 US dollars a post, from Apify's free monthly credit");
  say("  YouTube              free, on an allowance that resets daily");
  say("  Watching a video     free, on Gemini's daily allowance");
  say("  Writing hooks        free, on Groq");
  say("");
  say("Nothing here uses a paid key. If you have one in your .env, this tool will not touch it.");
}
