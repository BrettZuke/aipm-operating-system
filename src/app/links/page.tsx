"use client";

import { useEffect, useState } from "react";
import { LinkBuilder } from "@/components/coach/link-builder";

// Public, no-login UTM page: a channel "link bank" (short /go links) plus the
// one-off link builder. Mirrors the workflow in UTM-GUIDE.md so anyone on the
// team can grab a tagged link in 30 seconds without opening the dashboard.

const CHANNELS: { slug: string; label: string }[] = [
  { slug: "bio", label: "Instagram bio" },
  { slug: "dm", label: "DMs" },
  { slug: "story", label: "Story sticker" },
  { slug: "reel", label: "Reels" },
  { slug: "post", label: "Feed posts" },
  { slug: "email", label: "Email broadcasts" },
  { slug: "youtube", label: "YouTube" },
  { slug: "tiktok", label: "TikTok" },
];

const FUNNEL = process.env.NEXT_PUBLIC_FUNNEL_URL || "";

export default function LinksPage() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const destinations = FUNNEL
    ? [{ label: "Main funnel", url: FUNNEL }]
    : [{ label: "Example funnel", url: "https://example.com/" }];

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      /* clipboard blocked: the user can still select the text */
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#09090C", color: "#F5F5F7", padding: "48px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: "#6B7280" }}>
          MARKETING · UTM
        </div>
        <h1 style={{ marginTop: 6, fontSize: 34, fontWeight: 700 }}>UTM links</h1>
        <p style={{ marginTop: 8, fontSize: 14, color: "#9CA3AF", lineHeight: 1.6 }}>
          A tagged link is a normal link to your funnel with an invisible label on the end. The visitor
          sees a normal page; you see exactly where the click came from. Two kinds below.
        </p>

        {/* 1. Link bank */}
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Link bank (channel links)</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: "#9CA3AF", lineHeight: 1.6 }}>
            Short, clean links for places people actually see the link, like your bio and DMs. Each one
            tracks a whole channel. Paste them as-is.
          </p>
          {!FUNNEL && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#F0B429" }}>
              Set NEXT_PUBLIC_FUNNEL_URL in your environment so these redirect to your funnel.
            </p>
          )}
          <ul style={{ marginTop: 12, listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {CHANNELS.map((c) => {
              const url = origin ? `${origin}/go/${c.slug}` : `/go/${c.slug}`;
              return (
                <li
                  key={c.slug}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <code style={{ fontSize: 13, color: "#F5F5F7", wordBreak: "break-all" }}>{url}</code>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{c.label}</div>
                  </div>
                  <button
                    onClick={() => copy(url, c.slug)}
                    style={{
                      flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: copied === c.slug ? "#0083FF" : "rgba(255,255,255,0.06)",
                      color: "#F5F5F7",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {copied === c.slug ? "Copied" : "Copy"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 2. Builder */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Builder (one specific thing)</h2>
          <p style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.6, marginBottom: 16 }}>
            When you want to know which specific video, story, or email drove the sales, build a one-off
            labeled link. Pick the source and placement, name the campaign, and copy.
          </p>
          <LinkBuilder destinations={destinations} />
        </section>

        <p style={{ marginTop: 36, fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
          Use the short /go links where people see the link (bio, DMs). Use a builder link where the link
          is hidden behind text or a button (YouTube descriptions, email buttons, story stickers). Full
          walkthrough in UTM-GUIDE.md.
        </p>
      </div>
    </main>
  );
}
