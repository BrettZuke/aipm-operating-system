/**
 * Status checks for every wired integration.
 * Each returns { ok, status, info } so the UI can show green/yellow/red.
 */

export type IntegrationStatus = {
  ok: boolean;
  status: "connected" | "configured" | "missing" | "error";
  info: string;
  details?: Record<string, unknown>;
};

// ── Anthropic ───────────────────────────────────────────────────────────────
export async function checkAnthropic(): Promise<IntegrationStatus> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "ANTHROPIC_API_KEY not set" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `${data.data?.length ?? 0} models available` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Settoku Chat (Groq by default — free; Anthropic if AI_CHAT_PROVIDER=anthropic) ──
export async function checkSettokuChat(): Promise<IntegrationStatus> {
  const provider = (process.env.AI_CHAT_PROVIDER ?? (process.env.GROQ_API_KEY ? "groq" : "anthropic")).toLowerCase();
  if (provider !== "groq") return checkAnthropic();
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "GROQ_API_KEY not set" };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `Groq · ${data.data?.length ?? 0} models (free)` };
    }
    return { ok: false, status: "error", info: `Groq HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Slack ───────────────────────────────────────────────────────────────────
export async function checkSlack(): Promise<IntegrationStatus> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, status: "missing", info: "SLACK_BOT_TOKEN not set" };
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) {
      return { ok: true, status: "connected", info: `${data.team} · @${data.user}`, details: { team_id: data.team_id, user_id: data.user_id } };
    }
    return { ok: false, status: "error", info: data.error ?? "Auth failed" };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Twilio ──────────────────────────────────────────────────────────────────
export async function checkTwilio(): Promise<IntegrationStatus> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) return { ok: false, status: "missing", info: "TWILIO credentials not set" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `${data.friendly_name} · ${data.status}` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Close CRM ───────────────────────────────────────────────────────────────
export async function checkClose(): Promise<IntegrationStatus> {
  const key = process.env.CLOSE_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "CLOSE_API_KEY not set" };
  try {
    const res = await fetch("https://api.close.com/api/v1/me/", {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `${data.first_name} ${data.last_name} · ${data.email}` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Kit (ConvertKit) ────────────────────────────────────────────────────────
export async function checkKit(): Promise<IntegrationStatus> {
  const secret = process.env.KIT_API_SECRET;
  const key    = process.env.KIT_API_KEY;
  if (!secret && !key) return { ok: false, status: "missing", info: "Kit credentials not set" };
  try {
    // v3 with api_secret returns the actual account info
    if (secret) {
      const res = await fetch(`https://api.convertkit.com/v3/account?api_secret=${secret}`);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: "connected", info: `${data.name ?? "?"} · ${data.primary_email_address ?? ""}` };
      }
    }
    // Fallback to v4 with key
    if (key) {
      const res = await fetch(`https://api.kit.com/v4/account`, { headers: { "X-Kit-Api-Key": key } });
      if (res.ok) return { ok: true, status: "connected", info: "Connected (Kit v4)" };
    }
    return { ok: false, status: "error", info: "Auth failed" };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Boosend ─────────────────────────────────────────────────────────────────
export async function checkBoosend(): Promise<IntegrationStatus> {
  const key = process.env.BOOSEND_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "BOOSEND_API_KEY not set" };
  // Boosend doesn't have a public docs status endpoint we know — just verify key shape
  if (key.length > 10) return { ok: true, status: "configured", info: "Key present (no live verification endpoint)" };
  return { ok: false, status: "error", info: "Key looks malformed" };
}

// ── Retell ──────────────────────────────────────────────────────────────────
export async function checkRetell(): Promise<IntegrationStatus> {
  const key = process.env.RETELL_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "RETELL_API_KEY not set" };
  try {
    const res = await fetch("https://api.retellai.com/list-agents", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `${Array.isArray(data) ? data.length : 0} agents configured` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Make.com ────────────────────────────────────────────────────────────────
export async function checkMake(): Promise<IntegrationStatus> {
  const key = process.env.MAKE_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "MAKE_API_KEY not set" };
  try {
    const res = await fetch("https://us2.make.com/api/v2/users/me", {
      headers: { Authorization: `Token ${key}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `${data.authUser?.name ?? data.authUser?.email ?? "Connected"}` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status} — region might differ (try eu1/us1)` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── N8N ─────────────────────────────────────────────────────────────────────
export async function checkN8N(): Promise<IntegrationStatus> {
  const key = process.env.N8N_API_KEY;
  const url = process.env.N8N_BASE_URL;
  if (!key || !url) return { ok: false, status: "missing", info: "N8N_API_KEY or N8N_BASE_URL not set" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/v1/workflows?limit=1`, {
      headers: { "X-N8N-API-KEY": key },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `Connected · ${data.data?.length ?? 0} workflow(s) accessible` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Typeform ────────────────────────────────────────────────────────────────
export async function checkTypeform(): Promise<IntegrationStatus> {
  const key = process.env.TYPEFORM_API_KEY;
  if (!key) return { ok: false, status: "missing", info: "TYPEFORM_API_KEY not set" };
  try {
    const res = await fetch("https://api.typeform.com/me", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: "connected", info: `${data.alias ?? data.email ?? "Connected"}` };
    }
    return { ok: false, status: "error", info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: "error", info: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── FanBasis ────────────────────────────────────────────────────────────────
export { checkFanbasis } from "./fanbasis";

// ── iClosed ─────────────────────────────────────────────────────────────────
export async function checkICLOSED(): Promise<IntegrationStatus> {
  const key = process.env.ICLOSED_API_KEY;
  const secret = process.env.ICLOSED_WEBHOOK_SECRET;
  if (!key && !secret) return { ok: false, status: "missing", info: "iClosed credentials not set" };
  return {
    ok: true,
    status: "configured",
    info: secret ? "Webhook secret ready · register in iClosed dashboard once deployed" : "API key set but no webhook secret",
  };
}
