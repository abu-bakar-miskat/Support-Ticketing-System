"use client";

import { create } from "zustand";

export type PageCrumb = { label: string; href: string };

type BreadcrumbState = {
  /** Active full-page ticket id (db cuid), or null when not on a ticket page. */
  ticketDbId: string | null;
  /** Human ticket id shown in the top-bar breadcrumb (e.g. WEB-192). */
  ticketHumanId: string | null;
  /** Page-specific override registered by BreadcrumbRegistrar. */
  pageCrumbs: { pathname: string; crumbs: PageCrumb[] } | null;
  setTicketBreadcrumb: (dbId: string, humanId: string) => void;
  clearTicketBreadcrumb: (dbId?: string) => void;
  setPageCrumbs: (pathname: string, crumbs: PageCrumb[]) => void;
  clearPageCrumbs: (pathname?: string) => void;
};

export const useBreadcrumbStore = create<BreadcrumbState>((set, get) => ({
  ticketDbId: null,
  ticketHumanId: null,
  pageCrumbs: null,

  setTicketBreadcrumb: (dbId, humanId) =>
    set({ ticketDbId: dbId, ticketHumanId: humanId }),

  clearTicketBreadcrumb: (dbId) => {
    if (dbId && get().ticketDbId !== dbId) return;
    set({ ticketDbId: null, ticketHumanId: null });
  },

  setPageCrumbs: (pathname, crumbs) =>
    set({ pageCrumbs: { pathname, crumbs } }),

  clearPageCrumbs: (pathname) => {
    const current = get().pageCrumbs;
    if (!current) return;
    if (pathname && current.pathname !== pathname) return;
    set({ pageCrumbs: null });
  },
}));
