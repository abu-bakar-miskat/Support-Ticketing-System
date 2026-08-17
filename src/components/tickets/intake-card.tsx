"use client";

import { useState } from "react";
import { RichTextDisplay } from "@/components/ui/rich-text-editor";
import { Paperclip, ExternalLink, Inbox, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntakeResponseEntry = {
  fieldId: string;
  label: string;
  type: string;
  value: string;
};

export type IntakeData = {
  submitterName: string;
  submitterEmail: string;
  submittedAt: string;
  formName: string;
  portalUrl?: string | null;
  responses: IntakeResponseEntry[];
};

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i;

function isImageUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return IMAGE_EXT.test(pathname);
  } catch {
    return IMAGE_EXT.test(url);
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pen-text-label">{children}</p>;
}

function EmailValue({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={`mailto:${email}`}
        className="font-sans text-[12.5px] text-pen-id hover:underline"
      >
        {email}
      </a>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(email).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        title={copied ? "Copied" : "Copy email"}
        className="flex size-5 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
      >
        {copied ? (
          <Check className="size-3 text-pen-green" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </span>
  );
}

export function IntakeCard({ intake }: { intake: IntakeData }) {
  const date = new Date(intake.submittedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const visibleResponses = intake.responses.filter(
    (r) => r.fieldId && r.label && r.value,
  );

  return (
    <div className="flex flex-col rounded-xl border border-pen-card-border bg-pen-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-pen-blue-tint text-pen-id">
            <Inbox className="size-3.5" />
          </span>
          <p className="min-w-0 font-sans text-[12.5px] text-pen-foreground">
            <span className="font-semibold">{intake.submitterEmail}</span>{" "}
            raised this request via{" "}
            <span className="font-semibold">{intake.formName}</span>
          </p>
        </div>
        <span className="ml-3 shrink-0 font-sans text-[11.5px] text-pen-subtle">
          {date}
        </span>
      </div>

      <div className="flex flex-col gap-4 px-5 py-3.5">
        {/* Field responses */}
        {visibleResponses.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Responses</SectionLabel>
            <div className="overflow-hidden rounded-lg border border-pen-card-border">
              {visibleResponses.map((r, i) => {
                const isEmail =
                  r.type === "email" ||
                  (r.type !== "richtext" &&
                    r.type !== "file" &&
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.value.trim()));
                return (
                  <div
                    key={r.fieldId}
                    className={cn(
                      "px-3.5 py-2.5",
                      i > 0 && "border-t border-pen-card-border",
                    )}
                  >
                    <p className="mb-1 font-sans text-[10.5px] font-semibold uppercase tracking-wide text-pen-subtle">
                      {r.label}
                    </p>
                    {r.type === "richtext" ? (
                      <RichTextDisplay html={r.value} />
                    ) : r.type === "file" ? (
                      isImageUrl(r.value) ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="overflow-hidden rounded-lg border border-pen-card-border">
                            <img
                              src={r.value}
                              alt={r.label}
                              className="block max-w-full"
                            />
                          </div>
                          <a
                            href={r.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-sans text-[11.5px] text-pen-id hover:underline"
                          >
                            <ExternalLink className="size-3 shrink-0" />
                            View full image
                          </a>
                        </div>
                      ) : (
                        <a
                          href={r.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-id hover:underline"
                        >
                          <Paperclip className="size-3 shrink-0" />
                          Download file
                        </a>
                      )
                    ) : isEmail ? (
                      <EmailValue email={r.value.trim()} />
                    ) : (
                      <p className="font-sans text-[12.5px] leading-relaxed text-pen-foreground break-words whitespace-pre-wrap">
                        {r.value}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
