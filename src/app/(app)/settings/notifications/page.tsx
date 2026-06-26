import { SettingsHeader, SettingsCard } from "../_section";
import { getAuthContext } from "@/lib/auth";
import { NotificationForm } from "./notification-form";

export const dynamic = "force-dynamic";

const PREFS = [
  { key: "email_general",     label: "Email notifications",  desc: "Receive email updates for important events" },
  { key: "eod_reminder",      label: "EOD report reminders", desc: "Daily reminder at 5pm to submit your end-of-day report" },
  { key: "client_activity",   label: "Client activity alerts", desc: "Notifications when clients take key actions (new payment, signed up, churned)" },
  { key: "deal_closed",       label: "Deal closed",          desc: "Get pinged when a teammate closes a deal" },
  { key: "weekly_digest",     label: "Weekly digest",        desc: "Monday morning summary across the workspace" },
  { key: "payment_overdue",   label: "Overdue payments",     desc: "Alert when a scheduled payment goes past due" },
  { key: "webinar_reminders", label: "Webinar SMS reminders",desc: "Allow Settoku to text you before webinars you're attending" },
];

export default async function NotificationsPage() {
  const { supabase, user } = await getAuthContext();

  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();

  const stored = (profile?.notification_preferences as Record<string, boolean> | null) ?? {};
  const initial: Record<string, boolean> = {};
  for (const p of PREFS) initial[p.key] = stored[p.key] === true;

  return (
    <div className="space-y-6">
      <SettingsHeader title="Notifications" sub="Control what updates you receive and where. All off by default until you opt in." />
      <SettingsCard>
        <NotificationForm initial={initial} prefs={PREFS} />
      </SettingsCard>
    </div>
  );
}
