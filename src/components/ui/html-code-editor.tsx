"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A lightweight, dependency-free HTML code editor. A transparent <textarea> is
 * layered over a syntax-highlighted <pre>, both sharing identical typography and
 * wrapping so the caret lines up with the colored text. The outer box is the
 * single scroll container, so no scroll-syncing JS is needed.
 *
 * Highlighting is deliberately simple (tags / attribute names / quoted values /
 * comments / `{{placeholder}}` tokens) — enough to make hand-editing email HTML
 * readable without pulling in a full editor library.
 */

// GitHub-light palette — readable syntax colors on a light background.
const COLORS = {
  base: "#1f2328", // plain text between tags
  punct: "#6e7781", // < > / =
  tag: "#116329", // element names
  attr: "#0550ae", // attribute names
  string: "#0a3069", // quoted values
  comment: "#6e7781",
  placeholder: "#953800", // {{code}}
} as const;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wrap `{{placeholder}}` tokens in an already-escaped string. */
function colorPlaceholders(escaped: string): string {
  return escaped.replace(
    /\{\{\s*\w+\s*\}\}/g,
    (p) =>
      `<span style="color:${COLORS.placeholder};font-weight:600;background:#fff1e5;border-radius:3px;padding:0 2px">${p}</span>`,
  );
}

function highlightAttrs(attrs: string): string {
  return attrs.replace(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("[^"]*"|'[^']*')|([a-zA-Z_:][-a-zA-Z0-9_:.]*)/g,
    (_full, aname: string, eq: string, val: string, bareName: string) => {
      if (bareName) return `<span style="color:${COLORS.attr}">${esc(bareName)}</span>`;
      const value = colorPlaceholders(esc(val));
      return (
        `<span style="color:${COLORS.attr}">${esc(aname)}</span>` +
        `<span style="color:${COLORS.punct}">${esc(eq)}</span>` +
        `<span style="color:${COLORS.string}">${value}</span>`
      );
    },
  );
}

function highlightTag(tag: string): string {
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)(\/?)>$/.exec(tag);
  if (!m) return esc(tag);
  const [, slash, name, attrs, selfClose] = m;
  return (
    `<span style="color:${COLORS.punct}">&lt;${slash}</span>` +
    `<span style="color:${COLORS.tag}">${esc(name)}</span>` +
    highlightAttrs(attrs) +
    `<span style="color:${COLORS.punct}">${selfClose ? "/" : ""}&gt;</span>`
  );
}

function highlightHtml(src: string): string {
  let out = "";
  let last = 0;
  const re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += colorPlaceholders(esc(src.slice(last, m.index)));
    const token = m[0];
    out += token.startsWith("<!--")
      ? `<span style="color:${COLORS.comment}">${esc(token)}</span>`
      : highlightTag(token);
    last = m.index + token.length;
  }
  out += colorPlaceholders(esc(src.slice(last)));
  return out;
}

// Typography + box shared by the highlight layer and the textarea so they align.
const SHARED =
  "m-0 border-0 p-3 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-words [tab-size:2]";

export function HtmlCodeEditor({
  value,
  onChange,
  minHeight = 260,
  maxHeight = 460,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd } = ta;
    const next = value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
    onChange(next);
    // Restore the caret just after the inserted spaces on the next tick.
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.selectionStart = taRef.current.selectionEnd = selectionStart + 2;
      }
    });
  }

  return (
    <div
      className={cn(
        "relative overflow-auto rounded-lg border border-sts-card-border bg-[#fbfcfe]",
        "focus-within:border-sts-blue/40 focus-within:ring-2 focus-within:ring-sts-blue/20",
        className,
      )}
      style={{ maxHeight }}
    >
      <div className="relative" style={{ minHeight }}>
        <pre
          aria-hidden
          className={cn(SHARED, "pointer-events-none min-h-full")}
          style={{ color: COLORS.base }}
        >
          <code
            dangerouslySetInnerHTML={{ __html: highlightHtml(value) + "\n" }}
          />
        </pre>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(
            SHARED,
            "absolute inset-0 resize-none overflow-hidden bg-transparent text-transparent caret-[#1f2328] outline-none focus:outline-none",
          )}
        />
      </div>
    </div>
  );
}
