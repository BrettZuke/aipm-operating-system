"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const TaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(280),
  description: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_date: z.string().optional(),
  client_id: z.string().uuid().optional().or(z.literal("")),
  assignee_id: z.string().uuid().optional().or(z.literal("")),
});

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTask(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, agencyId, user } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = TaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    status: formData.get("status") || "todo",
    priority: formData.get("priority") || "medium",
    due_date: formData.get("due_date") || undefined,
    client_id: formData.get("client_id") || undefined,
    assignee_id: formData.get("assignee_id") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      agency_id: agencyId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_date: parsed.data.due_date
        ? new Date(parsed.data.due_date).toISOString()
        : null,
      client_id: parsed.data.client_id || null,
      assignee_id: parsed.data.assignee_id || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/tasks/my");
  revalidatePath("/tasks/all");
  revalidatePath("/tasks/today");
  return { ok: true, id: data.id };
}

export async function updateTask(id: string, formData: FormData): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = TaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    status: formData.get("status") || "todo",
    priority: formData.get("priority") || "medium",
    due_date: formData.get("due_date") || undefined,
    client_id: formData.get("client_id") || undefined,
    assignee_id: formData.get("assignee_id") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const completed_at = parsed.data.status === "done" ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_date: parsed.data.due_date
        ? new Date(parsed.data.due_date).toISOString()
        : null,
      client_id: parsed.data.client_id || null,
      assignee_id: parsed.data.assignee_id || null,
      completed_at,
    })
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/tasks/my");
  revalidatePath("/tasks/all");
  revalidatePath("/tasks/today");
  return { ok: true, id };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/tasks/my");
  revalidatePath("/tasks/all");
  revalidatePath("/tasks/today");
  return { ok: true, id };
}

export async function toggleTaskStatus(id: string, currentStatus: string): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const newStatus = currentStatus === "done" ? "todo" : "done";
  const { error } = await supabase
    .from("tasks")
    .update({
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/tasks/my");
  revalidatePath("/tasks/all");
  revalidatePath("/tasks/today");
  return { ok: true, id };
}
