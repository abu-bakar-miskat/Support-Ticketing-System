"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { getPortalRoot } from "@/lib/portal-root";

type ExpandableDescriptionEditorProps = {
  content: string;
  onChange: (html: string) => void;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  /** Used for focus targets, e.g. "new-ticket-form" or "ticket-description-editor" */
  scopeId: string;
  placeholder?: string;
  label?: string;
  showLabel?: boolean;
  subtitle?: string;
  inlineClassName?: string;
  footer?: ReactNode;
  /** Rendered at the right end of the editor toolbar (e.g. an AI compose button). */
  editorAction?: ReactNode;
};

export function ExpandableDescriptionEditor({
  content,
  onChange,
  expanded,
  onExpandedChange,
  scopeId,
  placeholder = "Write a description… use the toolbar for formatting.",
  label = "Description",
  showLabel = true,
  subtitle = "Write and format your ticket details",
  inlineClassName = "min-h-[140px]",
  footer,
  editorAction,
}: ExpandableDescriptionEditorProps) {
  const expandedEditorId = `${scopeId}-expanded`;

  const focusEditor = () => {
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        expanded
          ? `#${expandedEditorId} .ProseMirror, #${expandedEditorId} [contenteditable]`
          : `#${scopeId} .ProseMirror, #${scopeId} [contenteditable]`,
      );
      el?.focus();
    });
  };

  useEffect(() => {
    if (!expanded) return;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`#${expandedEditorId} .ProseMirror`)
        ?.focus();
    });
  }, [expanded, expandedEditorId]);

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExpandedChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  const expandButton = !expanded ? (
    <button
      type="button"
      onClick={() => onExpandedChange(true)}
      className="flex size-7 items-center justify-center rounded-md border border-pen-card-border text-pen-muted transition-colors hover:border-pen-blue/40 hover:bg-pen-surface hover:text-pen-foreground"
      aria-label="Expand description editor"
      title="Expand"
    >
      <Maximize2 className="size-3.5" strokeWidth={2} />
    </button>
  ) : null;

  const editor = (
    <RichTextEditor
      key={expanded ? `${scopeId}-expanded` : `${scopeId}-inline`}
      content={content}
      onChange={onChange}
      placeholder={placeholder}
      toolbarExtra={editorAction}
      className={expanded ? "flex min-h-0 flex-1 flex-col" : inlineClassName}
      contentClassName={
        expanded
          ? "min-h-[calc(100svh/var(--pen-font-scale,1)-220px)] max-h-none flex-1"
          : undefined
      }
    />
  );

  return (
    <>
      <div id={scopeId} className="flex flex-col gap-1">
        {showLabel ? (
          <div className="flex min-h-[20px] items-center justify-between gap-2">
            <button
              type="button"
              onClick={focusEditor}
              className="cursor-text pen-text-label"
            >
              {label}
            </button>
            {expandButton}
          </div>
        ) : (
          expandButton && <div className="flex justify-end">{expandButton}</div>
        )}
        {!expanded && editor}
        {!expanded && footer ? (
          <div className="mt-2 flex items-center justify-end gap-2">{footer}</div>
        ) : null}
      </div>

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              aria-label="Close expanded description"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => onExpandedChange(false)}
            />
            <div
              id={expandedEditorId}
              className="pen-glass-panel relative flex max-h-[calc(100svh/var(--pen-font-scale,1)-32px)] w-full max-w-[960px] flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10"
            >
              <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-pen-card-border px-4 sm:px-5">
                <h3 className="font-sans text-[14px] font-semibold text-pen-foreground">
                  {label}
                </h3>
                <span className="font-sans text-[11.5px] text-pen-subtle">
                  {subtitle}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => onExpandedChange(false)}
                  className="flex h-8 items-center gap-1.5 rounded-[6px] border border-pen-card-border px-2.5 font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                >
                  <Minimize2 className="size-3.5" strokeWidth={2} />
                  Collapse
                </button>
                <button
                  type="button"
                  onClick={() => onExpandedChange(false)}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
                {editor}
              </div>
              <div className="flex min-h-10 shrink-0 items-center gap-3 border-t border-pen-card-border px-4 sm:px-5">
                <span className="font-sans text-[11px] text-pen-subtle">
                  Press Esc to collapse
                </span>
                {footer ? <div className="ml-auto flex items-center gap-2">{footer}</div> : null}
              </div>
            </div>
          </div>,
          getPortalRoot() ?? document.body,
        )}
    </>
  );
}
