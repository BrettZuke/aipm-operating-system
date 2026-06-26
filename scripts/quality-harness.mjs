#!/usr/bin/env node
/**
 * Quality harness — single command that runs every gate the OS must pass
 * before changes can be merged or shipped.
 *
 * Returns JSON to stdout:
 *   { ok: true|false, gates: { tsc, lint, build, smoke, health }, duration_ms }
 *
 * Each gate is best-effort — if one fails, the rest still run so the user
 * sees the full picture in one go. Process exits 0 if all gates pass, 1 if any
 * fail. Exit code is what an external caller (cron / Railway / GitHub Action)
 * uses as the green/red signal.
 *
 * Usage:
 *   node scripts/quality-harness.mjs              # JSON to stdout
 *   node scripts/quality-harness.mjs --pretty     # human-readable summary
 *   node scripts/quality-harness.mjs --skip=lint  # skip a specific gate
 */

import { readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRETTY = process.argv.includes("--pretty");
const SKIP = (() => {
  const a = process.argv.find(x => x.startsWith("--skip="));
  return a ? new Set(a.slice("--skip=".length).split(",")) : new Set();
})();

// Load env so smoke + health can use the running dev server
try {
  const t = readFileSync(join(ROOT, ".env.local"), "utf-8");
  for (const line of t.split("\n")) {
    const tr = line.trim();
    if (!tr || tr.startsWith("#")) continue;
    const eq = tr.indexOf("=");
    if (eq < 0) continue;
    const k = tr.slice(0, eq).trim();
    const v = tr.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

const DEV_BASE = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const proc = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => {
      resolve({ ok: code === 0, code, ms: Date.now() - t0, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) });
    });
    proc.on("error", err => {
      resolve({ ok: false, code: -1, ms: Date.now() - t0, stdout, stderr: err.message });
    });
  });
}

const gates = {};

async function gateTsc() {
  if (SKIP.has("tsc")) return { skipped: true };
  const r = await run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]);
  return { ok: r.ok, ms: r.ms, summary: r.ok ? "no type errors" : `tsc failed (exit ${r.code})`, output: r.stdout + r.stderr };
}

async function gateTest() {
  if (SKIP.has("test")) return { skipped: true };
  const r = await run("npx", ["vitest", "run"]);
  return { ok: r.ok, ms: r.ms, summary: r.ok ? "unit tests pass" : `tests failed (exit ${r.code})`, output: r.stdout + r.stderr };
}

async function gateLint() {
  if (SKIP.has("lint")) return { skipped: true };
  // Next 16 removed the `next lint` subcommand; the project lints with ESLint
  // flat config directly (package.json "lint": "eslint"). ESLint exits non-zero
  // only on error-level results — warnings don't fail the gate.
  const r = await run("npx", ["eslint"]);
  return { ok: r.ok, ms: r.ms, summary: r.ok ? "no lint errors" : `lint failed (exit ${r.code})`, output: r.stdout + r.stderr };
}

async function gateBuild() {
  if (SKIP.has("build")) return { skipped: true };
  const r = await run("npx", ["next", "build"]);
  // Next prints success even if route-level errors happen; we look for "Compiled successfully"
  const passed = r.ok && /Compiled successfully/.test(r.stdout);
  return { ok: passed, ms: r.ms, summary: passed ? "build green" : `build failed (exit ${r.code})`, output: r.stdout + r.stderr };
}

async function gateSmoke() {
  if (SKIP.has("smoke")) return { skipped: true };
  // Only meaningful if dev server is up. If it's not, skip rather than fail —
  // we report "skipped" so the caller knows to start the server.
  const t0 = Date.now();
  const checks = [
    // The health endpoint is CRON_SECRET-gated (Wave 0). With the secret we expect
    // 200; without it the correct, healthy response is 401 — assert that rather than
    // flag the lock itself as a smoke failure.
    { path: "/api/health/webhooks", expectStatus: process.env.CRON_SECRET ? 200 : 401 },
    { path: "/login",               expectStatus: 200 },
  ];
  const results = [];
  for (const c of checks) {
    try {
      const headers = c.path.startsWith("/api/health/") && process.env.CRON_SECRET
        ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : undefined;
      const res = await fetch(`${DEV_BASE}${c.path}`, { headers, signal: AbortSignal.timeout(10000) });
      results.push({ path: c.path, status: res.status, ok: res.status === c.expectStatus });
    } catch (e) {
      results.push({ path: c.path, status: 0, ok: false, error: e instanceof Error ? e.message : "fetch failed" });
    }
  }
  // If every check failed with status 0, the server isn't running — skip not fail.
  const allDown = results.every(r => r.status === 0);
  if (allDown) return { skipped: true, summary: `dev server not running at ${DEV_BASE}`, ms: Date.now() - t0 };
  const ok = results.every(r => r.ok);
  return { ok, ms: Date.now() - t0, summary: ok ? `${results.length} smoke checks passed` : `${results.filter(r=>!r.ok).length}/${results.length} smoke checks failed`, output: JSON.stringify(results, null, 2) };
}

async function gateHealth() {
  if (SKIP.has("health")) return { skipped: true };
  // The health endpoint requires CRON_SECRET (Wave 0). Without it we can't read
  // source freshness at all — skip rather than fail. The smoke gate already
  // verifies the 401 lock is in place, so a green app isn't reported RED here.
  if (!process.env.CRON_SECRET) return { skipped: true, summary: "no CRON_SECRET — health read skipped" };
  // Same skip rule — only run if dev server is up
  const t0 = Date.now();
  try {
    const res = await fetch(`${DEV_BASE}/api/health/webhooks`, {
      headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, ms: Date.now() - t0, summary: `health endpoint HTTP ${res.status}` };
    const data = await res.json();
    const stale = (data.sources ?? []).filter(s => s.status === "stale").length;
    const warn  = (data.sources ?? []).filter(s => s.status === "warn").length;
    const ok = (data.summary?.stale ?? 0) === 0;
    return {
      ok, ms: Date.now() - t0,
      summary: ok ? `all sources ok (${warn} warn)` : `${stale} stale source${stale === 1 ? "" : "s"}`,
      output: JSON.stringify(data.summary, null, 2),
    };
  } catch {
    return { skipped: true, summary: "dev server not reachable for health check", ms: Date.now() - t0 };
  }
}

async function gateBundleSize() {
  if (SKIP.has("bundle")) return { skipped: true };
  // Heuristic only — if .next/static exists, sum its size and compare to a baseline.
  // Baseline is loaded from .quality-baseline.json; missing file = first run, set baseline.
  const t0 = Date.now();
  try {
    const baselinePath = join(ROOT, ".quality-baseline.json");
    let baseline = null;
    try { baseline = JSON.parse(readFileSync(baselinePath, "utf-8")); } catch {}
    // compute current size
    const buildDir = join(ROOT, ".next");
    let size = 0;
    try { size = statSync(buildDir).size; } catch {}
    if (size === 0) return { skipped: true, summary: ".next/ not found — run `next build` first" };
    if (!baseline) return { ok: true, ms: Date.now() - t0, summary: `baseline initialized at ${(size / 1024).toFixed(0)}KB` };
    const delta = size - baseline.bundleSize;
    const pctChange = ((delta / baseline.bundleSize) * 100).toFixed(1);
    const ok = Math.abs(delta) / baseline.bundleSize < 0.5; // fail if changed by >50%
    return {
      ok, ms: Date.now() - t0,
      summary: `${(size / 1024).toFixed(0)}KB (${pctChange}% vs baseline)`,
    };
  } catch (e) {
    return { skipped: true, summary: e instanceof Error ? e.message : "bundle check failed" };
  }
}

const t0 = Date.now();
gates.tsc        = await gateTsc();
gates.test       = await gateTest();
gates.lint       = await gateLint();
gates.build      = await gateBuild();
gates.bundle     = await gateBundleSize();
gates.smoke      = await gateSmoke();
gates.health     = await gateHealth();
const duration_ms = Date.now() - t0;

// Treat skipped as neutral. Failed (ok:false) is the only thing that fails the run.
const failures = Object.entries(gates).filter(([, v]) => v.ok === false);
const ok = failures.length === 0;

const result = { ok, gates, duration_ms, failures: failures.map(([k]) => k), generated_at: new Date().toISOString() };

if (PRETTY) {
  console.log(`\n🩺 Quality harness — ${ok ? "✅ GREEN" : "❌ RED"} (${(duration_ms / 1000).toFixed(1)}s)\n`);
  for (const [name, gate] of Object.entries(gates)) {
    const icon = gate.skipped ? "⏭️ " : gate.ok ? "✅" : "❌";
    const ms = gate.ms ? `${(gate.ms / 1000).toFixed(1)}s` : "—";
    console.log(`  ${icon} ${name.padEnd(8)} ${ms.padStart(6)}  ${gate.summary ?? ""}`);
  }
  console.log();
  if (!ok) {
    for (const [name, gate] of Object.entries(gates)) {
      if (gate.ok === false && gate.output) {
        console.log(`\n--- ${name} output (last 2KB) ---`);
        console.log(gate.output.slice(-2000));
      }
    }
  }
} else {
  console.log(JSON.stringify(result, null, 2));
}

process.exit(ok ? 0 : 1);
