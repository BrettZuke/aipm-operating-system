import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-8">
      <SettingsNav />
      <div className="max-w-3xl">{children}</div>
    </div>
  );
}
