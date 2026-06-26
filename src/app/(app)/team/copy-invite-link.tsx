"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyInviteLinkProps {
  token: string;
}

export function CopyInviteLink({ token }: CopyInviteLinkProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback when the async clipboard API is unavailable/blocked.
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } catch { /* user can still copy manually */ }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.10)] px-2 py-1 text-xs text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]"
      title="Copy invite link to share directly (no email needed)"
    >
      {copied ? (
        <>
          <Check className="size-3 text-[#00D393]" />
          <span className="text-[#00D393]">Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          <span>Copy link</span>
        </>
      )}
    </button>
  );
}
