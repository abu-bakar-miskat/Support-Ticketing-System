import PDFDocument from "pdfkit";
import { cellText, pdfColumns, type ExportDoc, type ExportSheet } from "./report-doc";

export function buildPdf(doc: ExportDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", layout: "landscape", margin: 32 });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const left = pdf.page.margins.left;
    const tableWidth = pdf.page.width - pdf.page.margins.right - left;
    const bottomLimit = () => pdf.page.height - pdf.page.margins.bottom;

    // Document title + subtitle
    pdf.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a");
    pdf.text(doc.title, left, pdf.page.margins.top);
    pdf.font("Helvetica").fontSize(9).fillColor("#64748b");
    pdf.text(doc.subtitle ?? `Generated ${new Date().toLocaleString()}`, { align: "left" });
    pdf.moveDown(0.6);

    const cellPad = 4;
    const headerHeight = 20;

    const renderSheet = (sheet: ExportSheet, showHeading: boolean) => {
      const columns = pdfColumns(sheet.columns);
      if (columns.length === 0) return;
      const totalHint = columns.reduce((sum, c) => sum + (c.width ?? 12), 0);
      const colWidths = columns.map((c) => ((c.width ?? 12) / totalHint) * tableWidth);

      if (showHeading) {
        if (pdf.y + 40 > bottomLimit()) pdf.addPage();
        pdf.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
        pdf.text(sheet.name, left, pdf.y);
        pdf.moveDown(0.3);
      }

      const drawHeader = () => {
        const y = pdf.y;
        pdf.rect(left, y, tableWidth, headerHeight).fill("#f1f5f9");
        pdf.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8);
        let x = left;
        columns.forEach((c, i) => {
          pdf.text(c.header, x + cellPad, y + 6, {
            width: colWidths[i] - cellPad * 2,
            lineBreak: false,
            ellipsis: true,
          });
          x += colWidths[i];
        });
        pdf.y = y + headerHeight;
      };

      drawHeader();
      pdf.font("Helvetica").fontSize(8);

      sheet.rows.forEach((row, idx) => {
        let rowHeight = 14;
        const texts = columns.map((c, i) => {
          const text = cellText(row, c.key);
          const h = pdf.heightOfString(text, { width: colWidths[i] - cellPad * 2 });
          rowHeight = Math.max(rowHeight, h + cellPad * 2);
          return text;
        });
        rowHeight = Math.min(rowHeight, 60);

        if (pdf.y + rowHeight > bottomLimit()) {
          pdf.addPage();
          drawHeader();
          pdf.font("Helvetica").fontSize(8);
        }

        const y = pdf.y;
        if (idx % 2 === 1) pdf.rect(left, y, tableWidth, rowHeight).fill("#f8fafc");
        pdf.fillColor("#1e293b");
        let x = left;
        columns.forEach((c, i) => {
          pdf.text(texts[i], x + cellPad, y + cellPad, {
            width: colWidths[i] - cellPad * 2,
            height: rowHeight - cellPad * 2,
            ellipsis: true,
          });
          x += colWidths[i];
        });
        pdf.y = y + rowHeight;
      });
    };

    const multi = doc.sheets.length > 1;
    doc.sheets.forEach((sheet, i) => {
      if (i > 0) pdf.moveDown(1);
      renderSheet(sheet, multi);
    });

    pdf.end();
  });
}
