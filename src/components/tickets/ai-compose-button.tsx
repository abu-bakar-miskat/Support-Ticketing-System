"use client";

import { useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Mode = "title" | "description";

type ComposeResult = { title: string; description: string };

// The description model is told to emit bare HTML, but strip stray code fences
// defensively so a ```html wrapper never lands in the editor.
function cleanHtml(s: string): string {
  return s
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function AiComposeButton({
  mode,
  getTitle,
  getDescription,
  onApply,
  label = "AI",
  iconOnly = false,
  title,
  className,
}: {
  mode: Mode;
  getTitle: () => string;
  getDescription: () => string;
  onApply: (result: ComposeResult) => void;
  label?: string;
  iconOnly?: boolean;
  title?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const tooltip =
    title ??
    (mode === "title"
      ? "Generate a better title with AI"
      : "Generate/structure the description with AI");

  async function run() {
    const currentTitle = getTitle();
    const currentDescription = getDescription();
    setLoading(true);
    try {
      const res = await fetch("/api/tickets/assist-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, title: currentTitle, description: currentDescription }),
      });

      // Title comes back as JSON; description streams as HTML text.
      if (mode === "title") {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data?.error ?? "AI compose failed.");
          return;
        }
        onApply({ title: data.title ?? currentTitle, description: currentDescription });
        toast.success("Title updated — review before saving");
        return;
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "AI compose failed.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        onApply({ title: currentTitle, description: cleanHtml(acc) });
      }
      onApply({ title: currentTitle, description: cleanHtml(acc) });
      toast.success("Description generated — review before saving");
    } catch {
      toast.error("AI compose failed.");
    } finally {
      setLoading(false);
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={loading}
        title={tooltip}
        aria-label={tooltip}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md text-pen-blue transition-colors hover:bg-pen-blue-tint disabled:opacity-50",
          className,
        )}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={loading}
      title={tooltip}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md border border-pen-blue/40 bg-pen-blue-tint px-2.5 font-sans text-[12px] font-medium text-pen-blue transition-colors hover:bg-pen-blue/15 disabled:opacity-50",
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
      {label}
    </button>
  );
}
