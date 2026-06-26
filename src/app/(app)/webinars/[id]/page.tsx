import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Users, MessageSquare, ExternalLink } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { EditWebinarDialog } from "../edit-webinar-dialog";
import { AddRegistrationsDialog } from "../add-registrations-dialog";
import { BlastButton } from "../blast-button";

export const dynamic = "force-dynamic";

type WebinarRow = {
  id: string;
  agency_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  join_url: string | null;
  template_24h: string | null;
  template_1h: string | null;
  template_15m: string | null;
  template_live: string | null;
};

type RegRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  registered_at: string;
  sent_24h_at: string | null;
  sent_1h_at: string | null;
  sent_15m_at: string | null;
  sent_live_at: string | null;
  last_send_error: string | null;
};

export default async function WebinarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, agencyId } = await getAuthContext();

  const { data: webinar } = await supabase
    .from("webinars")
    .select("id,agency_id,title,starts_at,ends_at,join_url,template_24h,template_1h,template_15m,template_live")
    .eq("agency_id", agencyId!)
    .eq("id", id)
    .maybeSingle();
  if (!webinar) notFound();
  const w = webinar as WebinarRow;

  const regs = await fetchAllPages<RegRow>(async (from, to) => {
    const r = await supabase
      .from("webinar_registrations")
      .select("id,name,email,phone,source,registered_at,sent_24h_at,sent_1h_at,sent_15m_at,sent_live_at,last_send_error")
      .eq("webinar_id", id)
      .order("registered_at", { ascending: false })
      .range(from, to);
    return { data: (r.data ?? null) as RegRow[] | null, error: r.error };
  });

  const totalRegs = regs.length;
  const withPhone = regs.filter(r => r.phone).length;
  const sent24 = regs.filter(r => r.sent_24h_at).length;
  const sent1h = regs.filter(r => r.sent_1h_at).length;
  const sent15 = regs.filter(r => r.sent_15m_at).length;
  const sentLive = regs.filter(r => r.sent_live_at).length;
  const startsAt = new Date(w.starts_at);
  const minutesUntil = Math.round((startsAt.getTime() - Date.now()) / 60000);
  const isUpcoming = minutesUntil > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/webinars" className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[rgba(245,245,247,0.8)]">
          <ArrowLeft className="size-3.5" />Back to webinars
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>{w.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#9CA3AF]">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {startsAt.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
              {" · "}
              {startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} UTC
            </span>
            {isUpcoming && <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">{minutesUntil < 60 ? `${minutesUntil} min away` : minutesUntil < 24 * 60 ? `${Math.round(minutesUntil / 60)} hours away` : `${Math.round(minutesUntil / 1440)} days away`}</span>}
            {!isUpcoming && <span className="rounded-md bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-xs font-medium text-[#6B7280]">Past</span>}
            {w.join_url && (<a href={w.join_url} target="_blank" rel="noopener" className="flex items-center gap-1 text-blue-400 hover:underline"><ExternalLink className="size-3" />join URL</a>)}
          </div>
        </div>
        <EditWebinarDialog webinar={w} />
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-5 gap-3">
        <Stat label="Registered" value={totalRegs} icon={Users} />
        <Stat label="With phone" value={withPhone} icon={MessageSquare} />
        <Stat label="24h sent" value={sent24} />
        <Stat label="1h sent" value={sent1h} />
        <Stat label="Live sent" value={sentLive} />
      </div>

      {/* Blast controls */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F5F5F7]">Send a blast</h2>
          <span className="text-xs text-[#6B7280]">Use these to manually fire reminders. The cron also auto-sends inside each window.</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BlastButton webinarId={w.id} kind="24h"  label="T-24h"  templateConfigured={!!w.template_24h}  unsentCount={withPhone - sent24} />
          <BlastButton webinarId={w.id} kind="1h"   label="T-1h"   templateConfigured={!!w.template_1h}   unsentCount={withPhone - sent1h} />
          <BlastButton webinarId={w.id} kind="15m"  label="T-15m"  templateConfigured={!!w.template_15m}  unsentCount={withPhone - sent15} />
          <BlastButton webinarId={w.id} kind="live" label="LIVE"   templateConfigured={!!w.template_live} unsentCount={withPhone - sentLive} />
        </div>
      </section>

      {/* Registrations */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F5F5F7]">Registrations</h2>
          <AddRegistrationsDialog webinarId={w.id} />
        </div>
        {regs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] py-12 text-center text-sm text-[#9CA3AF]">
            No registrations yet. Click “Add registrations” to paste a CSV.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-center">24h</th>
                  <th className="px-4 py-3 text-center">1h</th>
                  <th className="px-4 py-3 text-center">15m</th>
                  <th className="px-4 py-3 text-center">Live</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                {regs.slice(0, 200).map(r => (
                  <tr key={r.id} className="hover:bg-[#0C0C10]/40">
                    <td className="px-4 py-3 text-[#F5F5F7]">{r.name ?? "—"}</td>
                    <td className="px-4 py-3 text-[#9CA3AF]">{r.email ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[#9CA3AF]">{r.phone ?? <span className="text-[#6B7280]">—</span>}</td>
                    <td className="px-4 py-3 text-center">{r.sent_24h_at ? "✓" : ""}</td>
                    <td className="px-4 py-3 text-center">{r.sent_1h_at ? "✓" : ""}</td>
                    <td className="px-4 py-3 text-center">{r.sent_15m_at ? "✓" : ""}</td>
                    <td className="px-4 py-3 text-center">{r.sent_live_at ? "✓" : ""}</td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {regs.length > 200 && <div className="border-t border-[rgba(255,255,255,0.08)] px-4 py-2 text-xs text-[#6B7280]">Showing 200 of {regs.length}.</div>}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon?: typeof Users }) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</span>
        {Icon && <Icon className="size-3.5 text-[#6B7280]" />}
      </div>
      <div className="mt-2 text-2xl font-bold text-[#F5F5F7] tabular-nums">{value}</div>
    </div>
  );
}
