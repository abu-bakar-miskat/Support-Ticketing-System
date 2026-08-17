import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { exportFileName, type ExportDoc } from "@/lib/exports/report-doc";
import { buildCsv } from "@/lib/exports/to-csv";
import { buildXlsx } from "@/lib/exports/to-xlsx";
import { buildPdf } from "@/lib/exports/to-pdf";

const MAX_TOTAL_ROWS = 50_000;

const FORMATS = {
  csv: { ext: "csv", contentType: "text/csv; charset=utf-8" },
  excel: {
    ext: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: { ext: "pdf", contentType: "application/pdf" },
} as const;

type Format = keyof typeof FORMATS;

/** Validates a client-supplied ExportDoc; returns an error message or null. */
function validateDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return "Missing export document";
  const d = doc as Partial<ExportDoc>;
  if (typeof d.title !== "string") return "Invalid document title";
  if (!Array.isArray(d.sheets) || d.sheets.length === 0) return "No sheets to export";
  let total = 0;
  for (const sheet of d.sheets) {
    if (!sheet || typeof sheet.name !== "string") return "Invalid sheet";
    if (!Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) return "Invalid sheet contents";
    total += sheet.rows.length;
    if (total > MAX_TOTAL_ROWS) return "Export is too large";
  }
  return null;
}

/**
 * Format-only export endpoint. The client sends an already-assembled ExportDoc
 * (built from report data it already fetched and can see) and gets back a file.
 * No data is read here beyond what the caller supplies, so requireAuth (matching
 * the reports pages' own access) is sufficient.
 */
export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "excel") as Format;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const doc: ExportDoc = payload?.doc;
  const validationError = validateDoc(doc);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const base = typeof payload?.fileBase === "string" && payload.fileBase.trim()
    ? payload.fileBase.trim().replace(/[^a-z0-9._-]+/gi, "-").slice(0, 60)
    : "report";
  const { ext, contentType } = FORMATS[format];

  let body: Buffer | string;
  if (format === "csv") {
    body = buildCsv(doc);
  } else if (format === "excel") {
    body = await buildXlsx(doc);
  } else {
    body = await buildPdf(doc);
  }

  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${exportFileName(base, ext)}"`,
      "Cache-Control": "no-store",
    },
  });
}
