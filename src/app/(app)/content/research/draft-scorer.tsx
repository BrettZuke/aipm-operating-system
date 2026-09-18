"use client";

// Score a draft before it is posted.
//
// Paste the script, or upload the video and it is watched. Either way the checks in code run first
// (how many words are spoken, how long the first sentence is, whether there is an ask, whether it
// claims a result nobody can check), then a model scores six parts out of ten, and the total is
// worked out in code. A draft with no ask or an invented result is capped at 60 whatever the model
// thought of it.
//
// An uploaded video goes straight to private storage through a one-off address and is deleted the
// moment it has been scored.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Gauge, Upload } from "lucide-react";
import type { DraftDetail, DraftSummary } from "@/lib/research/detail";
import type { DraftReport } from "@/lib/research/types";
import { dateText, draftCardFormat, DRAFT_FORMAT_LABEL, DRAFT_UPLOAD_MAX_BYTES, draftContentType, durationText, type DraftFormat } from "@/lib/research/view";
import { createCard } from "../board-actions";
import { draftDetailAction, draftUploadUrlAction, scoreDraftAction } from "./ai-actions";
import { Card, ErrorLine, PrimaryButton, Progress, QuietButton, ResearchEmpty, Segmented, SelectPill, OFFLINE } from "./ui";

type Source = "script" | "video";

export function DraftScorer({ initialDrafts, initialDraft }: { initialDrafts: DraftSummary[]; initialDraft: DraftDetail | null }) {
  const [source, setSource] = useState<Source>("script");
  const [format, setFormat] = useState<DraftFormat>("reel");
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [script, setScript] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DraftReport | null>(initialDraft?.report ?? null);
  const [reportTitle, setReportTitle] = useState<string | null>(initialDraft?.title ?? null);
  const [history, setHistory] = useState(initialDrafts);
  const [openId, setOpenId] = useState<string | null>(initialDraft?.id ?? null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The browser knows how long the video is, and the pace check needs it. Reading it is
  // asynchronous, so the length is set from the callbacks rather than while the effect runs;
  // choosing a different video clears the old length where the choice is made.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      setDurationS(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      // Not knowing the length is not a failure: the pace is then judged from the words alone.
      setDurationS(null);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  }, [file]);

  const score = useCallback(async () => {
    setBusy(true);
    setStartedAt(Date.now());
    setError(null);
    setReport(null);
    try {
      let videoPath: string | null = null;
      if (source === "video") {
        if (!file) {
          setError("Choose a video to score.");
          return;
        }
        const contentType = draftContentType(file.name, file.type);
        if (!contentType) {
          setError("Upload an mp4, mov or webm video.");
          return;
        }
        if (file.size > DRAFT_UPLOAD_MAX_BYTES) {
          setError("Videos can be up to 25MB. Trim it, or paste the script instead.");
          return;
        }
        setStep("Uploading the video");
        const upload = await draftUploadUrlAction({ contentType, size: file.size });
        if (!upload.ok) {
          setError(upload.error);
          return;
        }
        const put = await fetch(upload.signedUrl, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
        if (!put.ok) {
          setError("The upload did not go through. Try again, or paste the script instead.");
          return;
        }
        videoPath = upload.path;
      }
      setStep(source === "video" ? "Watching your video and scoring it" : "Reading your script and scoring it");
      const answer = await scoreDraftAction(
        source === "script"
          ? { inputKind: "script", format, title: title || null, hook: hook || null, script }
          : { inputKind: "video", format, title: title || null, hook: hook || null, videoPath: videoPath!, durationS },
      );
      if (!answer.ok) {
        setError(answer.error);
        return;
      }
      setReport(answer.report);
      setReportTitle(title || null);
      setOpenId(answer.draftId);
      setHistory((h) => [
        { id: answer.draftId, created_at: new Date().toISOString(), input_kind: source, format, title: title || null, hook: hook || null, score: answer.score },
        ...h,
      ]);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
      setStep("");
    }
  }, [source, file, format, title, hook, script, durationS]);

  const openDraft = useCallback(async (id: string) => {
    setError(null);
    setOpenId(id);
    try {
      const answer = await draftDetailAction({ draftId: id });
      if (!answer.ok) setError(answer.error);
      else {
        setReport(answer.draft.report);
        setReportTitle(answer.draft.title);
      }
    } catch {
      setError(OFFLINE);
    }
  }, []);

  const canScore = source === "script" ? script.trim().length >= 20 : !!file;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-[#F5F5F7]">Your draft</h3>
            <Segmented
              label="What you are scoring"
              value={source}
              onChange={(v) => {
                setSource(v);
                setError(null);
              }}
              options={[
                { value: "script", label: "Paste script" },
                { value: "video", label: "Upload video" },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SelectPill
              label="Format"
              value={format}
              onChange={(v) => setFormat(v as DraftFormat)}
              options={(Object.keys(DRAFT_FORMAT_LABEL) as DraftFormat[]).map((f) => ({ value: f, label: DRAFT_FORMAT_LABEL[f] }))}
            />
          </div>

          <Field label="Title, if it has one">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="One video, half the calls"
              className="h-10 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 text-sm text-[#F5F5F7] placeholder:text-[#5C6472] focus:border-[#0083FF] focus:outline-none"
            />
          </Field>

          <Field label="The hook, if you wrote one separately">
            <input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="Left blank, the first line is treated as the hook"
              className="h-10 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 text-sm text-[#F5F5F7] placeholder:text-[#5C6472] focus:border-[#0083FF] focus:outline-none"
            />
          </Field>

          {source === "script" ? (
            <Field label="The script, one sentence per line">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={10}
                placeholder="Paste what will be said out loud."
                className="w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] p-3 text-sm leading-relaxed text-[#F5F5F7] placeholder:text-[#5C6472] focus:border-[#0083FF] focus:outline-none"
              />
            </Field>
          ) : (
            <Field label="The video, up to 25MB">
              <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.02)] p-5 text-center">
                <input
                  ref={fileInput}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(e) => {
                    setDurationS(null);
                    setFile(e.target.files?.[0] ?? null);
                  }}
                  className="sr-only"
                  aria-label="Choose a video to score"
                />
                <QuietButton onClick={() => fileInput.current?.click()} icon={Upload}>
                  {file ? "Choose a different video" : "Choose a video"}
                </QuietButton>
                <p className="mt-2 text-xs text-[#7C8595]">
                  {file ? `${file.name}, ${(file.size / 1024 / 1024).toFixed(1)}MB${durationS ? `, ${durationText(durationS)}` : ""}` : "mp4, mov or webm"}
                </p>
                <p className="mt-1 text-xs text-[#5C6472]">It is deleted as soon as it has been scored.</p>
              </div>
            </Field>
          )}

          {error && <ErrorLine>{error}</ErrorLine>}
          {busy ? <Progress text={step || "Scoring"} startedAt={startedAt} /> : <PrimaryButton onClick={score} disabled={!canScore} icon={Gauge}>Score this draft</PrimaryButton>}
        </Card>

        <div className="min-w-0">{report ? <Report report={report} title={reportTitle} format={format} /> : <NoReportYet />}</div>
      </div>

      {history.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-2.5 text-[13px] font-medium text-[#F5F5F7]">Scores so far</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-[rgba(255,255,255,0.02)] text-[#7C8595]">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Draft</th>
                  <th className="px-4 py-2 font-medium">Format</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => openDraft(d.id)}
                    className={`cursor-pointer border-t border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.02)] ${openId === d.id ? "bg-[rgba(0,131,255,0.06)]" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-[#7C8595]">{dateText(d.created_at)}</td>
                    <td className="max-w-[260px] truncate px-4 py-2 text-[#F5F5F7]">{d.title ?? d.hook ?? (d.input_kind === "video" ? "An uploaded video" : "A pasted script")}</td>
                    <td className="px-4 py-2 text-[#A8B0BD]">{DRAFT_FORMAT_LABEL[d.format]}</td>
                    <td className="px-4 py-2 font-mono text-[#F5F5F7]">{d.score ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-[#A8B0BD]">{label}</span>
      {children}
    </label>
  );
}

function NoReportYet() {
  return (
    <ResearchEmpty icon={Gauge} title="Nothing scored yet">
      Paste the script, or upload the video, and you get a score out of a hundred with the exact lines to change: the hook, whether it is one clear idea, what the
      viewer gets, the pace, the ask, and whether it looks like what is working in this niche.
    </ResearchEmpty>
  );
}

function Report({ report, title, format }: { report: DraftReport; title: string | null; format: DraftFormat }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tone = report.score >= 75 ? "text-[#7BE0A5]" : report.score >= 55 ? "text-[#F8AF00]" : "text-[#FF6466]";
  return (
    <Card className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="truncate text-xs text-[#7C8595]">{title}</p>}
          <div className={`text-[44px] font-semibold leading-none ${tone}`} style={{ fontFamily: "var(--font-settoku-display), Georgia, serif" }}>
            {report.score}
            <span className="ml-1 text-base text-[#5C6472]">/ 100</span>
          </div>
        </div>
      </div>
      {report.verdict && <p className="text-sm leading-relaxed text-[#F5F5F7]">{report.verdict}</p>}

      <div className="space-y-3">
        {report.parts.map((p) => (
          <div key={p.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-[#F5F5F7]">{p.label}</span>
              <span className="font-mono text-[11px] text-[#7C8595]">{p.score}/10</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
              <div className="h-full rounded-full bg-[#0083FF]" style={{ width: `${Math.max(0, Math.min(10, p.score)) * 10}%` }} />
            </div>
            {p.note && <p className="mt-1.5 text-[13px] leading-relaxed text-[#A8B0BD]">{p.note}</p>}
            {p.fix && <p className="mt-1 text-[13px] leading-relaxed text-[#7BE0A5]">{p.fix}</p>}
          </div>
        ))}
      </div>

      {report.line_fixes.length > 0 && (
        <div className="space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-4">
          <p className="text-[13px] font-semibold text-[#F5F5F7]">Lines to change</p>
          {report.line_fixes.map((f) => (
            <div key={f.line} className="space-y-1">
              <p className="text-[13px] text-[#7C8595] line-through">{f.line}</p>
              <p className="text-[13px] text-[#F5F5F7]">{f.rewrite}</p>
              {f.problem && <p className="text-xs text-[#5C6472]">{f.problem}</p>}
            </div>
          ))}
        </div>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}

      {report.hook_rewrites.length > 0 && (
        <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
          <p className="text-[13px] font-semibold text-[#F5F5F7]">Stronger hooks for this draft</p>
          {report.hook_rewrites.map((h) => (
            <div key={h} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-[13px] text-[#A8B0BD]">{h}</span>
              <SaveHookRewrite hook={h} format={format} saved={saved.includes(h)} onSaved={() => setSaved((s) => [...s, h])} onError={setError} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// A hook rewritten from a draft has no standout video behind it, so it is filed as an ordinary card
// in Ideas, marked as having come from a draft score.
function SaveHookRewrite({
  hook,
  format,
  saved,
  onSaved,
  onError,
}: {
  hook: string;
  format: DraftFormat;
  saved: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const save = useCallback(async () => {
    setBusy(true);
    try {
      // Every field the board's own checker asks for is sent, including the ones with no value:
      // a missing key is not the same as an empty one, and it refuses the card.
      const answer = await createCard(
        {
          title: hook.slice(0, 200),
          hook,
          format: draftCardFormat(format),
          platform: null,
          plan_month: null,
          source: "research:draft-score",
          notes: "Written by Score a draft, as a stronger opening for a draft you pasted in.",
        },
        "ideas",
      );
      if (!answer.ok) onError(answer.error);
      else onSaved();
    } catch {
      onError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }, [hook, format, onSaved, onError]);
  return (
    <QuietButton onClick={save} busy={busy} icon={saved ? Check : FileText}>
      {saved ? "Saved to the Board" : "Save to the Board"}
    </QuietButton>
  );
}
