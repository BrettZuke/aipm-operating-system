import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { loadCreatorSettings } from "@/lib/creator/settings";
import { fetchSiteSpeed } from "@/lib/creator/pagespeed";

export const dynamic = "force-dynamic";

// Site speed for the active creator workspace. Split into its own route (rather than the main
// dashboard render) because PageSpeed takes ~15s on a cache miss — the dashboard shouldn't block on it.
export async function GET() {
  const { agencyId } = await getAuthContext();
  if (!agencyId) return NextResponse.json({ siteSpeed: null, reason: "no agency" }, { status: 401 });

  const settings = await loadCreatorSettings(agencyId);
  if (!settings.siteUrl) return NextResponse.json({ siteSpeed: null, reason: "no site_url configured" });

  try {
    const siteSpeed = await fetchSiteSpeed(settings.siteUrl);
    return NextResponse.json({ siteSpeed, reason: siteSpeed ? null : "PageSpeed unavailable (quota or no field data)" });
  } catch (e) {
    return NextResponse.json({ siteSpeed: null, reason: e instanceof Error ? e.message : "failed" });
  }
}
