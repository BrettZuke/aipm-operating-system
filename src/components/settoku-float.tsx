"use client";

import { useState } from "react";
import { Send, X, Sparkles } from "lucide-react";
import Link from "next/link";

type Props = { agencyId: string; userId: string };

export function SettokuFloat({ agencyId, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-blue-500">
                <Sparkles className="size-3.5 text-white" />
              </div>
              <span className="text-sm font-medium text-[#F5F5F7]">Ask Settoku</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-4 text-center">
            <Sparkles className="mx-auto size-6 text-blue-400 mb-2" />
            <p className="text-xs text-[#9CA3AF]">Ask AI anything about your workspace.</p>
            <Link
              href="/settoku-chat"
              className="mt-3 block text-xs text-blue-400 hover:underline"
            >
              Open full AI Chat →
            </Link>
          </div>
          <div className="border-t border-[rgba(255,255,255,0.08)] p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) {
                    window.location.href = "/settoku-chat";
                  }
                }}
                placeholder="Ask Settoku anything…"
                className="flex-1 rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-2 text-xs text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => { if (input.trim()) window.location.href = "/settoku-chat"; }}
                className="flex size-8 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.08)] text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.15)]"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/95 px-4 py-2.5 text-sm text-[#9CA3AF] shadow-xl backdrop-blur hover:border-[rgba(255,255,255,0.18)] hover:text-[#F5F5F7]"
        >
          Ask Settoku anything…
          <div className="flex size-6 items-center justify-center rounded-md bg-[rgba(255,255,255,0.06)]">
            <Send className="size-3 text-[#9CA3AF]" />
          </div>
        </button>
      )}
    </div>
  );
}
