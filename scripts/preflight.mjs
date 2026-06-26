#!/usr/bin/env node
/**
 * Pre-deploy clean-guard (C4).
 *
 * `vercel deploy` ships the WORKING TREE — not a git ref — so any uncommitted edit
 * (including another session's in-progress work) rides along to production. Run
 * this before a prod deploy to catch that:
 *
 *   node scripts/preflight.mjs && npx vercel deploy --prod --token "$VERCEL_TOKEN_PERSONAL" --yes
 *
 * Exits 0 if the tree is clean, 1 if there are uncommitted/untracked changes —
 * so it can gate a deploy in a chained command.
 */
import { execSync } from "child_process";

let out = "";
try {
  out = execSync("git status --porcelain", { encoding: "utf8" }).trim();
} catch (e) {
  console.error("preflight: could not read git status —", e instanceof Error ? e.message : e);
  process.exit(1);
}

if (!out) {
  console.log("✓ working tree clean — safe to deploy.");
  process.exit(0);
}

console.log("⚠  working tree is NOT clean. `vercel deploy` would ship these to PROD:\n");
console.log(out + "\n");
console.log("Commit or stash them — or confirm they're intended — before deploying.");
process.exit(1);
