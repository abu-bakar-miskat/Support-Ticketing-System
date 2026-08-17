/**
 * Generic, transport-agnostic export document model shared by the CSV / XLSX /
 * PDF builders. Client code (or a server route) assembles an ExportDoc; the
 * per-format builders in this folder render it. Keep this file free of
 * server-only or heavy deps so it can be imported from the browser too.
 */

export type ExportColumn = {
  key: string;
  header: string;
  /** Relative width hint (Excel column width / PDF proportional width). */
  width?: number;
  /** Include this column in the PDF. If no column in a sheet sets this, all are shown. */
  pdf?: boolean;
};

export type ExportSheet = {
  /** Worksheet name (Excel) / section heading (CSV, PDF). */
  name: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
};

export type ExportDoc = {
  title: string;
  subtitle?: string;
  sheets: ExportSheet[];
};

export function cellText(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

export function exportFileName(base: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.${ext}`;
}

/** PDF shows only pdf-flagged columns, or all columns when none are flagged. */
export function pdfColumns(columns: ExportColumn[]): ExportColumn[] {
  const flagged = columns.filter((c) => c.pdf);
  return flagged.length ? flagged : columns;
}
