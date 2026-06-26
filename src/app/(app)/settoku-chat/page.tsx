import { SettokuChat } from "./settoku-chat-ui";
import { getAuthContext } from "@/lib/auth";
import { activeProvider } from "@/lib/settoku/provider";

export const dynamic = "force-dynamic";

export default async function SettokuChatPage() {
  const { supabase, user, agencyId } = await getAuthContext();

  // Scope the thread list to the ACTIVE workspace so each client gets its own chat history.
  // One user can belong to many workspaces (the coach, the creator, …); without this filter they'd all
  // share one thread list and the chats would bleed across clients. New conversations are
  // already tagged with agency_id on insert, so this filter cleanly separates them.
  let q = supabase
    .from("settoku_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id);
  if (agencyId) q = q.eq("agency_id", agencyId);

  const [{ data: conversations }, { data: agency }] = await Promise.all([
    q.order("updated_at", { ascending: false }).limit(20),
    agencyId
      ? supabase.from("agencies").select("name").eq("id", agencyId).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
  ]);

  const provider = activeProvider();
  return (
    <SettokuChat
      conversations={conversations ?? []}
      userId={user.id}
      agencyId={agencyId ?? ""}
      workspaceName={agency?.name ?? null}
      defaultModel={provider.model}
    />
  );
}
