import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { buildReport, type ReportModel } from "@/lib/report";
import type { ChecklistItem, ProjectProfile } from "@/lib/types";

const INK = rgb(0.1, 0.09, 0.08);
const MUTED = rgb(0.37, 0.34, 0.3);
const COPPER = rgb(0.7, 0.33, 0.16);
const RULE = rgb(0.82, 0.78, 0.72);
const PAPER = rgb(0.98, 0.96, 0.93);

function pdfSafe(text: string): string {
  return text
    .replace(/×/g, "x")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/·/g, "|")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderReportPdf(profile: ProjectProfile, items: ChecklistItem[], generatedAt?: string): Promise<Uint8Array> {
  const model = buildReport(profile, items, generatedAt);
  return drawReport(model);
}

async function drawReport(model: ReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  let page = doc.addPage(pageSize);
  let y = 792 - margin;

  const newPage = () => {
    page = doc.addPage(pageSize);
    y = 792 - margin;
    drawHeader(page, sans, model.title);
    y -= 28;
  };

  const ensure = (height: number) => {
    if (y - height < 48) newPage();
  };

  const text = (value: string, font: PDFFont, size: number, color = INK, indent = 0) => {
    const lines = wrap(value, font, size, 612 - margin * 2 - indent);
    for (const line of lines) {
      ensure(size + 4);
      page.drawText(line, { x: margin + indent, y, size, font, color });
      y -= size + 4;
    }
  };

  page.drawRectangle({ x: 0, y: 760, width: 612, height: 8, color: COPPER });
  page.drawText("LINTEL", { x: margin, y: y - 4, size: 9, font: sansBold, color: COPPER });
  y -= 22;
  text(model.title, serifBold, 22);
  y -= 4;
  text(model.kicker, sans, 10, MUTED);
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 0.6, color: RULE });
  y -= 16;
  text(model.disclaimer, sans, 8, MUTED);
  y -= 12;

  text("Project profile", serifBold, 14);
  y -= 4;
  for (const row of model.rows) {
    ensure(14);
    page.drawText(row.label, { x: margin, y, size: 9, font: sansBold, color: MUTED });
    const valueLines = wrap(row.value, sans, 10, 360);
    valueLines.forEach((line, index) => {
      if (index > 0) {
        y -= 13;
        ensure(13);
      }
      page.drawText(line, { x: margin + 130, y, size: 10, font: sans, color: INK });
    });
    y -= 15;
  }

  y -= 8;
  for (const section of model.sections) {
    ensure(48);
    y -= 6;
    page.drawRectangle({ x: margin, y: y - 4, width: 612 - margin * 2, height: 18, color: PAPER });
    page.drawText(section.section.toUpperCase(), { x: margin + 6, y: y, size: 8, font: sansBold, color: COPPER });
    page.drawText(section.applies ? "APPLIES" : "NOT APPLIED", {
      x: 430,
      y,
      size: 8,
      font: sansBold,
      color: MUTED,
    });
    y -= 20;
    text(section.title, serifBold, 14);
    text(section.status, sans, 9, MUTED);
    y -= 2;
    text(section.summary, serif, 11);
    y -= 2;
    text("Requirements", sansBold, 9, COPPER);
    for (const requirement of section.requirements) text(requirement, sans, 9, INK, 8);
    y -= 2;
    text("Exceptions", sansBold, 9, COPPER);
    for (const exception of section.exceptions) text(exception, sans, 9, INK, 8);
    if (section.notes) {
      y -= 2;
      text("Notes", sansBold, 9, COPPER);
      text(section.notes, sans, 9, INK, 8);
    }
    y -= 2;
    text(section.citation, sans, 8, MUTED);
    for (const source of section.sources) text(`${source.label}: ${source.url}`, sans, 8, MUTED, 8);
    y -= 8;
  }

  const pages = doc.getPages();
  pages.forEach((printed, index) => {
    printed.drawText(`${model.title}  ·  ${index + 1} / ${pages.length}`, {
      x: margin,
      y: 28,
      size: 8,
      font: sans,
      color: MUTED,
    });
  });

  doc.setTitle(`${model.title} — code analysis`);
  doc.setAuthor("Lintel");
  doc.setSubject(model.disclaimer);
  return doc.save();
}

function drawHeader(page: PDFPage, font: PDFFont, title: string) {
  page.drawRectangle({ x: 0, y: 784, width: 612, height: 8, color: COPPER });
  const safeTitle = pdfSafe(title);
  const clipped = safeTitle.length > 70 ? `${safeTitle.slice(0, 67)}...` : safeTitle;
  page.drawText(clipped, { x: 54, y: 756, size: 9, font, color: MUTED });
}
