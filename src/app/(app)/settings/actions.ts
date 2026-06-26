"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const RenameWorkspaceSchema = z.object({
  name: z.string().min(1, "Name required").max(120),
});

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function renameWorkspace(formData: FormData): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = RenameWorkspaceSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { error } = await supabase
    .from("agencies")
    .update({ name: parsed.data.name })
    .eq("id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getAuthContext();

  const fullName = String(formData.get("full_name") || "").trim();
  const timezone = String(formData.get("timezone") || "UTC").trim();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      timezone: timezone || "UTC",
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
