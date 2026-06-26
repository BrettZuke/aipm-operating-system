"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveNotificationPreferences } from "./actions";

type Pref = { key: string; label: string; desc: string };

export function NotificationForm({ initial, prefs }: { initial: Record<string, boolean>; prefs: Pref[] }) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setState(s => ({ ...s, [key]: !s[key] }));
    setSaved(false);
  }

  function handleSubmit(formData: FormData) {
    // Hydrate FormData from local state (checkboxes that aren't checked don't post)
    for (const p of prefs) {
      if (state[p.key]) formData.set(p.key, "on");
      else formData.delete(p.key);
    }
    startTransition(async () => {
      setError(null);
      const r = await saveNotificationPreferences(null, formData);
      if (!r.ok) setError(r.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {prefs.map(p => {
        const isOn = !!state[p.key];
        return (
          <div key={p.key} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[#F5F5F7]">{p.label}</div>
              <div className="text-xs text-[#6B7280]">{p.desc}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isOn}
              onClick={() => toggle(p.key)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                isOn ? "bg-blue-500" : "bg-[rgba(255,255,255,0.08)]"
              }`}
            >
              <span className={`inline-block size-4 rounded-full shadow transition-transform ${
                isOn ? "translate-x-4 bg-white" : "translate-x-0 bg-[rgba(255,255,255,0.5)]"
              }`} />
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-3 pt-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="size-3" />Saved</span>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
