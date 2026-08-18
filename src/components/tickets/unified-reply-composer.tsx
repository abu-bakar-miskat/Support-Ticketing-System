"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CommentInput, type CommentShape } from "@/components/tickets/comment-input";
import { CustomerReplyComposer, type MessageData } from "@/components/tickets/customer-reply";
import type { MentionableUser } from "@/lib/mentionable-users";

/**
 * CM-01/02: the single composer for the merged conversation feed. The author
 * must choose Internal Note or Reply before posting (CM-02) — this renders
 * that choice as a toggle and mounts the corresponding existing composer
 * underneath, unchanged, rather than reimplementing rich-text/attachment
 * handling twice. When the ticket can't receive a customer reply at all
 * (no known customer address, receiving disabled, etc.), the toggle is
 * omitted entirely and this is just the internal-note composer.
 */
export function UnifiedReplyComposer({
  ticketId,
  teamMembers,
  onCommentAdded,
  replyEnabled,
  customerName,
  customerEmail,
  onSent,
  onSentConfirmed,
  onSentFailed,
}: {
  ticketId: string;
  teamMembers?: MentionableUser[];
  onCommentAdded?: (comment: CommentShape) => void;
  replyEnabled: boolean;
  customerName: string | null;
  customerEmail: string | null;
  onSent?: (message: MessageData) => void;
  onSentConfirmed?: (tempId: string, real: MessageData) => void;
  onSentFailed?: (tempId: string) => void;
}) {
  const [mode, setMode] = useState<"note" | "reply">("note");

  if (!replyEnabled || !customerEmail) {
    return <CommentInput ticketId={ticketId} teamMembers={teamMembers} onCommentAdded={onCommentAdded} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit rounded-md border border-pen-card-border p-0.5">
        {(
          [
            { key: "note" as const, label: "Internal Note" },
            { key: "reply" as const, label: "Reply" },
          ]
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setMode(opt.key)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 font-sans text-[11.5px] font-medium transition-colors",
              mode === opt.key
                ? "bg-pen-blue text-white"
                : "text-pen-muted hover:text-pen-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "note" ? (
        <CommentInput ticketId={ticketId} teamMembers={teamMembers} onCommentAdded={onCommentAdded} />
      ) : (
        <CustomerReplyComposer
          ticketId={ticketId}
          customerName={customerName}
          customerEmail={customerEmail}
          onSent={onSent}
          onSentConfirmed={onSentConfirmed}
          onSentFailed={onSentFailed}
        />
      )}
    </div>
  );
}
