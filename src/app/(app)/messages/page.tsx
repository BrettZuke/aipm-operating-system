import { MessageSquare, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { supabase, user, agencyId } = await getAuthContext();
  void user;
  const { data: threads } = await supabase
    .from("settoku_conversations")
    .select("id,title,updated_at,user_id,profiles:user_id(full_name,email)")
    .eq("agency_id", agencyId!)
    .order("updated_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5F7]">Messages</h1>
          <p className="mt-1 text-sm text-[#9CA3AF] max-w-lg">Keep client and team communication inside Settoku with shared threads, searchable history, and live updates.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
          <MessageSquare className="size-4" /> New thread
        </button>
      </div>

      <div className="grid grid-cols-5 gap-0 overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
        {/* Inbox */}
        <div className="col-span-2 border-r border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60">
          <div className="border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#F5F5F7]">Inbox</div>
                <div className="text-xs text-[#6B7280]">{threads?.length ?? 0} conversations</div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">Live</span>
            </div>
            <div className="mt-3 relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input placeholder="Search messages" className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10] pl-9 pr-3 text-sm text-[rgba(245,245,247,0.8)] placeholder:text-[#6B7280] focus:outline-none" />
            </div>
          </div>
          {!threads?.length ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] mb-4">
                <MessageSquare className="size-5 text-[#6B7280]" />
              </div>
              <div className="text-base font-medium text-[rgba(245,245,247,0.8)]">No conversations yet</div>
              <p className="mt-1 text-sm text-[#9CA3AF]">Start a thread for a client handoff, internal update, or project discussion.</p>
              <button className="mt-5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Start first thread</button>
            </div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.08)]">
              {threads.map(t => (
                <div key={t.id} className="cursor-pointer px-5 py-3.5 hover:bg-[rgba(255,255,255,0.06)]/60">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#F5F5F7] truncate">{t.title ?? "Untitled"}</span>
                    <span className="text-xs text-[#9CA3AF] shrink-0 ml-2">{new Date(t.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conversation area */}
        <div className="col-span-3 flex flex-col items-center justify-center bg-[#09090C]/40 px-10 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)]/60 mb-4">
            <Users className="size-6 text-[#6B7280]" />
          </div>
          <div className="text-lg font-semibold text-[#F5F5F7]">Choose a conversation</div>
          <p className="mt-1 max-w-xs text-sm text-[#9CA3AF]">Select a thread from the inbox to read messages, reply, and keep work moving.</p>
          <button className="mt-6 rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600">New thread</button>
        </div>
      </div>
    </div>
  );
}

function Users({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>;
}
