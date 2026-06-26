export function SettingsHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>{title}</h1>
      {sub && <p className="mt-1 text-sm text-[#9CA3AF]">{sub}</p>}
    </header>
  );
}

export function SettingsCard({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-6">
      {title && <h2 className="text-base font-semibold text-[#F5F5F7] mb-1">{title}</h2>}
      {sub && <p className="mb-4 text-sm text-[#9CA3AF]">{sub}</p>}
      {children}
    </div>
  );
}
