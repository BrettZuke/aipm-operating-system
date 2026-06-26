/**
 * Minimal markdown renderer for the formats we generate internally:
 * client dossiers, call notes, brand-voice docs, weekly reports.
 *
 * Handles: # headers (1-6), **bold**, *italic*, `inline code`, links [text](url),
 * unordered lists (- ...), ordered lists (1. ...), paragraphs, blank lines,
 * tables (| col | col |), horizontal rules (---).
 *
 * NOT a full CommonMark parser — keeps deps zero.
 */

import React from "react";

type Inline = string | React.ReactElement;

function renderInline(text: string, keyPrefix = ""): React.ReactNode[] {
  // Order matters: links first (so their inner text doesn't get bold-parsed)
  const parts: Inline[] = [text];
  let key = 0;
  const nextKey = () => `${keyPrefix}-${key++}`;

  const apply = (regex: RegExp, render: (match: RegExpMatchArray) => React.ReactElement) => {
    const out: Inline[] = [];
    for (const part of parts) {
      if (typeof part !== "string") { out.push(part); continue; }
      let last = 0;
      const matches = [...part.matchAll(regex)];
      for (const m of matches) {
        if (m.index! > last) out.push(part.slice(last, m.index));
        out.push(render(m));
        last = m.index! + m[0].length;
      }
      if (last < part.length) out.push(part.slice(last));
    }
    parts.length = 0; parts.push(...out);
  };

  apply(/\[([^\]]+)\]\(([^)]+)\)/g, m => <a key={nextKey()} href={m[2]} className="text-blue-400 hover:underline">{m[1]}</a>);
  apply(/`([^`]+)`/g,                m => <code key={nextKey()} className="rounded bg-[rgba(255,255,255,0.06)] px-1 py-0.5 text-[12px] font-mono text-[#F5F5F7]">{m[1]}</code>);
  apply(/\*\*([^*]+)\*\*/g,         m => <strong key={nextKey()} className="font-semibold text-[#F5F5F7]">{m[1]}</strong>);
  apply(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, m => <em key={nextKey()} className="italic">{m[1]}</em>);

  return parts;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nextKey = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") { i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={nextKey()} className="my-4 border-[rgba(255,255,255,0.08)]" />);
      i++; continue;
    }

    // Headers
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = h[2];
      const cls = level === 1 ? "text-2xl font-bold text-[#F5F5F7] mt-6 mb-3"
               : level === 2 ? "text-xl font-semibold text-[#F5F5F7] mt-5 mb-2"
               : level === 3 ? "text-lg font-semibold text-[#F5F5F7] mt-4 mb-2"
               : "text-base font-semibold text-[#F5F5F7] mt-3 mb-1";
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      blocks.push(React.createElement(Tag, { key: nextKey(), className: cls }, renderInline(content, nextKey())));
      i++; continue;
    }

    // Tables — leading | line and a separator line below
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) {
      const headerCells = line.split("|").slice(1, -1).map(s => s.trim());
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map(s => s.trim()));
        i++;
      }
      blocks.push(
        <div key={nextKey()} className="my-3 overflow-x-auto rounded-md border border-[rgba(255,255,255,0.07)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[#0C0C10]/60 text-left text-[11px] uppercase tracking-wider text-[#6B7280]">
                {headerCells.map((c, j) => <th key={j} className="px-3 py-2">{renderInline(c, `h${j}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => <td key={ci} className="px-3 py-2 text-[rgba(245,245,247,0.85)]">{renderInline(c, `c${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Lists (- or *) and numbered (1.)
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={nextKey()} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6 my-2 text-[rgba(245,245,247,0.85)]`}>
          {items.map((it, j) => <li key={j} className="text-sm">{renderInline(it, `li${j}`)}</li>)}
        </Tag>
      );
      continue;
    }

    // Paragraph — collect contiguous non-blank lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^#{1,6}\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !lines[i].trim().startsWith("|")) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={nextKey()} className="my-2 text-sm text-[rgba(245,245,247,0.85)] leading-relaxed">{renderInline(para.join(" "), nextKey())}</p>);
  }

  return <div>{blocks}</div>;
}
