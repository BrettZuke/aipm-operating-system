import { SettingsHeader, SettingsCard } from "../_section";
import { getAuthContext } from "@/lib/auth";
import { OrganizationForm } from "./organization-form";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const { supabase, agencyId } = await getAuthContext();

  const [{ data: agency }, { data: settings }] = await Promise.all([
    agencyId
      ? supabase.from("agencies").select("id,name,created_at,brand_color,brand_logo_url").eq("id", agencyId).maybeSingle()
      : Promise.resolve({ data: null }),
    agencyId
      ? supabase.from("agency_settings").select("data").eq("agency_id", agencyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const data = (settings?.data as Record<string, unknown> | null) ?? {};
  const initial = {
    name:     agency?.name ?? "",
    industry: (data.industry as string | undefined) ?? "",
    website:  (data.website as string | undefined) ?? "",
  };

  return (
    <div className="space-y-6">
      <SettingsHeader title="Organization" sub="Workspace identity, branding, and core settings." />

      <SettingsCard title="Workspace details" sub="Visible to everyone in your workspace.">
        <OrganizationForm initial={initial} />
      </SettingsCard>

      <SettingsCard title="Workspace ID" sub="For API + integrations. Read-only.">
        <div className="rounded-md bg-[#09090C] border border-[rgba(255,255,255,0.08)] px-3 py-2 font-mono text-xs text-[#9CA3AF]">
          {agency?.id ?? "—"}
        </div>
      </SettingsCard>

      {agency?.created_at && (
        <SettingsCard title="Created" sub="When this workspace was set up.">
          <div className="text-sm text-[#9CA3AF]">{new Date(agency.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </SettingsCard>
      )}
    </div>
  );
}
