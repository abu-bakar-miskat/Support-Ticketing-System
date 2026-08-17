"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Collapsible card shell for the right rail — click the header to fold a
// section out of the way.
export function RailCard({ id, icon: Icon, accent, title, aside, defaultOpen = true, children }: {
  id?: string;
  icon: React.ElementType;
  accent: string;
  title: string;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className="shrink-0 overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card shadow-pen-card"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full shrink-0 items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-pen-surface/50",
          open && "border-b border-pen-card-border",
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}18` }}>
          <Icon className="size-3.5" style={{ color: accent }} />
        </span>
        <span className="pen-text-card-title">{title}</span>
        <span className="ml-auto flex items-center gap-2.5">
          {aside}
          <ChevronDown className={cn("size-3.5 text-pen-subtle transition-transform", !open && "-rotate-90")} />
        </span>
      </button>
      {open && children}
    </section>
  );
}
