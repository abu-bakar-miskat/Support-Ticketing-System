import { hasSignatureContent } from "./sanitize-signature-html";

export type SignatureEntry = { id: string; label: string; html: string };

export type SignaturePrefs = {
  enabled: boolean;
  activeId: string | null;
  list: SignatureEntry[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toEntry(v: unknown, fallbackId: string): SignatureEntry | null {
  if (!isRecord(v)) return null;
  const html = typeof v.html === "string" ? v.html : "";
  if (!hasSignatureContent(html)) return null;
  const label = typeof v.label === "string" && v.label.trim() ? v.label.trim() : "Signature";
  const id = typeof v.id === "string" && v.id ? v.id : fallbackId;
  return { id, label, html };
}

/** Reads the stored `preferences.signature` blob into the `{ enabled, activeId, list }` shape. */
export function normalizeSignaturePrefs(preferences: unknown): SignaturePrefs {
  const prefs = isRecord(preferences) ? preferences : {};
  const stored = prefs.signature;
  if (!isRecord(stored) || !Array.isArray(stored.list)) {
    return { enabled: false, activeId: null, list: [] };
  }

  const list = stored.list
    .map((item, i) => toEntry(item, `sig-${i}`))
    .filter((e): e is SignatureEntry => e !== null);
  const storedActiveId = typeof stored.activeId === "string" ? stored.activeId : null;
  const activeId = list.some((e) => e.id === storedActiveId) ? storedActiveId : (list[0]?.id ?? null);

  return {
    enabled: stored.enabled === true && list.length > 0,
    activeId,
    list,
  };
}
