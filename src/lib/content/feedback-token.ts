import crypto from "crypto";
import { safeEqual } from "@/lib/safe-equal";

/**
 * Signed one-click feedback links for the daily scripts email.
 *
 * The owner reads the scripts in their inbox and needs to judge each one without logging in, so the
 * verdict has to travel in the URL. A raw card id would let anyone who guessed a uuid write to that
 * board, so every link carries an HMAC over (card, verdict) and the route refuses anything else.
 *
 * The key is DERIVED from SECRETS_ENCRYPTION_KEY with a distinct label rather than using it
 * directly: the same secret also protects encrypted Stripe credentials, and a signing oracle for
 * one purpose should never be a signing oracle for another.
 */

export const FEEDBACK_VERDICTS = ["accepted", "rejected", "revise"] as const;
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

const LABEL = "content-feedback-v1";

function signingKey(): Buffer {
  const secret = process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret) {
    // Fail loudly at call time rather than silently minting tokens nobody can verify later.
    throw new Error("SECRETS_ENCRYPTION_KEY is required to sign content feedback links");
  }
  return crypto.createHmac("sha256", secret).update(LABEL).digest();
}

export function signFeedback(cardId: string, verdict: FeedbackVerdict): string {
  return crypto
    .createHmac("sha256", signingKey())
    .update(`${cardId}:${verdict}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyFeedback(
  cardId: string,
  verdict: string,
  token: string | null | undefined,
): verdict is FeedbackVerdict {
  if (!token) return false;
  if (!(FEEDBACK_VERDICTS as readonly string[]).includes(verdict)) return false;
  return safeEqual(token, signFeedback(cardId, verdict as FeedbackVerdict));
}
