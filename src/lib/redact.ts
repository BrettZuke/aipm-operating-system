/**
 * Mask structured PII in free-text before it leaves the system — e.g. transaction
 * descriptions (from Stripe/FanBasis) that get embedded in the Settoku Chat prompt sent
 * to Anthropic (M2). Conservative by design: it only touches clearly-structured PII
 * (emails, phone/card/account-length digit runs) so it won't mangle product names,
 * short order IDs, or formatted money amounts.
 *
 *   redactPII("Payment from jane@acme.com +1 (555) 123-4567")
 *     → "Payment from [email] [number]"
 */

// Email: local@domain.tld
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// A digit run (allowing space ( ) + - separators) of length ≥ 8 chars. The replace
// callback only redacts when it contains ≥ 9 actual digits — phones (10), cards
// (13–19), SSN/account-length (9). Money like "$1,234.56" is spared: comma/period
// aren't in the separator class, so the run breaks before reaching 9 digits.
const DIGIT_RUN = /\+?\d[\d ().+-]{6,}\d/g;

export function redactPII(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL, "[email]")
    .replace(DIGIT_RUN, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number]" : m));
}
