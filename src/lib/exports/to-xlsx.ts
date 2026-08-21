import ExcelJS from "exceljs";
import { type ExportDoc } from "./report-doc";

/** Excel sheet names must be ≤31 chars, unique, and exclude []:*?/\ */
function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function buildXlsx(doc: ExportDoc): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PEN Support Ticketing System";
  workbook.created = new Date();

  const usedNames = new Set<string>();
  for (const sheetDef of doc.sheets) {
    const sheet = workbook.addWorksheet(safeSheetName(sheetDef.name, usedNames), {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = sheetDef.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };

    for (const row of sheetDef.rows) {
      sheet.addRow(row);
    }

    if (sheetDef.columns.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheetDef.columns.length },
      };
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
