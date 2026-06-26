import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { encryptSecret, decryptSecret, isEncrypted } from "./secrets";

// getKey() resolves SECRETS_ENCRYPTION_KEY lazily on first use, so setting it
// before any encrypt/decrypt call is enough.
beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
});

describe("secrets at rest (H4)", () => {
  it.each([
    "example-fake-token-1234567890abcdef",
    "sk_live_short",
    "",
    "unicode: café — Москва",
    "a".repeat(5000),
  ])("round-trips %j", (plain) => {
    const enc = encryptSecret(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("passes legacy plaintext through unchanged (rollout safety)", () => {
    const legacy = "rk_live_plaintext_existing_value";
    expect(isEncrypted(legacy)).toBe(false);
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it("maps null/undefined to null", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
  });

  it("uses a fresh IV per call (non-deterministic ciphertext)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("returns null (never throws) on tampered ciphertext", () => {
    const good = encryptSecret("secret");
    const body = good.slice("enc:v1:".length);
    const tampered = "enc:v1:" + (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(decryptSecret(tampered)).toBeNull();
  });

  it("returns null (never throws) on ciphertext from a different key", () => {
    const otherKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", otherKey, iv);
    const ct = Buffer.concat([c.update("secret", "utf8"), c.final()]);
    const foreign = "enc:v1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
    expect(decryptSecret(foreign)).toBeNull();
  });
});
