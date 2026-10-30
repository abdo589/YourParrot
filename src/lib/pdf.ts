// Company PDF reports: Amiri font (Arabic shaping), RTL column order,
// rows never split across pages, page numbers, and no browser URLs/headers
// because the file is generated directly rather than printed.
import type { jsPDF as JsPDF } from "jspdf";

export interface PdfColumn { header: string; value: (row: Record<string, unknown>) => string | number | null | undefined }
export interface PdfSection { heading?: string; columns: PdfColumn[]; rows: Record<string, unknown>[]; totals?: (string | number)[] }
export interface PdfOptions {
  title: string;
  subtitle?: string;
  lang: "ar" | "en";
  sections: PdfSection[];
  /** key/value block printed under the title (e.g. settlement details) */
  facts?: [string, string][];
  orientation?: "portrait" | "landscape";
  filename: string;
}

let fontCache: { regular: string; bold: string } | null = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const get = async (p: string) => {
    const buf = await (await fetch(p)).arrayBuffer();
    let bin = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  fontCache = { regular: await get("/fonts/Amiri-Regular.ttf"), bold: await get("/fonts/Amiri-Bold.ttf") };
  return fontCache;
}

export async function buildPdf(o: PdfOptions): Promise<JsPDF> {
  const [{ jsPDF }, { autoTable }, fonts] = await Promise.all([import("jspdf"), import("jspdf-autotable"), loadFonts()]);
  const doc = new jsPDF({ orientation: o.orientation ?? "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("Amiri-Regular.ttf", fonts.regular);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", fonts.bold);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
  doc.setFont("Amiri", "normal");
  doc.setProperties({ title: o.title, creator: "METAL FUZE PROJECTS" });

  const rtl = o.lang === "ar";
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const edge = rtl ? W - M : M;
  const align = rtl ? "right" : "left";

  const header = () => {
    doc.setFillColor(20, 40, 75);
    doc.rect(0, 0, W, 4, "F");
    doc.setFont("Amiri", "bold"); doc.setFontSize(10); doc.setTextColor(242, 107, 29);
    doc.text("METAL FUZE PROJECTS", rtl ? M : W - M, 11, { align: rtl ? "left" : "right" });
  };
  header();
  doc.setTextColor(20, 40, 75); doc.setFontSize(17);
  doc.text(o.title, edge, 13, { align });
  doc.setFont("Amiri", "normal"); doc.setFontSize(10); doc.setTextColor(100, 110, 130);
  const stamp = new Intl.DateTimeFormat(rtl ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB",
    { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date());
  doc.text([o.subtitle, stamp].filter(Boolean).join("  •  "), edge, 19, { align });
  let y = 24;

  if (o.facts?.length) {
    const facts = o.facts.map(([k, v]) => (rtl ? [v, k] : [k, v]));
    autoTable(doc, {
      startY: y, body: facts, theme: "plain", margin: { left: M, right: M },
      styles: { font: "Amiri", fontSize: 11, halign: align, textOptions: {} } as never,
      columnStyles: rtl ? { 1: { fontStyle: "bold", textColor: [20, 40, 75] } } : { 0: { fontStyle: "bold", textColor: [20, 40, 75] } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  for (const s of o.sections) {
    if (s.heading) {
      if (y > H - 30) { doc.addPage(); header(); y = 16; }
      doc.setFont("Amiri", "bold"); doc.setFontSize(12); doc.setTextColor(20, 40, 75);
      doc.text(s.heading, edge, y + 4, { align });
      y += 7;
    }
    const cols = rtl ? [...s.columns].reverse() : s.columns;
    const body = s.rows.map((r) => cols.map((c) => { const v = c.value(r); return v === null || v === undefined ? "" : String(v); }));
    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => c.header)],
      body,
      foot: s.totals ? [rtl ? [...s.totals].reverse().map(String) : s.totals.map(String)] : undefined,
      margin: { left: M, right: M, top: 16 },
      rowPageBreak: "avoid",          // pagination happens at row boundaries
      showHead: "everyPage",
      styles: { font: "Amiri", fontStyle: "normal", fontSize: 9.5, halign: align, cellPadding: 1.8, textOptions: {} } as never,
      headStyles: { font: "Amiri", fontStyle: "bold", fillColor: [20, 40, 75], textColor: 255 },
      footStyles: { font: "Amiri", fontStyle: "bold", fillColor: [253, 231, 218], textColor: [20, 40, 75] },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      didDrawPage: () => header(),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("Amiri", "normal"); doc.setFontSize(9); doc.setTextColor(130, 140, 155);
    doc.text(rtl ? `صفحة ${i} من ${pages}` : `Page ${i} of ${pages}`, W / 2, H - 6, { align: "center" });
  }
  return doc;
}

export async function exportPdf(o: PdfOptions) {
  const doc = await buildPdf(o);
  doc.save(o.filename.endsWith(".pdf") ? o.filename : `${o.filename}.pdf`);
}

export async function pdfBase64(o: PdfOptions): Promise<string> {
  const doc = await buildPdf(o);
  return (doc.output("datauristring") as string).split(",")[1];
}
