export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Page header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-[rgba(255,255,255,0.06)]" />
        <div className="h-4 w-72 rounded-md bg-[#0C0C10]" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-4 space-y-3">
            <div className="h-3 w-24 rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-7 w-20 rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-3 w-28 rounded bg-[rgba(255,255,255,0.06)]" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2.5 border-b border-[rgba(255,255,255,0.08)]/50">
            <div className="h-4 w-32 rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-16 rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 flex-1 rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-20 rounded bg-[rgba(255,255,255,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
