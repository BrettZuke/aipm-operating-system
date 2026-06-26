// Tools Settoku Chat can call (OpenAI/Groq function-calling). This is what turns the chat from
// "answers questions" into "does things". Every tool is AGENCY-SCOPED via the caller's RLS
// client + the active agencyId, so the chat can only read/write the workspace you're in.
//
// Safety posture: reads are free; the one write (create_task) is internal + reversible; email is
// DRAFT-ONLY (never sends). Nothing here touches another tenant or an outward channel.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types.generated";
import type { WorkspaceSnapshot } from "./workspace-snapshot";

type Supa = SupabaseClient<Database>;

export interface ToolContext {
  supabase: Supa; // RLS-scoped to the signed-in user
  agencyId: string;
  userId: string;
  snapshot: WorkspaceSnapshot; // already built for the system prompt; reused so reads don't refetch
}

export interface ToolResult {
  ok: boolean;
  /** One-line human summary for the UI tool-chip + activity log. */
  summary: string;
  /** Structured payload fed back to the model. */
  data?: unknown;
}

// Function schemas advertised to the model.
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_revenue",
      description:
        "Get this workspace's LIVE revenue (today, last 7 days, last 30 days, all-time, MRR) and the data source. Use for any revenue/sales/MRR question.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description:
        "List clients in this workspace with status and MRR (highest first). Use to answer questions about specific clients or who is active.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "all"], description: "Filter (default active)" },
          limit: { type: "integer", description: "Max to return (default 15, max 50)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a task on this workspace's task board. Use when the user asks to follow up, remind, or add a to-do.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short task title" },
          description: { type: "string", description: "Optional details" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          due_date: { type: "string", description: "Due date as YYYY-MM-DD (optional)" },
          client_name: { type: "string", description: "Optional client to attach (matched by name)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description:
        "Draft an email for the user to review. Does NOT send — only prepares a draft. Never claim the email was sent.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient (optional)" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["subject", "body"],
      },
    },
  },
] as const;

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// Accept either a real date (YYYY-MM-DD etc.) or common relative phrasings the model emits
// ("tomorrow", "next week", "in 3 days"), since LLMs don't reliably format dates.
function parseDueDate(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const addDays = (n: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString();
  };
  if (s === "today") return addDays(0);
  if (s === "tomorrow") return addDays(1);
  if (s === "next week") return addDays(7);
  const m = s.match(/in (\d+) days?/);
  if (m) return addDays(parseInt(m[1], 10));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_revenue": {
        const r = ctx.snapshot.revenue;
        return {
          ok: true,
          summary: "Looked up live revenue",
          data: {
            source: r.source, currency: r.currency,
            today: r.today, last7: r.last7, last30: r.last30, allTime: r.allTime,
            mrr: r.mrr, activeSubscribers: r.activeSubscribers, topOffers: r.topOffers, note: r.note,
          },
        };
      }

      case "list_clients": {
        const wantStatus = args.status === "all" ? null : "active";
        const limit = Math.min(50, Math.max(1, num(args.limit, 15)));
        let q = ctx.supabase
          .from("clients")
          .select("name, status, mrr, total_pending")
          .eq("agency_id", ctx.agencyId);
        if (wantStatus) q = q.eq("status", wantStatus);
        const { data, error } = await q.order("mrr", { ascending: false }).limit(limit);
        if (error) return { ok: false, summary: "Couldn't list clients", data: { error: error.message } };
        return { ok: true, summary: `Listed ${data?.length ?? 0} client(s)`, data: data ?? [] };
      }

      case "create_task": {
        const title = String(args.title ?? "").trim();
        if (!title) return { ok: false, summary: "Task needs a title" };
        let clientId: string | null = null;
        if (args.client_name) {
          const { data: c } = await ctx.supabase
            .from("clients")
            .select("id")
            .eq("agency_id", ctx.agencyId)
            .ilike("name", `%${String(args.client_name)}%`)
            .limit(1)
            .maybeSingle();
          clientId = c?.id ?? null;
        }
        const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
        const pr = String(args.priority);
        const priority: (typeof PRIORITIES)[number] =
          (PRIORITIES as readonly string[]).includes(pr) ? (pr as (typeof PRIORITIES)[number]) : "medium";
        const due_date = args.due_date ? parseDueDate(String(args.due_date)) : null;
        const { data, error } = await ctx.supabase
          .from("tasks")
          .insert({
            agency_id: ctx.agencyId,
            title: title.slice(0, 280),
            description: args.description ? String(args.description).slice(0, 2000) : null,
            status: "todo",
            priority,
            due_date,
            client_id: clientId,
            created_by: ctx.userId,
          })
          .select("id")
          .single();
        if (error) return { ok: false, summary: "Couldn't create task", data: { error: error.message } };
        return {
          ok: true,
          summary: `Created task “${title.slice(0, 60)}”`,
          data: { id: data.id, title, priority, due_date, attached_client: clientId ? true : false },
        };
      }

      case "draft_email": {
        const subject = String(args.subject ?? "").trim();
        const body = String(args.body ?? "").trim();
        if (!subject || !body) return { ok: false, summary: "Draft needs a subject and body" };
        const draft = `${args.to ? `To: ${String(args.to)}\n` : ""}Subject: ${subject}\n\n${body}`;
        return { ok: true, summary: `Drafted email “${subject.slice(0, 60)}”`, data: { draft, sent: false } };
      }

      default:
        return { ok: false, summary: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, summary: "Tool error", data: { error: e instanceof Error ? e.message : "unknown" } };
  }
}
