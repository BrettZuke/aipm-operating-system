"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    group: "ACCOUNT",
    items: [
      { href: "/settings",               label: "Profile" },
      { href: "/settings/notifications", label: "Notifications" },
      { href: "/settings/security",      label: "Security" },
    ],
  },
  {
    group: "WORKSPACE",
    items: [
      { href: "/settings/organization", label: "Organization" },
      { href: "/settings/team",         label: "Team" },
      { href: "/settings/roles",        label: "Roles & permissions" },
      { href: "/settings/ai-access",    label: "AI access" },
      { href: "/settings/integrations", label: "Integrations" },
      { href: "/settings/plan",         label: "Plan & usage" },
      { href: "/settings/billing",      label: "Billing" },
    ],
  },
  {
    group: "ENTERPRISE",
    items: [
      { href: "/settings/enterprise", label: "Enterprise" },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <aside className="space-y-5 sticky top-0 self-start">
      {SECTIONS.map(section => (
        <div key={section.group}>
          <div className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-[#6B7280]">{section.group}</div>
          <div className="space-y-0.5">
            {section.items.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-1.5 text-sm transition-colors duration-100 ${
                    isActive
                      ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7] shadow-[inset_2px_0_0_#0083FF]"
                      : "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
