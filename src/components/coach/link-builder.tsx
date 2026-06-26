"use client";

import { useMemo, useState } from "react";

// UTM link builder for the coach. Generates consistently-tagged links so every visit + sale can be
// attributed (the capture/join already runs; this is what makes utm_source actually populate).
// Convention: source = where it lives, medium = the placement, campaign = the offer/launch,
// content = the specific piece. Everything is slugified (lowercase, underscores) so the
// dashboard groups cleanly instead of splitting "June Launch" vs "june_launch".

interface Dest { label: string; url: string }

const SOURCES: { key: string; label: string; mediums: string[] }[] = [
  { key: "instagram", label: "Instagram", mediums: ["bio", "story", "dm", "profile", "post"] },
  { key: "email", label: "Email (Kit)", mediums: ["broadcast", "sequence", "newsletter"] },
  { key: "youtube", label: "YouTube / content", mediums: ["description", "pinned", "community", "podcast"] },
  { key: "custom", label: "Custom…", mediums: [] },
];

const fieldStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#F5F5F7",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  width: "100%",
};
const labelStyle = "mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]";

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function LinkBuilder({ destinations }: { destinations: Dest[] }) {
  const [destUrl, setDestUrl] = useState(destinations[0]?.url ?? "https://example.com/");
  const [source, setSource] = useState("instagram");
  const [customSource, setCustomSource] = useState("");
  const [medium, setMedium] = useState("bio");
  const [customMedium, setCustomMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const sourceDef = SOURCES.find((s) => s.key === source) ?? SOURCES[0];
  const sourceVal = source === "custom" ? slug(customSource) : source;
  const mediumVal = sourceDef.mediums.length ? medium : slug(customMedium);

  const built = useMemo(() => {
    const base = destUrl.trim();
    if (!base) return "";
    try {
      const u = new URL(base);
      const set = (k: string, v: string) => { const x = slug(v); if (x) u.searchParams.set(k, x); };
      set("utm_source", sourceVal);
      set("utm_medium", mediumVal);
      set("utm_campaign", campaign);
      if (content.trim()) set("utm_content", content);
      return u.toString();
    } catch {
      return "";
    }
  }, [destUrl, sourceVal, mediumVal, campaign, content]);

  function onSourceChange(next: string) {
    setSource(next);
    const def = SOURCES.find((s) => s.key === next);
    if (def?.mediums.length) setMedium(def.mediums[0]);
  }

  async function copy() {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — user can select the text */ }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-[#F5F5F7]" style={{ fontFamily: "var(--font-settoku-display)" }}>Link builder</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">Tag every link you share so the dashboard knows which post, email, or video drove each visit and sale.</p>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelStyle}>Destination page</label>
            <select style={fieldStyle} value={destUrl} onChange={(e) => setDestUrl(e.target.value)}>
              {destinations.map((d) => (
                <option key={d.url} value={d.url}>{d.label} — {d.url.replace("https://", "")}</option>
              ))}
            </select>
            <input style={{ ...fieldStyle, marginTop: 8 }} placeholder="…or paste any example.com URL" value={destUrl} onChange={(e) => setDestUrl(e.target.value)} />
          </div>

          <div>
            <label className={labelStyle}>Source (where it lives)</label>
            <select style={fieldStyle} value={source} onChange={(e) => onSourceChange(e.target.value)}>
              {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {source === "custom" && (
              <input style={{ ...fieldStyle, marginTop: 8 }} placeholder="e.g. tiktok" value={customSource} onChange={(e) => setCustomSource(e.target.value)} />
            )}
          </div>

          <div>
            <label className={labelStyle}>Medium (placement)</label>
            {sourceDef.mediums.length ? (
              <select style={fieldStyle} value={medium} onChange={(e) => setMedium(e.target.value)}>
                {sourceDef.mediums.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input style={fieldStyle} placeholder="e.g. profile" value={customMedium} onChange={(e) => setCustomMedium(e.target.value)} />
            )}
          </div>

          <div>
            <label className={labelStyle}>Campaign (offer / launch)</label>
            <input style={fieldStyle} placeholder="e.g. spring_launch" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          </div>

          <div>
            <label className={labelStyle}>Content (specific piece, optional)</label>
            <input style={fieldStyle} placeholder="e.g. reel_42 or email_2" value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
        </div>

        <div className="mt-5">
          <label className={labelStyle}>Your tagged link</label>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 break-all rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 px-3 py-2.5 font-mono text-[13px] text-[#00D393]">
              {built || <span className="text-[#6B7280]">Fill in the fields above…</span>}
            </div>
            <button
              onClick={copy}
              disabled={!built}
              className="shrink-0 rounded-lg px-4 text-sm font-medium text-[#F5F5F7] transition-colors disabled:opacity-40"
              style={{ background: copied ? "rgba(0,211,147,0.15)" : "rgba(0,131,255,0.15)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 text-[13px] leading-relaxed text-[#9CA3AF]">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">The convention</div>
        <ul className="space-y-1.5">
          <li><span className="font-mono text-[#F5F5F7]">source</span> = where the link lives — <span className="font-mono">instagram</span>, <span className="font-mono">email</span>, <span className="font-mono">youtube</span>.</li>
          <li><span className="font-mono text-[#F5F5F7]">medium</span> = the placement — <span className="font-mono">bio</span>, <span className="font-mono">story</span>, <span className="font-mono">dm</span>, <span className="font-mono">broadcast</span>, <span className="font-mono">description</span>.</li>
          <li><span className="font-mono text-[#F5F5F7]">campaign</span> = the offer or launch: <span className="font-mono">spring_launch</span>, <span className="font-mono">membership</span>, <span className="font-mono">webinar</span>, <span className="font-mono">bundle</span>.</li>
          <li><span className="font-mono text-[#F5F5F7]">content</span> = the specific piece, so you can compare two of the same thing — <span className="font-mono">reel_42</span>, <span className="font-mono">email_2</span>.</li>
        </ul>
        <p className="mt-3">Use the <strong className="text-[#F5F5F7]">same words every time</strong> (the builder lowercases and underscores for you). A bare link still tracks as the channel in GA4, but only a tagged link shows up by campaign and gets the sale attributed in Attribution.</p>
      </div>
    </div>
  );
}
