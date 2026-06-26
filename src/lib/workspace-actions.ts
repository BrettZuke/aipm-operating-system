"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_AGENCY_COOKIE = "settoku-active-agency";

/**
 * Switch the user's active workspace by setting a cookie.
 * Verifies the user is actually a member of the target agency.
 */
export async function switchWorkspace(agencyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" } as const;

  // Verify membership
  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .eq("agency_id", agencyId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) return { ok: false, error: "You're not a member of that workspace" } as const;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_AGENCY_COOKIE, agencyId, {
    path: "/",
    httpOnly: false, // readable client-side for UI
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  revalidatePath("/");
  return { ok: true } as const;
}

/**
 * Create a new workspace and switch to it.
 */
export async function createWorkspace(name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" } as const;
  if (!name.trim()) return { ok: false, error: "Workspace name is required" } as const;

  // Create the agency (owner_id is required by schema)
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .insert({ name: name.trim(), owner_id: user.id })
    .select("id")
    .single();

  if (agencyError || !agency) return { ok: false, error: agencyError?.message ?? "Failed to create" } as const;

  // Add the user as owner
  const { error: memberError } = await supabase
    .from("agency_members")
    .insert({ agency_id: agency.id, user_id: user.id, role: "owner", status: "active" });

  if (memberError) return { ok: false, error: memberError.message } as const;

  // Switch to it
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_AGENCY_COOKIE, agency.id, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/");
  return { ok: true, agencyId: agency.id } as const;
}
