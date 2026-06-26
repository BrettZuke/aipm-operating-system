"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { ChevronDown, Check, Plus, Building2 } from "lucide-react";
import { switchWorkspace, createWorkspace } from "@/lib/workspace-actions";

type Workspace = { id: string; name: string; role: string };

export function WorkspaceSwitcher({ workspaces, activeId }: { workspaces: Workspace[]; activeId: string | null }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const active = workspaces.find(w => w.id === activeId) ?? workspaces[0];

  function handleSwitch(id: string) {
    if (id === activeId) { setOpen(false); return; }
    startTransition(async () => {
      const result = await switchWorkspace(id);
      if (result.ok) {
        setOpen(false);
        // Force a hard reload so all server components re-render with new agency context
        window.location.reload();
      } else {
        setError(result.error);
      }
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      setError(null);
      const result = await createWorkspace(newName);
      if (result.ok) {
        setNewName("");
        setCreating(false);
        setOpen(false);
        window.location.reload();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative w-full" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[rgba(255,255,255,0.05)] transition-colors duration-100"
      >
        <div className="flex size-6 items-center justify-center rounded overflow-hidden shrink-0 bg-[#0083FF] text-[10px] font-bold text-white">
          {active?.name?.charAt(0).toUpperCase() ?? "—"}
        </div>
        <span className="flex-1 truncate text-left text-sm font-medium text-[#F5F5F7]">{active?.name ?? "No workspace"}</span>
        <ChevronDown className="size-3.5 shrink-0 text-[#6B7280]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] shadow-2xl z-50 overflow-hidden"
             style={{ boxShadow: "0 16px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,131,255,0.05)" }}>
          {/* Workspace list */}
          <div className="px-2 pt-2 pb-1">
            <div className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-[#6B7280]">WORKSPACES</div>
            {workspaces.map(w => (
              <button
                key={w.id}
                onClick={() => handleSwitch(w.id)}
                disabled={pending}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                  w.id === activeId
                    ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7]"
                    : "text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F5F5F7]"
                }`}
              >
                <div className="flex size-6 items-center justify-center rounded bg-[rgba(255,255,255,0.06)] text-[10px] font-bold text-[#F5F5F7] shrink-0">
                  {w.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-[10px] text-[#6B7280] capitalize">{w.role}</div>
                </div>
                {w.id === activeId && <Check className="size-3.5 text-blue-400 shrink-0" />}
              </button>
            ))}
          </div>

          {/* Create new */}
          <div className="border-t border-[rgba(255,255,255,0.08)] p-2">
            {creating ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                  placeholder="Workspace name"
                  className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#09090C] px-2.5 py-1.5 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {error && <div className="text-xs text-red-400">{error}</div>}
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={pending || !newName.trim()}
                    className="flex-1 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                    {pending ? "Creating…" : "Create"}
                  </button>
                  <button onClick={() => { setCreating(false); setNewName(""); }}
                    className="rounded-md border border-[rgba(255,255,255,0.10)] px-2.5 py-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F5F5F7]"
              >
                <div className="flex size-6 items-center justify-center rounded border border-dashed border-[rgba(255,255,255,0.20)] shrink-0">
                  <Plus className="size-3 text-[#9CA3AF]" />
                </div>
                <span>New workspace</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
