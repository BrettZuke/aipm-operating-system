"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Uses the `settoku-agency-store` localStorage key pattern.
 * Holds the currently-selected agency (workspace) and UI prefs.
 */
type AgencyState = {
  currentAgencyId: string | null;
  setCurrentAgency: (id: string | null) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  openSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
};

export const useAgencyStore = create<AgencyState>()(
  persist(
    (set) => ({
      currentAgencyId: null,
      setCurrentAgency: (id) => set({ currentAgencyId: id }),
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openSections: {
        setup: true,
        revenue: true,
        operations: true,
        intelligence: true,
      },
      toggleSection: (key) =>
        set((s) => ({
          openSections: { ...s.openSections, [key]: !s.openSections[key] },
        })),
    }),
    {
      name: "settoku-agency-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
