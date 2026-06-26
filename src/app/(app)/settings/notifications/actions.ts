"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import type { Json } from "@/lib/supabase/types.generated";

const VALID_KEYS = [
  "email_general",
  "eod_reminder",
  "client_activity",
  "deal_closed",
  "weekly_digest",
  "payment_overdue",
  "webinar_reminders",
] as const;
type Key = typeof VALID_KEYS[number];

type Result = { ok: true } | { ok: false; error: string };

export async function saveNotificationPreferences(_prev: unknown, formData: FormData): Promise<Result> {
  const { supabase, user } = await getAuthContext();

  // Each toggle is a checkbox — if it's in formData with value "on", it's enabled.
  const prefs: Record<string, boolean> = {};
  for (const key of VALID_KEYS) {
    prefs[key] = formData.get(key) === "on";
  }

  const { error } = await supabase
    .from("profiles")
    .update({ notification_preferences: prefs as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/notifications");
  return { ok: true };
}
