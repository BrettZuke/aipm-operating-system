import Link from "next/link";
import { PhoneCall, Play, ExternalLink } from "lucide-react";
import { getCloser, num, salesSheetIdFor } from "@/lib/sheets-data";
import { formatCurrency } from "@/lib/utils";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const CLOSED = ['PIF', 'Financed via Fanbasis', 'Financed In House', 'Put Deposit'];

const OUTCOME_COLORS: Record<string, string> = {
  'PIF': '#00D393',
  'Financed via Fanbasis': '#0083FF',
  'Financed In House': '#00A4FF',
  'Put Deposit': '#F8AF00',
  'Booked Follow Up': '#B57EFF',
  'No Close': '#9CA3AF',
  "Financially DQ'd": '#FF6466',
  'No Show': '#4B5563',
};

export default async function CallsPage() {
  const { agencyId } = await getAuthContext();
  const closer = await getCloser(salesSheetIdFor(agencyId));
  // Parse DD/MM/YYYY to a real timestamp for sorting — the old string-key sort broke on
  // unpadded dates (e.g. "10/6" sorted before "9/6").
  const dateTs = (d: string) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((d || '').trim());
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
  };
  const calls = closer
    .filter((c: any) => c['Lead Email'])
    .sort((a, b) => dateTs(b['Date']) - dateTs(a['Date']));

  const closedCount = calls.filter(c => CLOSED.includes(c['Call Result'])).length;
  const withRecording = calls.filter(c => c['Call Recording Link']).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SALES · CALLS</div>
          <h1 className="mt-1 text-3xl font-bold flex items-center gap-2 text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>
            <PhoneCall size={26} style={{color:'#0083FF'}}/>Sales Calls
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {calls.length} calls logged · {closedCount} closed · {withRecording} with recording
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {calls.length === 0 ? (
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-8 text-center text-[#6B7280]">
            No sales calls logged yet.
          </div>
        ) : calls.map((c: any, i: number) => {
          const outcome = c['Call Result'];
          const oc = OUTCOME_COLORS[outcome] || '#6B7280';
          return (
            <div key={i} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-[#F5F5F7]">{c['Lead Name']}</span>
                    <span className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: `${oc}20`, color: oc }}>{outcome}</span>
                    <span className="text-xs text-[#6B7280]">· {c['Date']}</span>
                    <span className="text-xs text-[#6B7280]">· {c['Closer Name']}</span>
                    {c['Setter'] && c['Setter'] !== 'No Setter' && c['Setter'] !== 'Unsure of Setter' && <span className="text-xs text-[#6B7280]">· set by {c['Setter']}</span>}
                    {c['Region'] && <span className="rounded px-1.5 py-0.5 text-[9px] uppercase font-semibold" style={{ background: c['Region'] === 'UK' ? 'rgba(0,131,255,0.15)' : c['Region'] === 'EU' ? 'rgba(181,126,255,0.15)' : 'rgba(255,255,255,0.06)', color: c['Region'] === 'UK' ? '#0083FF' : c['Region'] === 'EU' ? '#B57EFF' : '#9CA3AF' }}>{c['Region']}</span>}
                  </div>
                  {c['Call Recording Link'] && (
                    <a href={c['Call Recording Link']} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#0083FF] hover:underline mt-1">
                      <Play size={12}/> Watch recording <ExternalLink size={10}/>
                    </a>
                  )}
                  {(c['Gap Identified'] || c['Biggest Objections'] || c['Struggles'] || c['Improvement Changes']) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                      {c['Gap Identified'] && c['Gap Identified'].toUpperCase() !== 'N/A' && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold mb-1">Gap Identified</div>
                          <div className="text-[#9CA3AF]">{c['Gap Identified']}</div>
                        </div>
                      )}
                      {c['Biggest Objections'] && c['Biggest Objections'].toUpperCase() !== 'N/A' && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold mb-1">Biggest Objections</div>
                          <div className="text-[#9CA3AF]">{c['Biggest Objections']}</div>
                        </div>
                      )}
                      {c['Struggles'] && c['Struggles'].toUpperCase() !== 'N/A' && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold mb-1">Struggles</div>
                          <div className="text-[#9CA3AF]">{c['Struggles']}</div>
                        </div>
                      )}
                      {c['Improvement Changes'] && c['Improvement Changes'].toUpperCase() !== 'N/A' && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold mb-1">Could Have Improved</div>
                          <div className="text-[#9CA3AF]">{c['Improvement Changes']}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {(num(c['Cash Collected ($)']) > 0 || num(c['Contract Value ($)']) > 0) && (
                  <div className="text-right text-sm flex-shrink-0">
                    {num(c['Cash Collected ($)']) > 0 && (
                      <>
                        <div className="font-semibold text-[#F5F5F7] tabular-nums">{formatCurrency(num(c['Cash Collected ($)']))}</div>
                        <div className="text-xs text-[#6B7280]">cash collected</div>
                      </>
                    )}
                    {num(c['Contract Value ($)']) > 0 && (
                      <div className="text-xs text-[#9CA3AF] mt-1 tabular-nums">{formatCurrency(num(c['Contract Value ($)']))} contract</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
