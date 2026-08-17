import { NextResponse } from "next/server";
import { requireAdminOrManager } from "@/lib/auth";
import { getBoardCards } from "@/lib/board-data";
import { buildTaskListParams } from "@/lib/task-list-query";
import { buildTicketExportDoc, exportFileName } from "@/lib/exports/ticket-report";
import { buildCsv } from "@/lib/exports/to-csv";
import { buildXlsx } from "@/lib/exports/to-xlsx";
import { buildPdf } from "@/lib/exports/to-pdf";

const MAX_ROWS = 10_000;

const FORMATS = {
  csv: {
    ext: "csv",
    contentType: "text/csv; charset=utf-8",
  },
  excel: {
    ext: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: {
    ext: "pdf",
    contentType: "application/pdf",
  },
} as const;

type Format = keyof typeof FORMATS;

export async function GET(request: Request) {
  const { profile, error } = await requireAdminOrManager("Only admins and managers can export reports.");
  if (error) return error;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "excel") as Format;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  const { filterParams, sortKey, error: paramError } = await buildTaskListParams(url, profile);
  if (paramError) return NextResponse.json({ error: paramError }, { status: 400 });

  const cards = await getBoardCards({
    ...filterParams,
    timeForUserId: profile.id,
    sortKey,
    take: MAX_ROWS,
  });

  const doc = buildTicketExportDoc(cards);
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
      "Content-Disposition": `attachment; filename="${exportFileName("tickets", ext)}"`,
      "Cache-Control": "no-store",
    },
  });
}
