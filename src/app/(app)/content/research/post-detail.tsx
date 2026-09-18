"use client";

// One standout video, opened from the feed without leaving the page.
//
// Two sections, in the order the work actually happens. 01 Why it worked: a model watches the video
// and says what it does, quoting the exact words and the second they happen. 02 Make it yours:
// hooks in this client's own voice, built on the same mechanism, which can be saved to the Board or
// turned into a full script that shows up in Record.
//
// Nothing here pretends. Each button shows the seconds it has been running, a failure shows the
// reason in one sentence, and a breakdown made without watching the video says so.

import { useCallback, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, FileText, Film, LayoutGrid, Sparkles, Wand2 } from "lucide-react";
import type { FeedPost } from "@/lib/research/feed";
import type { Adaptation, Breakdown } from "@/lib/research/types";
import { ageText, compactNumber, dateText, durationText, hookQuote, KIND_LABEL, multipleText, PLATFORM_LABEL, sourceNote } from "@/lib/research/view";
import type { PostDetail } from "@/lib/research/detail";
import { adaptPostAction, analyzePostAction, saveHookAction, writeScriptAction } from "./ai-actions";
import { Card, Disclosure, ErrorLine, Eyebrow, PrimaryButton, Progress, Quote, QuietButton, SectionHead, Thumb, TwoColumns } from "./ui";
import { OFFLINE } from "./ui";

const BREAKDOWN_NOTE = "A model watches the video and writes down what it does. It takes about twenty seconds.";
const ADAPT_NOTE = "Hooks in your client's own words, built on the same idea. It takes about twenty seconds.";

export function PostDetailView({
  post,
  detail: initialDetail,
  nowMs,
  onBack,
  onChanged,
}: {
  post: FeedPost;
  detail: PostDetail;
  nowMs: number;
  onBack: () => void;
  onChanged: (postId: string, patch: { analysed?: boolean; adapted?: boolean }) => void;
}) {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(initialDetail.breakdown);
  const [adaptation, setAdaptation] = useState<Adaptation | null>(initialDetail.adaptation);
  const [profileThin, setProfileThin] = useState(initialDetail.adaptedWithThinProfile);
  const [busy, setBusy] = useState<"breakdown" | "adapt" | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedHooks, setSavedHooks] = useState<string[]>([]);
  const [savingHook, setSavingHook] = useState<string | null>(null);
  const [scriptCard, setScriptCard] = useState<{ id: string; title: string; problems: string[] } | null>(null);
  const [writing, setWriting] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  const pickIndex = chosen ?? adaptation?.pick ?? 0;
  const picked = adaptation?.hooks[pickIndex] ?? adaptation?.hooks[0] ?? null;
  const others = (adaptation?.hooks ?? []).map((h, i) => ({ ...h, i })).filter((h) => h.i !== pickIndex);

  const runBreakdown = useCallback(async () => {
    setBusy("breakdown");
    setStartedAt(Date.now());
    setError(null);
    try {
      const answer = await analyzePostAction({ postId: post.id });
      if (!answer.ok) setError(answer.error);
      else {
        setBreakdown(answer.breakdown);
        onChanged(post.id, { analysed: true });
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }, [post.id, onChanged]);

  const runAdapt = useCallback(async () => {
    setBusy("adapt");
    setStartedAt(Date.now());
    setError(null);
    try {
      const answer = await adaptPostAction({ postId: post.id });
      if (!answer.ok) setError(answer.error);
      else {
        setAdaptation(answer.adaptation);
        setBreakdown(answer.breakdown);
        setProfileThin(answer.profileThin);
        setChosen(null);
        onChanged(post.id, { analysed: true, adapted: true });
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }, [post.id, onChanged]);

  const saveHook = useCallback(
    async (hook: string) => {
      setSavingHook(hook);
      setError(null);
      try {
        const answer = await saveHookAction({ postId: post.id, hook });
        if (!answer.ok) setError(answer.error);
        else setSavedHooks((s) => (s.includes(hook) ? s : [...s, hook]));
      } catch {
        setError(OFFLINE);
      } finally {
        setSavingHook(null);
      }
    },
    [post.id],
  );

  const writeScript = useCallback(async () => {
    if (!picked) return;
    setWriting(true);
    setStartedAt(Date.now());
    setError(null);
    try {
      const answer = await writeScriptAction({ postId: post.id, hook: picked.text });
      if (!answer.ok) setError(answer.error);
      else setScriptCard({ id: answer.cardId, title: answer.title, problems: answer.problems });
    } catch {
      setError(OFFLINE);
    } finally {
      setWriting(false);
    }
  }, [post.id, picked]);

  const multiple = multipleText(post.multiple);
  const unit = post.metric === "engagement" ? "engagement" : "views";
  const headline = compactNumber(post.metric === "engagement" ? post.score : (post.views ?? post.score));
  const quote = breakdown ? hookQuote(breakdown) : null;
  const note = sourceNote(breakdown?.source ?? null);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-[#A8B0BD] transition-colors hover:text-[#F5F5F7]"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Back to standout videos
      </button>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <Card className="overflow-hidden lg:sticky lg:top-4">
          <Thumb src={post.thumb_url} alt="" className="aspect-[4/5] w-full" />
          <div className="space-y-3 p-4">
            <div>
              <div className="text-[13px] font-medium text-[#F5F5F7]">{post.creator?.name ?? "A creator"}</div>
              <div className="font-mono text-[11px] text-[#7C8595]">
                {post.creator?.handle ? `@${post.creator.handle}` : ""} {PLATFORM_LABEL[post.platform]} {KIND_LABEL[post.kind]}
              </div>
            </div>
            <div>
              <div className="text-[30px] font-semibold leading-none text-[#F5F5F7]" style={{ fontFamily: "var(--font-settoku-display), Georgia, serif" }}>
                {headline ?? "-"}
              </div>
              <div className="mt-1 font-mono text-[11px] text-[#7C8595]">{unit}</div>
            </div>
            {multiple && post.baseline !== null ? (
              <p className="text-[13px] text-[#7BE0A5]">
                {multiple}x their normal of {compactNumber(post.baseline)}
              </p>
            ) : (
              <p className="text-[13px] text-[#7C8595]">No normal worked out for this creator yet.</p>
            )}
            <dl className="space-y-1 text-xs text-[#7C8595]">
              {post.posted_at && (
                <div className="flex justify-between gap-2">
                  <dt>Posted</dt>
                  <dd className="text-[#A8B0BD]">
                    {dateText(post.posted_at)} ({ageText(post.posted_at, nowMs)})
                  </dd>
                </div>
              )}
              {initialDetail.durationS !== null && (
                <div className="flex justify-between gap-2">
                  <dt>Length</dt>
                  <dd className="font-mono text-[#A8B0BD]">{durationText(initialDetail.durationS)}</dd>
                </div>
              )}
              {initialDetail.likes !== null && (
                <div className="flex justify-between gap-2">
                  <dt>Likes</dt>
                  <dd className="font-mono text-[#A8B0BD]">{compactNumber(initialDetail.likes)}</dd>
                </div>
              )}
              {initialDetail.comments !== null && (
                <div className="flex justify-between gap-2">
                  <dt>Comments</dt>
                  <dd className="font-mono text-[#A8B0BD]">{compactNumber(initialDetail.comments)}</dd>
                </div>
              )}
            </dl>
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-[#0083FF] transition-colors hover:underline"
            >
              Open the original <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>
        </Card>

        <div className="min-w-0 space-y-8">
          {error && <ErrorLine>{error}</ErrorLine>}

          <section className="space-y-4">
            <SectionHead n="01" title="Why it worked" />
            {!breakdown ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-[#A8B0BD]">{BREAKDOWN_NOTE}</p>
                {busy === "breakdown" ? (
                  <Progress text="Watching the video and writing the breakdown" startedAt={startedAt} />
                ) : (
                  <PrimaryButton onClick={runBreakdown} icon={Sparkles} disabled={busy !== null}>
                    Break it down
                  </PrimaryButton>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <Eyebrow>Understand the choices behind it</Eyebrow>
                {quote && <Quote>{quote}</Quote>}
                {note && <p className="text-xs text-[#7C8595]">{note}</p>}
                <TwoColumns
                  items={[
                    { title: "Why it holds attention", body: breakdown.why_it_holds_attention ?? "Not written down for this one." },
                    { title: "The pattern you can use", body: breakdown.pattern_you_can_use ?? "Not written down for this one." },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  {breakdown.hook_type && <Chip>{breakdown.hook_type}</Chip>}
                  {breakdown.format && <Chip>{breakdown.format}</Chip>}
                  {breakdown.hook_template && <Chip>Template: {breakdown.hook_template}</Chip>}
                </div>
                <Card>
                  {breakdown.beats.length > 0 && (
                    <Disclosure title="How it is put together" meta={`${breakdown.beats.length} beats`}>
                      <ol className="space-y-1.5">
                        {breakdown.beats.map((b) => (
                          <li key={b} className="font-mono text-[12px] leading-relaxed text-[#A8B0BD]">
                            {b}
                          </li>
                        ))}
                      </ol>
                    </Disclosure>
                  )}
                  {breakdown.creative_choices.length > 0 && (
                    <Disclosure title="The choices it makes" meta={`${breakdown.creative_choices.length}`}>
                      <ul className="list-disc space-y-1.5 pl-4">
                        {breakdown.creative_choices.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </Disclosure>
                  )}
                  {breakdown.angle && <Disclosure title="The angle it is built on">{breakdown.angle}</Disclosure>}
                  {breakdown.ask && <Disclosure title="What it asks the viewer to do">{breakdown.ask}</Disclosure>}
                  {initialDetail.transcript && (
                    <Disclosure title="What is said" meta="transcript">
                      <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed">{initialDetail.transcript}</p>
                    </Disclosure>
                  )}
                  {initialDetail.caption && (
                    <Disclosure title={post.platform === "youtube" ? "Title and description" : "The caption"}>
                      <p className="whitespace-pre-wrap">{initialDetail.caption}</p>
                    </Disclosure>
                  )}
                </Card>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHead n="02" title="Make it yours" />
            {!adaptation ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-[#A8B0BD]">{ADAPT_NOTE}</p>
                {busy === "adapt" ? (
                  <Progress text="Writing hooks in your client's voice" startedAt={startedAt} />
                ) : (
                  <PrimaryButton onClick={runAdapt} icon={Wand2} disabled={busy !== null}>
                    Make it yours
                  </PrimaryButton>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Eyebrow>A starting point for your client&apos;s next video</Eyebrow>
                  {picked && (
                    <QuietButton
                      onClick={() => saveHook(picked.text)}
                      busy={savingHook === picked.text}
                      disabled={savedHooks.includes(picked.text)}
                      icon={savedHooks.includes(picked.text) ? Check : undefined}
                    >
                      {savedHooks.includes(picked.text) ? "Saved to the Board" : "Save hook"}
                    </QuietButton>
                  )}
                </div>
                {picked && <Quote>{picked.text}</Quote>}
                {picked?.why && <p className="text-[13px] text-[#7C8595]">{picked.why}</p>}
                {profileThin && (
                  <p className="rounded-lg border border-[rgba(248,175,0,0.22)] bg-[rgba(248,175,0,0.05)] p-3 text-[13px] leading-relaxed text-[#A8B0BD]">
                    {adaptation.make_it_sound_like_you}
                  </p>
                )}
                <TwoColumns
                  items={[
                    {
                      title: "How to shoot it",
                      body: (
                        <div className="space-y-2">
                          <p>{adaptation.how_to_shoot_it ?? "Not written down for this one."}</p>
                          {adaptation.shot_list.length > 0 && (
                            <ul className="list-disc space-y-1 pl-4 text-[13px]">
                              {adaptation.shot_list.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: profileThin ? "What to ask your client for" : "Make it sound like them",
                      body: profileThin ? adaptation.make_it_sound_like_you : (adaptation.make_it_sound_like_you ?? "Not written down for this one."),
                    },
                  ]}
                />
                {adaptation.on_screen_text && (
                  <p className="text-[13px] text-[#A8B0BD]">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#5C6472]">On screen </span>
                    {adaptation.on_screen_text}
                  </p>
                )}

                {others.length > 0 && (
                  <Card>
                    {others.map((h) => (
                      <div key={h.text} className="flex flex-wrap items-center gap-3 border-b border-[rgba(255,255,255,0.06)] p-3 last:border-0">
                        <span className="min-w-0 flex-1 text-[13px] text-[#A8B0BD]">{h.text}</span>
                        <QuietButton onClick={() => setChosen(h.i)}>Use this</QuietButton>
                        <QuietButton
                          onClick={() => saveHook(h.text)}
                          busy={savingHook === h.text}
                          disabled={savedHooks.includes(h.text)}
                          icon={savedHooks.includes(h.text) ? Check : undefined}
                        >
                          {savedHooks.includes(h.text) ? "Saved" : "Save"}
                        </QuietButton>
                      </div>
                    ))}
                  </Card>
                )}

                <div className="space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-5">
                  {scriptCard ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 text-sm text-[#7BE0A5]">
                        <Check className="size-4" aria-hidden /> Script written and filed in Scripted.
                      </p>
                      <p className="text-[13px] text-[#A8B0BD]">{scriptCard.title}</p>
                      {scriptCard.problems.length > 0 && (
                        <div className="rounded-lg border border-[rgba(248,175,0,0.22)] bg-[rgba(248,175,0,0.05)] p-3">
                          <p className="text-[13px] font-medium text-[#F5F5F7]">Fix these before it is filmed</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-[#A8B0BD]">
                            {scriptCard.problems.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <a
                          href="?tab=board"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.12)] px-3.5 text-[13px] font-medium text-[#F5F5F7] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                        >
                          <LayoutGrid className="size-3.5" aria-hidden /> Open on the Board
                        </a>
                        <a
                          href="?tab=record"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.12)] px-3.5 text-[13px] font-medium text-[#F5F5F7] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                        >
                          <Film className="size-3.5" aria-hidden /> Film it in Record
                        </a>
                      </div>
                    </div>
                  ) : writing ? (
                    <Progress text="Writing the full script" startedAt={startedAt} />
                  ) : (
                    <PrimaryButton onClick={writeScript} icon={FileText} disabled={!picked}>
                      Write the full script
                    </PrimaryButton>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-xs text-[#A8B0BD]">
      {children}
    </span>
  );
}
