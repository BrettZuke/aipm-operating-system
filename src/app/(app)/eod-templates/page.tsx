import { Eye, Calendar, Mail, Hash, ToggleLeft, DollarSign, Link2, FileText, GripVertical } from "lucide-react";
import { StatCard } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

type FieldType = "Date" | "Email" | "Text" | "Number" | "YesNo" | "Dropdown" | "Currency" | "URL";

const TYPE_ICON: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  Date: Calendar, Email: Mail, Text: FileText, Number: Hash, YesNo: ToggleLeft, Dropdown: ToggleLeft, Currency: DollarSign, URL: Link2,
};

const FIELDS_BY_ROLE = {
  closer: [
    { label: "Call Date",          type: "Date" as FieldType,    required: true,  enabled: true },
    { label: "Lead Email",         type: "Email" as FieldType,   required: true,  enabled: true },
    { label: "Closer Name",        type: "Text" as FieldType,    required: true,  enabled: true },
    { label: "Scheduled Call #",   type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Call Outcome",       type: "Dropdown" as FieldType, required: true,  enabled: true },
    { label: "Live Call",          type: "YesNo" as FieldType,   required: false, enabled: true },
    { label: "DQ (Disqualified)",  type: "YesNo" as FieldType,   required: false, enabled: true },
    { label: "Ghosted",            type: "YesNo" as FieldType,   required: false, enabled: true },
    { label: "Made Offer",         type: "YesNo" as FieldType,   required: false, enabled: true },
    { label: "Cash Collected",     type: "Currency" as FieldType, required: false, enabled: true },
    { label: "Total Deal Value",   type: "Currency" as FieldType, required: false, enabled: true },
    { label: "Follow-up Needed",   type: "YesNo" as FieldType,   required: false, enabled: true },
    { label: "Follow-up Date",     type: "Date" as FieldType,    required: false, enabled: true },
    { label: "Recording Link",     type: "URL" as FieldType,     required: false, enabled: true },
  ],
  setter: [
    { label: "Date",               type: "Date" as FieldType,    required: true,  enabled: true },
    { label: "Setter Name",        type: "Text" as FieldType,    required: true,  enabled: true },
    { label: "DMs sent",           type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Replies",            type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Conversations",      type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Bookings",           type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "No-shows",           type: "Number" as FieldType,  required: false, enabled: true },
    { label: "Wins",               type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Blockers",           type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Tomorrow's plan",    type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Mood",               type: "Dropdown" as FieldType, required: false, enabled: true },
    { label: "Hours worked",       type: "Number" as FieldType,  required: false, enabled: true },
    { label: "Notes",              type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Recording",          type: "URL" as FieldType,     required: false, enabled: true },
  ],
  dialer: [
    { label: "Date",               type: "Date" as FieldType,    required: true,  enabled: true },
    { label: "Dials",              type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Connects",           type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Bookings",           type: "Number" as FieldType,  required: true,  enabled: true },
    { label: "Voicemails",         type: "Number" as FieldType,  required: false, enabled: true },
    { label: "Avg call duration",  type: "Number" as FieldType,  required: false, enabled: true },
    { label: "List used",          type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Wins",               type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Blockers",           type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Notes",              type: "Text" as FieldType,    required: false, enabled: true },
    { label: "Recording",          type: "URL" as FieldType,     required: false, enabled: true },
  ],
};

type Role = "closer" | "setter" | "dialer";

export default async function EodTemplatesPage({ searchParams }: { searchParams: Promise<{ role?: Role }> }) {
  const { role = "closer" } = await searchParams;
  const fields = FIELDS_BY_ROLE[role] ?? FIELDS_BY_ROLE.closer;

  const enabledFields = fields.filter(f => f.enabled);
  const requiredFields = fields.filter(f => f.required && f.enabled);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SALES · TEMPLATES</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>EOD Templates</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Configure what each role&apos;s daily check-in form asks. Changes apply to all reps in this role.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">Reset to defaults</button>
          <button className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">Save changes</button>
        </div>
      </div>

      {/* 4-card stat strip */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Active fields" value={String(enabledFields.length)} sub="In current role template" accent />
        <StatCard label="Required" value={String(requiredFields.length)} sub="Must be filled to submit" />
        <StatCard label="Custom fields" value="0" sub="Added on top of defaults" />
        <StatCard label="Last updated" value="Just now" sub="By you" />
      </div>

      {/* Roles + builder + preview */}
      <div className="grid grid-cols-[1fr_320px] gap-3">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60">
          {/* Role sub-tabs */}
          <div className="flex border-b border-[rgba(255,255,255,0.08)]">
            {(Object.keys(FIELDS_BY_ROLE) as Role[]).map(r => {
              const isActive = role === r;
              return (
                <a
                  key={r}
                  href={`?role=${r}`}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors duration-100 ${
                    isActive ? "border-[#0083FF] text-[#F5F5F7] bg-[#0C0C10]/80" : "border-transparent text-[#9CA3AF] hover:text-[#F5F5F7]"
                  }`}
                >
                  {r}
                  <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] tabular-nums text-[#9CA3AF]">{FIELDS_BY_ROLE[r].length}</span>
                </a>
              );
            })}
          </div>

          {/* Fields list */}
          <div className="p-4 space-y-2">
            {fields.map((f, i) => {
              const Icon = TYPE_ICON[f.type];
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3 hover:border-[rgba(255,255,255,0.12)]">
                  <GripVertical className="size-3.5 text-[rgba(245,245,247,0.3)] shrink-0 cursor-grab" />
                  <div className="flex size-7 items-center justify-center rounded-md bg-[rgba(255,255,255,0.06)] shrink-0">
                    <Icon className="size-3.5 text-[#9CA3AF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#F5F5F7]">{f.label}</div>
                    <div className="text-xs text-[#6B7280]">{f.type}</div>
                  </div>
                  <ToggleSwitch on={f.required} label="Required" />
                  <ToggleSwitch on={f.enabled} label="Enabled" />
                </div>
              );
            })}
            <button className="w-full rounded-lg border border-dashed border-[rgba(255,255,255,0.10)] py-3 text-sm text-[#9CA3AF] hover:border-[rgba(255,255,255,0.20)] hover:text-[#F5F5F7]">
              + Add custom field
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 self-start sticky top-4">
          <div className="border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Eye className="size-3.5 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Preview as a {role}</span>
            </div>
          </div>
          <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {enabledFields.map((f, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[rgba(245,245,247,0.8)]">
                  {f.label}
                  {f.required && <span className="text-red-400">*</span>}
                </div>
                <PreviewField type={f.type} />
              </div>
            ))}
            <button className="w-full rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white">Submit EOD</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">{label}</span>
      <button className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors ${on ? "bg-[rgba(0,131,255,0.5)]" : "bg-[rgba(255,255,255,0.08)]"}`}>
        <span className={`inline-block size-3 rounded-full bg-white shadow transition-transform ${on ? "translate-x-3" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function PreviewField({ type }: { type: FieldType }) {
  const baseClass = "h-8 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#09090C] px-2.5 text-xs text-[#F5F5F7]";
  if (type === "YesNo") {
    return (
      <div className="flex gap-1.5">
        <button className="flex-1 rounded-md border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] py-1 text-xs text-[#9CA3AF]">Yes</button>
        <button className="flex-1 rounded-md border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] py-1 text-xs text-[#9CA3AF]">No</button>
      </div>
    );
  }
  if (type === "Dropdown") {
    return <select className={baseClass}><option>Select…</option></select>;
  }
  if (type === "Date") return <input type="date" className={baseClass} />;
  if (type === "Email") return <input type="email" className={baseClass} placeholder="lead@example.com" />;
  if (type === "Number") return <input type="number" className={baseClass} placeholder="0" />;
  if (type === "Currency") return <input className={baseClass} placeholder="$0.00" />;
  if (type === "URL") return <input type="url" className={baseClass} placeholder="https://" />;
  return <input type="text" className={baseClass} />;
}
