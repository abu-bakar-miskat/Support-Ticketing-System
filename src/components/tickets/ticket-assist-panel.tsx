"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  ListChecks,
  MessageSquareText,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Action = "summarize" | "draft_reply" | "triage";

type SummarizeResult = { summary: string; openQuestions: string[]; nextStep: string };
type DraftReplyResult = { reply: string };
type TriageResult = { type: string; priority: string; labels: string[]; reasoning: string };

type ResultState =
  | { action: "summarize"; data: SummarizeResult }
  | { action: "draft_reply"; data: DraftReplyResult }
  | { action: "triage"; data: TriageResult }
  | null;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 rounded-md border border-pen-card-border px-2 py-1 font-sans text-[11px] text-pen-muted transition-colors hover:border-pen-id hover:text-pen-foreground"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function TicketAssistPanel({ dbId, isIntake }: { dbId: string; isIntake: boolean }) {
  const [loading, setLoading] = useState<Action | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setLoading(action);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/tickets/${dbId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Assist failed. Please try again.");
        return;
      }
      setResult({ action, data } as ResultState);
    } catch {
      setError("Assist failed. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  const actions: { id: Action; label: string; icon: typeof Sparkles; show: boolean }[] = [
    { id: "summarize", label: "Summarize", icon: ListChecks, show: true },
    { id: "draft_reply", label: "Draft reply", icon: MessageSquareText, show: isIntake },
    { id: "triage", label: "Suggest triage", icon: Tags, show: true },
  ];

  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-pen-blue" />
        <span className="font-sans text-[12px] font-semibold text-pen-foreground">AI assist</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {actions
          .filter((a) => a.show)
          .map((a) => {
            const Icon = a.icon;
            const isLoading = loading === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={loading !== null}
                onClick={() => run(a.id)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg border border-pen-card-border bg-transparent px-3 font-sans text-[12px] text-pen-muted transition-colors hover:border-pen-id hover:text-pen-foreground disabled:opacity-50",
                  isLoading && "border-pen-id text-pen-foreground",
                )}
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                {a.label}
              </button>
            );
          })}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-pen-surface px-3 py-2 font-sans text-[12px] text-pen-muted">
          {error}
        </p>
      )}

      {result?.action === "summarize" && (
        <div className="mt-3 space-y-2.5 rounded-lg bg-pen-surface p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-sans text-[12.5px] leading-relaxed text-pen-foreground">{result.data.summary}</p>
            <CopyButton text={result.data.summary} />
          </div>
          {result.data.openQuestions?.length > 0 && (
            <div>
              <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                Open questions
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {result.data.openQuestions.map((q, i) => (
                  <li key={i} className="font-sans text-[12px] text-pen-muted">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.data.nextStep && (
            <p className="font-sans text-[12px] text-pen-muted">
              <span className="font-semibold text-pen-foreground">Next step: </span>
              {result.data.nextStep}
            </p>
          )}
        </div>
      )}

      {result?.action === "draft_reply" && (
        <div className="mt-3 space-y-2 rounded-lg bg-pen-surface p-3">
          <div className="flex items-center justify-between">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
              Suggested reply — review before sending
            </p>
            <CopyButton text={result.data.reply} />
          </div>
          <p className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-pen-foreground">
            {result.data.reply}
          </p>
        </div>
      )}

      {result?.action === "triage" && (
        <div className="mt-3 space-y-2 rounded-lg bg-pen-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-pen-blue-tint px-2 py-0.5 font-sans text-[11.5px] font-semibold text-pen-id">
              Type: {result.data.type}
            </span>
            <span className="rounded-md bg-pen-blue-tint px-2 py-0.5 font-sans text-[11.5px] font-semibold text-pen-id">
              Priority: {result.data.priority}
            </span>
            {result.data.labels?.map((l) => (
              <span
                key={l}
                className="rounded-md bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] text-pen-muted ring-1 ring-pen-card-border"
              >
                {l}
              </span>
            ))}
          </div>
          <p className="font-sans text-[12px] text-pen-muted">{result.data.reasoning}</p>
          <p className="font-sans text-[11px] text-pen-subtle">Suggestions only — apply manually if they fit.</p>
        </div>
      )}
    </div>
  );
}
