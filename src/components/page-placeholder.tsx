import { Construction } from "lucide-react";

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#F5F5F7]">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[#9CA3AF]">{description}</p>
        )}
      </header>
      <div className="flex h-96 flex-col items-center justify-center rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 text-center">
        <Construction className="size-8 text-[#6B7280]" />
        <p className="mt-4 text-sm font-medium text-[#9CA3AF]">
          {title} — coming soon
        </p>
        <p className="mt-1 max-w-sm text-xs text-[#6B7280]">
          This route is reserved. Wire up the queries to your Supabase tables
          to bring it to life.
        </p>
      </div>
    </div>
  );
}
