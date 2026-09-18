// Shared UI types for the content board. Kept in a plain (no "use server", no "use client")
// module so both the server actions and the client components import the exact same shapes.

import type { Format, Platform, Stage, StageEvent } from "@/lib/content/board";

// One card as the board renders it: every user-facing column of content_cards plus the
// provenance/timestamps shown read-only in the detail drawer.
export interface BoardCard {
  id: string;
  stage: Stage;
  position: number;
  title: string;
  topic: string | null;
  format: Format | null;
  platform: Platform | null;
  hook: string | null;
  script: string | null;
  source: string | null;
  plan_month: string | null;
  notes: string | null;
  created_by: string; // 'human' | 'agent:<id>'
  created_at: string;
  updated_at: string;
  posted_at: string | null;
  stage_history: StageEvent[];
}

// Google Doc connection info passed from the server page into the board/drawer: whether a Scripts
// Doc is connected for this workspace, its link, and the service-account email a customer shares
// the Doc with. Shared here (a no-directive module) so both the client board and the drawer import
// the exact same shape without a client/client import cycle.
export type GoogleDocInfo = { connected: boolean; url: string | null; serviceAccountEmail: string | null };

// Result of a manual "Send to Doc" from the drawer. Mirrors the server SendResult, plus a `demo`
// flag for the canned Demo Workspace (where nothing actually leaves the browser).
export type SendToDocResult = { ok: true; demo?: boolean } | { ok: false; error: string; code?: "NO_DOC" };

// The editable field set the create/edit form submits. Selects send "" when cleared; the server
// action normalizes "" and whitespace to null.
export interface CardInput {
  title: string;
  topic?: string | null;
  format?: Format | "" | null;
  platform?: Platform | "" | null;
  hook?: string | null;
  script?: string | null;
  source?: string | null;
  plan_month?: string | null;
  notes?: string | null;
}
