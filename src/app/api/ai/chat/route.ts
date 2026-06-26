import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types.generated";
import { buildWorkspaceSnapshot, type WorkspaceSnapshot } from "@/lib/settoku/workspace-snapshot";
import { TOOL_DEFS, executeTool, type ToolContext } from "@/lib/settoku/tools";

/**
 * Settoku Chat streaming endpoint.
 *
 * Provider-agnostic: defaults to **Groq** (free, fast Llama models) when
 * GROQ_API_KEY is set, otherwise Anthropic. A workspace-context system prompt
 * lets it answer questions about the user's numbers (revenue, clients, calls…).
 *
 * Hardened (Wave 0):
 *   - Global kill switch: AI_CHAT_ENABLED=false disables it instantly.
 *   - Requires an authenticated workspace member (enforced here, not just
 *     middleware) — no user ⇒ we never call the model.
 *   - Per-user/day cap (messages + output tokens) in ai_usage_daily; fails CLOSED
 *     if metering is unavailable.
 *   - Customer PII is redacted out of the prompt (M2).
 *
 * Returns Vercel AI SDK v1 data stream format (`0:"text"\n` chunks).
 */

const ACTIVE_AGENCY_COOKIE = "settoku-active-agency";
const DAILY_MESSAGE_CAP = Number(process.env.AI_DAILY_MESSAGE_CAP ?? 250);
const DAILY_TOKEN_CAP = Number(process.env.AI_DAILY_TOKEN_CAP ?? 500_000);

// Provider: "groq" (free) by default when a Groq key is present, else "anthropic".
const PROVIDER = (process.env.AI_CHAT_PROVIDER ?? (process.env.GROQ_API_KEY ? "groq" : "anthropic")).toLowerCase();
const GROQ_MODEL = process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile";

// Free, tool-capable Groq models the user may switch between. Allowlist — never trust the client
// to name an arbitrary or paid model. Keep in sync with the picker in settoku-chat-ui.tsx.
const ALLOWED_GROQ_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "llama-3.1-8b-instant",
]);

// Anthropic-only model routing (H9). Opt-in: default OFF ⇒ always the main model.
const CHAT_MODEL = process.env.AI_CHAT_MODEL ?? "claude-sonnet-4-6";
const CHAT_MODEL_SIMPLE = process.env.AI_CHAT_MODEL_SIMPLE ?? "claude-haiku-4-5-20251001";
const MODEL_ROUTER_ON = process.env.AI_CHAT_MODEL_ROUTER === "on";

type ChatMessage = { role: "user" | "assistant"; content: string };

function pickAnthropicModel(messages: ChatMessage[]): string {
  if (!MODEL_ROUTER_ON) return CHAT_MODEL;
  const last = messages[messages.length - 1]?.content ?? "";
  const analytical = /\b(why|how|compare|trend|forecast|analy|breakdown|explain|should|recommend|strateg|project|predict)/i.test(last);
  return last.length <= 80 && !analytical ? CHAT_MODEL_SIMPLE : CHAT_MODEL;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  // --- Kill switch ----------------------------------------------------------
  if (process.env.AI_CHAT_ENABLED === "false") {
    return new Response(streamPlaceholder("Settoku Chat is temporarily turned off. Check back soon."), streamHeaders);
  }

  // --- Provider key (Groq by default, else Anthropic) -----------------------
  const providerKey = PROVIDER === "groq" ? process.env.GROQ_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!providerKey) {
    return new Response(streamPlaceholder("Settoku Chat isn't connected to an AI key yet. Add GROQ_API_KEY (free) in the environment and redeploy."), streamHeaders);
  }

  // --- Require an authenticated user (defense-in-depth, not just middleware) -
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Stream this notice at HTTP 200 like every other guard message. The chat UI
    // only renders 2xx stream bodies as assistant text; a non-2xx status makes it
    // show a generic error instead. Auth is still enforced — no user ⇒ we return
    // here and never reach the model.
    return new Response(streamPlaceholder("Please sign in to use Settoku Chat."), streamHeaders);
  }

  let body: { messages: ChatMessage[]; model?: string };
  try { body = await req.json(); }
  catch { return new Response(streamPlaceholder("Invalid request body."), streamHeaders); }
  // User-selected model (from the picker), validated against the free-model allowlist.
  const requestedModel = typeof body.model === "string" && ALLOWED_GROQ_MODELS.has(body.model) ? body.model : GROQ_MODEL;

  if (!Array.isArray(body.messages)) {
    return new Response(streamPlaceholder("No messages."), streamHeaders);
  }

  // --- Resolve the active workspace (Settoku Chat is a workspace feature) ----
  const { data: memberships } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  let agencyId: string | null = null;
  if (memberships && memberships.length > 0) {
    const cookieStore = await cookies();
    const cookieAgencyId = cookieStore.get(ACTIVE_AGENCY_COOKIE)?.value;
    agencyId = (memberships.find(m => m.agency_id === cookieAgencyId) ?? memberships[0]).agency_id;
  }
  if (!agencyId) {
    return new Response(streamPlaceholder("Settoku Chat is available inside a workspace. Once you're added to one, I can help with your numbers."), streamHeaders);
  }

  // --- Spend guardrail: per-user/day cap via ai_usage_daily -----------------
  const today = new Date().toISOString().slice(0, 10); // UTC date, matches Postgres current_date
  const svc = serviceClient();
  if (!svc) {
    // Without the service-role client we cannot read/write ai_usage_daily, so the
    // per-user cap can't be enforced. A guardrail that silently turns itself off on
    // misconfig is not a guardrail — fail CLOSED. (This key is core infra; this path
    // only trips on a genuine env misconfig.)
    return new Response(streamPlaceholder("Settoku Chat is temporarily unavailable (usage metering isn't configured)."), streamHeaders);
  }
  let usage = { messages_sent: 0, tokens_input: 0, tokens_output: 0 };
  try {
    const { data: row } = await svc
      .from("ai_usage_daily")
      .select("messages_sent, tokens_input, tokens_output")
      .eq("agency_id", agencyId).eq("user_id", user.id).eq("day", today)
      .maybeSingle();
    if (row) usage = { messages_sent: row.messages_sent, tokens_input: Number(row.tokens_input), tokens_output: Number(row.tokens_output) };
  } catch {
    // Usage read failed — don't deny a legitimate user over a tracking hiccup.
  }
  if (usage.messages_sent >= DAILY_MESSAGE_CAP || usage.tokens_output >= DAILY_TOKEN_CAP) {
    return new Response(streamPlaceholder("You've reached today's Settoku Chat limit. It resets at midnight UTC."), streamHeaders);
  }

  // --- Build workspace context for the system prompt ------------------------
  // Numbers come from the SAME live readers the dashboard uses (FanBasis for the coach tenant,
  // Stripe for creators, the Supabase ledger otherwise) — NOT the stale transactions table the
  // chat used to read alone. Agency-scoped, so the chat only sees the active workspace's data.
  // Best-effort: if it fails, the chat still answers, just without the numbers.
  let workspaceContext = "";
  let snapshot: WorkspaceSnapshot | null = null;
  try {
    snapshot = await buildWorkspaceSnapshot(supabase, agencyId);
    workspaceContext = `\n${snapshot.promptBlock}`;
  } catch {
    // Context is best-effort — auth is already enforced above.
  }

  // Tool context (agency-scoped). Built here where agencyId is narrowed to a string and the
  // snapshot is in hand, so reads (get_revenue) don't refetch and writes stay scoped.
  const toolCtx: ToolContext | null = snapshot ? { supabase, agencyId, userId: user.id, snapshot } : null;

  const systemPrompt = `You are Settoku, an AI assistant inside an operating system for info-product agencies and creators. You help the user understand their business — revenue, clients, sales calls, team activity, what's working, what's not.

Be direct, concise, and specific. When discussing numbers, cite them precisely — and when useful, mention the source (e.g. "per FanBasis" / "per Stripe"). When you don't have data, say so plainly — don't make up numbers. The figures below are for the user's currently-active workspace only.

You can also TAKE ACTIONS via tools: look up live revenue, list clients, create a task, or draft an email. When the user asks you to DO something ("remind me to…", "add a task…", "draft an email…"), call the right tool instead of only describing it — then confirm in one line what you did. Never say an email was sent: draft_email only prepares a draft for the user to review.

ACCURACY (important): Only state numbers that appear in the workspace data below or that a tool returns this turn. Never invent, guess, or change the figures. If you don't have a number, say so and offer to pull it — don't approximate. Day-level figures use UTC: if "today" shows 0, a very recent sale may fall under yesterday in UTC — say that rather than implying there were no sales. Always include the currency shown in the data (e.g. USD vs PLN); never convert or assume.
${workspaceContext}`;

  // Convert messages — only keep user + assistant
  const validMessages: ChatMessage[] = body.messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: m.content }));

  if (validMessages.length === 0 || validMessages[validMessages.length - 1].role !== "user") {
    return new Response(streamPlaceholder("Last message must be from the user."), streamHeaders);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { inTok, outTok } = PROVIDER === "groq" && toolCtx
          ? await runGroqAgent(controller, encoder, { apiKey: providerKey, model: requestedModel, systemPrompt, messages: validMessages, ctx: toolCtx })
          : PROVIDER === "groq"
          ? await streamGroq(controller, encoder, { apiKey: providerKey, model: requestedModel, systemPrompt, messages: validMessages })
          : await streamAnthropic(controller, encoder, { apiKey: providerKey, model: pickAnthropicModel(validMessages), systemPrompt, messages: validMessages });

        // Record usage for the daily cap (best-effort — never break a delivered reply).
        try {
          await svc.from("ai_usage_daily").upsert({
            agency_id: agencyId,
            user_id: user.id,
            day: today,
            messages_sent: usage.messages_sent + 1,
            tokens_input: usage.tokens_input + inTok,
            tokens_output: usage.tokens_output + outTok,
          }, { onConflict: "agency_id,user_id,day" });
        } catch { /* tracking is best-effort */ }

        controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
        controller.close();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        controller.enqueue(encoder.encode(`0:${JSON.stringify(`\n\n⚠️ Error: ${errMsg}`)}\n`));
        controller.enqueue(encoder.encode(`d:{"finishReason":"error"}\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, streamHeaders);
}

type StreamOpts = { apiKey: string; model: string; systemPrompt: string; messages: ChatMessage[] };

/** Stream from Anthropic; emits Vercel-AI `0:"..."` chunks, returns token counts. */
async function streamAnthropic(
  controller: ReadableStreamDefaultController, encoder: TextEncoder, opts: StreamOpts,
): Promise<{ inTok: number; outTok: number }> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  let inTok = 0, outTok = 0;
  const response = await client.messages.create({
    model: opts.model, max_tokens: 2048, system: opts.systemPrompt, messages: opts.messages, stream: true,
  });
  for await (const event of response) {
    if (event.type === "message_start") inTok = event.message.usage.input_tokens;
    else if (event.type === "message_delta") outTok = event.usage.output_tokens;
    else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(event.delta.text)}\n`));
    }
  }
  return { inTok, outTok };
}

/** Stream from Groq's OpenAI-compatible API (free); same output format. */
async function streamGroq(
  controller: ReadableStreamDefaultController, encoder: TextEncoder, opts: StreamOpts,
): Promise<{ inTok: number; outTok: number }> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "system", content: opts.systemPrompt }, ...opts.messages],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 2048,
      temperature: 0.4,
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${t.slice(0, 180)}`);
  }

  let inTok = 0, outTok = 0;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? ""; // keep any incomplete trailing line for the next chunk
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) controller.enqueue(encoder.encode(`0:${JSON.stringify(delta)}\n`));
        if (json.usage) { inTok = json.usage.prompt_tokens ?? inTok; outTok = json.usage.completion_tokens ?? outTok; }
      } catch { /* skip a malformed SSE line */ }
    }
  }
  return { inTok, outTok };
}

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 5;

type GroqMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

// Split the final answer into small pieces for a smooth "typing" stream to the UI.
function chunkText(s: string): string[] {
  return s.match(/[\s\S]{1,28}/g) ?? (s ? [s] : []);
}

/**
 * Groq with tool-calling (the "do things" loop). Each round: ask the model with tools advertised;
 * if it returns tool_calls, run them (agency-scoped), stream a `t:` activity event per tool, feed
 * the results back, and loop. When it returns text, stream it as `0:"..."`. On the last round we
 * force a text answer (tool_choice:"none") so we never end on a dangling tool request. Token usage
 * is summed across every round for the daily cap.
 */
async function runGroqAgent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  opts: { apiKey: string; model: string; systemPrompt: string; messages: ChatMessage[]; ctx: ToolContext },
): Promise<{ inTok: number; outTok: number }> {
  let inTok = 0, outTok = 0;
  const messages: GroqMsg[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content }) as GroqMsg),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const forceAnswer = round === MAX_TOOL_ROUNDS - 1;
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages,
        tools: TOOL_DEFS,
        tool_choice: forceAnswer ? "none" : "auto",
        max_tokens: 1024,
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text().catch(() => "")).slice(0, 180)}`);
    const j = await res.json();
    if (j.usage) { inTok += j.usage.prompt_tokens ?? 0; outTok += j.usage.completion_tokens ?? 0; }

    const msg = j.choices?.[0]?.message;
    const calls = msg?.tool_calls as GroqMsg["tool_calls"] | undefined;

    if (!forceAnswer && calls && calls.length) {
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const tc of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* malformed args → empty */ }
        const result = await executeTool(tc.function?.name ?? "", args, opts.ctx);
        controller.enqueue(encoder.encode(`t:${JSON.stringify({ name: tc.function?.name ?? "", ok: result.ok, summary: result.summary })}\n`));
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result.data ?? { ok: result.ok, summary: result.summary }).slice(0, 4000),
        });
      }
      continue;
    }

    const text = msg?.content ?? "";
    for (const chunk of chunkText(text)) controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
    return { inTok, outTok };
  }
  return { inTok, outTok };
}

/** Service-role client for usage accounting (bypasses RLS). Null if env missing. */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient<Database>(url, key, { auth: { persistSession: false } });
}

const streamHeaders = {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Vercel-AI-Data-Stream": "v1",
  },
};

function streamPlaceholder(msg: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunks = msg.match(/.{1,20}/g) ?? [msg];
      let i = 0;
      const interval = setInterval(() => {
        if (i >= chunks.length) {
          controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
          controller.close();
          clearInterval(interval);
          return;
        }
        controller.enqueue(encoder.encode(`0:${JSON.stringify(chunks[i])}\n`));
        i++;
      }, 20);
    },
  });
}
