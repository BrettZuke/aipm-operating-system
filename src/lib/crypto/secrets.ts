import crypto from "crypto";

/**
 * Symmetric encryption for secrets stored at rest — e.g. per-tenant Stripe keys
 * in agency_settings.data.integrations.stripe.key, which were plaintext (H4).
 *
 * AES-256-GCM (authenticated). The key comes from SECRETS_ENCRYPTION_KEY — 32
 * bytes supplied as 64 hex chars or 44-char base64. Stored format:
 *
 *     enc:v1:<base64( iv[12] | authTag[16] | ciphertext )>
 *
 * The `enc:v1:` prefix lets readers distinguish encrypted values from legacy
 * plaintext, so encryption rolls out with ZERO downtime:
 *   1. Deploy the reader — plaintext passes through untouched (no key needed).
 *   2. Set SECRETS_ENCRYPTION_KEY, then migrate stored values in place.
 *   3. From then on every stored secret is ciphertext.
 *
 * decryptSecret NEVER throws on bad input: a revenue dashboard must not 500
 * because a key is missing/rotated. On any failure it logs and returns null, so
 * the UI degrades to "no key configured" rather than crashing. encryptSecret DOES
 * throw when the key is absent — it's only called from the migration/CLI, where a
 * missing key is a hard stop, never a silent plaintext write.
 */

const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null | undefined; // undefined = not yet resolved

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!raw) { cachedKey = null; return null; }
  let buf: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    try { const b = Buffer.from(raw, "base64"); if (b.length === 32) buf = b; } catch { /* not base64 */ }
  }
  if (!buf || buf.length !== 32) {
    console.error("[secrets] SECRETS_ENCRYPTION_KEY is set but is not a valid 32-byte hex/base64 key");
    cachedKey = null;
    return null;
  }
  cachedKey = buf;
  return buf;
}

/** True if `value` is one of our encrypted blobs (vs legacy plaintext). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a plaintext secret. Throws if SECRETS_ENCRYPTION_KEY is not set. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY not configured — refusing to encrypt");
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt a stored secret. Legacy plaintext (no `enc:v1:` prefix) is returned
 * unchanged so the reader works before/during migration. Returns null on null
 * input or any decryption failure (never throws).
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value; // legacy plaintext — pass through
  const key = getKey();
  if (!key) {
    console.error("[secrets] encountered an encrypted value but SECRETS_ENCRYPTION_KEY is missing — returning null");
    return null;
  }
  try {
    const blob = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = blob.subarray(0, IV_LEN);
    const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = blob.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (e) {
    console.error("[secrets] decryption failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
