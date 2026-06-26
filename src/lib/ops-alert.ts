/**
 * Ops alerting.
 *
 * Posts a Slack message when a cron / background job hits an error, so failures
 * are VISIBLE to a human instead of being swallowed into an `ok: true` response
 * that nobody reads. Falls back to console.error if Slack isn't configured.
 *
 * Best-effort by contract: this NEVER throws — alerting must not be able to
 * break the caller it's reporting on.
 *
 * Channel: SLACK_OPS_CHANNEL, else SLACK_DAILY_DIGEST_CHANNEL. Token: SLACK_BOT_TOKEN.
 */
export async function alertOps(summary: string, detail?: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_OPS_CHANNEL ?? process.env.SLACK_DAILY_DIGEST_CHANNEL;
  const text = `:rotating_light: *settoku-os ops* — ${summary}`
    + (detail ? `\n\`\`\`${detail.slice(0, 1500)}\`\`\`` : "");

  if (!token || !channel) {
    console.error("[alertOps]", summary, detail ? `\n${detail}` : "");
    return;
  }
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
  } catch (e) {
    console.error("[alertOps] Slack post failed:", e instanceof Error ? e.message : e, "| original:", summary);
  }
}
