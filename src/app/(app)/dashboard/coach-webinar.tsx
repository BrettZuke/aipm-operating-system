import { webinarjamEnabledFor, loadWebinarjamSnapshots, loadWebinarjamNotifications, type WjSnapshot, type WjRunNotifs, type WjNotif } from "@/lib/coach/webinarjam";
import { KpiCard } from "@/components/creator-dashboard/kpi-card";
import { BarList, SessionsSparkline } from "@/components/creator-dashboard/charts";
import { Funnel } from "@/components/creator-dashboard/funnel";
import { fmtInt, fmtPct, fmtDuration, fmtMoney } from "@/lib/creator/format";

// the coach's Webinar tab — WebinarJam / EverWebinar attendance + watch-time, live from the API.
// Gated to the coach's workspace upstream in page.tsx. Revenue and traffic source live on the
// Revenue and Analytics tabs (the coach tracks sales downstream of the webinar), so this tab
// stays focused on the funnel WebinarJam owns: register -> attend -> stay.

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// "Wed, 3 Jun 2026, 07:00 PM" -> "3 Jun 2026, 07:00 PM" (drop the weekday prefix)
function prettyDate(s: string): string {
  return s.replace(/^[A-Za-z]{3,9},\s*/, "").trim() || s;
}

function Panel({ title, badge, children }: { title?: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{title}</div>
          {badge && (
            <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]">{badge}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function NotifTable({ rows, rates }: { rows: WjNotif[]; rates: boolean }) {
  if (!rows.length) return <div className="text-xs text-[#6B7280]">None sent.</div>;
  return (
    <div className="space-y-1.5">
      {rows.map((n, i) => (
        <div key={i} className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.04)] py-1 text-sm last:border-0">
          <div className="min-w-0">
            <div className="truncate text-[#F5F5F7]" title={n.subject}>{n.subject || "(no subject)"}</div>
            {n.time && <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">{n.time}</div>}
          </div>
          <div className="ml-2 shrink-0 text-right font-mono text-xs tabular-nums text-[#9CA3AF]">
            <div className="text-[#F5F5F7]">{fmtInt(n.sent)} sent</div>
            {rates && n.sent > 0 && <div>{fmtPct(n.open / n.sent)} open · {fmtPct(n.click / n.sent)} click</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function WebinarBlock({ s, notifs }: { s: WjSnapshot; notifs: WjRunNotifs | null }) {
  const productLabel = s.product === "everwebinar" ? "Evergreen" : "Live";
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#F5F5F7]" style={{ fontFamily: "var(--font-playfair),Georgia,serif" }}>
            {s.name || "Webinar"}
          </h3>
          {s.eventDate && <div className="mt-0.5 text-xs text-[#9CA3AF]">Ran {prettyDate(s.eventDate)}</div>}
        </div>
        <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]">
          {productLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Registrations" value={fmtInt(s.registrations)} source="WebinarJam" />
        <KpiCard
          label="Live show rate"
          value={fmtPct(s.showRate)}
          hint={`${fmtInt(s.attendedLive)} attended live`}
          accent={s.showRate >= 0.4 ? "good" : "default"}
        />
        <KpiCard label="Avg watch time" value={fmtDuration(s.avgWatchSec)} hint={`median ${fmtDuration(s.medianWatchSec)}`} />
        <KpiCard label="Replay views" value={fmtInt(s.attendedReplay)} hint={`${fmtPct(s.replayRate)} of registrants`} />
      </div>

      {s.attendedLive > 0 && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-300/80">Still in the room at the pitch</div>
              <div className="mt-1 text-xs text-[#9CA3AF]">the coach makes the offer around {s.pitchMin} min in</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl leading-none tabular-nums text-[#F5F5F7]">{fmtInt(s.attendedAtPitch)}</div>
              <div className="mt-1 text-xs text-[#9CA3AF]">{fmtPct(s.attendedLive ? s.attendedAtPitch / s.attendedLive : 0)} of live attendees</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Attendance funnel">
          <Funnel
            steps={[
              { label: "Registered", value: s.registrations },
              { label: "Attended live", value: s.attendedLive },
              { label: "Watched replay", value: s.attendedReplay },
            ]}
          />
        </Panel>
        <Panel title="Still in the room at" badge="of live attendees">
          {s.retention.length ? (
            <BarList rows={s.retention} />
          ) : (
            <div className="text-xs text-[#6B7280]">No live attendance recorded yet.</div>
          )}
        </Panel>
      </div>
      <Panel title="Live watch time (drop-off)">
        {s.watchBuckets.length ? (
          <BarList rows={s.watchBuckets} />
        ) : (
          <div className="text-xs text-[#6B7280]">No live attendance recorded yet.</div>
        )}
      </Panel>

      {notifs && (notifs.email.length > 0 || notifs.sms.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {notifs.email.length > 0 && (
            <Panel title="Email performance" badge="WebinarJam">
              <NotifTable rows={notifs.email} rates />
            </Panel>
          )}
          {notifs.sms.length > 0 && (
            <Panel title="SMS" badge="WebinarJam">
              <NotifTable rows={notifs.sms} rates={false} />
            </Panel>
          )}
        </div>
      )}

      {s.inWebinarRevenue > 0 && (
        <Panel title="In-webinar sales" badge="WebinarJam-tracked">
          <div className="text-sm text-[#F5F5F7]">
            {fmtInt(s.buyers)} {s.buyers === 1 ? "buyer" : "buyers"} · {fmtMoney(s.inWebinarRevenue, "USD")}
          </div>
        </Panel>
      )}

      {s.regByDay.length > 1 && (
        <Panel title="Registrations over time">
          <SessionsSparkline points={s.regByDay} />
        </Panel>
      )}
    </section>
  );
}

export async function CoachWebinar({ agencyId }: { agencyId: string }) {
  if (!webinarjamEnabledFor(agencyId)) {
    return <div className="text-sm text-[#6B7280]">WebinarJam isn&apos;t connected for this workspace.</div>;
  }

  let snaps: WjSnapshot[] = [];
  let error: string | null = null;
  try {
    snaps = await loadWebinarjamSnapshots();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load WebinarJam data";
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm text-amber-300">
        Couldn&apos;t reach WebinarJam right now. {error}
      </div>
    );
  }
  if (!snaps.length) {
    return <div className="text-sm text-[#6B7280]">No webinars with registrations yet.</div>;
  }

  // Email/SMS notification stats (WebinarJam's own sender) are scraped + stored separately, then
  // matched to each run by date. Missing/unsynced → blocks just omit the Email/SMS panels.
  const notifications = await loadWebinarjamNotifications(agencyId).catch(() => null);

  return (
    <div className="space-y-8">
      <p className="text-xs text-[#6B7280]">
        Live from WebinarJam · updated {ago(snaps[0]!.fetchedAt)}. Each run shown separately, newest first. Sales and traffic source are on the Revenue and Analytics tabs.
      </p>
      {snaps.map((s) => (
        <WebinarBlock
          key={`${s.product}-${s.webinarId}-${s.eventId}`}
          s={s}
          notifs={notifications?.forRun(s.webinarId, s.eventTs) ?? null}
        />
      ))}
    </div>
  );
}
