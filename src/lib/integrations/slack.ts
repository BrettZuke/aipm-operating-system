/**
 * Slack helpers — post messages from anywhere in the OS.
 *
 * Events we post on:
 *   - New deal closed       → #wins
 *   - Payment received      → #wins
 *   - Overdue payment       → #ops
 *   - Test message          → wherever specified
 */

const SLACK_API = "https://slack.com/api";

type SlackBlock = {
  type: "section" | "divider" | "context" | "header";
  text?: { type: "mrkdwn" | "plain_text"; text: string };
  fields?: Array<{ type: "mrkdwn"; text: string }>;
  elements?: Array<{ type: "mrkdwn" | "plain_text"; text: string }>;
};

export type SlackPostResult = { ok: true; ts: string; channel: string } | { ok: false; error: string };

export async function slackPost(channel: string, text: string, blocks?: SlackBlock[]): Promise<SlackPostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not configured" };

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text, blocks, unfurl_links: false, unfurl_media: false }),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.error ?? "post failed" };
  return { ok: true, ts: data.ts, channel: data.channel };
}

// Helper formatters

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export async function notifyDealClosed(opts: {
  channel?: string;
  clientName: string;
  amount: number;
  closer?: string;
  description?: string;
}) {
  const channel = opts.channel ?? process.env.SLACK_WINS_CHANNEL ?? "#general";
  const text = `🎉 New deal closed: ${opts.clientName} · ${formatCurrency(opts.amount)}`;
  return slackPost(channel, text, [
    { type: "section", text: { type: "mrkdwn", text: `*🎉 New deal closed*` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Client*\n${opts.clientName}` },
        { type: "mrkdwn", text: `*Amount*\n${formatCurrency(opts.amount)}` },
        ...(opts.closer ? [{ type: "mrkdwn" as const, text: `*Closer*\n${opts.closer}` }] : []),
        ...(opts.description ? [{ type: "mrkdwn" as const, text: `*Product*\n${opts.description}` }] : []),
      ],
    },
  ]);
}

export async function notifyOverduePayment(opts: {
  channel?: string;
  clientName: string;
  amount: number;
  daysOverdue: number;
  email?: string;
}) {
  const channel = opts.channel ?? process.env.SLACK_OPS_CHANNEL ?? "#general";
  const text = `⚠️ Overdue: ${opts.clientName} · ${formatCurrency(opts.amount)} · ${opts.daysOverdue}d late`;
  return slackPost(channel, text, [
    { type: "section", text: { type: "mrkdwn", text: `*⚠️ Overdue payment*` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Client*\n${opts.clientName}${opts.email ? `\n${opts.email}` : ""}` },
        { type: "mrkdwn", text: `*Amount*\n${formatCurrency(opts.amount)}` },
        { type: "mrkdwn", text: `*Days late*\n${opts.daysOverdue}` },
      ],
    },
  ]);
}

export async function listChannels(): Promise<{ ok: true; channels: { id: string; name: string }[] } | { ok: false; error: string }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  const res = await fetch(`${SLACK_API}/conversations.list?types=public_channel,private_channel&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.error ?? "list failed" };
  return { ok: true, channels: data.channels.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) };
}
