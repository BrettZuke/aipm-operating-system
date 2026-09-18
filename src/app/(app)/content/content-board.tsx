"use client";

import { useState } from "react";
import { GripVertical, Plus, Sparkles } from "lucide-react";
import {
  STAGES,
  formatLabel,
  platformLabel,
  computeCreatePosition,
  planCardMove,
  newCardHistory,
  type Stage,
} from "@/lib/content/board";
import type { BoardCard, CardInput, GoogleDocInfo, SendToDocResult } from "./board-types";
import { CardDrawer } from "./card-drawer";
import { createCard, updateCard, moveCard, deleteCard, sendCardToDoc } from "./board-actions";

// `notice` is a soft, non-blocking message (e.g. a move saved but the Doc delivery failed); it is
// never an error and never blocks the board.
type SubmitResult = { ok: boolean; error?: string; notice?: string };
type DragOver = { stage: Stage; before: number | null; after: number | null };

const STAGE_ACCENT: Record<Stage, string> = {
  ideas: "#7C8595",
  unscripted: "#0083FF",
  scripted: "#B57EFF",
  to_record: "#1E7A46",
  filming: "#F8AF00",
  editing: "#00A4FF",
  posted: "#00D393",
};

const EMPTY_COPY: Record<Stage, string> = {
  ideas: "No ideas yet. Add one, or let the agents.",
  unscripted: "Nothing chosen to script yet.",
  scripted: "No scripts waiting on approval.",
  to_record: "Nothing approved yet. Say yes to one in your morning email.",
  filming: "Nothing being filmed.",
  editing: "Nothing in the edit.",
  posted: "Nothing posted yet.",
};

function sortCards(a: BoardCard, b: BoardCard): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

// Normalize the form's editable fields into a card's stored shape (empty/whitespace -> null),
// mirroring the server's nn() so the optimistic card matches what the DB will hold.
function cleanFields(input: CardInput) {
  const t = (v?: string | null) => {
    const s = (v ?? "").trim();
    return s.length ? s : null;
  };
  return {
    title: (input.title ?? "").trim(),
    topic: t(input.topic),
    format: (input.format || null) as BoardCard["format"],
    platform: (input.platform || null) as BoardCard["platform"],
    hook: t(input.hook),
    script: t(input.script),
    source: t(input.source),
    plan_month: input.plan_month ? input.plan_month : null,
    notes: t(input.notes),
  };
}

export function ContentBoard({
  initialCards,
  isDemo,
  googleDoc,
}: {
  initialCards: BoardCard[];
  isDemo: boolean;
  googleDoc: GoogleDocInfo;
}) {
  const [cards, setCards] = useState<BoardCard[]>(initialCards);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DragOver | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The stage a new card should be created in: null = no create drawer open. The global button
  // opens it on "ideas"; the per-column add opens it on that column's stage.
  const [createStage, setCreateStage] = useState<Stage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = selectedId ? cards.find((c) => c.id === selectedId) ?? null : null;
  const columns = STAGES.map((s) => ({
    ...s,
    cards: cards.filter((c) => c.stage === s.key).sort(sortCards),
  }));

  // ── Persistence (optimistic local state; the server action is skipped entirely in demo) ──
  async function persistCreate(input: CardInput, stage: Stage): Promise<SubmitResult> {
    const now = new Date().toISOString();
    // New cards land at the top of their own column (mirrors the server's per-stage midpoint read).
    const top = cards.filter((c) => c.stage === stage).sort(sortCards)[0]?.position ?? null;
    const clean = cleanFields(input);
    const makeCard = (id: string): BoardCard => ({
      id,
      stage,
      position: computeCreatePosition(top),
      ...clean,
      created_by: "human",
      created_at: now,
      updated_at: now,
      posted_at: null,
      stage_history: newCardHistory(now, stage),
    });

    if (isDemo) {
      setCards((prev) => [...prev, makeCard(`demo-new-${crypto.randomUUID()}`)]);
      return { ok: true };
    }

    const r = await createCard(input, stage);
    if (!r.ok) return { ok: false, error: r.error };
    setCards((prev) => [...prev, makeCard(r.id)]);
    return { ok: true };
  }

  // Hard delete. Optimistic: the card leaves the board immediately, and a server failure rolls it
  // back. Demo mutates local state only (never the DB), like every other demo action.
  async function persistDelete(id: string): Promise<SubmitResult> {
    const prev = cards;
    setCards((cs) => cs.filter((c) => c.id !== id));
    if (isDemo) return { ok: true };
    const r = await deleteCard(id);
    if (!r.ok) {
      setCards(prev); // roll back
      return { ok: false, error: r.error };
    }
    return { ok: true };
  }

  // Manual "Send to Doc" from the drawer. Demo is simulated (nothing leaves the browser); a real
  // workspace calls the server action, which returns the friendly error or a NO_DOC code.
  async function handleSendToDoc(id: string): Promise<SendToDocResult> {
    if (isDemo) return { ok: true, demo: true };
    if (id.startsWith("demo-new-")) return { ok: true, demo: true };
    return sendCardToDoc(id);
  }

  async function persistUpdate(id: string, input: CardInput): Promise<SubmitResult> {
    const clean = cleanFields(input);
    const now = new Date().toISOString();
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...clean, updated_at: now } : c)));
    if (isDemo) return { ok: true };
    const r = await updateCard(id, input);
    if (!r.ok) {
      setCards(prev); // roll back
      return { ok: false, error: r.error };
    }
    return { ok: true };
  }

  async function persistMove(id: string, toStage: Stage, before: number | null, after: number | null): Promise<SubmitResult> {
    const card = cards.find((c) => c.id === id);
    if (!card) return { ok: false, error: "Card not found" };
    const now = new Date().toISOString();
    const patch = planCardMove({
      fromStage: card.stage,
      toStage,
      history: card.stage_history,
      before,
      after,
      at: now,
      currentPostedAt: card.posted_at,
    });
    const prev = cards;
    setCards((cs) =>
      cs.map((c) =>
        c.id === id
          ? { ...c, stage: patch.stage, position: patch.position, stage_history: patch.stage_history, posted_at: patch.posted_at, updated_at: now }
          : c,
      ),
    );
    if (isDemo) return { ok: true };
    setSaving(true);
    const r = await moveCard(id, toStage, before, after);
    setSaving(false);
    if (!r.ok) {
      setCards(prev); // roll back
      return { ok: false, error: r.error };
    }
    // The move saved; a docNotice (if any) is a soft, non-blocking message the caller surfaces.
    return { ok: true, notice: r.docNotice };
  }

  // ── Drag handlers ────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function onDragEnd() {
    setDraggingId(null);
    setDragOver(null);
  }

  // Hovering a card: insert above or below it based on the pointer's half. Neighbour positions
  // are read from the target column EXCLUDING the dragging card, so the midpoint is correct.
  function onCardDragOver(e: React.DragEvent, stage: Stage, cardId: string) {
    if (!draggingId || cardId === draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const insertAbove = e.clientY - rect.top < rect.height / 2;
    const col = cards.filter((c) => c.stage === stage && c.id !== draggingId).sort(sortCards);
    const i = col.findIndex((c) => c.id === cardId);
    if (i === -1) return;
    const next: DragOver = insertAbove
      ? { stage, before: col[i - 1]?.position ?? null, after: col[i].position }
      : { stage, before: col[i].position, after: col[i + 1]?.position ?? null };
    setDragOver((d) => (d && d.stage === next.stage && d.before === next.before && d.after === next.after ? d : next));
  }

  // Hovering the column's empty area appends to the end of that column.
  function onColumnDragOver(e: React.DragEvent, stage: Stage) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const col = cards.filter((c) => c.stage === stage && c.id !== draggingId).sort(sortCards);
    const next: DragOver = { stage, before: col[col.length - 1]?.position ?? null, after: null };
    setDragOver((d) => (d && d.stage === next.stage && d.before === next.before && d.after === next.after ? d : next));
  }

  function onColumnDrop(e: React.DragEvent, stage: Stage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    const target = dragOver;
    setDragOver(null);
    setDraggingId(null);
    if (!id || !target || target.stage !== stage) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;

    // No-op guard: dropped back into its own current slot in the same column.
    if (card.stage === stage) {
      const cur = cards.filter((c) => c.stage === stage).sort(sortCards);
      const pos = cur.findIndex((c) => c.id === id);
      const above = cur[pos - 1]?.position ?? null;
      const below = cur[pos + 1]?.position ?? null;
      if (above === target.before && below === target.after) return;
    }

    void persistMove(id, stage, target.before, target.after).then((r) => {
      if (!r.ok) setError(r.error ?? "Could not move the card.");
      else if (r.notice) setNotice(r.notice);
    });
  }

  const totalCards = cards.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#7C8595]">
          {totalCards} card{totalCards === 1 ? "" : "s"} · drag between columns, or tap a card to open and move it.
        </p>
        <button
          onClick={() => setCreateStage("ideas")}
          className="group flex items-center gap-2 rounded-full bg-[#0083FF] px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#0072e0] active:scale-[0.98]"
        >
          <Plus className="size-4" />
          New card
        </button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-[rgba(255,100,102,0.28)] bg-[rgba(255,100,102,0.08)] px-3 py-2 text-[13px] text-[#FF9A9B]">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-[#FF9A9B]/70 hover:text-[#FF9A9B]">Dismiss</button>
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-[rgba(248,175,0,0.28)] bg-[rgba(248,175,0,0.08)] px-3 py-2 text-[13px] text-[#F8CE6A]">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-[#F8CE6A]/70 hover:text-[#F8CE6A]">Dismiss</button>
        </div>
      )}

      {isDemo && (
        <p className="text-xs text-amber-300/90">
          Demo Workspace: these are sample cards. Creating and dragging here is a preview and is never saved.
        </p>
      )}

      {/* One row, always. The count was hardcoded to 6 while STAGES has 7, so Posted wrapped onto
          a second row of its own and read as a separate section. Derived from STAGES now, so
          adding or removing a stage can never split the board again. Columns keep a floor width
          and the row scrolls sideways rather than squashing seven columns into a phone. */}
      <div
        className="grid gap-3 overflow-x-auto pb-2"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(210px, 1fr))` }}
      >
        {columns.map((col) => {
          const isColOver = dragOver?.stage === col.key;
          const emptyExclDragging = col.cards.filter((c) => c.id !== draggingId).length === 0;
          return (
            <section
              key={col.key}
              onDragOver={(e) => onColumnDragOver(e, col.key)}
              onDrop={(e) => onColumnDrop(e, col.key)}
              className={`flex min-h-[420px] flex-col rounded-xl border transition-colors ${
                isColOver ? "border-[#0083FF]/50 bg-[#0083FF]/[0.04]" : "border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40"
              }`}
            >
              <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.07)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STAGE_ACCENT[col.key] }} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: STAGE_ACCENT[col.key] }}>{col.label}</span>
                </div>
                <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] tabular-nums text-[#A8B0BD]">{col.cards.length}</span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2 [max-height:calc(100vh-320px)]">
                {col.cards.length === 0 ? (
                  <div className={`mt-1 rounded-lg border border-dashed px-3 py-8 text-center text-[11px] leading-relaxed transition-colors ${
                    isColOver ? "border-[#0083FF]/40 text-[#0083FF]/80" : "border-[rgba(255,255,255,0.08)] text-[#545D6C]"
                  }`}>
                    {isColOver ? "Drop here" : EMPTY_COPY[col.key]}
                  </div>
                ) : (
                  <>
                    {col.cards.map((card) => {
                      const isDragging = draggingId === card.id;
                      const showLineAbove = dragOver?.stage === col.key && dragOver.after === card.position && draggingId !== card.id;
                      return (
                        <div key={card.id}>
                          {showLineAbove && <div className="mb-2 h-0.5 rounded-full bg-[#0083FF]" />}
                          <article
                            draggable
                            onDragStart={(e) => onDragStart(e, card.id)}
                            onDragEnd={onDragEnd}
                            onDragOver={(e) => onCardDragOver(e, col.key, card.id)}
                            onClick={() => setSelectedId(card.id)}
                            className={`group cursor-pointer rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/80 p-3 transition-[border-color,opacity,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:border-[rgba(255,255,255,0.18)] ${
                              isDragging ? "opacity-30" : ""
                            }`}
                          >
                            <div className="flex items-start gap-1.5">
                              <GripVertical className="mt-0.5 size-3 shrink-0 cursor-grab text-[#545D6C] opacity-0 transition-opacity group-hover:opacity-100" />
                              <h3 className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[#F5F5F7] line-clamp-3">{card.title}</h3>
                              {card.created_by.startsWith("agent:") && (
                                <Sparkles className="mt-0.5 size-3 shrink-0 text-[#B57EFF]" aria-label="Filed by an agent" />
                              )}
                            </div>
                            {(card.format || card.platform) && (
                              <div className="mt-2 flex flex-wrap gap-1.5 pl-[18px]">
                                {card.format && <span className="sk-chip sk-chip-blue">{formatLabel(card.format)}</span>}
                                {card.platform && <span className="sk-chip">{platformLabel(card.platform)}</span>}
                              </div>
                            )}
                          </article>
                        </div>
                      );
                    })}
                    {/* End-of-column insertion line */}
                    {dragOver?.stage === col.key && dragOver.after === null && !emptyExclDragging && (
                      <div className="h-0.5 rounded-full bg-[#0083FF]" />
                    )}
                  </>
                )}
                {/* Per-column add: opens the create drawer pre-set to THIS column's stage. */}
                <button
                  type="button"
                  onClick={() => setCreateStage(col.key)}
                  aria-label={`Add a card to ${col.label}`}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[rgba(255,255,255,0.10)] px-3 py-2 text-[12px] font-medium text-[#7C8595] transition-colors hover:border-[#0083FF]/40 hover:text-[#0083FF]"
                >
                  <Plus className="size-3.5" /> Add a card
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {saving && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-3 py-2 text-xs text-[#A8B0BD] shadow-xl">
          Saving…
        </div>
      )}

      {createStage && (
        <CardDrawer
          key={`create-${createStage}`}
          mode="create"
          card={null}
          createStage={createStage}
          googleDoc={googleDoc}
          onClose={() => setCreateStage(null)}
          onSubmit={(input) => persistCreate(input, createStage)}
          onMove={async () => ({ ok: true })}
        />
      )}
      {selected && (
        <CardDrawer
          key={selected.id}
          mode="edit"
          card={selected}
          googleDoc={googleDoc}
          onClose={() => setSelectedId(null)}
          onSubmit={(input) => persistUpdate(selected.id, input)}
          onMove={(toStage) => persistMove(selected.id, toStage, null, cards.filter((c) => c.stage === toStage && c.id !== selected.id).sort(sortCards)[0]?.position ?? null)}
          onDelete={() => persistDelete(selected.id)}
          onSendToDoc={() => handleSendToDoc(selected.id)}
        />
      )}
    </div>
  );
}
