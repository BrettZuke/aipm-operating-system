import { Lightbulb, Star, Sparkle, Target, MessageSquare, AlertCircle } from "lucide-react";
import { getCloser, getOnboarding, salesSheetIdFor } from "@/lib/sheets-data";
import { Section } from "../../dashboard/tabs";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 60;

function topResponses(rows: any[], field: string, limit = 6): { text: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const text = (r[field] || '').trim();
    if (!text) continue;
    if (['n/a','na','-','–','none','no','nothing'].includes(text.toLowerCase())) continue;
    const key = text.length > 100 ? text.slice(0, 100) + '…' : text;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}

export default async function SalesInsightsPage() {
  const { agencyId } = await getAuthContext();
  const sheetId = salesSheetIdFor(agencyId);
  const [closer, onboarding] = await Promise.all([getCloser(sheetId), getOnboarding(sheetId)]);
  const validClose = closer.filter((c: any) => c['Lead Email']);
  const validOnboard = onboarding.filter((o: any) => o['Email'] || o['Name']);

  // First touch points
  const touchPoints = new Map<string, number>();
  for (const o of validOnboard) {
    const tp = (o['First Touch Point'] || '').trim();
    if (!tp) continue;
    touchPoints.set(tp, (touchPoints.get(tp) || 0) + 1);
  }

  // Confidence
  const confidence = validOnboard.map((o: any) => parseInt(o['Pre-Call Confidence (1-10)']) || 0).filter(n => n > 0);
  const avgConfidence = confidence.length ? confidence.reduce((s, n) => s + n, 0) / confidence.length : 0;

  const fearsList = topResponses(validOnboard, 'Fears');
  const hesitationsList = topResponses(validOnboard, 'Hesitations');
  const contentList = topResponses(validOnboard, 'Specific Content');
  const decisionList = topResponses(validOnboard, 'Final Decision');

  const gapsList = topResponses(validClose, 'Gap Identified');
  const objectionsList = topResponses(validClose, 'Biggest Objections');
  const strugglesList = topResponses(validClose, 'Struggles');
  const marketingList = topResponses(validClose, 'Improvement Changes');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SALES · INSIGHTS</div>
          <h1 className="mt-1 text-3xl font-bold flex items-center gap-2 text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>
            <Lightbulb size={26} style={{color:'#F8AF00'}}/>Sales &amp; Onboarding Insights
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {validClose.length} sales calls · {validOnboard.length} onboarding responses · qualitative patterns aggregated.
          </p>
        </div>
      </div>

      <Section num="01" title="Onboarding Insights" sub="What customers said about their journey to becoming students.">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="flex items-center gap-2 mb-3"><Star className="size-4 text-[#F8AF00]"/><span className="text-sm font-semibold text-[#F5F5F7]">First Touch Points</span></div>
            {touchPoints.size === 0 ? <p className="text-sm text-[#6B7280]">No data yet.</p> : (
              <div className="space-y-2">
                {Array.from(touchPoints.entries()).sort((a,b) => b[1] - a[1]).map(([tp, count]) => {
                  const max = Math.max(...Array.from(touchPoints.values()));
                  return (
                    <div key={tp}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[#9CA3AF]">{tp}</span>
                        <span className="tabular-nums text-[#F5F5F7] font-medium">{count}</span>
                      </div>
                      <div className="h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(count/max)*100}%`, background: 'linear-gradient(90deg, #0083FF, #B57EFF)' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="flex items-center gap-2 mb-3"><Sparkle className="size-4 text-[#0083FF]"/><span className="text-sm font-semibold text-[#F5F5F7]">Pre-Call Confidence</span></div>
            {confidence.length === 0 ? <p className="text-sm text-[#6B7280]">No data yet.</p> : (
              <>
                <div className="text-3xl font-bold tabular-nums" style={{ color: avgConfidence >= 7 ? '#00D393' : avgConfidence >= 5 ? '#F8AF00' : '#FF6466' }}>{avgConfidence.toFixed(1)} <span className="text-sm text-[#6B7280] font-normal">/ 10</span></div>
                <p className="text-xs text-[#6B7280] mt-1">Avg conviction before sales call (n={confidence.length})</p>
                <div className="mt-4 grid grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(score => {
                    const matches = confidence.filter(c => c === score).length;
                    const max = Math.max(1, ...Array.from({ length: 10 }, (_, i) => confidence.filter(c => c === i + 1).length));
                    return (
                      <div key={score} className="text-center">
                        <div className="h-12 flex items-end">
                          <div className="w-full rounded-t" style={{ height: `${matches ? Math.max(8, (matches / max) * 100) : 0}%`, background: score >= 7 ? '#00D393' : score >= 5 ? '#F8AF00' : '#FF6466' }}/>
                        </div>
                        <div className="text-[10px] text-[#6B7280] mt-1">{score}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="flex items-center gap-2 mb-3"><Target className="size-4 text-[#00D393]"/><span className="text-sm font-semibold text-[#F5F5F7]">What pushed them over</span></div>
            {decisionList.length === 0 ? <p className="text-sm text-[#6B7280]">No data yet.</p> : (
              <ul className="space-y-2 text-xs">
                {decisionList.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums flex-shrink-0" style={{background:'rgba(0,211,147,0.15)', color:'#00D393'}}>{d.count}×</span>
                    <span className="text-[#9CA3AF]">{d.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section num="02" title="Sales Call Insights" sub={`What closers are seeing across ${validClose.length} PCFs.`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <InsightPanel icon={AlertCircle} iconColor="#FF6466" title="Top Gaps Identified" data={gapsList} pillBg="rgba(255,100,102,0.15)" pillText="#FF6466"/>
          <InsightPanel icon={MessageSquare} iconColor="#F8AF00" title="Top Objections" data={objectionsList} pillBg="rgba(248,175,0,0.15)" pillText="#F8AF00"/>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <InsightPanel icon={MessageSquare} iconColor="#F8AF00" title="Closer Struggles (couldn't overcome)" data={strugglesList} pillBg="rgba(248,175,0,0.15)" pillText="#F8AF00"/>
          <InsightPanel icon={MessageSquare} iconColor="#00A4FF" title="Marketing Improvement Requests" data={marketingList} pillBg="rgba(0,164,255,0.15)" pillText="#00A4FF"/>
        </div>
      </Section>

      <Section num="03" title="Customer Voice" sub="Direct from the onboarding form — fears, hesitations, content that converted.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <InsightPanel icon={AlertCircle} iconColor="#FF6466" title="Customer Fears" data={fearsList} pillBg="rgba(255,100,102,0.15)" pillText="#FF6466"/>
          <InsightPanel icon={MessageSquare} iconColor="#F8AF00" title="Customer Hesitations" data={hesitationsList} pillBg="rgba(248,175,0,0.15)" pillText="#F8AF00"/>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 mb-3"><Target className="size-4 text-[#00D393]"/><span className="text-sm font-semibold text-[#F5F5F7]">Specific Content That Pushed Them To Buy</span></div>
          {contentList.length === 0 ? <p className="text-sm text-[#6B7280]">No data yet — populates as students fill the onboarding form.</p> : (
            <ul className="space-y-2 text-xs">
              {contentList.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums flex-shrink-0" style={{background:'rgba(0,211,147,0.15)', color:'#00D393'}}>{c.count}×</span>
                  <span className="text-[#9CA3AF]">{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

function InsightPanel({ icon: Icon, iconColor, title, data, pillBg, pillText }: { icon: any; iconColor: string; title: string; data: { text: string; count: number }[]; pillBg: string; pillText: string }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
      <div className="flex items-center gap-2 mb-3"><Icon className="size-4" style={{color: iconColor}}/><span className="text-sm font-semibold text-[#F5F5F7]">{title}</span></div>
      {data.length === 0 ? <p className="text-sm text-[#6B7280]">No data yet.</p> : (
        <ul className="space-y-2 text-xs">
          {data.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums flex-shrink-0" style={{background: pillBg, color: pillText}}>{d.count}×</span>
              <span className="text-[#9CA3AF]">{d.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
