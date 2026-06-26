"use server";

import { notifyOverduePayment } from "@/lib/integrations/slack";

type Result = { ok: true; message: string } | { ok: false; error: string };

export async function slackOverduePayment(opts: {
  clientName: string;
  amount: number;
  daysOverdue: number;
  email?: string | null;
}): Promise<Result> {
  const result = await notifyOverduePayment({
    clientName: opts.clientName,
    amount: opts.amount,
    daysOverdue: opts.daysOverdue,
    email: opts.email ?? undefined,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Posted to ${result.channel}` };
}
