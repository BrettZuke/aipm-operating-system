"use server";

import { getAuthContext } from "@/lib/auth";

type Result = { ok: true } | { ok: false; error: string };

export async function changePassword(_prev: unknown, formData: FormData): Promise<Result> {
  const password = String(formData.get("password") ?? "");
  const confirm  = String(formData.get("confirm") ?? "");
  if (!password) return { ok: false, error: "Password required" };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters" };
  if (password !== confirm) return { ok: false, error: "Passwords don't match" };

  const { supabase } = await getAuthContext();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Sign out everywhere — invalidates all refresh tokens for this user across all
 * devices. Doesn't kill the current session immediately (the user stays signed
 * in here until their access token expires, ~1h), but no other device can refresh.
 */
export async function signOutEverywhere(): Promise<Result> {
  const { supabase } = await getAuthContext();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
