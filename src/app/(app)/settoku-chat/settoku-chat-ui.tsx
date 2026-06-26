"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Plus, Send, Sparkles, Bot, User, Mic, Play, Eye, Inbox, Wrench, FileText, Target, Zap, Trash2, Wand2, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const SUGGESTIONS = [
  { group: "WORKSPACE", items: [
    "Summarize this week — revenue, calls, pipeline, what changed",
    "Which clients dropped in revenue this month vs last?",
    "Who on the team is behind quota and by how much?",
  ]},
  { group: "MESSAGES", items: [
    "Pull this YouTube video and summarize the key points",
    "Research the top 3 lead-gen plays for high-ticket coaches in 2026",
    "Find what changed in our Meta ads in the last 7 days that explains the CPL dip",
  ]},
  { group: "GO", items: [
    "Create a task to follow up on this",
    "Generate this week's operational report and email it",
    "Draft a recap doc for {client} for our next call",
  ]},
];

const ACTION_CHIPS = [
  { icon: Eye, label: "Research", prompt: "Research " },
  { icon: FileText, label: "Report", prompt: "Generate a short report on this workspace: revenue today / last 7d / last 30d, MRR, top clients, and 3 things to focus on this week." },
  { icon: Play, label: "Run SOP", prompt: "Run SOP: " },
  { icon: Sparkles, label: "Generate", prompt: "Generate " },
  { icon: Mic, label: "Transcribe", prompt: "Transcribe this: " },
];

// Free, tool-capable Groq models. Must match the allowlist in api/ai/chat/route.ts.
const MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", note: "balanced" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "most accurate" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout", note: "newest" },
  { id: "qwen/qwen3-32b", label: "Qwen3 32B", note: "reasoning" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", note: "fastest" },
];

// Skills = one-click structured prompts that lean on the chat's tools.
const SKILLS = [
  { label: "Weekly report", prompt: "Generate this week's report: revenue today / last 7d / last 30d, MRR, top clients, pipeline, and the 3 most important things to focus on." },
  { label: "Client health check", prompt: "Review my clients and flag any that look at-risk (low or dropping MRR). List them with the reason." },
  { label: "Revenue breakdown", prompt: "Break down revenue by offer/source for the last 30 days and call out what's growing vs shrinking." },
  { label: "Plan my day", prompt: "Based on my pipeline and goals, create 3 high-priority tasks for today and list them." },
  { label: "Re-engagement email", prompt: "Draft a short, friendly re-engagement email for a client who's gone quiet — under 120 words." },
];

type Conversation = { id: string; title: string | null; updated_at: string };
type ToolEvent = { name: string; ok: boolean; summary: string };
type Message = { role: "user" | "assistant"; content: string; id?: string; tools?: ToolEvent[] };

export function SettokuChat({ conversations: initial, userId, agencyId, workspaceName, defaultModel }: { conversations: Conversation[]; userId: string; agencyId: string; workspaceName?: string | null; defaultModel?: string }) {
  const [conversations, setConversations] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionTools, setSessionTools] = useState<(ToolEvent & { at: number })[]>([]);
  const [model, setModel] = useState<string>(defaultModel && MODELS.some(m => m.id === defaultModel) ? defaultModel : MODELS[0].id);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Restore the user's last model choice.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("settoku-chat-model") : null;
    if (saved && MODELS.some(m => m.id === saved)) setModel(saved);
  }, []);

  function chooseModel(id: string) {
    setModel(id);
    try { window.localStorage.setItem("settoku-chat-model", id); } catch { /* private mode */ }
  }

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase.from("settoku_messages").select("id,role,content,created_at").eq("conversation_id", activeId).order("created_at").then(({ data }) => {
      setMessages((data ?? []).map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content ?? "" })));
    });
  }, [activeId]);

  // Scroll ONLY the message list — never scrollIntoView here. scrollIntoView bubbles up and
  // scrolls the page's <main> too, which drags the chat up and clips the header off the top.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function newConversation() {
    const { data } = await supabase.from("settoku_conversations").insert({ user_id: userId, agency_id: agencyId, title: "New chat" }).select("id,title,updated_at").single();
    if (!data) return;
    setConversations(prev => [{ ...data, title: data.title ?? "New chat" }, ...prev]);
    setActiveId(data.id);
    setMessages([]);
  }

  // Clear the current chat: delete the active conversation + its messages, then reset to a blank slate.
  async function clearChat() {
    if (activeId) {
      await supabase.from("settoku_messages").delete().eq("conversation_id", activeId);
      await supabase.from("settoku_conversations").delete().eq("id", activeId);
      setConversations(prev => prev.filter(c => c.id !== activeId));
    }
    setActiveId(null);
    setMessages([]);
    setSessionTools([]);
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");

    let convId = activeId;
    if (!convId) {
      const { data } = await supabase.from("settoku_conversations").insert({ user_id: userId, agency_id: agencyId, title: userMsg.slice(0, 60) }).select("id,title,updated_at").single();
      if (!data) return;
      convId = data.id;
      setConversations(prev => [{ ...data, title: data.title ?? "New chat" }, ...prev]);
      setActiveId(convId);
    }

    // Save user message
    await supabase.from("settoku_messages").insert({ conversation_id: convId, role: "user", content: userMsg });
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);

    setStreaming(true);
    let assistantContent = "";
    const toolEvents: ToolEvent[] = [];

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, { role: "user", content: userMsg }], conversationId: convId, model }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      const flush = () => setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: assistantContent, tools: toolEvents.length ? [...toolEvents] : undefined };
        return next;
      });
      // Buffer partial lines across network chunks so a split JSON line never breaks parsing.
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("0:")) {
            try { assistantContent += JSON.parse(line.slice(2)); flush(); } catch {}
          } else if (line.startsWith("t:")) {
            try {
              const ev = JSON.parse(line.slice(2)) as ToolEvent;
              toolEvents.push(ev);
              setSessionTools(prev => [{ ...ev, at: Date.now() }, ...prev].slice(0, 25));
              flush();
            } catch {}
          }
        }
      }
    } catch (e) {
      assistantContent = "⚠️ Settoku Chat hit a problem reaching the AI. Please try again in a moment.";
      setMessages(prev => [...prev, { role: "assistant", content: assistantContent }]);
    }

    // Save assistant message
    await supabase.from("settoku_messages").insert({ conversation_id: convId, role: "assistant", content: assistantContent });
    await supabase.from("settoku_conversations").update({ updated_at: new Date().toISOString(), title: userMsg.slice(0, 60) }).eq("id", convId);
    setStreaming(false);
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]">
      {/* Sidebar */}
      <div className="flex w-60 flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60">
        <div className="border-b border-[rgba(255,255,255,0.08)] p-3">
          <button onClick={newConversation} className="flex w-full items-center gap-2 rounded-md border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.06)]">
            <Plus className="size-4" /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && <p className="px-3 py-6 text-center text-xs text-[#6B7280]">No chats yet</p>}
          {conversations.map(c => (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm truncate transition-colors ${c.id === activeId ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)]/60 hover:text-[#F5F5F7]"}`}>
              <MessageSquare className="inline size-3.5 mr-2 opacity-50" />{c.title ?? "New chat"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-2.5">
          <Sparkles className="size-4 shrink-0 text-blue-400" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-[#F5F5F7]">{workspaceName ?? "Settoku Chat"}</span>
            <span className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 sm:inline-flex" title="Runs on free Groq models — private to this workspace.">
              <Zap className="size-3" /> Free · private
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {/* Skills */}
            <div className="relative">
              <button onClick={() => setSkillsOpen(o => !o)} className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">
                <Wand2 className="size-3.5" /> Skills <ChevronDown className="size-3" />
              </button>
              {skillsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSkillsOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] p-1 shadow-xl">
                    {SKILLS.map(s => (
                      <button key={s.label} onClick={() => { setInput(s.prompt); setSkillsOpen(false); }} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[rgba(245,245,247,0.85)] hover:bg-[rgba(255,255,255,0.06)]">
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Model switcher — every option is a free Groq model */}
            <div className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5" title="Switch model — all free, no per-message cost. GPT-OSS 120B is the most accurate.">
              <Zap className="size-3.5 shrink-0 text-emerald-400" />
              <select value={model} onChange={e => chooseModel(e.target.value)} className="cursor-pointer bg-transparent text-xs font-medium text-emerald-400 focus:outline-none">
                {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0C0C10] text-[#F5F5F7]">{m.label} ({m.note})</option>)}
              </select>
            </div>
            {/* Clear chat — labeled so it's unmistakable */}
            <button onClick={clearChat} title="Delete this conversation and start fresh" className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-xs text-[#9CA3AF] hover:border-red-500/30 hover:text-red-300">
              <Trash2 className="size-3.5" /> Clear
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col h-full">
              <div className="flex flex-col items-center text-center pt-6 pb-4">
                <div className="flex size-14 items-center justify-center rounded-full bg-blue-500/15 mb-4"><Sparkles className="size-6 text-blue-400" /></div>
                <h3 className="text-2xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>How can I help today?</h3>
              </div>

              {/* Action chips */}
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {ACTION_CHIPS.map(c => (
                  <button key={c.label} onClick={() => setInput(c.prompt)} className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7] hover:border-[rgba(255,255,255,0.18)]">
                    <c.icon className="size-3" /> {c.label}
                  </button>
                ))}
              </div>

              {/* Suggestion tiles */}
              <div className="grid grid-cols-3 gap-3">
                {SUGGESTIONS.map(group => (
                  <div key={group.group} className="space-y-2">
                    <div className="px-1 text-[10px] font-semibold tracking-widest text-[#6B7280]">{group.group}</div>
                    {group.items.map(s => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="block w-full rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-left text-xs text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                      >{s}</button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-blue-500" : "bg-[rgba(255,255,255,0.06)]"}`}>
                {m.role === "user" ? <User className="size-4 text-white" /> : <Bot className="size-4 text-[rgba(245,245,247,0.8)]" />}
              </div>
              <div className={`flex flex-col gap-1.5 max-w-[75%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((t, ti) => (
                      <span key={ti} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${t.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>
                        <Wrench className="size-2.5" /> {t.summary}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-blue-500 text-white rounded-tr-sm" : "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7] rounded-tl-sm"}`}>
                  {m.content || (streaming && i === messages.length - 1 ? <span className="animate-pulse">●</span> : "")}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[rgba(255,255,255,0.08)] p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask Settoku · use / for capabilities · hold mic to talk…"
              disabled={streaming}
              className="flex-1 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-4 py-2.5 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button onClick={sendMessage} disabled={streaming || !input.trim()} className="rounded-lg bg-blue-500 px-4 py-2.5 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-[#9CA3AF]">Messages are saved to your workspace history.</p>
        </div>
      </div>

      {/* Right rail */}
      <div className="hidden xl:flex w-72 flex-col border-l border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 overflow-y-auto">
        <RightRailSection icon={Play} title="Active runs" empty="Trigger one with /run" emptyHint="No runs in flight." />
        <RightRailSection icon={Inbox} title="Needs review" empty="No items." emptyHint="Settoku surfaces drafts and proposed actions here." />
        <RightRailSection icon={FileText} title="Open transcripts" empty="No items." emptyHint="Call transcripts ready to review will land here." />
        <RightRailSection icon={Target} title="Agent-proposed edits" empty="Inbox clear." emptyHint="When Settoku drafts a SOP edit, it waits for your review." />
        {sessionTools.length > 0 ? (
          <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="size-3.5 text-[#9CA3AF]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Recent tool calls</span>
            </div>
            <div className="space-y-1.5">
              {sessionTools.map((t, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px]">
                  <span className={t.ok ? "text-emerald-400" : "text-red-400"}>{t.ok ? "✓" : "✕"}</span>
                  <span className="text-[#9CA3AF]">{t.summary}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <RightRailSection icon={Wrench} title="Recent tool calls" empty="No recent tool calls yet." emptyHint="Every Settoku action — query, write, draft — is logged here." />
        )}
      </div>
    </div>
  );
}

function RightRailSection({ icon: Icon, title, empty, emptyHint }: {
  icon: React.ComponentType<{ className?: string }>; title: string; empty: string; emptyHint: string;
}) {
  return (
    <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3.5 text-[#9CA3AF]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">{title}</span>
      </div>
      <div className="text-xs text-[#6B7280]">{empty}</div>
      <div className="mt-0.5 text-[11px] text-[#4B5563]">{emptyHint}</div>
    </div>
  );
}
