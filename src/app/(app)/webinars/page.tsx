import Link from "next/link";
import { Calendar, Users, MessageSquare, ArrowRight } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { CreateWebinarDialog } from "./create-webinar-dialog";

export const dynamic = "force-dynamic";

type WebinarRow = {
  id: string;
  title: string;
  starts_at: string;
  join_url: string | null;
  template_24h: string | null;
};

export default async function WebinarsPage() {
  const { supabase, agencyId } = await getAuthContext();

  const { data: webinars } = await supabase
    .from("webinars")
    .select("id,title,starts_at,join_url,template_24h")
    .eq("agency_id", agencyId!)
    .order("starts_at", { ascending: false });

  // Per-webinar registration counts
  const counts = new Map<string, { total: number; phoned: number }>();
  if (webinars && webinars.length > 0) {
    const ids = webinars.map(w => w.id);
    const { data: regs } = await supabase
      .from("webinar_registrations")
      .select("webinar_id,phone")
      .in("webinar_id", ids);
    for (const r of regs ?? []) {
      const c = counts.get(r.webinar_id) ?? { total: 0, phoned: 0 };
      c.total++;
      if (r.phone) c.phoned++;
      counts.set(r.webinar_id, c);
    }
  }

  const now = Date.now();
  const upcoming: WebinarRow[] = [];
  const past: WebinarRow[] = [];
  for (const w of webinars ?? []) {
    if (new Date(w.starts_at).getTime() >= now) upcoming.push(w);
    else past.push(w);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">EVENTS · WEBINARS</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Webinars</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Schedule a webinar, paste in attendees, and Settoku auto-fires SMS reminders at T-24h, T-1h, T-15m and live.</p>
        </div>
        <CreateWebinarDialog />
      </header>

      {(webinars?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] py-16 text-center">
          <Calendar className="mx-auto size-8 text-[#6B7280] mb-3" />
          <div className="text-base font-medium text-[#F5F5F7]">No webinars scheduled yet</div>
          <p className="mt-1 max-w-md mx-auto text-sm text-[#9CA3AF]">Create your first webinar — Settoku will pull registrations and auto-text reminders so attendance stays high.</p>
          <div className="mt-6"><CreateWebinarDialog /></div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && <WebinarSection title="Upcoming" rows={upcoming} counts={counts} />}
          {past.length > 0 && <WebinarSection title="Past" rows={past} counts={counts} />}
        </>
      )}
    </div>
  );
}

function WebinarSection({ title, rows, counts }: { title: string; rows: WebinarRow[]; counts: Map<string, { total: number; phoned: number }> }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">{title}</h2>
      <div className="space-y-2">
        {rows.map(w => {
          const c = counts.get(w.id) ?? { total: 0, phoned: 0 };
          const when = new Date(w.starts_at);
          return (
            <Link
              key={w.id}
              href={`/webinars/${w.id}`}
              className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 px-5 py-4 hover:border-[rgba(255,255,255,0.16)] hover:bg-[#0C0C10]/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#F5F5F7]">{w.title}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-[#9CA3AF]">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3" />
                    {when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3" />
                    {c.total} registered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="size-3" />
                    {c.phoned} with phone
                  </span>
                </div>
              </div>
              <ArrowRight className="size-4 text-[#6B7280]" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
