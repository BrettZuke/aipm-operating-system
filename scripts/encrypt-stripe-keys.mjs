#!/usr/bin/env node
/**
 * One-time (idempotent) migration: encrypt plaintext Stripe keys at rest (H4).
 *
 * Walks agency_settings.data.integrations.stripe.key and replaces any plaintext
 * value with an AES-256-GCM blob in the SAME format the app reads:
 *
 *     enc:v1:<base64( iv[12] | authTag[16] | ciphertext )>      // see src/lib/crypto/secrets.ts
 *
 * The crypto below is a faithful, standalone copy of that helper's `v1` contract
 * (scripts run with plain `node`, can't import the app's .ts). A startup self-test
 * proves the round-trip before any row is touched, and after --apply each row is
 * read back + decrypted — but the AUTHORITATIVE check is that the deployed app's
 * revenue widgets still read after migration (verify live).
 *
 * SAFETY:
 *   - Dry-run by DEFAULT. Pass --apply to write.
 *   - Already-encrypted keys are skipped (safe to re-run after onboarding agencies).
 *   - Every key is round-trip verified BEFORE its row is written; a mismatch skips
 *     that row untouched.
 *
 * REQUIRES (.env.local): SECRETS_ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 *   node scripts/encrypt-stripe-keys.mjs            # dry run
 *   node scripts/encrypt-stripe-keys.mjs --apply    # writes encrypted values
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const PREFIX = "enc:v1:", IV_LEN = 12, TAG_LEN = 16;

// --- .env.local loader -------------------------------------------------------
try {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf-8").split("\n")) {
    const tr = line.trim();
    if (!tr || tr.startsWith("#")) continue;
    const eq = tr.indexOf("="); if (eq < 0) continue;
    const k = tr.slice(0, eq).trim();
    const v = tr.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch { /* no .env.local */ }

// --- crypto (must match src/lib/crypto/secrets.ts `v1`) ----------------------
function loadKey() {
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b = Buffer.from(raw, "base64");
  return b.length === 32 ? b : null;
}
const KEY = loadKey();
function encryptSecret(plain) {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function decryptSecret(value) {
  if (value == null || !value.startsWith(PREFIX)) return value ?? null;
  const blob = Buffer.from(value.slice(PREFIX.length), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, blob.subarray(0, IV_LEN));
  d.setAuthTag(blob.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([d.update(blob.subarray(IV_LEN + TAG_LEN)), d.final()]).toString("utf8");
}
const isEncrypted = (v) => typeof v === "string" && v.startsWith(PREFIX);

const mask = (s) => (s.length <= 12 ? "•".repeat(s.length) : `${s.slice(0, 8)}…${s.slice(-4)}`);
const clone = (o) => JSON.parse(JSON.stringify(o));

// --- preflight ---------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("✖ SECRETS_ENCRYPTION_KEY missing or not a 32-byte hex/base64 key — aborting."); process.exit(1); }
if (!url || !serviceKey) { console.error("✖ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — aborting."); process.exit(1); }

// Self-test: prove this script's crypto round-trips before touching any data.
const probe = "rk_live_selftest_" + crypto.randomBytes(6).toString("hex");
if (decryptSecret(encryptSecret(probe)) !== probe) { console.error("✖ crypto self-test FAILED — aborting, no data touched."); process.exit(1); }
console.log("✓ crypto self-test passed");
console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}\n`);

// --- migrate -----------------------------------------------------------------
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: rows, error } = await supabase.from("agency_settings").select("agency_id, data");
if (error) { console.error("✖ read failed:", error.message); process.exit(1); }

let candidates = 0, encrypted = 0, skipped = 0, failed = 0;
for (const row of rows ?? []) {
  const data = row.data ?? {};
  const key = data.integrations?.stripe?.key;
  if (!key || typeof key !== "string") continue;
  if (isEncrypted(key)) { skipped++; console.log(`  ⏭️  ${row.agency_id}: already encrypted`); continue; }

  candidates++;
  let cipher;
  try {
    cipher = encryptSecret(key);
    if (decryptSecret(cipher) !== key) throw new Error("round-trip mismatch");
  } catch (e) {
    failed++; console.log(`  ❌ ${row.agency_id}: encrypt/verify failed (${e.message}) — left untouched`); continue;
  }

  if (!APPLY) { console.log(`  • ${row.agency_id}: would encrypt ${mask(key)}  →  ${cipher.slice(0, 22)}…`); continue; }

  const next = clone(data);
  next.integrations = next.integrations ?? {};
  next.integrations.stripe = { ...(next.integrations.stripe ?? {}), key: cipher };
  const { error: upErr } = await supabase.from("agency_settings").update({ data: next }).eq("agency_id", row.agency_id);
  if (upErr) { failed++; console.log(`  ❌ ${row.agency_id}: write failed (${upErr.message})`); continue; }

  const { data: check } = await supabase.from("agency_settings").select("data").eq("agency_id", row.agency_id).maybeSingle();
  const stored = check?.data?.integrations?.stripe?.key;
  if (isEncrypted(stored) && decryptSecret(stored) === key) {
    encrypted++; console.log(`  ✅ ${row.agency_id}: encrypted + verified (${mask(key)})`);
  } else {
    failed++; console.log(`  ⚠️  ${row.agency_id}: WROTE but read-back verification FAILED — check this row`);
  }
}

console.log(`\n${APPLY ? "Applied" : "Dry run"}: ${candidates} candidate(s), ${encrypted} encrypted, ${skipped} already-encrypted, ${failed} failed.`);
if (!APPLY && candidates > 0) console.log("Re-run with --apply to write.");
process.exit(failed === 0 ? 0 : 1);
