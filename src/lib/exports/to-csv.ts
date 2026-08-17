import { cellText, type ExportDoc } from "./report-doc";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(doc: ExportDoc): string {
  const sections = doc.sheets.map((sheet) => {
    const header = sheet.columns.map((c) => escapeCsv(c.header)).join(",");
    const body = sheet.rows
      .map((row) => sheet.columns.map((c) => escapeCsv(cellText(row, c.key))).join(","))
      .join("\r\n");
    const heading = doc.sheets.length > 1 ? `${escapeCsv(sheet.name)}\r\n` : "";
    return `${heading}${header}\r\n${body}`;
  });
  // UTF-8 BOM so Excel detects encoding correctly; blank line between sections.
  return `﻿${sections.join("\r\n\r\n")}`;
}
