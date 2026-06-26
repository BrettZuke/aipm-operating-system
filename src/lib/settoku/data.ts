import { getSettokuClient } from "./client";

const PIPELINE_STAGES = ["new_lead", "qualifying", "link_sent", "booked", "closed"] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

const SIGNAL_WEIGHTS: Record<string, number> = {
  current_situation: 1, job: 1, pain: 2, dream: 2,
  desired_outcome: 2, budget_signal: 1, buying_intent: 3,
};

export type DmMetrics = {
  total: number; applied: number; booked: number;
  dq: number; ghosted: number; conversion_rate: number;
  daily: { date: string; APPLY: number; CONFIRMED: number; DISQUALIFY: number; COMMUNITY: number; CONTINUE: number }[];
};

export type Conversation = {
  contact_id: string; instagram_handle: string | null;
  last_tag: string | null; lead_source: string | null;
  message_count: number; last_message_at: string | null;
  paused: boolean; messages: { role: string; content: string }[] | null;
};

export type PipelineData = { columns: Record<PipelineStage, PipelineCard[]>; totals: Record<PipelineStage, number> };
type PipelineCard = { contact_id: string; handle: string; message_count: number; last_message_at: string | null; lead_source: string | null; last_tag: string | null; preview: string };

export type Lead = {
  contact_id: string; handle: string; score: number;
  job: string | null; pain: string | null; dream: string | null;
  budget_signal: string | null; buying_intent: string | null;
  objection_type: string | null; ai_summary: string | null;
  last_tag: string | null; message_count: number; last_message_at: string | null; lead_source: string | null;
};

export type KeywordRow = { opener: string; total: number; replied: number; applied: number; booked: number; dq: number; reply_rate: number; book_rate: number };

export type VoiceMetrics = {
  total: number; picked_up: number; sms_sent: number; booked: number;
  pickup_rate: number; sms_rate: number; booking_rate: number;
  by_agent: { name: string; fired: number; picked_up: number; booked: number; pickup_rate: number; booking_rate: number }[];
  daily: { date: string; fired: number; picked_up: number; booked: number }[];
  queue_pending: number; queue_calling: number;
};

export type VoiceCall = {
  call_id: string; agent_name: string | null; lead_phone: string | null; lead_name: string | null;
  call_started_at: string | null; duration_ms: number | null;
  picked_up: boolean; sms_sent: boolean; led_to_booking: boolean;
  disconnection_reason: string | null;
};

function isBooked(tag: string | null) { return tag === "CONFIRMED" || tag === "COMMUNITY"; }
function isApplied(tag: string | null) { return tag === "APPLY" || tag === "CONFIRMED" || tag === "COMMUNITY"; }
function isGhosted(tag: string | null, lastMsg: string | null): boolean {
  if (isApplied(tag) || tag === "DISQUALIFY") return false;
  if (!lastMsg) return false;
  return (Date.now() - new Date(lastMsg).getTime()) > 48 * 60 * 60 * 1000;
}

export async function fetchDmMetrics(): Promise<DmMetrics> {
  const sb = getSettokuClient();
  const { data: rows } = await sb
    .from("dm_conversations")
    .select("contact_id,last_tag,last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(2000);

  const r = rows ?? [];
  const total = r.length;
  const applied = r.filter(c => isApplied(c.last_tag)).length;
  const booked = r.filter(c => isBooked(c.last_tag)).length;
  const dq = r.filter(c => c.last_tag === "DISQUALIFY").length;
  const ghosted = r.filter(c => isGhosted(c.last_tag, c.last_message_at)).length;
  const conversion_rate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;

  // daily breakdown last 30 days
  const days: Record<string, Record<string, number>> = {};
  const tags = ["APPLY", "CONFIRMED", "DISQUALIFY", "COMMUNITY", "CONTINUE"];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days[d] = { APPLY: 0, CONFIRMED: 0, DISQUALIFY: 0, COMMUNITY: 0, CONTINUE: 0 };
  }
  for (const c of r) {
    const d = c.last_message_at?.slice(0, 10);
    if (!d || !days[d]) continue;
    const tag = c.last_tag ?? "CONTINUE";
    if (tags.includes(tag)) days[d][tag]++;
    else days[d].CONTINUE++;
  }
  const daily = Object.entries(days).map(([date, v]) => ({ date, ...v } as DmMetrics["daily"][number]));

  return { total, applied, booked, dq, ghosted, conversion_rate, daily };
}

export async function fetchConversations(): Promise<Conversation[]> {
  const sb = getSettokuClient();
  const { data } = await sb
    .from("dm_conversations")
    .select("contact_id,instagram_handle,messages,last_tag,lead_source,message_count,last_message_at,paused")
    .order("last_message_at", { ascending: false })
    .limit(100);
  return (data ?? []) as Conversation[];
}

export async function fetchPipeline(): Promise<PipelineData> {
  const sb = getSettokuClient();
  const { data: rows } = await sb
    .from("dm_conversations")
    .select("contact_id,instagram_handle,funnel_stage,last_tag,last_message_at,message_count,lead_source,messages")
    .order("last_message_at", { ascending: false })
    .limit(500);

  const cols: Record<PipelineStage, PipelineCard[]> = { new_lead: [], qualifying: [], link_sent: [], booked: [], closed: [] };
  for (const c of rows ?? []) {
    const tag = c.last_tag as string | null;
    let col: PipelineStage;
    if (tag === "CONFIRMED" || tag === "COMMUNITY") col = "booked";
    else if (tag === "DISQUALIFY") col = "closed";
    else if (tag === "APPLY") col = "link_sent";
    else if (PIPELINE_STAGES.includes(c.funnel_stage as PipelineStage)) col = c.funnel_stage as PipelineStage;
    else if ((c.message_count ?? 0) <= 2) col = "new_lead";
    else col = "qualifying";

    const msgs: { content?: string }[] = c.messages ?? [];
    const lastMsg = msgs[msgs.length - 1];
    cols[col].push({
      contact_id: c.contact_id,
      handle: c.instagram_handle || c.contact_id,
      message_count: c.message_count ?? 0,
      last_message_at: c.last_message_at,
      lead_source: c.lead_source,
      last_tag: tag,
      preview: (lastMsg?.content ?? "").slice(0, 48),
    });
  }
  return { columns: cols, totals: Object.fromEntries(PIPELINE_STAGES.map(s => [s, cols[s].length])) as Record<PipelineStage, number> };
}

export async function fetchLeads(): Promise<Lead[]> {
  const sb = getSettokuClient();
  const [{ data: profiles }, { data: convos }] = await Promise.all([
    sb.from("lead_profiles").select("contact_id,instagram_handle,job,pain,dream,desired_outcome,budget_signal,buying_intent,objection_type,ai_summary,current_situation").order("updated_at", { ascending: false }).limit(200),
    sb.from("dm_conversations").select("contact_id,instagram_handle,last_tag,message_count,last_message_at,lead_source").limit(200),
  ]);
  const convoMap = Object.fromEntries((convos ?? []).map(c => [c.contact_id, c]));
  const leads: Lead[] = (profiles ?? []).map(p => {
    const c = convoMap[p.contact_id] ?? {};
    let score = 0;
    for (const [field, weight] of Object.entries(SIGNAL_WEIGHTS)) {
      if ((p as Record<string, unknown>)[field]) score += weight;
    }
    if (p.objection_type) score -= 1;
    if (isBooked(c.last_tag)) score += 5;
    else if (c.last_tag === "APPLY") score += 3;
    return {
      contact_id: p.contact_id,
      handle: c.instagram_handle || p.instagram_handle || p.contact_id,
      score, job: p.job, pain: p.pain,
      dream: p.dream || p.desired_outcome,
      budget_signal: p.budget_signal, buying_intent: p.buying_intent,
      objection_type: p.objection_type, ai_summary: p.ai_summary,
      last_tag: c.last_tag ?? null, message_count: c.message_count ?? 0,
      last_message_at: c.last_message_at ?? null, lead_source: c.lead_source ?? null,
    };
  });
  return leads.sort((a, b) => b.score - a.score);
}

export async function fetchKeywords(): Promise<KeywordRow[]> {
  const sb = getSettokuClient();
  const [{ data: openers }, { data: convos }] = await Promise.all([
    sb.from("boosend_openers").select("contact_id,opener_message").order("created_at", { ascending: false }).limit(500),
    sb.from("dm_conversations").select("contact_id,last_tag").limit(500),
  ]);
  const tagMap = Object.fromEntries((convos ?? []).map(c => [c.contact_id, c.last_tag]));
  const by: Record<string, KeywordRow> = {};
  for (const o of openers ?? []) {
    const opener = (o.opener_message ?? "").trim().slice(0, 80);
    if (!opener) continue;
    if (!by[opener]) by[opener] = { opener, total: 0, replied: 0, applied: 0, booked: 0, dq: 0, reply_rate: 0, book_rate: 0 };
    by[opener].total++;
    const tag = tagMap[o.contact_id];
    if (tag) {
      by[opener].replied++;
      if (isApplied(tag)) by[opener].applied++;
      if (isBooked(tag)) by[opener].booked++;
      if (tag === "DISQUALIFY") by[opener].dq++;
    }
  }
  return Object.values(by).map(k => ({
    ...k,
    reply_rate: k.total ? Math.round((k.replied / k.total) * 1000) / 10 : 0,
    book_rate: k.total ? Math.round((k.booked / k.total) * 1000) / 10 : 0,
  })).sort((a, b) => b.total - a.total).slice(0, 30);
}

export async function fetchVoiceMetrics(): Promise<VoiceMetrics> {
  const sb = getSettokuClient();
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: rows } = await sb
    .from("voice_calls")
    .select("call_id,agent_id,agent_name,call_started_at,picked_up,sms_sent,led_to_booking,duration_ms,disconnection_reason")
    .gte("call_started_at", cutoff)
    .order("call_started_at", { ascending: false })
    .limit(5000);

  const r = rows ?? [];
  const total = r.length;
  const picked_up = r.filter(c => c.picked_up).length;
  const sms_sent = r.filter(c => c.sms_sent).length;
  const booked = r.filter(c => c.led_to_booking).length;
  const pickup_rate = total ? Math.round((picked_up / total) * 1000) / 10 : 0;
  const sms_rate = picked_up ? Math.round((sms_sent / picked_up) * 1000) / 10 : 0;
  const booking_rate = picked_up ? Math.round((booked / picked_up) * 1000) / 10 : 0;

  const agentMap: Record<string, { name: string; fired: number; picked_up: number; booked: number }> = {};
  const dayMap: Record<string, { fired: number; picked_up: number; booked: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dayMap[d] = { fired: 0, picked_up: 0, booked: 0 };
  }
  for (const c of r) {
    const aid = c.agent_id ?? "unknown";
    if (!agentMap[aid]) agentMap[aid] = { name: c.agent_name ?? aid, fired: 0, picked_up: 0, booked: 0 };
    agentMap[aid].fired++;
    if (c.picked_up) agentMap[aid].picked_up++;
    if (c.led_to_booking) agentMap[aid].booked++;
    const d = c.call_started_at?.slice(0, 10);
    if (d && dayMap[d]) {
      dayMap[d].fired++;
      if (c.picked_up) dayMap[d].picked_up++;
      if (c.led_to_booking) dayMap[d].booked++;
    }
  }

  const by_agent = Object.values(agentMap).map(a => ({
    ...a,
    pickup_rate: a.fired ? Math.round((a.picked_up / a.fired) * 1000) / 10 : 0,
    booking_rate: a.picked_up ? Math.round((a.booked / a.picked_up) * 1000) / 10 : 0,
  })).sort((a, b) => b.fired - a.fired);

  let queueRows: { status: string }[] = [];
  try {
    const qr = await sb.from("voice_call_queue").select("status").limit(10000);
    queueRows = (qr.data ?? []) as { status: string }[];
  } catch { /* table may not exist */ }
  const queue_pending = (queueRows ?? []).filter((q: { status: string }) => q.status === "pending").length;
  const queue_calling = (queueRows ?? []).filter((q: { status: string }) => q.status === "calling").length;

  return {
    total, picked_up, sms_sent, booked,
    pickup_rate, sms_rate, booking_rate,
    by_agent,
    daily: Object.entries(dayMap).map(([date, v]) => ({ date, ...v })),
    queue_pending, queue_calling,
  };
}

export async function fetchVoiceCalls(limit = 100): Promise<VoiceCall[]> {
  const sb = getSettokuClient();
  const { data } = await sb
    .from("voice_calls")
    .select("call_id,agent_name,lead_phone,lead_name,call_started_at,duration_ms,picked_up,sms_sent,led_to_booking,disconnection_reason")
    .order("call_started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as VoiceCall[];
}
