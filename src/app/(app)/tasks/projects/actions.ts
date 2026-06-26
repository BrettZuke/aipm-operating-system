"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";

type Result = { ok: true; id?: string } | { ok: false; error: string };

export async function createProject(_prev: unknown, formData: FormData): Promise<Result> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const clientId = String(formData.get("client_id") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Project name required" };

  const { supabase, agencyId, user } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      agency_id: agencyId,
      name,
      description,
      client_id: clientId,
      due_date: dueDate,
      owner_id: user.id,
    })
    .select("id").single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tasks/projects");
  return { ok: true, id: data.id };
}
