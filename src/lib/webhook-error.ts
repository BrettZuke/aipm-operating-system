import { NextResponse } from "next/server";

/**
 * Error response for inbound webhooks that does NOT leak internal detail — DB
 * error text, table/column names, stack traces — to external callers (H11).
 *
 * The full detail is logged server-side (captured in Vercel logs); the caller
 * receives only a safe, operation-level `label`. The 5xx status — not the body —
 * is what drives a provider's retry, so this preserves delivery semantics.
 *
 *   if (txError) return webhookError("Transaction insert failed", txError);
 */
export function webhookError(
  label: string,
  detail: unknown,
  opts?: { status?: number; extra?: Record<string, unknown> },
) {
  const msg =
    detail instanceof Error ? detail.message
    : typeof detail === "object" && detail !== null && "message" in detail ? String((detail as { message: unknown }).message)
    : String(detail);
  console.error(`[webhook] ${label}: ${msg}`);
  return NextResponse.json({ ok: false, error: label, ...(opts?.extra ?? {}) }, { status: opts?.status ?? 500 });
}
