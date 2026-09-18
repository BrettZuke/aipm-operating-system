import crypto from "crypto";

// Constant-time equality for comparing secrets and tokens (bearer credentials, webhook tokens).
// Node's crypto.timingSafeEqual THROWS when the two buffers differ in length, so we length-check
// first and fail closed on any mismatch; a null/undefined/empty input also fails closed. This is
// the webhook idiom (fanbasis's inline safeEqual) extracted so every credential compare goes
// through one audited helper instead of a hand-rolled `===`, which returns on the first differing
// byte and leaks the position of the mismatch through timing. The length pre-check is itself an
// early return, so this proves value equality without being a zero-length-leak primitive: the same
// accepted tradeoff the webhook idiom already made for these high-entropy, server-set secrets.
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
