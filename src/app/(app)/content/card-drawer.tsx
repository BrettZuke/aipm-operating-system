"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { X, Sparkles, User, Trash2, FileText } from "lucide-react";
import {
  STAGES,
  FORMATS,
  PLATFORMS,
  stageLabel,
  type Stage,
} from "@/lib/content/board";
import type { BoardCard, CardInput, GoogleDocInfo, SendToDocResult } from "./board-types";

type SubmitResult = { ok: boolean; error?: string; notice?: string };

const STAGE_ACCENT: Record<Stage, string> = {
  ideas: "#7C8595",
  unscripted: "#0083FF",
  scripted: "#B57EFF",
  to_record: "#1E7A46",
  filming: "#F8AF00",
  editing: "#00A4FF",
  posted: "#00D393",
};

function fieldFromCard(card: BoardCard | null): CardInput {
  return {
    title: card?.title ?? "",
    topic: card?.topic ?? "",
    format: card?.format ?? "",
    platform: card?.platform ?? "",
    hook: card?.hook ?? "",
    script: card?.script ?? "",
    source: card?.source ?? "",
    plan_month: card?.plan_month ?? "",
    notes: card?.notes ?? "",
  };
}

function creatorLabel(createdBy: string): { icon: "agent" | "human"; text: string } {
  if (createdBy.startsWith("agent:")) {
    const key = createdBy.slice("agent:".length);
    const name = key
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
    return { icon: "agent", text: `${name} agent` };
  }
  return { icon: "human", text: "Added by hand" };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const inputClass =
  "w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#545D6C] transition-colors focus:border-[#0083FF]/50 focus:outline-none focus:ring-1 focus:ring-[#0083FF]/30";
const labelClass = "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#7C8595]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

export function CardDrawer({
  mode,
  card,
  createStage,
  googleDoc,
  onClose,
  onSubmit,
  onMove,
  onDelete,
  onSendToDoc,
}: {
  mode: "create" | "edit";
  card: BoardCard | null;
  createStage?: Stage;
  googleDoc?: GoogleDocInfo;
  onClose: () => void;
  onSubmit: (input: CardInput) => Promise<SubmitResult>;
  onMove: (toStage: Stage) => Promise<SubmitResult>;
  onDelete?: () => Promise<SubmitResult>;
  onSendToDoc?: () => Promise<SendToDocResult>;
}) {
  const [fields, setFields] = useState<CardInput>(() => fieldFromCard(card));
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ kind: "ok" | "error" | "connect"; text?: string } | null>(null);
  // A move INTO Filming can save fine but fail to deliver the script to the Doc; that soft notice
  // shows here so the operator can retry with Send to Doc. Never blocks anything.
  const [docNotice, setDocNotice] = useState<string | null>(null);

  const set = <K extends keyof CardInput>(key: K, value: CardInput[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const close = useCallback(() => {
    if (saving || moving || deleting) return;
    onClose();
  }, [saving, moving, deleting, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const titleValid = (fields.title ?? "").trim().length > 0;

  async function handleSave() {
    if (!titleValid || saving) return;
    setSaving(true);
    setError(null);
    const r = await onSubmit(fields);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error ?? "Could not save the card.");
  }

  async function handleMove(toStage: Stage) {
    if (moving || !card || toStage === card.stage) return;
    setMoving(toStage);
    setError(null);
    const r = await onMove(toStage);
    setMoving(null);
    if (!r.ok) setError(r.error ?? "Could not move the card.");
    else if (r.notice) setDocNotice(r.notice);
  }

  async function handleDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setError(null);
    const r = await onDelete();
    setDeleting(false);
    if (r.ok) onClose();
    else {
      setDeleteConfirm(false);
      setError(r.error ?? "Could not delete the card.");
    }
  }

  async function handleSend() {
    if (!onSendToDoc || sending) return;
    setSending(true);
    setSendResult(null);
    const r = await onSendToDoc();
    setSending(false);
    if (r.ok) {
      setSendResult({ kind: "ok", text: r.demo ? "Demo preview: nothing was actually sent." : "Sent to your Google Doc, under Approved Scripts." });
    } else if (r.code === "NO_DOC") {
      setSendResult({ kind: "connect" });
    } else {
      setSendResult({ kind: "error", text: r.error });
    }
  }

  const creator = card ? creatorLabel(card.created_by) : null;
  const headerStage: Stage = createStage ?? "ideas";
  const docConnected = googleDoc?.connected ?? false;
  const saEmail = googleDoc?.serviceAccountEmail ?? null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={mode === "create" ? "New card" : "Card detail"}>
      <div className="sk-drawer-backdrop absolute inset-0 bg-black/60" onClick={close} aria-hidden />
      <aside className="sk-drawer-panel absolute right-0 top-0 flex h-full w-[min(520px,96vw)] flex-col border-l border-[rgba(255,255,255,0.10)] bg-[#0A0A0F] shadow-[-24px_0_64px_rgba(0,0,0,0.55)]">
        <header className="flex items-start justify-between gap-3 border-b border-[rgba(255,255,255,0.07)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-[#F5F5F7]" style={{ fontFamily: "var(--font-settoku-display)" }}>
              {mode === "create" ? "New card" : "Card detail"}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7C8595]">
              {card ? (
                <>
                  <span style={{ color: STAGE_ACCENT[card.stage] }}>{stageLabel(card.stage)}</span>
                  {creator && (
                    <span className="flex items-center gap-1 text-[#545D6C]">
                      ·{" "}
                      {creator.icon === "agent" ? <Sparkles className="size-2.5" /> : <User className="size-2.5" />}
                      {creator.text}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: STAGE_ACCENT[headerStage] }}>Starts in {stageLabel(headerStage)}</span>
              )}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#A8B0BD] transition-colors hover:border-[rgba(255,255,255,0.2)] hover:text-[#F5F5F7]"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-lg border border-[rgba(255,100,102,0.28)] bg-[rgba(255,100,102,0.08)] px-3 py-2 text-[13px] text-[#FF9A9B]">
              {error}
            </div>
          )}
          {docNotice && (
            <div className="rounded-lg border border-[rgba(248,175,0,0.28)] bg-[rgba(248,175,0,0.08)] px-3 py-2 text-[13px] text-[#F8CE6A]">
              {docNotice}
            </div>
          )}

          <Field label="Title">
            <input
              className={inputClass}
              value={fields.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="What's the piece?"
              autoFocus={mode === "create"}
              maxLength={200}
            />
            {!titleValid && <p className="mt-1 text-[11px] text-[#FF9A9B]">Title is required.</p>}
          </Field>

          {/* Stage / Move-to control (edit only). The explicit path drag can't offer on mobile. */}
          {mode === "edit" && card && (
            <Field label="Stage">
              <div className="flex flex-wrap gap-1.5">
                {STAGES.map((s) => {
                  const active = card.stage === s.key;
                  const busy = moving === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => handleMove(s.key)}
                      disabled={active || moving !== null}
                      aria-current={active}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "cursor-default border-transparent text-[#050508]"
                          : "border-[rgba(255,255,255,0.12)] text-[#A8B0BD] hover:border-[rgba(255,255,255,0.28)] hover:text-[#F5F5F7] disabled:opacity-40"
                      }`}
                      style={active ? { backgroundColor: STAGE_ACCENT[s.key] } : undefined}
                    >
                      {busy ? "Moving…" : s.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-[#545D6C]">Moving a card into Filming sends its script to your connected Google Doc.</p>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <select className={inputClass} value={fields.format ?? ""} onChange={(e) => set("format", e.target.value as CardInput["format"])}>
                <option value="">Not set</option>
                {FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Platform">
              <select className={inputClass} value={fields.platform ?? ""} onChange={(e) => set("platform", e.target.value as CardInput["platform"])}>
                <option value="">Not set</option>
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Topic">
            <input className={inputClass} value={fields.topic ?? ""} onChange={(e) => set("topic", e.target.value)} placeholder="The angle in one line" maxLength={500} />
          </Field>

          <Field label="Hook">
            <textarea className={`${inputClass} min-h-[64px] resize-y`} value={fields.hook ?? ""} onChange={(e) => set("hook", e.target.value)} placeholder="The opening line that stops the scroll" maxLength={1000} />
          </Field>

          <Field label="Script">
            <textarea className={`${inputClass} min-h-[160px] resize-y font-mono text-[13px] leading-relaxed`} value={fields.script ?? ""} onChange={(e) => set("script", e.target.value)} placeholder="The full script" maxLength={20000} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <input className={inputClass} value={fields.source ?? ""} onChange={(e) => set("source", e.target.value)} placeholder="Which winner or pattern" maxLength={500} />
            </Field>
            <Field label="Plan month">
              <input type="month" className={inputClass} value={fields.plan_month ?? ""} onChange={(e) => set("plan_month", e.target.value)} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className={`${inputClass} min-h-[72px] resize-y`} value={fields.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else worth carrying" maxLength={5000} />
          </Field>

          {/* Script delivery to the connected Google Doc (edit only). */}
          {mode === "edit" && card && onSendToDoc && (
            <div className="space-y-2.5 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="sk-label">Script delivery</div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-xs font-medium text-[#A8B0BD] transition-colors hover:border-[rgba(255,255,255,0.28)] hover:text-[#F5F5F7] disabled:opacity-40"
                >
                  <FileText className="size-3.5" /> {sending ? "Sending…" : "Send to Doc"}
                </button>
              </div>
              {docConnected ? (
                <p className="text-xs leading-relaxed text-[#7C8595]">
                  Appends the title, hook, and script to your connected Google Doc under an Approved Scripts section. This also happens automatically the first time a card moves into Filming.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-[#7C8595]">
                  No Google Doc is connected yet. In{" "}
                  <Link href="/settings/integrations" className="text-[#0083FF] hover:underline">Settings, then Integrations</Link>, connect your Scripts Doc: create a Google Doc, share edit access with{" "}
                  {saEmail ? <span className="break-all font-mono text-[#A8B0BD]">{saEmail}</span> : "the Settoku service account"}, and paste the link. Then you can send scripts here.
                </p>
              )}
              {sendResult?.kind === "ok" && <p className="text-xs text-emerald-400">{sendResult.text}</p>}
              {sendResult?.kind === "error" && <p className="text-xs text-[#FF9A9B]">{sendResult.text}</p>}
              {sendResult?.kind === "connect" && (
                <p className="text-xs text-[#F8CE6A]">
                  No Google Doc connected. Connect one in{" "}
                  <Link href="/settings/integrations" className="text-[#0083FF] hover:underline">Settings, then Integrations</Link>, then try again.
                </p>
              )}
            </div>
          )}

          {/* Read-only provenance + stage timeline */}
          {mode === "edit" && card && (
            <div className="mt-2 space-y-3 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#7C8595]">
                <span>Created {fmtDate(card.created_at)}</span>
                <span>Updated {fmtDate(card.updated_at)}</span>
                {card.posted_at && <span className="text-[#00D393]">Posted {fmtDate(card.posted_at)}</span>}
              </div>
              {card.stage_history.length > 0 && (
                <div>
                  <div className="sk-label mb-2">Stage history</div>
                  <ol className="space-y-1.5">
                    {card.stage_history.map((h, i) => (
                      <li key={`${h.stage}-${h.at}-${i}`} className="flex items-center gap-2 text-[12px]">
                        <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: STAGE_ACCENT[h.stage] ?? "#545D6C" }} />
                        <span className="text-[#A8B0BD]">{stageLabel(h.stage)}</span>
                        <span className="text-[#545D6C]">{fmtDate(h.at)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[rgba(255,255,255,0.07)] px-5 py-4">
          <div className="flex items-center gap-2">
            {mode === "edit" && onDelete && (
              deleteConfirm ? (
                <>
                  <span className="text-xs text-[#A8B0BD]">Delete this card?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-lg border border-[rgba(255,100,102,0.30)] bg-[rgba(255,100,102,0.08)] px-3 py-2 text-sm font-medium text-[#FF9A9B] transition-colors hover:bg-[rgba(255,100,102,0.16)] disabled:opacity-40"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    disabled={deleting}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-[#A8B0BD] transition-colors hover:text-[#F5F5F7] disabled:opacity-40"
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7C8595] transition-colors hover:text-red-400"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              disabled={saving || moving !== null || deleting}
              className="rounded-lg border border-[rgba(255,255,255,0.10)] px-4 py-2 text-sm font-medium text-[#A8B0BD] transition-colors hover:text-[#F5F5F7] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!titleValid || saving}
              className="rounded-lg bg-[#0083FF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0072e0] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : mode === "create" ? "Create card" : "Save changes"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
