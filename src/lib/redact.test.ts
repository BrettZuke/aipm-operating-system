import { describe, it, expect } from "vitest";
import { redactPII } from "./redact";

describe("redactPII (M2)", () => {
  it.each([
    ["Payment from jane.doe@example.com", "Payment from [email]"],
    ["Charge +1 (555) 123-4567", "Charge [number]"],
    ["Card 4242 4242 4242 4242", "Card [number]"],
    ["acct 123456789", "acct [number]"],
    ["john@example.com paid via 5551234567", "[email] paid via [number]"],
  ])("redacts structured PII: %j", (input, expected) => {
    expect(redactPII(input)).toBe(expected);
  });

  it.each([
    ["Subscription — Example Academy", "Subscription — Example Academy"],
    ["Refund $1,234.56", "Refund $1,234.56"],   // money not mangled
    ["Order #12345", "Order #12345"],            // short id kept
    ["Plan tier 3", "Plan tier 3"],
    ["", ""],
    ["INV-2026-06", "INV-2026-06"],
  ])("leaves legitimate content intact: %j", (input, expected) => {
    expect(redactPII(input)).toBe(expected);
  });
});
