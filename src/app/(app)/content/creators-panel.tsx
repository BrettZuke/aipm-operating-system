"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Pause, Play, Plus, Search, Trash2, Users } from "lucide-react";
import {
  CREATOR_ROLES,
  ROLE_ACCENT,
  ROLE_HELP,
  ROLE_LABEL,
  ROLE_ORDER,
  SCRAPE_DEPTHS,
  compactCount,
  depthLabel,
  lastScrapedLabel,
  sourcesOf,
  type Creator,
  type CreatorRole,
} from "@/lib/content/creators";
import { addCreator, deleteCreator, updateCreator } from "./creator-actions";

type Filter = CreatorRole | "all";

// The roster is the operator's control over what the content machine learns from. One line per
// creator so 30-odd people scan in a single screen; everything secondary lives in the columns.
export function CreatorsPanel(
  { initialCreators, workspace, lanes = [] }:
  { initialCreators: Creator[]; workspace?: string | null;
    /** The lanes this workspace runs. Empty means it has none, and every creator feeds
        every piece, which is how a single-lane workspace already behaves. */
    lanes?: string[] },
) {
  const [creators, setCreators] = useState(initialCreators);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: creators.length };
    for (const c of creators) by[c.role] = (by[c.role] ?? 0) + 1;
    return by;
  }, [creators]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators
      .filter((c) => filter === "all" || c.role === filter)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        const r = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
        return r !== 0 ? r : a.name.localeCompare(b.name);
      });
  }, [creators, filter, query]);

  const active = creators.filter((c) => c.status === "active").length;
  const scripting = creators.filter((c) => c.status === "active" && c.role === "emulate").length;

  // Optimistic: the row changes the moment it is clicked, and rolls back with a message if the
  // server refuses. Nothing here silently swallows a failure.
  function apply(id: string, patch: Partial<Creator>) {
    const before = creators;
    setCreators((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setError(null);
    startTransition(async () => {
      const res = await updateCreator({ id, ...patch } as Parameters<typeof updateCreator>[0]);
      if (!res.ok) {
        setCreators(before);
        setError(res.error);
      }
    });
  }

  function remove(id: string) {
    const before = creators;
    setCreators((cs) => cs.filter((c) => c.id !== id));
    setConfirmDelete(null);
    setError(null);
    startTransition(async () => {
      const res = await deleteCreator(id);
      if (!res.ok) {
        setCreators(before);
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#A8B0BD]">
          <span className="text-[#F5F5F7]">{active}</span> active of {creators.length},{" "}
          <span className="text-[#F5F5F7]">{scripting}</span> driving your scripts.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#5C6472]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search creators"
              className="w-40 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] py-1.5 pl-8 pr-2.5 text-xs text-[#F5F5F7] placeholder:text-[#5C6472] outline-none focus:border-[#0083FF]"
            />
          </div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-medium text-[#F5F5F7] transition hover:bg-[rgba(255,255,255,0.08)]"
          >
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
        {ROLE_ORDER.map((r) => (
          <FilterChip
            key={r}
            label={ROLE_LABEL[r]}
            count={counts[r] ?? 0}
            accent={ROLE_ACCENT[r]}
            active={filter === r}
            onClick={() => setFilter(r)}
          />
        ))}
      </div>

      {filter !== "all" && <p className="text-xs text-[#7C8595]">{ROLE_HELP[filter]}</p>}

      {error && (
        <div className="rounded-lg border border-[rgba(255,90,90,0.28)] bg-[rgba(255,90,90,0.07)] px-3 py-2 text-xs text-[#FFB4B4]">
          {error}
        </div>
      )}

      {adding && (
        <AddCreatorForm
          onCancel={() => setAdding(false)}
          onAdded={(c) => {
            setCreators((cs) => [...cs.filter((x) => x.handle !== c.handle), c]);
            setAdding(false);
          }}
          onError={setError}
        />
      )}

      {creators.length === 0 ? (
        <EmptyRoster workspace={workspace ?? null} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.10)] px-4 py-8 text-center text-sm text-[#7C8595]">
          Nothing matches that.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-left">
                <Th className="w-8" />
                <Th>Who</Th>
                <Th className="hidden sm:table-cell">Where the data comes from</Th>
                <Th>Why</Th>
                <Th className="hidden md:table-cell">Copy them for</Th>
                <Th className="hidden lg:table-cell">How deep</Th>
                <Th className="pr-3 text-right">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Row
                  key={c.id}
                  creator={c}
                  pending={pending}
                  confirming={confirmDelete === c.id}
                  onRole={(r) => apply(c.id, { role: r })}
                  onToggle={() => apply(c.id, { status: c.status === "active" ? "paused" : "active" })}
                  onAskDelete={() => setConfirmDelete(c.id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onDelete={() => remove(c.id)}
                  onDepth={(n) => apply(c.id, { scrape_limit: n })}
                  onWhy={(text) => apply(c.id, { why: text.trim() || null })}
                  lanes={lanes}
                  onLanes={(next) => apply(c.id, { lanes: next })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[#5C6472] ${className}`}>{children}</th>;
}

function FilterChip({
  label, count, active, accent, onClick,
}: { label: string; count: number; active: boolean; accent?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? "border-[rgba(255,255,255,0.20)] bg-[rgba(255,255,255,0.08)] text-[#F5F5F7]"
          : "border-[rgba(255,255,255,0.08)] text-[#7C8595] hover:text-[#A8B0BD]"
      }`}
    >
      {accent && <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />}
      {label}
      <span className="text-[#5C6472]">{count}</span>
    </button>
  );
}

function Row({
  creator: c, pending, confirming, onRole, onToggle, onAskDelete, onCancelDelete, onDelete, onDepth, onWhy,
  lanes, onLanes,
}: {
  creator: Creator;
  /** The lanes this workspace actually runs, so the choices are never invented. */
  lanes: string[];
  onLanes: (next: string[] | null) => void;
  pending: boolean;
  confirming: boolean;
  onRole: (r: CreatorRole) => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onDepth: (n: number) => void;
  onWhy: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(c.why ?? "");
  const paused = c.status === "paused";
  const sources = sourcesOf(c);

  return (
    <>
      <tr
        className="border-b border-[rgba(255,255,255,0.05)] transition-colors duration-500 hover:bg-[rgba(255,255,255,0.02)]"
        style={{ opacity: paused ? 0.5 : 1 }}
      >
        <td className="py-2.5 pl-3 pr-2 align-top">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? `Hide details for ${c.name}` : `Show details for ${c.name}`}
            className="mt-0.5 text-[#545D6C] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[#A8B0BD]"
            style={{ transform: open ? "rotate(90deg)" : undefined }}
          >
            &rsaquo;
          </button>
        </td>

        <td className="py-2.5 pr-3 align-top">
          <div className="flex items-center gap-2">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: paused ? "#5C6472" : ROLE_ACCENT[c.role] }}
              aria-hidden
            />
            <span className="truncate font-medium text-[#F5F5F7]">{c.name}</span>
            {paused && <span className="text-[10px] uppercase tracking-wide text-[#5C6472]">Paused</span>}
          </div>
          {c.followers != null && (
            <div className="ml-3.5 text-xs text-[#5C6472]">{compactCount(c.followers)} followers</div>
          )}
        </td>

        {/* Where the data comes from, named per platform rather than implied by an icon. */}
        <td className="hidden py-2.5 pr-3 align-top sm:table-cell">
          {sources.length === 0 ? (
            <span className="text-xs text-[#5C6472]">No source set</span>
          ) : (
            <div className="space-y-0.5">
              {sources.map((src) => (
                <div key={src.platform} className="flex items-center gap-1.5 text-xs">
                  <span className="w-[62px] shrink-0 text-[#5C6472]">{src.platform}</span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[#A8B0BD] hover:text-[#0083FF]"
                  >
                    {src.handle}
                  </a>
                  <span className="text-[#5C6472]">{src.collected}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-0.5 text-[11px] text-[#545D6C]">
            {lastScrapedLabel(c.last_scraped_at)}
          </div>
        </td>

        <td className="py-2.5 pr-3 align-top">
          <div className="relative inline-flex items-center">
            <select
              value={c.role}
              disabled={pending}
              onChange={(e) => onRole(e.target.value as CreatorRole)}
              aria-label={`Why ${c.name} is on the roster`}
              className="appearance-none rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] py-1 pl-2.5 pr-7 text-xs text-[#F5F5F7] outline-none focus:border-[#0083FF]"
            >
              {CREATOR_ROLES.map((r) => (
                <option key={r} value={r} className="bg-[#12151B]">{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-[#5C6472]" />
          </div>
        </td>

        {/* What this creator is a model FOR. Role says how much they count, this says where they
            are allowed to count. Untagged means every lane, which is right for anyone teaching
            craft, and wrong for anyone whose subject matter belongs to one lane only. */}
        <td className="hidden py-2.5 pr-3 align-top md:table-cell">
          {lanes.length === 0 ? (
            <span className="text-xs text-[#5C6472]">Every piece</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {lanes.map((lane) => {
                const on = !c.lanes?.length || c.lanes.includes(lane);
                const only = !c.lanes?.length;
                return (
                  <button
                    key={lane}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const current = c.lanes?.length ? c.lanes : lanes;
                      const next = on ? current.filter((l) => l !== lane) : [...current, lane];
                      onLanes(next.length === lanes.length ? null : next);
                    }}
                    title={only ? `Every lane. Click to use ${lane} only.` : on ? `Copied for ${lane}. Click to stop.` : `Not copied for ${lane}. Click to add.`}
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${
                      on
                        ? "border-[rgba(0,131,255,0.35)] bg-[rgba(0,131,255,0.12)] text-[#8FC4FF]"
                        : "border-[rgba(255,255,255,0.10)] text-[#5C6472] hover:text-[#A8B0BD]"
                    }`}
                  >
                    {lane}
                  </button>
                );
              })}
            </div>
          )}
          {!c.lanes?.length && lanes.length > 0 && (
            <div className="mt-1 text-[11px] text-[#545D6C]">every lane</div>
          )}
        </td>

        <td className="hidden py-2.5 pr-3 align-top lg:table-cell">
          <div className="relative inline-flex items-center">
            <select
              value={c.scrape_limit}
              disabled={pending}
              onChange={(e) => onDepth(Number(e.target.value))}
              aria-label={`How deep to scrape ${c.name}`}
              className="appearance-none rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] py-1 pl-2.5 pr-7 text-xs text-[#A8B0BD] outline-none focus:border-[#0083FF]"
            >
              {SCRAPE_DEPTHS.map((d) => (
                <option key={d.value} value={d.value} className="bg-[#12151B]">{d.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-[#5C6472]" />
          </div>
        </td>

        <td className="py-2.5 pl-2 pr-3 align-top">
          {confirming ? (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              <span className="hidden text-xs text-[#FFB4B4] sm:inline">Delete?</span>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-[rgba(255,90,90,0.32)] bg-[rgba(255,90,90,0.10)] px-2 py-1 text-xs font-medium text-[#FFB4B4]"
              >
                Delete
              </button>
              <button type="button" onClick={onCancelDelete} className="px-1.5 py-1 text-xs text-[#7C8595] hover:text-[#F5F5F7]">
                Keep
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                onClick={onToggle}
                disabled={pending}
                title={paused ? `Resume scraping ${c.name}` : `Pause scraping ${c.name}`}
                aria-label={paused ? `Resume scraping ${c.name}` : `Pause scraping ${c.name}`}
                className="rounded-lg p-1.5 text-[#7C8595] transition-colors duration-500 hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]"
              >
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={onAskDelete}
                disabled={pending}
                title={`Remove ${c.name} from the roster`}
                aria-label={`Remove ${c.name} from the roster`}
                className="rounded-lg p-1.5 text-[#7C8595] transition-colors duration-500 hover:text-[#FFB4B4]"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]">
          <td />
          <td colSpan={5} className="px-3 py-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-[rgba(255,255,255,0.06)] px-3 py-2.5">
                <div className="sk-label">WHAT SETTOKU DOES WITH THEM</div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#A8B0BD]">{ROLE_HELP[c.role]}</p>
                <p className="mt-2 text-[11px] text-[#545D6C]">
                  Pulling {depthLabel(c.scrape_limit).toLowerCase()}, {c.scrape_limit} posts each run.
                </p>
              </div>

              <label className="block rounded-lg border border-[rgba(255,255,255,0.06)] px-3 py-2.5">
                <span className="sk-label">YOUR NOTE, WHY THEY ARE HERE</span>
                <textarea
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  onBlur={() => { if ((why.trim() || null) !== (c.why ?? null)) onWhy(why); }}
                  rows={2}
                  placeholder="Best hooks in my lane. Watch how he opens."
                  className="mt-1.5 w-full resize-none rounded border border-transparent bg-transparent text-xs leading-relaxed text-[#A8B0BD] placeholder:text-[#5C6472] outline-none focus:border-[rgba(255,255,255,0.10)]"
                />
                {c.note && <p className="mt-1 text-[11px] text-[#545D6C]">Added: {c.note}</p>}
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EmptyRoster({ workspace }: { workspace: string | null }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.015)] p-6 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)]">
        <Users className="size-5 text-[#7C8595]" />
      </div>
      <div className="text-sm font-medium text-[#A8B0BD]">
        No creators in{workspace ? ` ${workspace}` : " this workspace"}
      </div>
      <div className="mt-1 max-w-md text-xs text-[#7C8595]">
        Every workspace keeps its own roster. If you added creators somewhere else, switch workspace
        using the picker at the top left. Otherwise add the first one with the Add button above.
      </div>
    </div>
  );
}

function AddCreatorForm({
  onAdded, onCancel, onError,
}: {
  onAdded: (c: Creator) => void;
  onCancel: () => void;
  onError: (e: string) => void;
}) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [youtube, setYoutube] = useState("");
  const [role, setRole] = useState<CreatorRole>("emulate");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim() || saving) return;
    setSaving(true);
    const res = await addCreator({ handle, name, youtube, role });
    setSaving(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    const clean = handle.trim().replace(/^@+/, "");
    onAdded({
      id: `pending-${clean}`,
      handle: clean,
      name: name.trim() || clean,
      instagram: clean,
      youtube: youtube.trim().replace(/^@+/, "") || null,
      role,
      status: "active",
      note: null,
      last_scraped_at: null,
      posts_count: 0,
      videos_count: 0,
      followers: null,
      scrape_limit: 50,
      why: null,
      lanes: null,
    });
  }

  const field =
    "w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1.5 text-sm text-[#F5F5F7] placeholder:text-[#5C6472] outline-none focus:border-[#0083FF]";

  return (
    <form
      onSubmit={submit}
      className="space-y-2.5 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.025)] p-3"
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <input className={field} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@instagram" aria-label="Instagram handle" autoFocus />
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" />
        <input className={field} value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="YouTube (optional)" aria-label="YouTube handle" />
        <select className={field} value={role} onChange={(e) => setRole(e.target.value as CreatorRole)} aria-label="Use them for">
          {CREATOR_ROLES.map((r) => (
            <option key={r} value={r} className="bg-[#12151B]">{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-[#7C8595]">{ROLE_HELP[role]}</p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!handle.trim() || saving}
          className="rounded-lg bg-[#0083FF] px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
        >
          {saving ? "Adding" : "Add to roster"}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-xs text-[#7C8595] hover:text-[#F5F5F7]">
          Cancel
        </button>
      </div>
    </form>
  );
}
