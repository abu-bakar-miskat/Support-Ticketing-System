/**
 * Signatures are pasted verbatim from external signature-generator sites, so unlike the
 * tiptap editor's tag allowlist, styling/fonts/icons must survive. This only strips the
 * constructs that can execute code (script/event handlers/javascript: URLs) or hijack the
 * page (iframe/object/embed/form), keeping everything else — including <style> and inline
 * style attributes — intact.
 */
const DISALLOWED_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "noscript",
  "applet",
  "meta",
  "link",
];

const URL_ATTRS = new Set(["href", "src", "action", "formaction"]);

function sanitizeWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  DISALLOWED_TAGS.forEach((tag) => doc.querySelectorAll(tag).forEach((el) => el.remove()));

  doc.body.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.has(name) && value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML.trim();
}

/** Regex fallback for environments without DOMParser (the API route, server-side). */
function sanitizeWithRegex(html: string): string {
  let out = html;
  for (const tag of DISALLOWED_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?\\s*>`, "gi"), "");
  }
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src|action|formaction)(\s*=\s*)(["'])\s*javascript:[^"']*\3/gi, "$1$2$3$3");
  return out.trim();
}

export function sanitizeSignatureHtml(html: string): string {
  if (!html) return "";
  return typeof DOMParser !== "undefined" ? sanitizeWithDom(html) : sanitizeWithRegex(html);
}

/** A signature counts as set once it has visible text or an image — not just empty markup. */
export function hasSignatureContent(html: string): boolean {
  if (!html) return false;
  const textOnly = html.replace(/<[^>]*>/g, "").trim();
  return textOnly.length > 0 || /<img\b/i.test(html);
}
