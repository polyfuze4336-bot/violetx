// Renders a ProgressReport as a PDF with pdf-lib (pure JavaScript, standard
// fonts only, so it runs unchanged on Azure App Service).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { ProgressReport, ReportExercise } from "@/lib/progress-report";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;
const VIOLET = rgb(0.36, 0.2, 0.62);
const MAGENTA = rgb(0.78, 0.15, 0.55);
const INK = rgb(0.1, 0.1, 0.14);
const MUTED = rgb(0.4, 0.4, 0.46);
const RULE = rgb(0.86, 0.86, 0.9);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function pdfDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** Standard PDF fonts only encode Latin-1: map the rest to plain ASCII. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2192/g, "->")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/gu, "?");
}

class Writer {
  page: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - M;
  }

  ensure(height: number) {
    if (this.y - height < M + 24) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.y = PAGE_H - M;
    }
  }

  text(t: string, opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    let s = pdfSafe(t);
    const max = opts.maxWidth ?? CONTENT_W;
    // Truncate (never wrap) so the layout stays predictable.
    if (font.widthOfTextAtSize(s, size) > max) {
      while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > max) s = s.slice(0, -1);
      s = `${s}...`;
    }
    this.page.drawText(s, { x: opts.x ?? M, y: this.y, size, font, color: opts.color ?? INK });
  }

  /** Wrap long text over several lines. */
  paragraph(t: string, size = 9, color = MUTED, lineHeight = 12) {
    const words = pdfSafe(t).split(/\s+/);
    let line = "";
    const flush = () => {
      this.ensure(lineHeight);
      this.page.drawText(line, { x: M, y: this.y, size, font: this.font, color });
      this.y -= lineHeight;
      line = "";
    };
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (this.font.widthOfTextAtSize(next, size) > CONTENT_W && line) {
        flush();
        line = w;
      } else line = next;
    }
    if (line) flush();
  }

  rule() {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, thickness: 0.6, color: RULE });
  }
}

function sparkline(w: Writer, ex: ReportExercise, x: number, y: number, width: number, height: number) {
  if (ex.trend.length < 2) return;
  // Lower assistance is stronger, so assisted lifts are plotted upside down.
  const vals = ex.trend.map((t) => (ex.assisted ? -t.weightKg : t.weightKg));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals.map((v, i) => ({
    x: x + (i / (vals.length - 1)) * width,
    y: y + ((v - lo) / span) * height,
  }));
  w.page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.4, color: RULE });
  for (let i = 1; i < pts.length; i++) {
    w.page.drawLine({ start: pts[i - 1], end: pts[i], thickness: 1.4, color: VIOLET });
  }
  const last = pts[pts.length - 1];
  w.page.drawCircle({ x: last.x, y: last.y, size: 2.4, color: MAGENTA });
}

const kg = (n: number, assisted: boolean) => `${Math.round(n * 100) / 100} kg${assisted ? " assistance" : ""}`;

function drawExercise(w: Writer, ex: ReportExercise) {
  const prRows = ex.prs.slice(0, 6);
  const height = 20 + 3 * 14 + (ex.trend.length > 1 ? 44 : 0) + (prRows.length ? 18 + prRows.length * 13 + 6 : 14) + 14;
  w.ensure(height);

  w.text(ex.name, { size: 13, bold: true });
  w.y -= 16;
  w.text(`Best recorded: ${kg(ex.best.weightKg, ex.assisted)} x ${ex.best.reps} (${pdfDate(ex.best.date)})`, { size: 9.5 });
  w.y -= 13;
  w.text(
    `Most reps: ${ex.mostReps.reps} at ${kg(ex.mostReps.weightKg, ex.assisted)} (${pdfDate(ex.mostReps.date)})` +
      (ex.estimatedOneRepMaxKg !== null ? `   |   Estimated 1RM (calculated): ${ex.estimatedOneRepMaxKg} kg` : "   |   Lower assistance = stronger"),
    { size: 9.5 }
  );
  w.y -= 13;
  w.text(
    `${ex.daysRecorded} day${ex.daysRecorded === 1 ? "" : "s"} recorded, ${pdfDate(ex.firstDate)} to ${pdfDate(ex.lastDate)}` +
      (ex.loadChange ? `   |   ${ex.loadChange}` : ""),
    { size: 9.5, color: MUTED }
  );
  w.y -= 8;

  if (ex.trend.length > 1) {
    w.text("Top set per day", { size: 7.5, color: MUTED });
    w.y -= 6;
    sparkline(w, ex, M, w.y - 26, 180, 26);
    w.y -= 38;
  } else w.y -= 4;

  if (prRows.length) {
    w.text("Date", { size: 8, bold: true, color: MUTED });
    w.text("Personal record", { x: M + 80, size: 8, bold: true, color: MUTED });
    w.text("Result", { x: M + 190, size: 8, bold: true, color: MUTED });
    w.text("Change", { x: M + 320, size: 8, bold: true, color: MUTED, maxWidth: CONTENT_W - 320 });
    w.y -= 5;
    w.rule();
    w.y -= 10;
    for (const p of prRows) {
      w.text(pdfDate(p.date), { size: 9 });
      w.text(p.label, { x: M + 80, size: 9, bold: true, color: MAGENTA });
      w.text(p.result, { x: M + 190, size: 9 });
      w.text(p.change, { x: M + 320, size: 9, maxWidth: CONTENT_W - 320 });
      w.y -= 13;
    }
    if (ex.prs.length > prRows.length) {
      const more = ex.prs.length - prRows.length;
      w.text(`+ ${more} earlier PR${more === 1 ? "" : "s"} not shown`, { size: 8, color: MUTED });
      w.y -= 12;
    }
  } else {
    w.text("No personal records yet: not enough earlier sets to beat.", { size: 9, color: MUTED });
    w.y -= 12;
  }
  w.y -= 6;
  w.rule();
  w.y -= 16;
}

export async function renderProgressPdf(report: ProgressReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`VioletX progress report - ${report.scope}`));
  doc.setAuthor("VioletX");
  doc.setCreator("VioletX");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  // Header band.
  w.page.drawRectangle({ x: 0, y: PAGE_H - 78, width: PAGE_W, height: 78, color: VIOLET });
  w.page.drawText("VioletX progress report", { x: M, y: PAGE_H - 40, size: 20, font: bold, color: rgb(1, 1, 1) });
  w.page.drawText(pdfSafe(`${report.athleteLabel}  |  ${report.scope}  |  Generated ${pdfDate(report.generatedOn)}`), {
    x: M,
    y: PAGE_H - 60,
    size: 10,
    font,
    color: rgb(0.9, 0.86, 0.98),
  });
  w.y = PAGE_H - 104;

  const t = report.totals;
  w.text(
    `${t.exercises} exercise${t.exercises === 1 ? "" : "s"}   |   ${t.daysRecorded} days recorded   |   ${t.sets} sets   |   ${t.prs} PR${t.prs === 1 ? "" : "s"}` +
      (t.fromWhatsApp > 0 ? `   |   ${t.fromWhatsApp} imported from WhatsApp` : ""),
    { size: 10, bold: true }
  );
  w.y -= 12;
  w.rule();
  w.y -= 18;

  if (report.exercises.length === 0) {
    w.text("No exercises have been recorded yet.", { size: 11, color: MUTED });
    w.y -= 20;
  }
  for (const ex of report.exercises) drawExercise(w, ex);

  w.ensure(60);
  w.text("About this report", { size: 9, bold: true });
  w.y -= 12;
  for (const n of report.notes) w.paragraph(`- ${n}`, 8.5);

  // Footer with page numbers on every page.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(pdfSafe(`VioletX  |  ${report.athleteLabel}  |  Page ${i + 1} of ${pages.length}`), {
      x: M,
      y: 22,
      size: 8,
      font,
      color: MUTED,
    });
  });

  return doc.save();
}
